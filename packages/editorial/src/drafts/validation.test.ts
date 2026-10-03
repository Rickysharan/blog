import { describe, expect, it } from "vitest";

import {
  validateDraftMdx,
  validateDraftRef,
} from "../index";
import { makeValidMdx } from "../test-fixtures";

describe("validateDraftRef", () => {
  it("rejects traversal before constructing a filesystem or Git path", () => {
    expect(() =>
      validateDraftRef({ category: "anime", filename: "../secret.mdx" }),
    ).toThrow(/filename/i);
    expect(() =>
      validateDraftRef({ category: "anime", filename: "%2e%2e%2fsecret.mdx" }),
    ).toThrow(/filename/i);
  });

  it("accepts only supported categories and canonical MDX filenames", () => {
    expect(validateDraftRef({ category: "anime", filename: "story.mdx" })).toEqual({
      category: "anime",
      filename: "story.mdx",
    });
    expect(() =>
      validateDraftRef({ category: "local-news", filename: "story.mdx" }),
    ).toThrow(/category/i);
    expect(() =>
      validateDraftRef({ category: "anime", filename: "Story.mdx" }),
    ).toThrow(/filename/i);
  });
});

describe("validateDraftMdx", () => {
  it("requires the filename, category, Why it matters section and final source", () => {
    const ref = { category: "anime", filename: "story.mdx" } as const;
    expect(validateDraftMdx(ref, makeValidMdx())).toMatchObject({
      slug: "story",
      category: "anime",
    });

    expect(() =>
      validateDraftMdx(ref, makeValidMdx({ category: "movies" })),
    ).toThrow(/category/i);
    expect(() =>
      validateDraftMdx(
        ref,
        makeValidMdx().replace("## Why it matters", "## More details"),
      ),
    ).toThrow(/Why it matters/i);
  });
});


describe("shared validation boundaries", () => {
  it.each(["anime", "movies", "politics", "sports", "finance", "share-market"])("accepts %s", (category) => {
    expect(validateDraftRef({ category, filename: "story.mdx" }).category).toBe(category);
  });
  it.each(["../story.mdx", "a/story.mdx", "a\\story.mdx", "%2fstory.mdx", "Story.mdx", "story.mdx/extra", "story..mdx", "story.md", ""])("rejects unsafe filename %s", (filename) => {
    expect(() => validateDraftRef({ category: "anime", filename })).toThrow(/filename/i);
  });
  it.each([
    ["slug", () => makeValidMdx({ slug: "different" })],
    ["source", () => makeValidMdx().replace("Source: [", "Citation: [")],
    ["source", () => makeValidMdx() + "\nExtra trailing text"],
    ["frontmatter", () => "not frontmatter"],
    ["imports", () => makeValidMdx() + "\nimport X from 'x'"],
    ["exports", () => makeValidMdx() + "\nexport const x = 1"],
    ["256 KiB", () => makeValidMdx() + "é".repeat(131072)],
  ])("rejects invalid MDX: %s", (reason, source) => {
    expect(() => validateDraftMdx({ category: "anime", filename: "story.mdx" }, source())).toThrow();
  });
});
