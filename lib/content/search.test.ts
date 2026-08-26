import { describe, expect, it } from "vitest";

import { buildSearchIndex, searchArticles } from "@/lib/content/search";
import type { ArticleSummary } from "@/lib/content/schema";

const article: ArticleSummary = {
  title: "Coalitions & Co-operation",
  slug: "coalitions-and-cooperation",
  date: "2026-08-20",
  category: "politics",
  tags: ["Global Policy", "Diplomacy"],
  author: "Renée Müller",
  excerpt: "How countries coordinate across borders.",
  coverImage: "/images/articles/politics.svg",
  readTime: 5,
  sourceName: "Example",
  sourceUrl: "https://example.com/coalitions",
};

describe("article search", () => {
  it("matches title, tags, author, and category without case or accents", () => {
    const index = buildSearchIndex([article]);

    expect(searchArticles(index, "GLOBAL POLICY").map(({ slug }) => slug)).toEqual([
      "coalitions-and-cooperation",
    ]);
    expect(searchArticles(index, "renee muller").map(({ slug }) => slug)).toEqual([
      "coalitions-and-cooperation",
    ]);
    expect(searchArticles(index, "POLITICS").map(({ slug }) => slug)).toEqual([
      "coalitions-and-cooperation",
    ]);
  });

  it("returns no results for punctuation-only or unrelated queries", () => {
    const index = buildSearchIndex([article]);

    expect(searchArticles(index, "---")).toEqual([]);
    expect(searchArticles(index, "semiconductors")).toEqual([]);
  });
});
