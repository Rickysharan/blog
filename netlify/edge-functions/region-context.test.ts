import { describe, expect, it } from "vitest";

import regionContext, { mapCountryToRegion } from "./region-context";

describe("region context Edge Function", () => {
  it.each([
    ["US", "north-america"],
    ["GB", "europe"],
    ["IN", "asia"],
    ["BR", "latin-america"],
    ["ZA", "africa"],
    ["JP", "asia"],
    ["AU", "oceania"],
    ["AE", "middle-east"],
    ["gb", "europe"],
  ])("maps %s to %s", (countryCode, region) => {
    expect(mapCountryToRegion(countryCode)).toBe(region);
  });

  it.each([undefined, null, "", "?", "ZZZ"])("falls back globally for %s", (countryCode) => {
    expect(mapCountryToRegion(countryCode)).toBe("global");
  });

  it("returns only coarse country context and never serializes precise geography", async () => {
    const response = await regionContext(
      new Request("https://omnilede.example/api/region-context"),
      {
        geo: {
          city: "London",
          country: { code: "GB", name: "United Kingdom" },
          latitude: 51.5,
          longitude: -0.1,
          postalCode: "SW1A",
        },
        ip: "203.0.113.10",
      } as never,
    );
    const body = await response.json();

    expect(body).toEqual({ countryCode: "GB", region: "europe", source: "netlify" });
    expect(JSON.stringify(body)).not.toMatch(/ip|city|postal|latitude|longitude/i);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses a truthful fallback response when country data is missing", async () => {
    const response = await regionContext(
      new Request("https://omnilede.example/api/region-context"),
      { geo: {} } as never,
    );

    await expect(response.json()).resolves.toEqual({
      countryCode: null,
      region: "global",
      source: "fallback",
    });
  });
});
