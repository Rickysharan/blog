import "server-only";

import type { ReportEnvelope, ReportRange } from "@omnilede/contracts";

import { parseGoogleProviderEnv } from "../env";
import { readGoogleRefreshToken, readGoogleResourceId } from "../google/connections";
import { markReportFailure, readReport, writeSuccessfulReport } from "./cache";
import { createGoogleHttpClient } from "./google-http";
import { logProviderFailure } from "./provider-error";
import { resolveReportRange, type ReportPreset } from "./report-range";

export type Ga4MetricSummary = { activeUsers: number; sessions: number; views: number; engagementRate: number };
export type Ga4TrendPoint = Ga4MetricSummary & { date: string };
export type Ga4DimensionRow = { name: string; views: number; sessions: number };
export type Ga4Report = {
  summary: Ga4MetricSummary | null;
  trend: Ga4TrendPoint[];
  channels: Ga4DimensionRow[];
  devices: Ga4DimensionRow[];
  countries: Ga4DimensionRow[];
  landingPages: Ga4DimensionRow[];
  articlePaths: Ga4DimensionRow[];
};

type RunReport = {
  dimensionHeaders?: Array<{ name?: unknown }>;
  metricHeaders?: Array<{ name?: unknown }>;
  rows?: Array<{ dimensionValues?: Array<{ value?: unknown }>; metricValues?: Array<{ value?: unknown }> }>;
  rowCount?: unknown;
  kind?: unknown;
};

type Ga4ReportPart = "summary" | "trend" | "channels" | "devices" | "countries" | "landing-pages" | "article-paths";

