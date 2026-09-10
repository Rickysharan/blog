import { createHash } from "node:crypto";

import type { EditorDocument, EditorNode, SubmissionInput } from "@omnilede/contracts";
import { editorDocumentSchema } from "@omnilede/contracts";

import { stageResult, type StageResult } from "./types";

export type QualityConfig = {
  minWords: number;
  maxWords: number;
  maxLinks: number;
  minDomains: number;
  spamPhrases?: readonly string[];
};

export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  minWords: 120,
  maxWords: 2_000,
  maxLinks: 12,
  minDomains: 1,
  spamPhrases: ["buy now", "guaranteed profit", "click here to win", "act now!!!"]
};

export function textFromEditor(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as { text?: unknown; content?: unknown };
  const own = typeof value.text === "string" ? value.text : "";
  const children = Array.isArray(value.content) ? value.content.map(textFromEditor).join(" ") : "";
  return `${own} ${children}`.trim();
}

export function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (Array.isArray(value)) return `[${value.map(normalizeContent).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${normalizeContent(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentSha256(document: EditorDocument): string {
  return createHash("sha256").update(normalizeContent(document)).digest("hex");
}

function isAllCaps(title: string): boolean {
  const letters = title.match(/\p{L}/gu);
  return Boolean(letters && letters.length >= 5 && title === title.toLocaleUpperCase() && title !== title.toLocaleLowerCase());
}

function links(document: EditorDocument): string[] {
  const urls: string[] = [];
  const visit = (node: EditorNode) => {
    if (node.type === "text" && node.marks) {
      for (const mark of node.marks) if (mark.type === "link") urls.push(mark.attrs.href);
    }
    if ("content" in node && Array.isArray(node.content)) for (const child of node.content) visit(child as EditorNode);
  };
  for (const node of document.content) visit(node);
  return urls;
}

function disclaimerPresent(text: string): boolean {
  return /not financial advice|financial information only|do your own research/iu.test(text);
}

export function runQualityGate(input: Pick<SubmissionInput, "title" | "contentDocument" | "category">, config: QualityConfig = DEFAULT_QUALITY_CONFIG): StageResult {
  const title = input.title.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const text = textFromEditor(input.contentDocument);
  const words = text ? text.split(/\s+/u).length : 0;
  const urls = links(input.contentDocument);
  const domains = new Set(urls.map((url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }).filter(Boolean));
  const reasons: string[] = [];
  if (!title) reasons.push("quality.title_missing");
  if (isAllCaps(title)) reasons.push("quality.title_all_caps");
  if (words < config.minWords) reasons.push("quality.word_count_low");
  if (words > config.maxWords) reasons.push("quality.word_count_high");
  if (urls.length > config.maxLinks) reasons.push("quality.link_count_high");
  if (urls.length > 0 && domains.size < config.minDomains) reasons.push("quality.source_domains_low");
  if ((config.spamPhrases ?? []).some((phrase) => text.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()))) reasons.push("quality.spam_phrase");
  if ((input.category === "finance" || input.category === "share-market") && !disclaimerPresent(text)) reasons.push("quality.finance_disclaimer_missing");
  const rejectReasons = reasons.filter((reason) => reason === "quality.title_all_caps" || reason === "quality.spam_phrase");
  if (rejectReasons.length > 0) return stageResult("quality", "reject", reasons, 0);
  if (reasons.length > 0) return stageResult("quality", "manual_review", reasons, Math.max(0, 1 - reasons.length / 8));
  return stageResult("quality", "pass", [], 1);
}

export function runTextSafetyGate(document: unknown): StageResult {
  const parsed = editorDocumentSchema.safeParse(document);
  if (!parsed.success) return stageResult("text_safety", "manual_review", ["text_safety.schema_invalid"], null, null, "deterministic-1");
  const text = textFromEditor(parsed.data);
  if (/<\/?(script|iframe|style|object|embed)\b/iu.test(text)) return stageResult("text_safety", "reject", ["text_safety.unsafe_markup"], 0);
  return stageResult("text_safety", "pass", [], 1);
}
