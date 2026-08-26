import { describe, expect, it } from "vitest";

import type { QueueStory } from "@/lib/pipeline/types";
import {
  canonicalizeSourceUrl,
  dedupeStories,
  normalizeTitle,
} from "@/lib/pipeline/dedupe";

function story(overrides: Partial<QueueStory> = {}): QueueStory {
  return {
    title: "Studio confirms a new season for Global Quest",
    source: "Outlet A",
    sourceUrl: "https://a.test/story",
    date: "2026-08-25T12:00:00.000Z",
    snippet: "Short",
    category: "anime",
    ...overrides,
  };
}

describe("canonicalizeSourceUrl", () => {
  it("removes tracking parameters and fragments while sorting useful parameters", () => {
    expect(
      canonicalizeSourceUrl(
        "https://Example.com/news/?utm_source=rss&b=2&fbclid=secret&a=1#comments",
      ),
    ).toBe("https://example.com/news?a=1&b=2");
  });

  it("rejects non-HTTPS source URLs", () => {
    expect(() => canonicalizeSourceUrl("http://example.com/story")).toThrow(
      /HTTPS/,
    );
  });
});

describe("normalizeTitle", () => {
  it("normalizes punctuation, stop words, inflections and outlet suffixes", () => {
    expect(normalizeTitle("The Studios Confirmed: New Seasons! - Reuters")).toBe(
      "studio confirm new season",
    );
  });
});

describe("dedupeStories", () => {
  it("collapses tracking variants and near-identical cross-source headlines", () => {
    const result = dedupeStories([
      story({
        sourceUrl: "https://a.test/x?utm_source=rss",
      }),
      story({
        title: "Global Quest new season confirmed by studio",
        source: "Outlet B",
        sourceUrl: "https://b.test/y",
        date: "2026-08-25T13:00:00.000Z",
        snippet: "A richer factual summary from another outlet.",
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.snippet).toMatch(/richer/);
  });

  it("deduplicates canonical URL variants within one category", () => {
    expect(
      dedupeStories([
        story({ sourceUrl: "https://a.test/x?utm_medium=rss" }),
        story({ sourceUrl: "https://a.test/x?utm_campaign=daily" }),
      ]),
    ).toHaveLength(1);
  });

  it("does not merge similar titles from different categories", () => {
    expect(
      dedupeStories([
        story({ category: "sports" }),
        story({ category: "finance" }),
      ]),
    ).toHaveLength(2);
  });

  it("does not merge similar stories more than 72 hours apart", () => {
    expect(
      dedupeStories([
        story({ date: "2026-08-20T12:00:00.000Z" }),
        story({
          title: "Global Quest new season confirmed by studio",
          sourceUrl: "https://b.test/later-story",
          date: "2026-08-25T12:00:01.000Z",
        }),
      ]),
    ).toHaveLength(2);
  });
});
