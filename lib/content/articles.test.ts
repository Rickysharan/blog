import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  getAllArticles,
  getArticleBySlug,
  getRelatedArticles,
  paginateArticles,
} from "@/lib/content/articles";
import type { ArticleSummary } from "@/lib/content/schema";

const fixtureRoot = path.join(process.cwd(), "tests/fixtures/content");
const duplicateRoot = path.join(
  process.cwd(),
  "tests/fixtures/duplicate-content",
);

const baseArticle: ArticleSummary = {
  title: "Subject",
  slug: "subject",
  date: "2026-08-20",
  category: "politics",
  tags: ["policy", "trade"],
  author: "OmniLede Editorial",
  excerpt: "Subject excerpt",
  coverImage: "/images/articles/politics.svg",
  readTime: 5,
  sourceName: "Example",
  sourceUrl: "https://example.com/subject",
};

describe("public article discovery", () => {
  it("never returns files from the drafts tree", async () => {
    const articles = await getAllArticles({ rootDir: fixtureRoot });

    expect(articles.map(({ slug }) => slug)).toEqual(["published-story"]);
  });

  it("reads a public article body by global slug", async () => {
    const article = await getArticleBySlug("published-story", {
      rootDir: fixtureRoot,
    });

    expect(article).toMatchObject({
      slug: "published-story",
      body: "Published fixture body.",
    });
    expect(await getArticleBySlug("draft-story", { rootDir: fixtureRoot })).toBeNull();
  });

  it("rejects duplicate public slugs across categories", async () => {
    await expect(getAllArticles({ rootDir: duplicateRoot })).rejects.toThrow(
      /duplicate published slug.*same-story/i,
    );
  });
});

describe("article collection helpers", () => {
  it("ranks related stories by shared tags and then recency", () => {
    const candidates: ArticleSummary[] = [
      {
        ...baseArticle,
        slug: "one-shared-tag-older",
        date: "2026-08-16",
        tags: ["policy"],
      },
      {
        ...baseArticle,
        slug: "two-shared-tags",
        date: "2026-08-10",
        tags: ["trade", "policy"],
      },
      {
        ...baseArticle,
        slug: "one-shared-tag-newer",
        date: "2026-08-19",
        tags: ["trade"],
      },
    ];

    expect(
      getRelatedArticles(baseArticle, candidates, 2).map(({ slug }) => slug),
    ).toEqual(["two-shared-tags", "one-shared-tag-newer"]);
  });

  it("clamps invalid page numbers and preserves an empty collection", () => {
    expect(paginateArticles(["a", "b", "c"], 0, 2)).toEqual({
      items: ["a", "b"],
      page: 1,
      pageCount: 2,
      total: 3,
    });
    expect(paginateArticles([], 4, 10)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
    });
  });
});
