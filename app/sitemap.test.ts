import { beforeEach, describe, expect, it, vi } from "vitest";

import { SITE_CONFIG } from "@/lib/config/site";

const articles = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/articles", () => ({ getAllArticles: articles }));

import sitemap from "./sitemap";

const base = { date: "2026-10-01", category: "anime" as const, author: "OmniLede Editorial", excerpt: "Useful original context.", coverImage: "/image.jpg", readTime: 4, sourceName: "Example", sourceUrl: "https://example.com/source" };

beforeEach(() => vi.clearAllMocks());

describe("sitemap", () => {
  it("includes only qualified canonical topic hubs while preserving article and category URLs", async () => {
    articles.mockResolvedValue([
      { ...base, slug: "one", title: "One", tags: ["Streaming"] },
      { ...base, slug: "two", title: "Two", tags: ["streaming"] },
      { ...base, slug: "three", title: "Three", tags: ["STREAMING"], category: "movies" },
      { ...base, slug: "thin", title: "Thin", tags: ["One off"] },
    ]);
    const entries = await sitemap();
    const urls = entries.map(({ url }) => url);
    expect(urls).toContain(`${SITE_CONFIG.url}/`);
    expect(entries.find(({ url }) => url === `${SITE_CONFIG.url}/`)).toMatchObject({ changeFrequency: "daily", priority: 1 });
    expect(urls.some((url) => url.endsWith("/topic/streaming"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/topic/one-off"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/article/one"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/category/anime"))).toBe(true);
    expect(urls).toContain(`${SITE_CONFIG.url}/author/ricky-sharan`);
  });
});
