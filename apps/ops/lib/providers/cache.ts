import "server-only";

import { reportEnvelopeSchema, type ReportEnvelope, type ReportRange } from "@omnilede/contracts";

import { createServiceSupabaseClient } from "../supabase/server";

export type GoogleProvider = "google-analytics" | "google-search-console" | "google-adsense";
export type CachedReport = {
  provider: GoogleProvider;
  key: string;
  source: string;
  range: ReportRange;
  fetchedAt: string | null;
  state: "connected" | "stale" | "unavailable";
  data: unknown | null;
};

export type ReportCacheStore = {
  hasConnection(provider: GoogleProvider): Promise<boolean>;
  read(provider: GoogleProvider, key: string): Promise<CachedReport | null>;
  write(report: CachedReport): Promise<void>;
};

const fallbackSource: Record<GoogleProvider, string> = {
  "google-analytics": "Google Analytics",
  "google-search-console": "Google Search Console",
  "google-adsense": "Google AdSense"
};

function fallbackRange(): ReportRange {
  const today = new Date().toISOString().slice(0, 10);
  return { start: today, end: today };
}

export function createReportCache(store: ReportCacheStore) {
  return {
    async readReport<T>(provider: GoogleProvider, key: string): Promise<ReportEnvelope<T>> {
      const connected = await store.hasConnection(provider);
      const cached = await store.read(provider, key);
      const source = cached?.source ?? fallbackSource[provider];
      const range = cached?.range ?? fallbackRange();
      if (!connected) return reportEnvelopeSchema.parse({ source, range, fetchedAt: null, state: "disconnected", data: null }) as ReportEnvelope<T>;
      if (!cached) return reportEnvelopeSchema.parse({ source, range, fetchedAt: null, state: "unavailable", data: null }) as ReportEnvelope<T>;
      return reportEnvelopeSchema.parse({ source, range, fetchedAt: cached.fetchedAt, state: cached.state, data: cached.data }) as ReportEnvelope<T>;
    },

    async writeSuccessfulReport<T>(provider: GoogleProvider, key: string, report: { source: string; range: ReportRange; fetchedAt: string; data: T }): Promise<void> {
      const envelope = reportEnvelopeSchema.parse({ ...report, state: "connected" });
      await store.write({ provider, key, source: envelope.source, range: envelope.range, fetchedAt: envelope.fetchedAt, state: "connected", data: envelope.data });
    },

    async markReportFailure(provider: GoogleProvider, key: string, fallback: { source: string; range: ReportRange }): Promise<void> {
      const prior = await store.read(provider, key);
      await store.write(prior?.data !== null && prior?.fetchedAt
        ? { ...prior, state: "stale" }
        : { provider, key, source: fallback.source, range: fallback.range, fetchedAt: null, state: "unavailable", data: null });
    }
  };
}

const databaseStore: ReportCacheStore = {
  async hasConnection(provider) {
    const { data, error } = await createServiceSupabaseClient().from("provider_connections")
      .select("provider").eq("provider", provider).neq("state", "disconnected").maybeSingle();
    if (error) throw new Error("Provider reports are temporarily unavailable");
    return Boolean(data);
  },
  async read(provider, key) {
    const { data, error } = await createServiceSupabaseClient().from("provider_report_cache")
      .select("provider,report_key,source,range_start,range_end,fetched_at,state,data")
      .eq("provider", provider).eq("report_key", key).maybeSingle();
    if (error) throw new Error("Provider reports are temporarily unavailable");
    if (!data) return null;
    return { provider, key, source: data.source, range: { start: data.range_start, end: data.range_end }, fetchedAt: data.fetched_at, state: data.state, data: data.data } as CachedReport;
  },
  async write(report) {
    const { error } = await createServiceSupabaseClient().from("provider_report_cache").upsert({
      provider: report.provider, report_key: report.key, source: report.source,
      range_start: report.range.start, range_end: report.range.end, fetched_at: report.fetchedAt,
      state: report.state, data: report.data
    });
    if (error) throw new Error("Provider reports are temporarily unavailable");
  }
};

const reports = createReportCache(databaseStore);
export const readReport = reports.readReport;
export const writeSuccessfulReport = reports.writeSuccessfulReport;
export const markReportFailure = reports.markReportFailure;
