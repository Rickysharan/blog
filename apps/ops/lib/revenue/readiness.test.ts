import { describe, expect, it } from "vitest";

import { adsenseServingConfig } from "../../../../lib/config/commercial";
import { evaluateAdsenseReadiness, type AdsenseReadinessInput } from "./readiness";

const ready = (): AdsenseReadinessInput => ({
  providerState: "connected", accountStatus: "READY", siteStatus: "READY", ownershipVerified: true,
  configuredSiteStatus: "READY", pendingTasks: [],
  adsTxtStatus: "valid", consentConfigured: true, commercialEnabled: true, adsenseEnabled: true,
  publisherIdsMatch: true, slotsValid: true, policyIssueCount: 0, configurationIssueCount: 0
});

describe("AdSense readiness", () => {
  it("reports ready only when every provider, policy, config, ownership, consent and activation gate passes", () => {
    const findings = evaluateAdsenseReadiness(ready());
    expect(findings.every((finding) => finding.status === "pass")).toBe(true);
    expect(findings.some((finding) => finding.id === "site-review" && finding.summary.includes("Ready"))).toBe(true);
  });

  it.each([
    ["disconnected", { providerState: "disconnected" }],
    ["unavailable", { providerState: "unavailable" }],
    ["review pending", { siteStatus: "GETTING_READY" }],
    ["review required", { siteStatus: "REQUIRES_REVIEW" }],
    ["rejected or attention needed", { siteStatus: "NEEDS_ATTENTION" }],
    ["configured review pending", { configuredSiteStatus: "GETTING_READY" }],
    ["configured status missing", { configuredSiteStatus: null }],
    ["pending-task evidence unavailable", { pendingTasks: null }],
    ["missing ownership", { ownershipVerified: false }],
    ["invalid ads.txt", { adsTxtStatus: "invalid" }],
    ["missing consent behavior", { consentConfigured: false }],
    ["policy issue", { policyIssueCount: 1 }],
    ["configuration issue", { configurationIssueCount: 1 }],
    ["publisher mismatch", { publisherIdsMatch: false }],
    ["invalid slots", { slotsValid: false }],
    ["commercial disabled", { commercialEnabled: false }],
    ["activation disabled", { adsenseEnabled: false }]
  ])("fails closed for %s", (_label, override) => {
    const findings = evaluateAdsenseReadiness({ ...ready(), ...override } as AdsenseReadinessInput);
    expect(findings.some((finding) => finding.status === "block")).toBe(true);
  });

  it("includes every provider pending task as separate blocking evidence", () => {
    const findings = evaluateAdsenseReadiness({ ...ready(), pendingTasks: ["billing-profile-creation", "phone-pin-verification"] });
    expect(findings.filter(({ id }) => id.startsWith("pending-task:"))).toEqual([
      expect.objectContaining({ status: "block", summary: expect.stringContaining("billing-profile-creation") }),
      expect.objectContaining({ status: "block", summary: expect.stringContaining("phone-pin-verification") })
    ]);
    expect(findings.every(({ status }) => status === "pass")).toBe(false);
  });

  it.each([undefined, "REQUIRES_REVIEW", "GETTING_READY", "NEEDS_ATTENTION", "ready", "READY"])("matches the public blog site-status activation gate for %s", (siteStatus) => {
    const environment = {
      ...process.env,
      COMMERCIAL_FEATURES_ENABLED: "true",
      ADSENSE_ENABLED: "true",
      ADSENSE_SITE_STATUS: siteStatus,
      ADSENSE_PUBLISHER_ID: "pub-1234567890123456",
      ADSENSE_CLIENT_ID: "ca-pub-1234567890123456"
    };
    const findings = evaluateAdsenseReadiness({ ...ready(), configuredSiteStatus: siteStatus ?? null });
    expect(findings.every(({ status }) => status === "pass")).toBe(adsenseServingConfig(environment).enabled);
  });
});
