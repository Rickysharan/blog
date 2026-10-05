import "server-only";

import type { ReportEnvelope, ReportRange } from "@omnilede/contracts";

import { parseGoogleProviderEnv } from "../env";
import { readGoogleRefreshToken, readGoogleResourceId } from "../google/connections";
import { markReportFailure, readReport, writeSuccessfulReport } from "./cache";
import { createGoogleHttpClient } from "./google-http";
import { resolveReportRange, type ReportPreset } from "./report-range";

const PUBLISHER_PATTERN = /^pub-\d{16}$/;
const ACCOUNT_STATES = ["READY", "NEEDS_ATTENTION", "CLOSED"] as const;
const SITE_STATES = ["REQUIRES_REVIEW", "GETTING_READY", "READY", "NEEDS_ATTENTION"] as const;
const ALERT_SEVERITIES = ["INFO", "WARNING", "SEVERE"] as const;
const POLICY_ACTIONS = ["WARNED", "AD_SERVING_RESTRICTED", "AD_SERVING_DISABLED", "AD_SERVED_WITH_CLICK_CONFIRMATION", "AD_PERSONALIZATION_RESTRICTED"] as const;
const METRICS = ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS", "PAGE_VIEWS_RPM"] as const;
const METRIC_TYPES = ["METRIC_CURRENCY", "METRIC_TALLY", "METRIC_TALLY", "METRIC_CURRENCY"] as const;
const SELLER_RECORD_SUFFIX = ", DIRECT, f08c47fec0942fa0";
const MAX_ADS_TXT_BYTES = 65_536;

type AccountStatus = (typeof ACCOUNT_STATES)[number];
type SiteStatus = (typeof SITE_STATES)[number];
export type AdsenseReport = {
  account: { publisherId: string; displayName: string; status: AccountStatus; pendingTasks: string[] };
  site: { domain: string; status: SiteStatus; ownershipVerified: boolean; autoAdsEnabled: boolean };
  adsTxt: { status: "valid" | "missing" | "invalid" | "unavailable"; url: string };
  metrics: { estimatedEarnings: number | null; impressions: number | null; clicks: number | null; pageRpm: number | null; currency: string | null };
  policyMessages: Array<{ site: string; action: string; topics: string[] }>;
  configurationMessages: Array<{ severity: "INFO" | "WARNING" | "SEVERE"; type: string; message: string }>;
};

type AdsenseRawResponses = { accounts: unknown; sites: unknown; policyIssues: unknown; alerts: unknown; report: unknown; adsTxt: { status: number; contentType: string | null; text: string } };
type AdsenseConfig = { publisherId: string; blogOrigin: string };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid AdSense ${label}`);
  return value as Record<string, unknown>;
}

function list(value: unknown, key: string, maximum: number): unknown[] {
  const root = record(value, key);
  const items = root[key] ?? [];
  if (!Array.isArray(items) || items.length > maximum || typeof root.nextPageToken === "string") throw new Error(`Invalid AdSense ${key}`);
  return items;
}

function boundedString(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new Error(`Invalid AdSense ${label}`);
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid AdSense ${label}`);
  return value as T[number];
}

function parseMetric(value: unknown, integer: boolean): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.trim() === "") throw new Error("Invalid AdSense metric");
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) throw new Error("Invalid AdSense metric");
  return number;
}

function parseMetrics(value: unknown): AdsenseReport["metrics"] {
  const report = record(value, "report");
  if (!Array.isArray(report.headers) || report.headers.length !== METRICS.length) throw new Error("Invalid AdSense report headers");
  const headers = report.headers.map((header, index) => {
    const row = record(header, "report header");
    if (row.name !== METRICS[index] || row.type !== METRIC_TYPES[index]) throw new Error("Invalid AdSense report headers");
    if (METRIC_TYPES[index] === "METRIC_TALLY" && row.currencyCode !== undefined) throw new Error("Invalid AdSense report headers");
    return row;
  });

  const parseRow = (value: unknown, label: string): Array<number | null> => {
    const cells = record(value, label).cells;
    if (!Array.isArray(cells) || cells.length !== METRICS.length) throw new Error(`Invalid AdSense ${label}`);
    return cells.map((cell, index) => parseMetric(record(cell, `${label} cell`).value, index === 1 || index === 2));
  };
  if (report.rows !== undefined) {
    if (!Array.isArray(report.rows) || report.rows.length > 1) throw new Error("Invalid AdSense report rows");
    report.rows.forEach((row) => parseRow(row, "report row"));
  }
  const values = report.totals === undefined
    ? [null, null, null, null]
    : parseRow(report.totals, "report totals");

  const parseCurrency = (value: unknown, required: boolean): string | null => {
    if (value === undefined && !required) return null;
    if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new Error("Invalid AdSense report currency");
    return value;
  };
  const earningsCurrency = parseCurrency(headers[0]!.currencyCode, values[0] !== null);
  const rpmCurrency = parseCurrency(headers[3]!.currencyCode, values[3] !== null);
  if (earningsCurrency && rpmCurrency && earningsCurrency !== rpmCurrency) throw new Error("Invalid AdSense report currency");
  return {
    estimatedEarnings: values[0]!,
    impressions: values[1]!,
    clicks: values[2]!,
    pageRpm: values[3]!,
    currency: earningsCurrency ?? rpmCurrency
  };
}