function invalidReport(part: Ga4ReportPart, reason: string, message: string): Error {
  return Object.assign(new Error(message), { kind: `invalid-report:ga4-${part}-${reason}` });
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing GA4 ${label}`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`Invalid GA4 ${label}`);
  return result;
}

function parseReport(value: unknown, dimensions: string[], metrics: string[], part: Ga4ReportPart) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidReport(part, "shape", "Invalid GA4 response");
  const report = value as RunReport;
  const actualDimensions = report.dimensionHeaders?.map(({ name }) => name) ?? [];
  const actualMetrics = report.metricHeaders?.map(({ name }) => name);
  const rows = report.rows ?? [];
  const verifiedEmptyReport = report.kind === "analyticsData#runReport"
    && (report.rowCount === undefined || report.rowCount === 0 || report.rowCount === "0")
    && Array.isArray(rows)
    && rows.length === 0
    && (report.dimensionHeaders === undefined || JSON.stringify(actualDimensions) === JSON.stringify(dimensions))
    && (report.metricHeaders === undefined || JSON.stringify(actualMetrics) === JSON.stringify(metrics));
  if (verifiedEmptyReport) return [];
  if (actualDimensions.length !== dimensions.length) throw invalidReport(part, "dimension-count", "GA4 response columns do not match the request");
  if (JSON.stringify(actualDimensions) !== JSON.stringify(dimensions)) throw invalidReport(part, "dimension-names", "GA4 response columns do not match the request");
  if (actualMetrics === undefined) throw invalidReport(part, "metrics-missing", "GA4 response columns do not match the request");
  if (actualMetrics.length !== metrics.length) throw invalidReport(part, "metric-count", "GA4 response columns do not match the request");
  if (JSON.stringify(actualMetrics) !== JSON.stringify(metrics)) throw invalidReport(part, "metric-names", "GA4 response columns do not match the request");
  if (!Array.isArray(rows)) throw invalidReport(part, "rows", "GA4 response columns do not match the request");
  if (rows.length > 500) throw invalidReport(part, "row-limit", "GA4 response exceeds row limit");
  return rows.map((row) => {
    if (row.dimensionValues?.length !== dimensions.length || row.metricValues?.length !== metrics.length) throw invalidReport(part, "row", "GA4 row is incomplete");
    const dimensionValues = row.dimensionValues.map(({ value: item }) => {
      if (typeof item !== "string" || item.length > 2048) throw new Error("Invalid GA4 dimension");
      return item;
    });
    return { dimensionValues, metricValues: row.metricValues.map(({ value: item }, index) => {
      const metric = metrics[index]!; const parsed = finite(item, metric);
      if (metric === "engagementRate" && parsed > 1) throw new Error("Invalid GA4 engagementRate");
      return parsed;
    }) };
  });
}

const summaryMetrics = ["activeUsers", "sessions", "screenPageViews", "engagementRate"];
const listMetrics = ["screenPageViews", "sessions"];

function summaryFrom(values: number[]): Ga4MetricSummary {
  return { activeUsers: values[0]!, sessions: values[1]!, views: values[2]!, engagementRate: values[3]! };
}

export function transformGa4Reports(input: {
  summary: unknown; trend: unknown; channels: unknown; devices: unknown; countries: unknown; landingPages: unknown; articlePaths: unknown;
}): Ga4Report {
  const summaryRows = parseReport(input.summary, [], summaryMetrics, "summary");
  if (summaryRows.length > 1) throw new Error("GA4 summary is invalid");
  const seenDates = new Set<string>();
  const trend = parseReport(input.trend, ["date"], summaryMetrics, "trend").map(({ dimensionValues, metricValues }) => {
    const raw = dimensionValues[0]!;
    if (!/^\d{8}$/.test(raw)) throw new Error("Invalid GA4 date");
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid GA4 date");
    if (seenDates.has(date)) throw new Error("Duplicate GA4 date"); seenDates.add(date);
    return { date, ...summaryFrom(metricValues) };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const list = (value: unknown, dimension: string, part: Ga4ReportPart) => parseReport(value, [dimension], listMetrics, part).map(({ dimensionValues, metricValues }) => ({
    name: dimensionValues[0]!, views: metricValues[0]!, sessions: metricValues[1]!
  }));
  return {
    summary: summaryRows[0] ? summaryFrom(summaryRows[0].metricValues) : null, trend,
    channels: list(input.channels, "sessionDefaultChannelGroup", "channels"), devices: list(input.devices, "deviceCategory", "devices"),
    countries: list(input.countries, "country", "countries"), landingPages: list(input.landingPages, "landingPagePlusQueryString", "landing-pages"),
    articlePaths: list(input.articlePaths, "pagePath", "article-paths")
  };
}

type Ga4Dependencies = {
  request: (url: string, init?: RequestInit) => Promise<unknown>;
  propertyId: string;
  cache: {
    read<T>(provider: "google-analytics", key: string): Promise<ReportEnvelope<T>>;
    success(provider: "google-analytics", key: string, report: { source: string; range: ReportRange; fetchedAt: string; data: Ga4Report }): Promise<void>;
    failure(provider: "google-analytics", key: string, fallback: { source: string; range: ReportRange }): Promise<void>;
  };
  onFailure?: (error: unknown) => void;
  now?: () => Date;
};

function reportBody(range: ReportRange, dimensions: string[], metrics: string[], limit = 100) {
  return JSON.stringify({ dateRanges: [{ startDate: range.start, endDate: range.end }], dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit: String(Math.min(limit, 500)), keepEmptyRows: false });
}

export function createGa4Provider(dependencies: Ga4Dependencies) {
  return async function fetchGa4(preset: ReportPreset): Promise<ReportEnvelope<Ga4Report>> {
    const now = dependencies.now?.() ?? new Date();
    const range = resolveReportRange(preset, now);
    const key = `growth:${preset}`;
    const prior = await dependencies.cache.read<Ga4Report>("google-analytics", key);
    if (prior.state === "disconnected") return { ...prior, range };
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(dependencies.propertyId)}:runReport`;
    const call = (dimensions: string[], metrics: string[], limit?: number) => dependencies.request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: reportBody(range, dimensions, metrics, limit) });
    try {
      const [summary, trend, channels, devices, countries, landingPages, articlePaths] = await Promise.all([
        call([], summaryMetrics, 1), call(["date"], summaryMetrics, 367), call(["sessionDefaultChannelGroup"], listMetrics),
        call(["deviceCategory"], listMetrics), call(["country"], listMetrics), call(["landingPagePlusQueryString"], listMetrics),
        call(["pagePath"], listMetrics)
      ]);
      const data = transformGa4Reports({ summary, trend, channels, devices, countries, landingPages, articlePaths });
      await dependencies.cache.success("google-analytics", key, { source: "Google Analytics Data API", range, fetchedAt: now.toISOString(), data });
    } catch (error) {
      dependencies.onFailure?.(error);
      await dependencies.cache.failure("google-analytics", key, { source: "Google Analytics Data API", range });
    }
    return dependencies.cache.read<Ga4Report>("google-analytics", key);
  };
}

export async function fetchGa4Report(preset: ReportPreset): Promise<ReportEnvelope<Ga4Report>> {
  const config = parseGoogleProviderEnv();
  const propertyId = config.analyticsPropertyId ?? await readGoogleResourceId("google-analytics");
  if (!propertyId) {
    const range = resolveReportRange(preset);
    await markReportFailure("google-analytics", `growth:${preset}`, { source: "Google Analytics Data API", range });
    return readReport("google-analytics", `growth:${preset}`);
  }
  const request = createGoogleHttpClient({ clientId: config.clientId, clientSecret: config.clientSecret, readRefreshToken: () => readGoogleRefreshToken("google-analytics", config.encryptionKey) });
  return createGa4Provider({ propertyId, request, cache: { read: readReport, success: writeSuccessfulReport, failure: markReportFailure }, onFailure: (error) => logProviderFailure("google-analytics", error) })(preset);
}
