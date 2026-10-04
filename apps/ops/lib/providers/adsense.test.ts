import { describe, expect, it } from "vitest";
import type { ReportEnvelope } from "@omnilede/contracts";

import { createAdsenseProvider, transformAdsenseResponses } from "./adsense";

const responses = () => ({
  accounts: { accounts: [{ name: "accounts/pub-1234567890123456", displayName: "OmniLede", state: "READY", pendingTasks: [] }] },
  sites: { sites: [{ name: "accounts/pub-1234567890123456/sites/1", domain: "omnilede.example", state: "READY", autoAdsEnabled: false }] },
  policyIssues: { policyIssues: [] },
  alerts: { alerts: [] },
  report: {
    headers: [
      { name: "ESTIMATED_EARNINGS", type: "METRIC_CURRENCY", currencyCode: "GBP" },
      { name: "IMPRESSIONS", type: "METRIC_TALLY" },
      { name: "CLICKS", type: "METRIC_TALLY" },
      { name: "PAGE_VIEWS_RPM", type: "METRIC_CURRENCY", currencyCode: "GBP" }
    ],
    totals: { cells: [{ value: "12.34" }, { value: "2500" }, { value: "18" }, { value: "4.94" }] }
  },
  adsTxt: { status: 200, contentType: "text/plain; charset=utf-8", text: "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n" }
});

describe("AdSense transforms", () => {
  it("validates the configured account/site and maps genuine metrics", () => {
    expect(transformAdsenseResponses(responses(), {
      publisherId: "pub-1234567890123456",
      blogOrigin: "https://omnilede.example"
    })).toMatchObject({
      account: { publisherId: "pub-1234567890123456", displayName: "OmniLede", status: "READY" },
      site: { domain: "omnilede.example", status: "READY", ownershipVerified: true },
      adsTxt: { status: "valid" },
      metrics: { estimatedEarnings: 12.34, impressions: 2500, clicks: 18, pageRpm: 4.94, currency: "GBP" },
      policyMessages: [],
      configurationMessages: []
    });
  });

  it("keeps absent report values unavailable and preserves genuine zeros", () => {
    const missing = responses();
    missing.report.totals = { cells: [{ value: "0" }, {}, { value: "0" }, {}] } as never;
    expect(transformAdsenseResponses(missing, {
      publisherId: "pub-1234567890123456",
      blogOrigin: "https://omnilede.example"
    }).metrics).toEqual({ estimatedEarnings: 0, impressions: null, clicks: 0, pageRpm: null, currency: "GBP" });
  });

  it("rejects foreign accounts, domains, unknown states, malformed metrics and oversized provider lists", () => {
    const foreign = responses();
    foreign.accounts.accounts[0]!.name = "accounts/pub-9999999999999999";
    expect(() => transformAdsenseResponses(foreign, { publisherId: "pub-1234567890123456", blogOrigin: "https://omnilede.example" })).toThrow(/account/i);

    const badSite = responses();
    badSite.sites.sites[0]!.domain = "evil.example";
    expect(() => transformAdsenseResponses(badSite, { publisherId: "pub-1234567890123456", blogOrigin: "https://omnilede.example" })).toThrow(/site/i);

    const badState = responses();
    badState.sites.sites[0]!.state = "APPROVED";
    expect(() => transformAdsenseResponses(badState, { publisherId: "pub-1234567890123456", blogOrigin: "https://omnilede.example" })).toThrow(/state/i);

    const badMetric = responses();
    badMetric.report.totals.cells[1]!.value = "Infinity";
    expect(() => transformAdsenseResponses(badMetric, { publisherId: "pub-1234567890123456", blogOrigin: "https://omnilede.example" })).toThrow(/metric/i);

    const oversized = responses();
    oversized.alerts.alerts = Array.from({ length: 101 }, (_, index) => ({ name: `accounts/a/alerts/${index}`, severity: "INFO", type: "info", message: "message" })) as never;
    expect(() => transformAdsenseResponses(oversized, { publisherId: "pub-1234567890123456", blogOrigin: "https://omnilede.example" })).toThrow(/alert/i);
  });

  it("marks missing, malformed, non-text, and mismatched ads.txt evidence as invalid without claiming approval", () => {
    for (const adsTxt of [
      { status: 404, contentType: "text/plain", text: "" },
      { status: 200, contentType: "text/html", text: "google.com, pub-1234567890123456, DIRECT" },
      { status: 200, contentType: "text/plain", text: "google.com, pub-9999999999999999, DIRECT, f08c47fec0942fa0" },
      { status: 200, contentType: "text/plain", text: "google.com, pub-1234567890123456, RESELLER, f08c47fec0942fa0" }
    ]) {
      const fixture = responses(); fixture.adsTxt = adsTxt;
      expect(transformAdsenseResponses(fixture, { publisherId: "pub-1234567890123456", blogOrigin: "https://omnilede.example" }).adsTxt.status).not.toBe("valid");
    }
  });
});

describe("AdSense provider", () => {
  it("uses bounded official endpoints and preserves stale cache data after a failed refresh", async () => {
    const urls: string[] = [];
    const fixture = responses();
    const queue: unknown[] = [fixture.accounts, fixture.sites, fixture.policyIssues, fixture.alerts, { broken: true }];
    const prior = { source: "Google AdSense Management API", range: { start: "2026-09-28", end: "2026-10-04" }, fetchedAt: "2026-10-04T10:00:00.000Z", state: "stale" as const, data: { old: true } };
    let failures = 0;
    const provider = createAdsenseProvider({
      publisherId: "pub-1234567890123456", blogOrigin: "https://omnilede.example",
      request: async (url) => { urls.push(url); return queue.shift(); },
      fetchAdsTxt: async () => fixture.adsTxt,
      cache: { read: async <T,>() => prior as unknown as ReportEnvelope<T>, success: async () => undefined, failure: async () => { failures += 1; } },
      now: () => new Date("2026-10-04T12:00:00.000Z")
    });
    expect(await provider("7d")).toBe(prior);
    expect(failures).toBe(1);
    expect(urls).toHaveLength(5);
    expect(urls.every((url) => url.startsWith("https://adsense.googleapis.com/v2/"))).toBe(true);
    expect(urls.find((url) => url.includes("reports:generate"))).toContain("limit=1");
    expect(urls.find((url) => url.includes("policyIssues"))).toContain("pageSize=100");
  });
});
