import { describe, expect, it } from "vitest";

import { storedGoogleResourceId } from "./resource-identifiers";

describe("stored Google resource identifiers", () => {
  it("reads only validated identifiers from safe display labels", () => {
    expect(storedGoogleResourceId("google-analytics", "OmniLede · 123456")).toBe("123456");
    expect(storedGoogleResourceId("google-search-console", "https://omnilede.example/")).toBe("https://omnilede.example/");
    expect(storedGoogleResourceId("google-search-console", "sc-domain:omnilede.example")).toBe("sc-domain:omnilede.example");
    expect(storedGoogleResourceId("google-adsense", "pub-1234567890123456")).toBe("pub-1234567890123456");
  });

  it("returns null for placeholders or malformed values", () => {
    expect(storedGoogleResourceId("google-analytics", "GA4 property not selected")).toBeNull();
    expect(storedGoogleResourceId("google-search-console", "javascript:bad")).toBeNull();
    expect(storedGoogleResourceId("google-adsense", "pub-123")).toBeNull();
  });
});
