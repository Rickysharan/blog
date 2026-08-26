import { describe, expect, it } from "vitest";

import {
  validateDraftMdx,
  validateDraftRef,
} from "@/lib/drafts/validation";
import { makeValidMdx } from "@/tests/helpers/temp-content";

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
