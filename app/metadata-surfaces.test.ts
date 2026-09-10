import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArticleSummary } from "@/lib/content/schema";

const getAllArticles = vi.fn<() => Promise<ArticleSummary[]>>();

vi.mock("@/lib/content/articles", () => ({ getAllArticles }));

const baseArticle: ArticleSummary = {
  title: "Legacy story",
  slug: "legacy-story",
  date: "2026-09-01",
  category: "politics",
  tags: ["Global"],
  author: "OmniLede Editorial",
  excerpt: "A legacy article remains discoverable.",
  coverImage: "/images/articles/politics.svg",
  readTime: 4,
  sourceName: "Example Wire",
  sourceUrl: "https://example.com/legacy",
};

describe("public discovery metadata", () => {
  beforeEach(() => {
    getAllArticles.mockReset();
  });

  it("emits one global sitemap URL for both legacy and contributor articles", async () => {
    getAllArticles.mockResolvedValue([
      baseArticle,
      {
        ...baseArticle,
        slug: "contributor-story",
        language: "en-IN",
        region: "asia",
        contributorId: "00000000-0000-4000-8000-000000000101",
        contributorName: "Fixture Contributor",
        submissionId: "00000000-0000-4000-8000-000000000111",
        publicationId: "00000000-0000-4000-8000-000000000161",
      },
    ]);
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    const articleUrls = entries
      .map((entry) => entry.url)
      .filter((url) => url.includes("/article/"));

    expect(articleUrls.filter((url) => url.endsWith("/legacy-story"))).toHaveLength(1);
    expect(articleUrls.filter((url) => url.endsWith("/contributor-story"))).toHaveLength(1);
    expect(articleUrls.some((url) => url.includes("/region/"))).toBe(false);
    expect(entries.some((entry) => entry.url.endsWith("/advertise"))).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/guidelines"))).toBe(true);
  });

  it("keeps API and private administration routes out of crawling", async () => {
    const { default: robots } = await import("@/app/robots");
    const metadata = robots();
    const rules = Array.isArray(metadata.rules) ? metadata.rules : [metadata.rules];

    expect(rules[0]?.disallow).toEqual(expect.arrayContaining(["/admin/", "/api/"]));
  });
});
