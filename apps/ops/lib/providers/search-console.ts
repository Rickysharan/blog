import "server-only";

import type { ReportEnvelope, ReportRange } from "@omnilede/contracts";

import { parseGoogleProviderEnv } from "../env";
import { readGoogleRefreshToken, readGoogleResourceId } from "../google/connections";
import { markReportFailure, readReport, writeSuccessfulReport } from "./cache";
import { createGoogleHttpClient } from "./google-http";
import { logProviderFailure } from "./provider-error";
import { resolveReportRange, type ReportPreset } from "./report-range";

export type SearchMetric = { clicks: number; impressions: number; ctr: number; position: number };
export type SearchRow = SearchMetric & { key: string };
export type SearchPageRow = SearchRow & { previousClicks: number | null };
export type SearchSitemap = { path: string; lastSubmitted: string | null; pending: boolean; warnings: number; errors: number };
export type SearchInspection = { url: string; verdict: "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL" | "VERDICT_UNSPECIFIED"; coverageState: string | null; robotsTxtState: string | null; indexingState: string | null; pageFetchState: string | null; userCanonical: string | null; googleCanonical: string | null; lastCrawlTime: string | null };
export type SearchReport = {
  summary: SearchMetric | null;
  trend: SearchRow[];
  queries: SearchRow[];
  pages: SearchPageRow[];
  countries: SearchRow[];
  devices: SearchRow[];
  sitemaps: SearchSitemap[];
  inspections: SearchInspection[];
};

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid Search Console ${field}`);
  return value;
}

function finiteCount(value: unknown, field: string): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return finite(parsed, field);
}

function parseRows(value: unknown, dimensions: number): Array<{ keys: string[]; metric: SearchMetric }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Search Console response");
  const rows = (value as { rows?: unknown }).rows;
  if (rows === undefined) return [];
  if (!Array.isArray(rows) || rows.length > 500) throw new Error("Invalid Search Console rows");
  return rows.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid Search Console row");
    const row = item as Record<string, unknown>;
    const keys = row.keys ?? (dimensions === 0 ? [] : undefined);
    if (!Array.isArray(keys) || keys.length !== dimensions || keys.some((key) => typeof key !== "string" || key.length > 2048)) throw new Error("Missing Search Console dimension");
    const ctr = finite(row.ctr, "ctr");
    if (ctr > 1) throw new Error("Invalid Search Console ctr");
    return { keys: keys as string[], metric: { clicks: finite(row.clicks, "clicks"), impressions: finite(row.impressions, "impressions"), ctr, position: finite(row.position, "position") } };
  });
}

function exactOrigin(value: string, expectedOrigin: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== expectedOrigin || url.username || url.password) throw new Error("Unexpected Search Console origin");
  return url.toString();
}

function parseSitemaps(value: unknown, blogOrigin: string): SearchSitemap[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid sitemap response");
  const entries = (value as { sitemap?: unknown }).sitemap ?? [];
  if (!Array.isArray(entries) || entries.length > 100) throw new Error("Invalid sitemap list");
  return entries.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid sitemap");
    const row = item as Record<string, unknown>;
    if (typeof row.path !== "string" || typeof row.isPending !== "boolean") throw new Error("Invalid sitemap");
    const timestamp = row.lastSubmitted === undefined ? null : row.lastSubmitted;
    if (timestamp !== null && (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)))) throw new Error("Invalid sitemap date");
    return { path: exactOrigin(row.path, blogOrigin), lastSubmitted: timestamp, pending: row.isPending, warnings: finiteCount(row.warnings ?? "invalid", "warnings"), errors: finiteCount(row.errors ?? "invalid", "errors") };
  });
}

function parseInspection(value: unknown, requestedUrl: string, blogOrigin: string): SearchInspection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid URL inspection response");
  const result = (value as { inspectionResult?: { inspectionUrl?: unknown; indexStatusResult?: unknown } }).inspectionResult;
  const status = result?.indexStatusResult;
  if (!result || typeof result.inspectionUrl !== "string" || !status || typeof status !== "object" || Array.isArray(status)) throw new Error("Invalid URL inspection response");
  if (exactOrigin(result.inspectionUrl, blogOrigin) !== exactOrigin(requestedUrl, blogOrigin)) throw new Error("URL inspection did not match request");
  const row = status as Record<string, unknown>;
  const verdicts = ["PASS", "PARTIAL", "FAIL", "NEUTRAL", "VERDICT_UNSPECIFIED"] as const;
  if (typeof row.verdict !== "string" || !verdicts.includes(row.verdict as typeof verdicts[number])) throw new Error("Invalid inspection verdict");
  const canonical = (field: "userCanonical" | "googleCanonical") => {
    const item = row[field];
    return item === undefined ? null : typeof item === "string" ? exactOrigin(item, blogOrigin) : (() => { throw new Error("Invalid canonical"); })();
  };
  const text = (field: string) => row[field] === undefined ? null : typeof row[field] === "string" ? row[field] as string : (() => { throw new Error("Invalid inspection field"); })();
  const known = (field: string, allowed: readonly string[]) => {
    const item = text(field);
    if (item !== null && !allowed.includes(item)) throw new Error(`Invalid inspection ${field}`);
    return item;
  };
  const lastCrawlTime = text("lastCrawlTime");
  if (lastCrawlTime && !Number.isFinite(Date.parse(lastCrawlTime))) throw new Error("Invalid crawl time");
  const robotsTxtState = known("robotsTxtState", ["ROBOTS_TXT_STATE_UNSPECIFIED", "ALLOWED", "DISALLOWED"]);
  const indexingState = known("indexingState", ["INDEXING_STATE_UNSPECIFIED", "INDEXING_ALLOWED", "BLOCKED_BY_META_TAG", "BLOCKED_BY_HTTP_HEADER", "BLOCKED_BY_ROBOTS_TXT"]);
  const pageFetchState = known("pageFetchState", ["PAGE_FETCH_STATE_UNSPECIFIED", "SUCCESSFUL", "SOFT_404", "BLOCKED_ROBOTS_TXT", "NOT_FOUND", "ACCESS_DENIED", "SERVER_ERROR", "REDIRECT_ERROR", "ACCESS_FORBIDDEN", "BLOCKED_4XX", "INTERNAL_CRAWL_ERROR", "INVALID_URL"]);
  return { url: exactOrigin(requestedUrl, blogOrigin), verdict: row.verdict as SearchInspection["verdict"], coverageState: text("coverageState"), robotsTxtState, indexingState, pageFetchState, userCanonical: canonical("userCanonical"), googleCanonical: canonical("googleCanonical"), lastCrawlTime };
}

export function transformSearchReports(input: {
  summary: unknown; trend: unknown; queries: unknown; pages: unknown; previousPages: unknown; countries: unknown; devices: unknown; sitemaps: unknown;
  inspections: Array<{ url: string; response: unknown }>;
}, blogOrigin: string): SearchReport {
  const summaryRows = parseRows(input.summary, 0);
  if (summaryRows.length > 1) throw new Error("Invalid Search Console summary");
  const keyed = (value: unknown, validate?: (key: string) => string) => parseRows(value, 1).map(({ keys, metric }) => ({ key: validate?.(keys[0]!) ?? keys[0]!, ...metric }));
  const prior = new Map(keyed(input.previousPages, (key) => exactOrigin(key, blogOrigin)).map((row) => [row.key, row.clicks]));
  const pages = keyed(input.pages, (key) => exactOrigin(key, blogOrigin)).map((row) => ({ ...row, previousClicks: prior.get(row.key) ?? null }));
  const trend = keyed(input.trend);
  const seenTrendDates = new Set<string>();
  for (const row of trend) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.key)) throw new Error("Invalid Search Console trend date");
    const parsed = new Date(`${row.key}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== row.key) throw new Error("Invalid Search Console trend date");
    if (seenTrendDates.has(row.key)) throw new Error("Duplicate Search Console trend date"); seenTrendDates.add(row.key);
  }
  trend.sort((a, b) => a.key.localeCompare(b.key));
  return {
    summary: summaryRows[0]?.metric ?? null,
    trend, queries: keyed(input.queries), pages,
    countries: keyed(input.countries), devices: keyed(input.devices),
    sitemaps: parseSitemaps(input.sitemaps, blogOrigin),
    inspections: input.inspections.map(({ url, response }) => parseInspection(response, url, blogOrigin))
  };
}

