import { describe, expect, it } from "vitest";

import type { ArticleSummary } from "@/lib/content/schema";
import { buildRssXml } from "@/lib/seo/rss";

const article: ArticleSummary = {
  title: "Markets & Policy",
  slug: "markets-and-policy",
  date: "2026-08-25",
  category: "finance",
  tags: ["Markets", "Policy"],
  author: "OmniLede Editorial",
  excerpt: "What rates <and> policy mean for households & companies.",
  coverImage: "/images/articles/finance.svg",
  readTime: 5,
  sourceName: "Example & Co",
  sourceUrl: "https://example.com/story?a=1&b=2",
};

describe("buildRssXml", () => {
  it("escapes XML while preserving absolute article links", () => {
    const xml = buildRssXml([article], {
      name: "OmniLede & News",
      description: "Global <news>",
      url: "https://news.example",
    });

    expect(xml).toContain("Markets &amp; Policy");
    expect(xml).toContain("What rates &lt;and&gt; policy");
    expect(xml).toContain("https://news.example/article/markets-and-policy");
    expect(xml).toContain('url="https://example.com/story?a=1&amp;b=2"');
    expect(xml).not.toContain("<news>");
  });

  it("sorts newest first and limits the feed to twenty public articles", () => {
    const articles = Array.from({ length: 25 }, (_, index) => ({
      ...article,
      title: `Story ${index}`,
      slug: `story-${index}`,
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    }));
    const xml = buildRssXml(articles, {
      name: "OmniLede",
      description: "Global news",
      url: "https://news.example",
    });

    expect((xml.match(/<item>/g) ?? [])).toHaveLength(20);
    expect(xml.indexOf("Story 24")).toBeLessThan(xml.indexOf("Story 5"));
    expect(xml).not.toContain("Story 0");
  });
});
