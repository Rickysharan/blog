import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
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

  it("rejects duplicate contributor publication IDs in a fixture library", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "omnilede-publication-id-"));
    const publicationId = "10000000-0000-4000-8000-000000000003";

    try {
      await Promise.all(
        ["anime", "movies"].map((category) =>
          mkdir(path.join(rootDir, "articles", category), { recursive: true }),
        ),
      );
      await Promise.all(
        ["anime", "movies"].map((category, index) => {
          const slug = `${category}-contributor-story`;
          const source = [
            "---",
            `title: ${category} contributor story`,
            `slug: ${slug}`,
            `date: 2026-08-2${index}`,
            `category: ${category}`,
            "tags:",
            "  - contributor",
            "author: Ada Contributor",
            "excerpt: A fixture article with contributor attribution.",
            `coverImage: /images/articles/${category}.svg`,
            "readTime: 3",
            "sourceName: Example Newsroom",
            `sourceUrl: https://example.com/${slug}`,
            "region: europe",
            "language: en-GB",
            "contributorId: 10000000-0000-4000-8000-000000000001",
            "contributorName: Ada Contributor",
            "submissionId: 10000000-0000-4000-8000-000000000002",
            `publicationId: ${publicationId}`,
            "---",
            "",
            "Fixture body.",
          ].join("\n");

          return writeFile(
            path.join(rootDir, "articles", category, `${slug}.mdx`),
            source,
          );
        }),
      );

      await expect(getAllArticles({ rootDir })).rejects.toThrow(
        /duplicate publication id.*10000000-0000-4000-8000-000000000003/i,
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe("article collection helpers", () => {
  it("keeps at least two published explainers in every global desk", async () => {
    const articles = await getAllArticles();
    const counts = new Map<string, number>();

    for (const article of articles) {
      counts.set(article.category, (counts.get(article.category) ?? 0) + 1);
    }

    expect(articles.length).toBeGreaterThanOrEqual(12);
    for (const category of ["anime", "movies", "politics", "sports", "finance", "share-market"]) {
      expect(counts.get(category)).toBeGreaterThanOrEqual(2);
    }
  });

  it("preserves current published articles and carries their default language", async () => {
    const articles = await getAllArticles();

    expect(articles).toHaveLength(18);
    expect(articles.map(({ slug }) => slug)).toContain(
      "how-to-read-global-economic-forecasts-without-treating-them-as-certainty",
    );
    expect(articles.every(({ language }) => language === "en")).toBe(true);
  });

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
        region: "europe",
        language: "en-GB",
        contributorId: "10000000-0000-4000-8000-000000000001",
        contributorName: "Ada Contributor",
        submissionId: "10000000-0000-4000-8000-000000000002",
        publicationId: "10000000-0000-4000-8000-000000000003",
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