async function readBoundedAdsTxt(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_ADS_TXT_BYTES)) {
    throw new Error("Invalid ads.txt response size");
  }
  if (!response.body) throw new Error("Invalid ads.txt response body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ADS_TXT_BYTES) {
        await reader.cancel();
        throw new Error("Invalid ads.txt response size");
      }
      chunks.push(value);
    }
  } catch {
    throw new Error("Invalid ads.txt response stream");
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Invalid ads.txt response encoding");
  }
}

type AdsTxtFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function createAdsTxtFetcher(blogOrigin: string, fetcher: AdsTxtFetch = fetch, timeoutMs = 5_000) {
  const origin = new URL(blogOrigin);
  if (origin.protocol !== "https:" || origin.origin !== blogOrigin || origin.username || origin.password) throw new Error("Invalid ads.txt origin");
  const boundedTimeout = Math.min(Math.max(timeoutMs, 1), 10_000);
  return async (): Promise<AdsenseRawResponses["adsTxt"]> => {
    const response = await fetcher(`${blogOrigin}/ads.txt`, {
      cache: "no-store",
      headers: { accept: "text/plain" },
      signal: AbortSignal.timeout(boundedTimeout)
    });
    const text = response.status === 200 ? await readBoundedAdsTxt(response) : "";
    return { status: response.status, contentType: response.headers.get("content-type"), text };
  };
}

function parseAdsTxt(response: AdsenseRawResponses["adsTxt"], publisherId: string, blogOrigin: string): AdsenseReport["adsTxt"] {
  const url = `${blogOrigin}/ads.txt`;
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599 || response.text.length > 65_536) throw new Error("Invalid ads.txt response");
  if (response.status === 404) return { status: "missing", url };
  if (response.status !== 200) return { status: "unavailable", url };
  if (!response.contentType?.toLowerCase().startsWith("text/plain")) return { status: "invalid", url };
  const expected = `google.com, ${publisherId}${SELLER_RECORD_SUFFIX}`;
  const lines = response.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { status: lines.includes(expected) ? "valid" : "invalid", url };
}

function cleanMessage(value: unknown): string {
  const clean = boundedString(value, "alert message", 2000).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!clean) throw new Error("Invalid AdSense alert message");
  return clean;
}

export function transformAdsenseResponses(input: AdsenseRawResponses, config: AdsenseConfig): AdsenseReport {
  if (!PUBLISHER_PATTERN.test(config.publisherId)) throw new Error("Invalid AdSense publisher account");
  const origin = new URL(config.blogOrigin);
  if (origin.protocol !== "https:" || origin.origin !== config.blogOrigin || origin.username || origin.password) throw new Error("Invalid AdSense site origin");
  const accountName = `accounts/${config.publisherId}`;
  const accountMatches = list(input.accounts, "accounts", 100).map((item) => record(item, "account")).filter((item) => item.name === accountName);
  if (accountMatches.length !== 1) throw new Error("Configured AdSense account was not returned");
  const account = accountMatches[0]!;
  const pendingTasks = account.pendingTasks ?? [];
  if (!Array.isArray(pendingTasks) || pendingTasks.length > 50 || pendingTasks.some((task) => typeof task !== "string" || task.length > 200)) throw new Error("Invalid AdSense account tasks");

  const siteMatches = list(input.sites, "sites", 100).map((item) => record(item, "site")).filter((item) => item.domain === origin.hostname);
  if (siteMatches.length !== 1) throw new Error("Configured AdSense site was not returned");
  const site = siteMatches[0]!;
  const siteStatus = enumValue(site.state, SITE_STATES, "site state");
  if (typeof site.autoAdsEnabled !== "boolean") throw new Error("Invalid AdSense site configuration");

  const policies = list(input.policyIssues, "policyIssues", 100).map((item) => {
    const issue = record(item, "policy issue");
    const topics = issue.policyTopics;
    if (issue.site !== origin.hostname || !Array.isArray(topics) || topics.length > 50) throw new Error("Invalid AdSense policy issue");
    return {
      site: origin.hostname,
      action: enumValue(issue.action, POLICY_ACTIONS, "policy action"),
      topics: topics.map((topic) => {
        const value = boundedString(record(topic, "policy topic").topic, "policy topic", 200);
        if (!/^[a-z0-9-]+$/.test(value)) throw new Error("Invalid AdSense policy topic");
        return value;
      })
    };
  });
  const alerts = list(input.alerts, "alerts", 100).map((item) => {
    const alert = record(item, "alert");
    return { severity: enumValue(alert.severity, ALERT_SEVERITIES, "alert severity"), type: boundedString(alert.type, "alert type", 200), message: cleanMessage(alert.message) };
  });

  return {
    account: {
      publisherId: config.publisherId,
      displayName: boundedString(account.displayName, "account display name", 200),
      status: enumValue(account.state, ACCOUNT_STATES, "account state"),
      pendingTasks: pendingTasks as string[]
    },
    site: { domain: origin.hostname, status: siteStatus, ownershipVerified: siteStatus === "READY", autoAdsEnabled: site.autoAdsEnabled },
    adsTxt: parseAdsTxt(input.adsTxt, config.publisherId, config.blogOrigin),
    metrics: parseMetrics(input.report),
    policyMessages: policies,
    configurationMessages: alerts
  };
}

