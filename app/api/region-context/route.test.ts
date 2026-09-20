import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/region-context/route";

describe("GET /api/region-context", () => {
  it("returns an honest no-store fallback when no edge location is available", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      countryCode: null,
      region: "global",
      source: "fallback",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
