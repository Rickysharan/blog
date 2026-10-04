import { describe, expect, it } from "vitest";

import { evaluateAdsenseReadiness, type AdsenseReadinessInput } from "./readiness";

const ready = (): AdsenseReadinessInput => ({
  providerState: "connected", accountStatus: "READY", siteStatus: "READY", ownershipVerified: true,
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
});
