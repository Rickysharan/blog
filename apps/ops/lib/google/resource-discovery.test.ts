import { describe, expect, it, vi } from "vitest";

import { createGoogleResourceDiscovery } from "./resource-discovery";

const blogOrigin = "https://omnilede-news.netlify.app";

describe("Google resource discovery", () => {
  it("selects the OmniLede Analytics property, exact Search Console site, and AdSense publisher", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn(async (provider: string) => {
      if (provider === "google-analytics") return {
        accountSummaries: [{ account: "accounts/41", displayName: "Ricky", propertySummaries: [
          { property: "properties/111", displayName: "Other" },
          { property: "properties/222", displayName: "OmniLede" }
        ] }]
      };
      if (provider === "google-search-console") return { siteEntry: [
        { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
        { siteUrl: `${blogOrigin}/`, permissionLevel: "siteOwner" }
      ] };
      return { accounts: [{ name: "accounts/pub-1234567890123456", displayName: "OmniLede", state: "READY" }] };
    });

    const result = await createGoogleResourceDiscovery({ blogOrigin, request, save })();

    expect(result).toEqual([
      { provider: "google-analytics", status: "selected", resourceId: "222" },
      { provider: "google-search-console", status: "selected", resourceId: `${blogOrigin}/` },
      { provider: "google-adsense", status: "selected", resourceId: "pub-1234567890123456" }
    ]);
    expect(save).toHaveBeenCalledWith("google-analytics", expect.objectContaining({ accountLabel: "Ricky", propertyLabel: "OmniLede · 222" }), expect.any(String));
    expect(save).toHaveBeenCalledWith("google-search-console", expect.objectContaining({ propertyLabel: `${blogOrigin}/` }), expect.any(String));
  });

  it("records empty providers honestly and isolates an unavailable provider", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn(async (provider: string) => {
      if (provider === "google-analytics") throw new Error("API disabled");
      return provider === "google-search-console" ? { siteEntry: [] } : { accounts: [] };
    });

    const result = await createGoogleResourceDiscovery({ blogOrigin, request, save })();

    expect(result.map(({ status }) => status)).toEqual(["unavailable", "empty", "empty"]);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenCalledWith("google-analytics", null, expect.any(String));
    expect(save).toHaveBeenCalledWith("google-search-console", expect.objectContaining({ propertyLabel: "Search Console site not found" }), expect.any(String));
  });

  it("rejects malformed Google resource identifiers instead of storing them", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn(async (provider: string) => provider === "google-analytics"
      ? { accountSummaries: [{ account: "accounts/x", displayName: "Bad", propertySummaries: [{ property: "properties/not-a-number", displayName: "Bad" }] }] }
      : provider === "google-search-console"
        ? { siteEntry: [{ siteUrl: "javascript:alert(1)", permissionLevel: "siteOwner" }] }
        : { accounts: [{ name: "accounts/pub-invalid", displayName: "Bad" }] });

    const result = await createGoogleResourceDiscovery({ blogOrigin, request, save })();
    expect(result.every(({ status }) => status === "empty")).toBe(true);
  });
});
