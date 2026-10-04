import { createHash } from "node:crypto";

import type { StudioTaskInput } from "@omnilede/contracts";
import type { SearchReport } from "../providers/search-console";

export type SearchOpportunity = {
  evidenceKey: string;
  title: string;
  evidence: string;
  proposedAction: string;
  priority: number;
  url: string | null;
  query: string | null;
};

const id = (kind: string, value: string) => `search:${kind}:${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;

export function deriveSearchOpportunities(report: SearchReport): SearchOpportunity[] {
  const result: SearchOpportunity[] = [];
  for (const row of report.queries) {
    if (row.impressions >= 100 && row.position <= 10 && row.ctr < (row.position <= 3 ? 0.08 : 0.025)) result.push({
      evidenceKey: id("ctr", row.key), title: `Improve search result for “${row.key}”`,
      evidence: `${row.impressions} impressions, ${(row.ctr * 100).toFixed(1)}% CTR, average position ${row.position.toFixed(1)}.`,
      proposedAction: "Review the matching page title and description against the query intent.", priority: 80, url: null, query: row.key
    });
    if (row.impressions >= 50 && row.position > 10 && row.position <= 20) result.push({
      evidenceKey: id("near-page-one", row.key), title: `Strengthen coverage for “${row.key}”`,
      evidence: `${row.impressions} impressions at average position ${row.position.toFixed(1)}.`,
      proposedAction: "Review the relevant article for useful missing context and internal links.", priority: 70, url: null, query: row.key
    });
  }
  for (const row of report.pages) if (row.previousClicks !== null && row.previousClicks >= 20 && row.clicks <= row.previousClicks * 0.7) result.push({
    evidenceKey: id("decline", row.key), title: "Investigate declining search clicks",
    evidence: `${row.key} fell from ${row.previousClicks} to ${row.clicks} clicks versus the preceding period.`,
    proposedAction: "Check the page, competing results, freshness, links, and query changes before editing.", priority: 85, url: row.key, query: null
  });
  for (const sitemap of report.sitemaps) if (sitemap.errors > 0 || sitemap.warnings > 0 || sitemap.pending) result.push({
    evidenceKey: id("sitemap", sitemap.path), title: "Resolve sitemap processing issue",
    evidence: `${sitemap.path} reports ${sitemap.errors} errors, ${sitemap.warnings} warnings, pending ${sitemap.pending ? "yes" : "no"}.`,
    proposedAction: "Inspect the sitemap response and Search Console details, then correct only verified faults.", priority: sitemap.errors ? 95 : 75, url: sitemap.path, query: null
  });
  for (const item of report.inspections) if (["PARTIAL", "FAIL", "NEUTRAL"].includes(item.verdict)) result.push({
    evidenceKey: id("index", item.url), title: "Review an unindexed canonical page",
    evidence: `${item.url} has verdict ${item.verdict}${item.coverageState ? ` (${item.coverageState})` : ""}.`,
    proposedAction: "Review the URL inspection evidence, canonical, crawl access, and page quality before requesting indexing.", priority: 90, url: item.url, query: null
  });
  return result.sort((a, b) => b.priority - a.priority || a.evidenceKey.localeCompare(b.evidenceKey));
}

export function opportunityToTask(opportunity: SearchOpportunity): StudioTaskInput {
  return { evidenceKey: opportunity.evidenceKey, kind: "seo", title: opportunity.title, detail: `${opportunity.evidence} Proposed action: ${opportunity.proposedAction}`, category: null, state: "open", priority: opportunity.priority, source: "Google Search evidence", postponedUntil: null, completedAt: null };
}
