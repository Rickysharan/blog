import { describe, expect, it } from "vitest";

import type { ArticleSummary } from "@/lib/content/schema";

import { buildNewsSitemapXml } from "./news-sitemap";

const base: ArticleSummary = {
  title: "Recent & useful report",
  slug: "recent-report",
  date: "2026-10-07",
  category: "finance",
  tags: ["Markets"],
  author: "OmniLede Editorial",
  excerpt: "A verified update.",
  coverImage: "/image.jpg",
  readTime: 4,
  sourceName: "Example",
  sourceUrl: "https://example.com/source",
};

describe("Google News sitemap", () => {
  it("contains only the two most recent UTC publication dates with escaped news metadata", () => {
    const xml = buildNewsSitemapXml([
      base,
      { ...base, title: "Yesterday <update>", slug: "yesterday", date: "2026-10-06" },
      { ...base, title: "Older report", slug: "older", date: "2026-10-05" },
    ], {
      name: "OmniLede & News",
      url: "https://news.example",
      locale: "en_GB",
    }, new Date("2026-10-07T18:00:00.000Z"));

    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain("https://news.example/article/recent-report");
    expect(xml).toContain("https://news.example/article/yesterday");
    expect(xml).not.toContain("https://news.example/article/older");
    expect(xml).toContain("OmniLede &amp; News");
    expect(xml).toContain("Yesterday &lt;update&gt;");
    expect(xml).toContain("<news:language>en</news:language>");
  });
});
