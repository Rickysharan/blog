import { describe, expect, it, vi } from "vitest";

import { fetchMarketSnapshot } from "@/lib/market/provider";

describe("fetchMarketSnapshot", () => {
  it("normalizes all four requested indices in display order", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        { symbol: "^IXIC", price: 18123.45, change: -12.5, changePercentage: -0.07, timestamp: 1787770000 },
        { symbol: "^NSEI", price: 25001.1, change: 100.2, changePercentage: 0.4, timestamp: 1787770000 },
        { symbol: "^GSPC", price: 6200.25, change: 4.5, changesPercentage: 0.07, timestamp: 1787770000 },
        { symbol: "^BSESN", price: 81200, change: 200, changePercentage: 0.25, timestamp: 1787770000 },
      ]),
    );

    const snapshot = await fetchMarketSnapshot({
      fetchImpl,
      apiKey: "test-key",
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(snapshot.status).toBe("available");
    expect(snapshot.quotes.map(({ label }) => label)).toEqual([
      "Nifty 50",
      "Sensex",
      "S&P 500",
      "Nasdaq Composite",
    ]);
    expect(snapshot.quotes[0]).toMatchObject({ value: 25001.1, changePercent: 0.4 });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(/stable\/quote/),
      expect.objectContaining({ next: { revalidate: 1800 } }),
    );
  });

  it("returns a truthful unavailable snapshot without credentials or valid data", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchMarketSnapshot({ apiKey: undefined, fetchImpl })).resolves.toMatchObject({
      status: "unavailable",
      quotes: [],
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(
      fetchMarketSnapshot({
        apiKey: "test-key",
        fetchImpl: async () => Response.json([{ symbol: "^NSEI", price: "not-a-number" }]),
      }),
    ).resolves.toMatchObject({ status: "unavailable", quotes: [] });
  });

  it("returns a partial snapshot without fabricating missing indices", async () => {
    const snapshot = await fetchMarketSnapshot({
      apiKey: "test-key",
      fetchImpl: async () =>
        Response.json([
          { symbol: "^GSPC", price: 6200, change: 5, changePercentage: 0.08, timestamp: 1787770000 },
        ]),
    });

    expect(snapshot.status).toBe("partial");
    expect(snapshot.quotes).toHaveLength(1);
    expect(snapshot.quotes[0]?.symbol).toBe("^GSPC");
  });
});
