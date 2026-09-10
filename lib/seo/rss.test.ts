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
  language: "en-IN",
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
    expect(xml).toContain("<dc:language>en-IN</dc:language>");
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
    expect(xml).not.toContain("<news>");
  });

  it("keeps legacy articles and contributor articles on one global canonical URL", () => {
    const legacy = { ...article, slug: "legacy-story", language: undefined };
    const contributor = {
      ...article,
      slug: "contributor-story",
      contributorId: "00000000-0000-4000-8000-000000000101",
      contributorName: "Fixture Contributor",
      submissionId: "00000000-0000-4000-8000-000000000111",
      publicationId: "00000000-0000-4000-8000-000000000161",
      region: "asia" as const,
    };
    const xml = buildRssXml([legacy, contributor], {
      name: "OmniLede",
      description: "Global news",
      url: "https://news.example",
    });

    expect(xml).toContain("https://news.example/article/legacy-story");
    expect(xml).toContain("https://news.example/article/contributor-story");
    expect(xml).toContain("<dc:language>en</dc:language>");
    expect(xml).not.toContain("/region/");
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
