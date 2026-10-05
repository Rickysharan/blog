import { describe, expect, it } from "vitest";

import type { ArticleSummary } from "./schema";
import { getQualifiedTopics } from "./topics";

function article(slug: string, tags: string[], overrides: Partial<ArticleSummary> = {}): ArticleSummary {
  return {
    title: `Story ${slug}`,
    slug,
    date: "2026-10-01",
    category: "anime",
    tags,
    author: "OmniLede Editorial",
    excerpt: `Original reporting context for ${slug}.`,
    coverImage: "/images/articles/anime.svg",
    readTime: 4,
    sourceName: "Example",
    sourceUrl: "https://example.com/source",
    ...overrides,
  };
}

describe("getQualifiedTopics", () => {
  it("publishes one useful canonical hub only after three distinct related articles", () => {
    const two = [article("one", ["Streaming"]), article("two", ["streaming"])];
    expect(getQualifiedTopics(two)).toEqual([]);

    const topics = getQualifiedTopics([...two, article("three", ["STREAMING"], { category: "movies" })]);
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      slug: "streaming",
      label: "Streaming",
      canonicalPath: "/topic/streaming",
      articles: expect.arrayContaining([expect.objectContaining({ slug: "one" }), expect.objectContaining({ slug: "two" }), expect.objectContaining({ slug: "three" })]),
      categories: ["anime", "movies"],
    });
    expect(topics[0]?.summary).toMatch(/Streaming/);
    expect(topics[0]?.summary).not.toMatch(/undefined|template/i);
  });

  it("does not create thin, unsafe, empty, duplicated, or tag-stuffed topics", () => {
    const tags = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Stuffed"];
    const topics = getQualifiedTopics([
      article("thin-1", ["Thin"]), article("thin-2", ["Thin"]),
      article("unsafe-1", ["../../unsafe"]), article("unsafe-2", ["../../unsafe"]), article("unsafe-3", ["../../unsafe"]),
      article("empty-1", ["   "]), article("empty-2", ["   "]), article("empty-3", ["   "]),
      article("duplicate", ["Case Topic", "case topic"]),
      article("case-2", ["CASE TOPIC"]), article("case-3", ["case topic"]),
      article("stuff-1", tags), article("stuff-2", tags), article("stuff-3", tags),
    ]);
    expect(topics).toEqual([]);
  });

  it("returns stable article and topic ordering independent of input order", () => {
    const articles = [article("z", ["Global Cinema"], { date: "2026-09-01" }), article("a", ["global cinema"], { date: "2026-10-01" }), article("m", ["GLOBAL CINEMA"], { date: "2026-10-01" })];
    expect(getQualifiedTopics([...articles].reverse())).toEqual(getQualifiedTopics(articles));
    expect(getQualifiedTopics(articles)[0]?.articles.map(({ slug }) => slug)).toEqual(["a", "m", "z"]);
  });
});
