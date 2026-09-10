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
  it("parses a legacy article and defaults its language without changing source fields", () => {
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
      language: "en",
      sourceName: "Example Newsroom",
      sourceUrl: "https://example.com/world/published-story",
      body: "The article body.",
    });
  });

  it("parses a complete contributor attribution group", () => {
    const article = parseArticleFile(
      validMdx.replace(
        "sourceUrl: https://example.com/world/published-story",
        `sourceUrl: https://example.com/world/published-story
region: europe
language: en-GB
contributorId: 10000000-0000-4000-8000-000000000001
contributorName: Ada Contributor
submissionId: 10000000-0000-4000-8000-000000000002
publicationId: 10000000-0000-4000-8000-000000000003`,
      ),
      "/content/articles/politics/published-story.mdx",
    );

    expect(article).toMatchObject({
      region: "europe",
      language: "en-GB",
      contributorId: "10000000-0000-4000-8000-000000000001",
      contributorName: "Ada Contributor",
      submissionId: "10000000-0000-4000-8000-000000000002",
      publicationId: "10000000-0000-4000-8000-000000000003",
    });
  });

  it.each([
    { fields: ["contributorId"] },
    { fields: ["contributorName"] },
    { fields: ["submissionId"] },
    { fields: ["publicationId"] },
    { fields: ["contributorId", "contributorName"] },
    { fields: ["contributorId", "submissionId"] },
    { fields: ["contributorId", "publicationId"] },
    { fields: ["contributorName", "submissionId"] },
    { fields: ["contributorName", "publicationId"] },
    { fields: ["submissionId", "publicationId"] },
    { fields: ["contributorId", "contributorName", "submissionId"] },
    { fields: ["contributorId", "contributorName", "publicationId"] },
    { fields: ["contributorId", "submissionId", "publicationId"] },
    { fields: ["contributorName", "submissionId", "publicationId"] },
  ] as const)("rejects partial contributor attribution: $fields", ({ fields }) => {
    const values = {
      contributorId: "10000000-0000-4000-8000-000000000001",
      contributorName: "Ada Contributor",
      submissionId: "10000000-0000-4000-8000-000000000002",
      publicationId: "10000000-0000-4000-8000-000000000003",
    };
    const partial = fields.map((field) => `${field}: ${values[field]}`).join("\n");
    const article = validMdx.replace(
      "sourceUrl: https://example.com/world/published-story",
      `sourceUrl: https://example.com/world/published-story\n${partial}`,
    );

    expect(() =>
      parseArticleFile(article, "/content/articles/politics/published-story.mdx"),
    ).toThrow(/contributor attribution/i);
  });

  it.each(["region", "language"] as const)(
    "requires explicit %s when contributor attribution is present",
    (omittedField) => {
      const attribution = `region: europe
language: en-GB
contributorId: 10000000-0000-4000-8000-000000000001
contributorName: Ada Contributor
submissionId: 10000000-0000-4000-8000-000000000002
publicationId: 10000000-0000-4000-8000-000000000003`
        .split("\n")
        .filter((line) => !line.startsWith(`${omittedField}:`))
        .join("\n");
      const article = validMdx.replace(
        "sourceUrl: https://example.com/world/published-story",
        `sourceUrl: https://example.com/world/published-story\n${attribution}`,
      );

      expect(() =>
        parseArticleFile(article, "/content/articles/politics/published-story.mdx"),
      ).toThrow(/contributor attribution/i);
    },
  );

  it.each([
    ["region", "antarctica"],
    ["language", "en-12"],
  ])("rejects an invalid %s", (field, value) => {
    const article = validMdx.replace(
      "sourceUrl: https://example.com/world/published-story",
      `sourceUrl: https://example.com/world/published-story\n${field}: ${value}`,
    );

    expect(() =>
      parseArticleFile(article, "/content/articles/politics/published-story.mdx"),
    ).toThrow(/frontmatter/i);
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
