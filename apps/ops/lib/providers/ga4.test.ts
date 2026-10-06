import { describe, expect, it } from "vitest";
import { createGa4Provider, transformGa4Reports } from "./ga4";
import { safeProviderFailure } from "./provider-error";

const report = (dimensions: string[], metrics: string[], values: string[][]) => ({
  dimensionHeaders: dimensions.map((name) => ({ name })), metricHeaders: metrics.map((name) => ({ name, type: "TYPE_INTEGER" })),
  rows: values.map((row) => ({ dimensionValues: row.slice(0, dimensions.length).map((value) => ({ value })), metricValues: row.slice(dimensions.length).map((value) => ({ value })) }))
});
const summaryMetrics = ["activeUsers", "sessions", "screenPageViews", "engagementRate"];
const listMetrics = ["screenPageViews", "sessions"];
function fixture() { return {
  summary: report([], summaryMetrics, [["10", "12", "30", "0.5"]]), trend: report(["date"], summaryMetrics, [["20261004", "10", "12", "30", "0.5"]]),
  channels: report(["sessionDefaultChannelGroup"], listMetrics, [["Organic Search", "20", "8"]]), devices: report(["deviceCategory"], listMetrics, [["mobile", "16", "7"]]), countries: report(["country"], listMetrics, [["United Kingdom", "12", "6"]]), landingPages: report(["landingPagePlusQueryString"], listMetrics, [["/story", "9", "4"]]), articlePaths: report(["pagePath"], listMetrics, [["/story", "9", "4"]])
}; }
describe("GA4 transforms", () => {
  it("parses official-shaped reports without inventing rows", () => expect(transformGa4Reports(fixture())).toMatchObject({ summary: { activeUsers: 10, sessions: 12, views: 30, engagementRate: .5 }, trend: [{ date: "2026-10-04" }], channels: [{ name: "Organic Search", views: 20, sessions: 8 }] }));
  it("accepts a valid empty property without inventing zero metrics", () => {
    const empty = (_dimensions: string[], _metrics: string[]) => ({
      kind: "analyticsData#runReport",
    });
    expect(transformGa4Reports({
      summary: empty([], summaryMetrics),
      trend: empty(["date"], summaryMetrics),
      channels: empty(["sessionDefaultChannelGroup"], listMetrics),
      devices: empty(["deviceCategory"], listMetrics),
      countries: empty(["country"], listMetrics),
      landingPages: empty(["landingPagePlusQueryString"], listMetrics),
      articlePaths: empty(["pagePath"], listMetrics),
    })).toEqual({
      summary: null,
      trend: [],
      channels: [],
      devices: [],
      countries: [],
      landingPages: [],
      articlePaths: [],
    });
  });
  it("rejects missing dimensions and nonfinite values", () => { const missing = fixture(); missing.channels = report([], listMetrics, [["20", "8"]]); expect(() => transformGa4Reports(missing)).toThrow(/columns/); const invalid = fixture(); invalid.summary = report([], summaryMetrics, [["10", "12", "Infinity", "0.5"]]); expect(() => transformGa4Reports(invalid)).toThrow(/Invalid/); });
  it("identifies the failing GA4 report without exposing response data", () => {
    const invalid = fixture();
    invalid.summary = report(["unexpected"], summaryMetrics, [["value", "10", "12", "30", "0.5"]]);
    let failure: unknown;
    try { transformGa4Reports(invalid); } catch (error) { failure = error; }
    expect(safeProviderFailure("google-analytics", failure)).toEqual({
      provider: "google-analytics",
      kind: "invalid-report:ga4-summary-dimension-count",
    });
  });
  it("identifies omitted GA4 metric headers", () => {
    const invalid = fixture();
    delete (invalid.summary as { metricHeaders?: unknown }).metricHeaders;
    let failure: unknown;
    try { transformGa4Reports(invalid); } catch (error) { failure = error; }
    expect(safeProviderFailure("google-analytics", failure)).toEqual({
      provider: "google-analytics",
      kind: "invalid-report:ga4-summary-metrics-missing",
    });
  });
  it("rejects a non-array rows field even when an empty report kind is claimed", () => {
    const invalid = fixture();
    invalid.summary = { kind: "analyticsData#runReport", rows: { length: 0 } } as never;
    expect(() => transformGa4Reports(invalid)).toThrow(/columns/);
  });
  it("sorts daily evidence and rejects impossible, duplicate dates and rates outside 0..1", () => { const sorted = fixture(); sorted.trend = report(["date"], summaryMetrics, [["20261004", "1", "1", "1", ".5"], ["20261002", "1", "1", "1", ".5"]]); expect(transformGa4Reports(sorted).trend.map(({ date }) => date)).toEqual(["2026-10-02", "2026-10-04"]); const impossible = fixture(); impossible.trend = report(["date"], summaryMetrics, [["20260231", "1", "1", "1", ".5"]]); expect(() => transformGa4Reports(impossible)).toThrow(/date/); const duplicate = fixture(); duplicate.trend = report(["date"], summaryMetrics, [["20261004", "1", "1", "1", ".5"], ["20261004", "1", "1", "1", ".5"]]); expect(() => transformGa4Reports(duplicate)).toThrow(/duplicate/i); const rate = fixture(); rate.summary = report([], summaryMetrics, [["1", "1", "1", "1.2"]]); expect(() => transformGa4Reports(rate)).toThrow(/engagementRate/); });
  it("uses official date fields and never stores an invalid response", async () => { const bodies: string[] = []; let successes = 0; let failures = 0; const request = async (_url: string, init?: RequestInit) => { bodies.push(String(init?.body)); return { broken: true }; }; const cache = { read: async () => ({ source: "Google Analytics", range: { start: "2026-10-01", end: "2026-10-01" }, fetchedAt: null, state: "unavailable" as const, data: null }), success: async () => { successes += 1; }, failure: async () => { failures += 1; } }; await createGa4Provider({ request, propertyId: "123", cache, now: () => new Date("2026-10-04T12:00:00Z") })("7d"); expect(JSON.parse(bodies[0]!)).toMatchObject({ dateRanges: [{ startDate: "2026-09-28", endDate: "2026-10-04" }] }); expect(successes).toBe(0); expect(failures).toBe(1); });
});
