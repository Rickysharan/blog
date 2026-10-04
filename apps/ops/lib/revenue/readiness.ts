export type ReadinessFinding = {
  id: string;
  label: string;
  status: "pass" | "block";
  summary: string;
  action: string | null;
};

export type AdsenseReadinessInput = {
  providerState: "connected" | "stale" | "unavailable" | "disconnected";
  accountStatus: "READY" | "NEEDS_ATTENTION" | "CLOSED" | null;
  siteStatus: "REQUIRES_REVIEW" | "GETTING_READY" | "READY" | "NEEDS_ATTENTION" | null;
  ownershipVerified: boolean | null;
  adsTxtStatus: "valid" | "missing" | "invalid" | "unavailable";
  consentConfigured: boolean;
  commercialEnabled: boolean;
  adsenseEnabled: boolean;
  publisherIdsMatch: boolean;
  slotsValid: boolean;
  policyIssueCount: number;
  configurationIssueCount: number;
};

function finding(id: string, label: string, pass: boolean, good: string, bad: string, action: string): ReadinessFinding {
  return { id, label, status: pass ? "pass" : "block", summary: pass ? good : bad, action: pass ? null : action };
}

export function evaluateAdsenseReadiness(input: AdsenseReadinessInput): ReadinessFinding[] {
  return [
    finding("connection", "Google connection", input.providerState === "connected", "AdSense reporting is connected.", `AdSense is ${input.providerState}.`, "Connect or refresh the read-only Google provider."),
    finding("account", "AdSense account", input.accountStatus === "READY", "The account is Ready.", input.accountStatus ? `Account status is ${input.accountStatus}.` : "Account status is unavailable.", "Resolve account tasks in AdSense."),
    finding("ownership", "Site ownership", input.ownershipVerified === true, "Google has verified the site through its Ready result.", "Verified ownership is unavailable.", "Complete an ownership method in AdSense and wait for Google to report Ready."),
    finding("site-review", "Site review", input.siteStatus === "READY", "Google reports the site as Ready.", input.siteStatus ? `Google reports ${input.siteStatus}.` : "Site review status is unavailable.", "Submit or resolve the review in AdSense, then wait for an exact Ready status."),
    finding("ads-txt", "ads.txt", input.adsTxtStatus === "valid", "The live seller record matches the configured publisher.", `ads.txt is ${input.adsTxtStatus}.`, "Publish the exact seller record at /ads.txt and wait for Google to recheck it."),
    finding("policy", "Policy", input.providerState === "connected" && input.policyIssueCount === 0, "No current policy issues were returned.", input.providerState === "connected" ? `${input.policyIssueCount} policy issue${input.policyIssueCount === 1 ? "" : "s"} returned.` : "Current policy evidence is unavailable.", "Resolve the provider-reported policy issues after a successful refresh."),
    finding("configuration", "Provider alerts", input.providerState === "connected" && input.configurationIssueCount === 0, "No current configuration alerts were returned.", input.providerState === "connected" ? `${input.configurationIssueCount} configuration alert${input.configurationIssueCount === 1 ? "" : "s"} returned.` : "Current provider alerts are unavailable.", "Review provider messages after a successful refresh."),
    finding("consent", "Reader consent", input.consentConfigured, "Optional-cookie consent keeps advertising blocked until granted.", "Advertising consent behavior is not configured.", "Verify accept, decline, and withdrawal behavior before activation."),
    finding("publisher", "Publisher identifiers", input.publisherIdsMatch, "Publisher and client identifiers match.", "Publisher and client identifiers are missing, invalid, or mismatched.", "Copy the exact 16-digit publisher and client identifiers from AdSense."),
    finding("slots", "Ad placements", input.slotsValid, "Every configured placement has a valid slot identifier.", "One or more placement identifiers are missing or invalid.", "Add the exact 10-digit IDs for every enabled placement."),
    finding("commercial", "Commercial launch", input.commercialEnabled, "Commercial features are enabled.", "Commercial features remain disabled.", "Enable the commercial gate only on hosting whose terms permit monetization."),
    finding("activation", "Ad activation", input.adsenseEnabled, "The AdSense activation switch is enabled.", "AdSense activation remains disabled.", "Enable it only after all provider and site checks pass.")
  ];
}
