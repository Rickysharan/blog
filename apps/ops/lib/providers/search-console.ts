import "server-only";

import type { ReportEnvelope, ReportRange } from "@omnilede/contracts";

import { parseGoogleReportEnv } from "../env";
import { readGoogleRefreshToken } from "../google/connections";
import { markReportFailure, readReport, writeSuccessfulReport } from "./cache";
import { createGoogleHttpClient } from "./google-http";
import { resolveReportRange, type ReportPreset } from "./report-range";

export type SearchMetric = { clicks: number; impressions: number; ctr: number; position: number };
export type SearchRow = SearchMetric & { key: string };
export type SearchPageRow = SearchRow & { previousClicks: number | null };
export type SearchSitemap = { path: string; lastSubmitted: string | null; pending: boolean; warnings: number; errors: number };
export type SearchInspection = { url: string; verdict: string; coverageState: string | null; userCanonical: string | null; googleCanonical: string | null; lastCrawlTime: string | null };
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
    if (!Array.isArray(row.keys) || row.keys.length !== dimensions || row.keys.some((key) => typeof key !== "string" || key.length > 2048)) throw new Error("Missing Search Console dimension");
    const ctr = finite(row.ctr, "ctr");
    if (ctr > 1) throw new Error("Invalid Search Console ctr");
    return { keys: row.keys as string[], metric: { clicks: finite(row.clicks, "clicks"), impressions: finite(row.impressions, "impressions"), ctr, position: finite(row.position, "position") } };
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
  if (typeof row.verdict !== "string") throw new Error("Missing inspection verdict");
  const canonical = (field: "userCanonical" | "googleCanonical") => {
    const item = row[field];
    return item === undefined ? null : typeof item === "string" ? exactOrigin(item, blogOrigin) : (() => { throw new Error("Invalid canonical"); })();
  };
  const text = (field: string) => row[field] === undefined ? null : typeof row[field] === "string" ? row[field] as string : (() => { throw new Error("Invalid inspection field"); })();
  const lastCrawlTime = text("lastCrawlTime");
  if (lastCrawlTime && !Number.isFinite(Date.parse(lastCrawlTime))) throw new Error("Invalid crawl time");
  return { url: exactOrigin(requestedUrl, blogOrigin), verdict: row.verdict, coverageState: text("coverageState"), userCanonical: canonical("userCanonical"), googleCanonical: canonical("googleCanonical"), lastCrawlTime };
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
  return {
    summary: summaryRows[0]?.metric ?? null,
    trend: keyed(input.trend), queries: keyed(input.queries), pages,
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
    } catch {
      await dependencies.cache.failure("google-search-console", key, { source: "Google Search Console API", range });
    }
    return dependencies.cache.read<SearchReport>("google-search-console", key);
  };
}

export async function fetchSearchReport(preset: ReportPreset): Promise<ReportEnvelope<SearchReport>> {
  const config = parseGoogleReportEnv();
  const request = createGoogleHttpClient({ clientId: config.clientId, clientSecret: config.clientSecret, readRefreshToken: () => readGoogleRefreshToken("google-search-console", config.encryptionKey) });
  return createSearchProvider({ request, siteUrl: config.searchSiteUrl, blogOrigin: config.blogOrigin, cache: { read: readReport, success: writeSuccessfulReport, failure: markReportFailure } })(preset);
}
