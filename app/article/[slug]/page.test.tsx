import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const article = {
  title: "A Clear News Headline",
  slug: "a-clear-news-headline",
  date: "2026-09-30",
  category: "world",
  tags: ["Organisation", "Place"],
  author: "OmniLede Editorial",
  excerpt: "A short explanation.",
  coverImage: "/images/articles/world.svg",
  readTime: 2,
  sourceName: "Example Outlet",
  sourceUrl: "https://example.com/story",
  language: "en",
  body: "Article body\n\nSource: [Example Outlet](https://example.com/story)",
};

vi.mock("next/image", () => ({
  default: ({ fill: _fill, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => <img {...props} />,
}));
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/lib/content/articles", () => ({
  getAllArticles: vi.fn(async () => [article]),
  getArticleBySlug: vi.fn(async () => article),
  getRelatedArticles: vi.fn(() => []),
}));
vi.mock("@/lib/content/mdx", () => ({
  renderArticleMdx: vi.fn(async () => (
    <p>Source: <a href="https://example.com/story">Example Outlet</a></p>
  )),
}));
vi.mock("@/components/articles/article-body", () => ({ ArticleBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/articles/article-meta", () => ({ ArticleMeta: () => <div /> }));
vi.mock("@/components/articles/category-label", () => ({ CategoryLabel: () => <div /> }));
vi.mock("@/components/articles/contributor-attribution", () => ({ ContributorAttribution: () => null }));
vi.mock("@/components/articles/related-articles", () => ({ RelatedArticles: () => null }));
vi.mock("@/components/articles/share-actions", () => ({ ShareActions: () => null }));
vi.mock("@/components/ads/ad-slot", () => ({ AdSlot: () => null }));
vi.mock("@/lib/config/commercial", () => ({ commercialFeaturesEnabled: () => false }));
vi.mock("@/lib/config/site", () => ({ SITE_CONFIG: { name: "OmniLede", url: "https://omnilede.example" } }));
vi.mock("@/lib/seo/json-ld", () => ({ buildNewsArticleJsonLd: () => ({}), serializeJsonLd: () => "{}" }));

describe("article page canonical title and source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the headline and canonical source exactly once", async () => {
    const { default: ArticlePage } = await import("@/app/article/[slug]/page");
    render(await ArticlePage({ params: Promise.resolve({ slug: article.slug }) }));

    expect(screen.getAllByRole("heading", { level: 1, name: article.title })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: article.sourceName })).toHaveLength(1);
  });
});
