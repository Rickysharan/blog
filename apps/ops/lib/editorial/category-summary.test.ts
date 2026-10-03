import { describe, expect, it } from "vitest";

import type { EditorialInventory } from "@omnilede/editorial";

import { buildCategorySummaries } from "./category-summary";

describe("buildCategorySummaries", () => {
  it("always returns all six ordered categories and treats absent content as real zero counts", () => {
    const inventory: EditorialInventory = {
      source: "github",
      version: "a".repeat(40),
      items: [
        { kind: "published", category: "sports", filename: "match.mdx", slug: "match", date: "2026-10-01T00:00:00.000Z" },
        { kind: "draft", category: "sports", filename: "preview.mdx", slug: "preview", date: "2026-10-02T00:00:00.000Z" }
      ]
    };

    const summaries = buildCategorySummaries(inventory, { now: new Date("2026-10-03T12:00:00.000Z") });

    expect(summaries.map(({ category }) => category)).toEqual([
      "anime", "movies", "politics", "sports", "finance", "share-market"
    ]);
    expect(summaries.find(({ category }) => category === "sports")).toMatchObject({
      publishedCount: 1,
      draftCount: 1,
      latestPublication: "2026-10-01T00:00:00.000Z",
      coverageAgeDays: 2
    });
    expect(summaries.filter(({ category }) => category !== "sports")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "anime", publishedCount: 0, draftCount: 0, latestPublication: null, coverageAgeDays: null })
      ])
    );
  });

  it("keeps disconnected report values unavailable instead of inventing zero", () => {
    const inventory: EditorialInventory = { source: "github", items: [] };
    const summaries = buildCategorySummaries(inventory, {
      views: { source: "Google Analytics", range: { start: "2026-09-06", end: "2026-10-03" }, fetchedAt: null, state: "disconnected", data: null },
      clicks: { source: "Google Search Console", range: { start: "2026-09-06", end: "2026-10-03" }, fetchedAt: null, state: "unavailable", data: null }
    });

    expect(summaries[0]?.views).toEqual({ value: null, state: "disconnected", source: "Google Analytics", fetchedAt: null });
    expect(summaries[0]?.clicks.value).toBeNull();
  });
});
