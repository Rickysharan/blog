import { describe, expect, it } from "vitest";

import { createReportCache, isUsableProviderConnection, type CachedReport, type ReportCacheStore } from "./cache";

function memoryStore(connected = true) {
  let report: CachedReport | null = null;
  const store: ReportCacheStore = {
    hasConnection: async () => connected,
    read: async () => report,
    write: async (next) => { report = next; }
  };
  return { cache: createReportCache(store), current: () => report };
}

const range = { start: "2026-09-01", end: "2026-09-28" };

describe("provider report cache", () => {
  it("requires encrypted credential existence before treating a provider row as connected", () => {
    expect(isUsableProviderConnection("connected", false)).toBe(false);
    expect(isUsableProviderConnection("connected", true)).toBe(true);
    expect(isUsableProviderConnection("disconnected", true)).toBe(false);
  });
  it("returns fresh successful provider data as connected", async () => {
    const { cache } = memoryStore();
    await cache.writeSuccessfulReport("google-analytics", "overview", {
      source: "Google Analytics", range, fetchedAt: "2026-10-04T10:00:00.000Z", data: { views: 42 }
    });
    expect(await cache.readReport<{ views: number }>("google-analytics", "overview")).toEqual({
      source: "Google Analytics", range, fetchedAt: "2026-10-04T10:00:00.000Z", state: "connected", data: { views: 42 }
    });
  });

  it("preserves identical prior data and fetchedAt as stale after failure", async () => {
    const { cache } = memoryStore();
    await cache.writeSuccessfulReport("google-search-console", "queries", {
      source: "Google Search Console", range, fetchedAt: "2026-10-04T10:00:00.000Z", data: { clicks: 9 }
    });
    await cache.markReportFailure("google-search-console", "queries", { source: "Google Search Console", range });
    expect(await cache.readReport("google-search-console", "queries")).toEqual({
      source: "Google Search Console", range, fetchedAt: "2026-10-04T10:00:00.000Z", state: "stale", data: { clicks: 9 }
    });
  });

  it("returns unavailable with no invented numeric values on a first failure", async () => {
    const { cache } = memoryStore();
    await cache.markReportFailure("google-analytics", "overview", { source: "Google Analytics", range });
    expect(await cache.readReport("google-analytics", "overview")).toEqual({
      source: "Google Analytics", range, fetchedAt: null, state: "unavailable", data: null
    });
  });

  it("returns disconnected when no provider connection exists", async () => {
    const { cache } = memoryStore(false);
    expect(await cache.readReport("google-analytics", "overview")).toMatchObject({ state: "disconnected", data: null, fetchedAt: null });
  });
});
