import { describe, expect, it } from "vitest";

import { parseArticleFile } from "@/lib/content/schema";

const validMdx = `---
title: A Published Story
slug: published-story
date: 2026-08-20
category: politics
tags:
  - Global Policy
  - Diplomacy
author: OmniLede Editorial
excerpt: A concise explanation of a global policy development.
coverImage: /images/articles/politics.svg
readTime: 6
sourceName: Example Newsroom
sourceUrl: https://example.com/world/published-story
---

The article body.
`;

describe("parseArticleFile", () => {
  it("parses and normalizes a valid article document", () => {
    const article = parseArticleFile(
      validMdx,
      "/content/articles/politics/published-story.mdx",
    );

    expect(article).toMatchObject({
      title: "A Published Story",
      slug: "published-story",
      date: "2026-08-20",
      category: "politics",
      readTime: 6,
      sourceUrl: "https://example.com/world/published-story",
      body: "The article body.",
    });
  });

  it("rejects mismatched filenames and slugs", () => {
    expect(() =>
      parseArticleFile(validMdx, "/content/articles/politics/wrong-name.mdx"),
    ).toThrow(/filename must match frontmatter slug/i);
  });

  it("rejects insecure source URLs and unsupported fields", () => {
    const invalid = validMdx
      .replace(
        "sourceUrl: https://example.com/world/published-story",
        "sourceUrl: http://example.com/world/published-story",
      )
      .replace("readTime: 6", "readTime: 6\nunreviewed: true");

    expect(() =>
      parseArticleFile(
        invalid,
        "/content/articles/politics/published-story.mdx",
      ),
    ).toThrow(/frontmatter/i);
  });
});
