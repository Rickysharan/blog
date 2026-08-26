import { describe, expect, it } from "vitest";

import { selectHomepageStories } from "@/lib/content/homepage";
import type { ArticleSummary } from "@/lib/content/schema";

function story(
  slug: string,
  category: ArticleSummary["category"],
  date: string,
): ArticleSummary {
  return {
    title: slug,
    slug,
    date,
    category,
    tags: [category],
    author: "OmniLede Editorial",
    excerpt: `${slug} excerpt`,
    coverImage: `/images/articles/${category}.svg`,
    readTime: 5,
    sourceName: "Example",
    sourceUrl: `https://example.com/${slug}`,
  };
}

describe("selectHomepageStories", () => {
  it("selects the newest lead, every desk leader, and a deduplicated latest feed", () => {
    const articles = [
      story("anime-new", "anime", "2026-08-23"),
      story("politics-new", "politics", "2026-08-22"),
      story("anime-old", "anime", "2026-08-20"),
    ];

    const result = selectHomepageStories(articles, 5);

    expect(result.lead?.slug).toBe("anime-new");
    expect(result.categoryStories.anime?.slug).toBe("anime-new");
    expect(result.categoryStories.politics?.slug).toBe("politics-new");
    expect(result.categoryStories.movies).toBeNull();
    expect(result.latest.map(({ slug }) => slug)).toEqual([
      "politics-new",
      "anime-old",
    ]);
  });
});
