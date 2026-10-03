import { createHash } from "node:crypto";

import { CATEGORIES, type CategorySlug, type EditorialInventory } from "@omnilede/editorial";
import { studioTaskInputSchema, type ProviderState, type StudioTaskInput } from "@omnilede/contracts";
import type { z } from "zod";

export type DerivedTask = z.output<typeof studioTaskInputSchema>;
export type GoogleProvider = "google-analytics" | "google-search-console" | "google-adsense";

export interface TodayTaskInput {
  inventory: EditorialInventory;
  now?: Date;
  staleCoverageDays?: number;
  dailyPlan?: {
    version: 1;
    date: string;
    tasks: Array<{
      category: CategorySlug;
      reason: string;
      outcome: "todo" | "running" | "completed" | "attention" | "cancelled";
      runId?: string;
      draftRef?: { category: CategorySlug; filename: string };
    }>;
  } | null;
  writerRun?: {
    runId: string;
    status: "running" | "human-required" | "cancelled";
    category: CategorySlug;
    resumable: boolean;
    message: string;
  } | null;
  providers?: Array<{ provider: GoogleProvider; state: ProviderState }>;
  seoWarnings?: Array<{ code: string; url: string; detail: string }>;
  adsense?: { state: "setup-required" | "review-required" | "not-ready" | "ready"; detail: string } | null;
  deployment?: { state: "ready" | "building" | "failed" | "unavailable"; id: string; url: string; detail: string } | null;
}

function task(input: Omit<StudioTaskInput, "state" | "postponedUntil" | "completedAt">): DerivedTask {
  return studioTaskInputSchema.parse({ ...input, state: "open", postponedUntil: null, completedAt: null });
}

function safeKeyPart(value: string, maximum = 180): string {
  const encoded = encodeURIComponent(value);
  if (encoded.length <= maximum) return encoded;
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${encoded.slice(0, maximum - digest.length - 1)}-${digest}`;
}

export function deriveTodayTasks(input: TodayTaskInput): DerivedTask[] {
  const now = input.now ?? new Date();
  const staleCoverageDays = input.staleCoverageDays ?? 14;
  const result: DerivedTask[] = [];

  for (const draft of input.inventory.items.filter(({ kind }) => kind === "draft")) {
    const label = CATEGORIES.find(({ slug }) => slug === draft.category)?.label ?? draft.category;
    result.push(task({
      evidenceKey: `draft:${draft.category}:${draft.filename}`,
      kind: "review",
      title: `Review ${label} draft`,
      detail: `${draft.filename} is waiting for editorial review.`,
      category: draft.category,
      priority: 90,
      source: "GitHub content",
    }));
  }

  if (input.writerRun && input.writerRun.status !== "running" && input.writerRun.resumable) {
    result.push(task({
      evidenceKey: `writer:${safeKeyPart(input.writerRun.runId)}`,
      kind: "writing",
      title: `Resume ${input.writerRun.category} writer run`,
      detail: input.writerRun.message,
      category: input.writerRun.category,
      priority: 95,
      source: "Local writer",
    }));
  }

  const plannedCategories = new Set<CategorySlug>();
  for (const planned of input.dailyPlan?.tasks ?? []) {
    if (planned.outcome === "completed") continue;
    plannedCategories.add(planned.category);
    const needsAttention = planned.outcome === "attention" || planned.outcome === "cancelled";
    const label = CATEGORIES.find(({ slug }) => slug === planned.category)?.label ?? planned.category;
    result.push(task({
      evidenceKey: `daily-plan:${input.dailyPlan!.date}:${planned.category}`,
      kind: "writing",
      title: needsAttention ? `Try ${label} writing again` : planned.outcome === "running" ? `Continue ${label} writing` : `Write ${label} article`,
      detail: planned.reason,
      category: planned.category,
      priority: needsAttention ? 95 : planned.outcome === "running" ? 90 : 80,
      source: "Local daily plan v1",
    }));
  }

  for (const { slug: category, label } of CATEGORIES) {
    if (plannedCategories.has(category)) continue;
    const latest = input.inventory.items
      .filter((item) => item.kind === "published" && item.category === category)
      .map(({ date }) => date)
      .sort()
      .at(-1);
    const age = latest ? Math.floor((now.getTime() - new Date(latest).getTime()) / 86_400_000) : Number.POSITIVE_INFINITY;
    if (age < staleCoverageDays) continue;
    const dateKey = latest?.slice(0, 10) ?? "none";
    result.push(task({
      evidenceKey: `coverage:${category}:${dateKey}`,
      kind: "writing",
      title: `Plan ${label} coverage`,
      detail: latest ? `Latest publication is ${Math.max(0, age)} days old.` : "This category has no published article yet.",
      category,
      priority: latest ? 60 : 75,
      source: "Editorial inventory",
    }));
  }

  for (const provider of input.providers ?? []) {
    if (provider.state === "connected") continue;
    result.push(task({
      evidenceKey: `provider:${provider.provider}`,
      kind: "provider",
      title: `Set up ${provider.provider.replaceAll("-", " ")}`,
      detail: `Provider state is ${provider.state}; connect or recover it before relying on its reports.`,
      category: null,
      priority: 55,
      source: "Provider connection",
    }));
  }

  for (const warning of input.seoWarnings ?? []) {
    result.push(task({
      evidenceKey: `seo:${safeKeyPart(warning.code, 32)}:${safeKeyPart(warning.url)}`,
      kind: "seo",
      title: `Resolve SEO warning: ${warning.code}`,
      detail: `${warning.detail} Affected page: ${warning.url}`,
      category: null,
      priority: 70,
      source: "Google Search evidence",
    }));
  }

  if (input.adsense && input.adsense.state !== "ready") {
    result.push(task({
      evidenceKey: `adsense:${input.adsense.state}`,
      kind: "provider",
      title: "Review AdSense readiness",
      detail: input.adsense.detail,
      category: null,
      priority: 45,
      source: "AdSense readiness",
    }));
  }

  if (input.deployment?.state === "failed") {
    result.push(task({
      evidenceKey: `deployment:${safeKeyPart(input.deployment.id)}`,
      kind: "maintenance",
      title: "Recover the failed site deployment",
      detail: `${input.deployment.detail} Affected site: ${input.deployment.url}`,
      category: null,
      priority: 100,
      source: "Netlify deployment",
    }));
  }

  return result.sort((left, right) => right.priority - left.priority || left.evidenceKey.localeCompare(right.evidenceKey));
}