type Dependencies = {
  request: (url: string, init?: RequestInit) => Promise<unknown>;
  siteUrl: string;
  blogOrigin: string;
  cache: {
    read<T>(provider: "google-search-console", key: string): Promise<ReportEnvelope<T>>;
    success(provider: "google-search-console", key: string, report: { source: string; range: ReportRange; fetchedAt: string; data: SearchReport }): Promise<void>;
    failure(provider: "google-search-console", key: string, fallback: { source: string; range: ReportRange }): Promise<void>;
  };
  onFailure?: (error: unknown) => void;
  now?: () => Date;
};

function priorRange(range: ReportRange): ReportRange {
  const start = new Date(`${range.start}T00:00:00.000Z`);
  const end = new Date(`${range.end}T00:00:00.000Z`);
  const length = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const priorEnd = new Date(start); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - length + 1);
  return { start: priorStart.toISOString().slice(0, 10), end: priorEnd.toISOString().slice(0, 10) };
}

export function createSearchProvider(dependencies: Dependencies) {
  return async function fetchSearch(preset: ReportPreset): Promise<ReportEnvelope<SearchReport>> {
    const now = dependencies.now?.() ?? new Date();
    const range = resolveReportRange(preset, now);
    const key = `search:${preset}`;
    const prior = await dependencies.cache.read<SearchReport>("google-search-console", key);
    if (prior.state === "disconnected") return { ...prior, range };
    const encodedSite = encodeURIComponent(dependencies.siteUrl);
    const analyticsUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;
    const query = (dimensions: string[], requestRange = range) => dependencies.request(analyticsUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ startDate: requestRange.start, endDate: requestRange.end, dimensions, type: "web", aggregationType: dimensions.includes("page") ? "auto" : "byProperty", rowLimit: 500, dataState: "final" })
    });
    try {
      const [summary, trend, queries, pages, previousPages, countries, devices, sitemaps] = await Promise.all([
        query([]), query(["date"]), query(["query"]), query(["page"]), query(["page"], priorRange(range)), query(["country"]), query(["device"]),
        dependencies.request(`https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps`)
      ]);
      const canonicalPages = parseRows(pages, 1).map(({ keys }) => exactOrigin(keys[0]!, dependencies.blogOrigin)).slice(0, 10);
      const inspections = await Promise.all(canonicalPages.map(async (url) => ({ url, response: await dependencies.request("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inspectionUrl: url, siteUrl: dependencies.siteUrl })
      }) })));
      const data = transformSearchReports({ summary, trend, queries, pages, previousPages, countries, devices, sitemaps, inspections }, dependencies.blogOrigin);
      await dependencies.cache.success("google-search-console", key, { source: "Google Search Console API", range, fetchedAt: now.toISOString(), data });
    } catch (error) {
      dependencies.onFailure?.(error);
      await dependencies.cache.failure("google-search-console", key, { source: "Google Search Console API", range });
    }
    return dependencies.cache.read<SearchReport>("google-search-console", key);
  };
}

export async function fetchSearchReport(preset: ReportPreset): Promise<ReportEnvelope<SearchReport>> {
  const config = parseGoogleProviderEnv();
  const siteUrl = config.searchSiteUrl ?? await readGoogleResourceId("google-search-console");
  if (!siteUrl) {
    const range = resolveReportRange(preset);
    await markReportFailure("google-search-console", `search:${preset}`, { source: "Google Search Console API", range });
    return readReport("google-search-console", `search:${preset}`);
  }
  const request = createGoogleHttpClient({ clientId: config.clientId, clientSecret: config.clientSecret, readRefreshToken: () => readGoogleRefreshToken("google-search-console", config.encryptionKey) });
  return createSearchProvider({ request, siteUrl, blogOrigin: config.blogOrigin, cache: { read: readReport, success: writeSuccessfulReport, failure: markReportFailure }, onFailure: (error) => logProviderFailure("google-search-console", error) })(preset);
}
