import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/market/route";

afterEach(() => vi.unstubAllEnvs());

describe("market API route", () => {
  it("returns a cacheable unavailable response without exposing credentials", async () => {
    vi.stubEnv("STOCK_API_KEY", "");
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=1800, stale-while-revalidate=3600",
    );
    expect(JSON.parse(body)).toMatchObject({ status: "unavailable", quotes: [] });
    expect(body).not.toContain("STOCK_API_KEY");
  });
});