type AdsenseDependencies = AdsenseConfig & {
  request: (url: string, init?: RequestInit) => Promise<unknown>;
  fetchAdsTxt: () => Promise<AdsenseRawResponses["adsTxt"]>;
  cache: {
    read<T>(provider: "google-adsense", key: string): Promise<ReportEnvelope<T>>;
    success(provider: "google-adsense", key: string, report: { source: string; range: ReportRange; fetchedAt: string; data: AdsenseReport }): Promise<void>;
    failure(provider: "google-adsense", key: string, fallback: { source: string; range: ReportRange }): Promise<void>;
  };
  now?: () => Date;
};

export function createAdsenseProvider(dependencies: AdsenseDependencies) {
  return async function fetchAdsense(preset: ReportPreset): Promise<ReportEnvelope<AdsenseReport>> {
    const now = dependencies.now?.() ?? new Date();
    const range = resolveReportRange(preset, now);
    const key = `revenue:${preset}`;
    const prior = await dependencies.cache.read<AdsenseReport>("google-adsense", key);
    if (prior.state === "disconnected") return { ...prior, range };
    const account = `accounts/${dependencies.publisherId}`;
    const reportParams = new URLSearchParams({
      "startDate.year": range.start.slice(0, 4), "startDate.month": String(Number(range.start.slice(5, 7))), "startDate.day": String(Number(range.start.slice(8, 10))),
      "endDate.year": range.end.slice(0, 4), "endDate.month": String(Number(range.end.slice(5, 7))), "endDate.day": String(Number(range.end.slice(8, 10))), limit: "1"
    });
    for (const metric of METRICS) reportParams.append("metrics", metric);
    try {
      const [accounts, sites, policyIssues, alerts, report, adsTxt] = await Promise.all([
        dependencies.request("https://adsense.googleapis.com/v2/accounts?pageSize=100"),
        dependencies.request(`https://adsense.googleapis.com/v2/${account}/sites?pageSize=100`),
        dependencies.request(`https://adsense.googleapis.com/v2/${account}/policyIssues?pageSize=100`),
        dependencies.request(`https://adsense.googleapis.com/v2/${account}/alerts?languageCode=en`),
        dependencies.request(`https://adsense.googleapis.com/v2/${account}/reports:generate?${reportParams}`),
        dependencies.fetchAdsTxt()
      ]);
      const data = transformAdsenseResponses({ accounts, sites, policyIssues, alerts, report, adsTxt }, dependencies);
      await dependencies.cache.success("google-adsense", key, { source: "Google AdSense Management API", range, fetchedAt: now.toISOString(), data });
    } catch {
      await dependencies.cache.failure("google-adsense", key, { source: "Google AdSense Management API", range });
    }
    return dependencies.cache.read<AdsenseReport>("google-adsense", key);
  };
}

export async function fetchAdsenseReport(preset: ReportPreset): Promise<ReportEnvelope<AdsenseReport>> {
  const config = parseGoogleProviderEnv();
  const publisherId = config.publisherId ?? await readGoogleResourceId("google-adsense");
  if (!publisherId) {
    const range = resolveReportRange(preset);
    await markReportFailure("google-adsense", `revenue:${preset}`, { source: "Google AdSense Management API", range });
    return readReport("google-adsense", `revenue:${preset}`);
  }
  const request = createGoogleHttpClient({ clientId: config.clientId, clientSecret: config.clientSecret, readRefreshToken: () => readGoogleRefreshToken("google-adsense", config.encryptionKey) });
  return createAdsenseProvider({
    publisherId,
    blogOrigin: config.blogOrigin,
    request,
    fetchAdsTxt: createAdsTxtFetcher(config.blogOrigin),
    cache: { read: readReport, success: writeSuccessfulReport, failure: markReportFailure }
  })(preset);
}
