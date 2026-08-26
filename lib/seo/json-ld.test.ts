import { describe, expect, it } from "vitest";

import {
  buildNewsArticleJsonLd,
  serializeJsonLd,
} from "@/lib/seo/json-ld";
import type { ArticleSummary } from "@/lib/content/schema";

const article: ArticleSummary = {
  title: "A Global Story",
  slug: "a-global-story",
  date: "2026-08-25",
  category: "politics",
  tags: ["Policy", "Global"],
  author: "OmniLede Editorial",
  excerpt: "A concise global summary.",
  coverImage: "/images/articles/politics.svg",
  readTime: 5,
  sourceName: "Example Wire",
  sourceUrl: "https://example.com/source",
};

const site = {
  name: "OmniLede",
  url: "https://news.example",
  publisher: "OmniLede Editorial",
};

describe("buildNewsArticleJsonLd", () => {
  it("emits a canonical NewsArticle object with publisher and source URL", () => {
    expect(buildNewsArticleJsonLd(article, site)).toMatchObject({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: article.title,
      mainEntityOfPage: "https://news.example/article/a-global-story",
      isBasedOn: "https://example.com/source",
      publisher: { "@type": "Organization", name: "OmniLede Editorial" },
    });
  });

  it("serializes less-than characters safely for an inline script", () => {
    expect(serializeJsonLd({ headline: "</script><script>alert(1)</script>" })).not.toContain(
      "</script>",
    );
    expect(serializeJsonLd({ headline: "<unsafe>" })).toContain("\\u003cunsafe>");
  });
});
