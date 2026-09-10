import type { SearchEvidence } from "../providers/types";
import { stageResult, type StageResult } from "./types";

export type OriginalityEvidence = {
  exactPhraseMatches: number;
  ngramOverlap: number;
  sourceExcluded: number;
  evidence: readonly { url: string; domain: string; snippet: string }[];
};

export function normalizeForComparison(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function distinctiveSentences(text: string, limit = 4): readonly string[] {
  const sentences = text.split(/(?<=[.!?])\s+/u).map(normalizeForComparison).filter((sentence) => sentence.split(" ").length >= 8);
  return [...new Set(sentences)].sort((a, b) => b.length - a.length).slice(0, limit);
}

export function titlePhrases(title: string, limit = 2): readonly string[] {
  const words = normalizeForComparison(title).split(" ").filter(Boolean);
  const phrases = new Set<string>();
  for (let size = Math.min(6, words.length); size >= 3 && phrases.size < limit; size -= 1) {
    for (let index = 0; index + size <= words.length && phrases.size < limit; index += 1) phrases.add(words.slice(index, index + size).join(" "));
  }
  return [...phrases];
}

function ngrams(value: string, size = 5): Set<string> {
  const words = normalizeForComparison(value).split(" ").filter(Boolean);
  return new Set(Array.from({ length: Math.max(0, words.length - size + 1) }, (_, index) => words.slice(index, index + size).join(" ")));
}

export function compareOriginality(text: string, primarySourceDomain: string, results: readonly SearchEvidence[]): StageResult & { evidence: OriginalityEvidence } {
  const sentences = distinctiveSentences(text);
  const source = normalizeForComparison(primarySourceDomain);
  const filtered = results.filter((result) => normalizeForComparison(result.domain) !== source).slice(0, 5);
  const candidateNgrams = ngrams(text);
  const evidenceNgrams = new Set(filtered.flatMap((result) => [...ngrams(result.snippet)]));
  const overlap = candidateNgrams.size === 0 ? 0 : [...candidateNgrams].filter((gram) => evidenceNgrams.has(gram)).length / candidateNgrams.size;
  const exactPhraseMatches = sentences.filter((sentence) => filtered.some((result) => normalizeForComparison(result.snippet).includes(sentence))).length;
  const evidence = filtered.slice(0, 5).map((result) => ({ url: result.url, domain: result.domain, snippet: result.snippet.slice(0, 220) }));
  const detail = { exactPhraseMatches, ngramOverlap: Math.round(overlap * 10_000) / 10_000, sourceExcluded: results.length - filtered.length, evidence };
  if (filtered.length === 0) return { ...stageResult("originality", "manual_review", ["originality.no_external_evidence"], null, "tavily", "bounded-search-1"), evidence: detail };
  if (exactPhraseMatches > 0 || overlap >= 0.65) return { ...stageResult("originality", "manual_review", ["originality.similarity_requires_editor_review"], Math.max(0, 1 - overlap), "tavily", "bounded-search-1"), evidence: detail };
  return { ...stageResult("originality", "pass", [], Math.max(0, 1 - overlap), "tavily", "bounded-search-1"), evidence: detail };
}
