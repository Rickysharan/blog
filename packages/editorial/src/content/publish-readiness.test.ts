import { describe, expect, it } from "vitest";

import type { ArticleDocument } from "./schema";
import { validatePublishReadyArticle } from "./publish-readiness";

const images = [1, 2].map((number) =>
  `![Related image ${number}](https://upload.wikimedia.org/photo-${number}.jpg)\n\nPhoto: Photographer ${number} / [Source](https://commons.wikimedia.org/photo-${number}).`,
).join("\n\n");

function article(body: string, category: ArticleDocument["category"] = "top-10"): ArticleDocument {
  return {
    title: "Ten carefully sourced choices",
    slug: "ten-carefully-sourced-choices",
    date: "2026-10-08",
    category,
    tags: ["Lists", "Recommendations"],
    author: "Ricky Sharan",
    excerpt: "Ten carefully sourced choices with clear reasons.",
    coverImage: "https://upload.wikimedia.org/photo-1.jpg",
    readTime: 8,
    sourceName: "Example Source",
    sourceUrl: "https://example.com/list",
    language: "en",
    body,
  };
}

function body(numbers = Array.from({ length: 10 }, (_, index) => index + 1), options: { intro?: boolean; why?: boolean; source?: boolean; images?: boolean } = {}) {
  const { intro = true, why = true, source = true, images: includeImages = true } = options;
  return [
    intro ? "These ten choices are supported by the cited research." : "",
    ...numbers.map((number) => `## ${number}. Choice ${number}\n\nSupported explanation for choice ${number}.`),
    why ? "## Why it matters\n\nThe comparison makes the source material easier to use." : "",
    includeImages ? images : "",
    source ? "Source: [Example Source](https://example.com/list)" : "",
  ].filter(Boolean).join("\n\n");
}

describe("validatePublishReadyArticle", () => {
  it("accepts a sourced Top 10 article with exactly ten sequential entries and credited images", () => {
    expect(() => validatePublishReadyArticle(article(body()))).not.toThrow();
  });

  it.each([
    ["nine entries", Array.from({ length: 9 }, (_, index) => index + 1)],
    ["eleven entries", Array.from({ length: 11 }, (_, index) => index + 1)],
    ["a duplicate", [1, 2, 3, 4, 5, 5, 7, 8, 9, 10]],
    ["a gap", [1, 2, 3, 4, 5, 6, 8, 9, 10]],
    ["out-of-order entries", [1, 2, 3, 5, 4, 6, 7, 8, 9, 10]],
  ])("rejects %s", (_name, numbers) => {
    expect(() => validatePublishReadyArticle(article(body(numbers)))).toThrow(/exactly ten sequential/i);
  });

  it.each([
    ["introduction", { intro: false }, /introduction/i],
    ["Why it matters", { why: false }, /Why it matters/i],
    ["source attribution", { source: false }, /source/i],
    ["credited images", { images: false }, /credited images/i],
  ] as const)("rejects a Top 10 article without %s", (_name, options, error) => {
    expect(() => validatePublishReadyArticle(article(body(undefined, options)))).toThrow(error);
  });

  it("does not impose list rules on another category", () => {
    expect(() => validatePublishReadyArticle(article("Ordinary article body.", "movies"))).not.toThrow();
  });
});
