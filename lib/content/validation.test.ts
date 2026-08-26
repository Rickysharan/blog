import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateContentTree } from "@/lib/content/validation";

describe("validateContentTree", () => {
  it("validates published articles and drafts as separate collections", async () => {
    const result = await validateContentTree({
      rootDir: path.join(process.cwd(), "tests/fixtures/content"),
    });

    expect(result).toEqual({
      publishedCount: 1,
      draftCount: 1,
      errors: [],
      valid: true,
    });
  });

  it("fails closed without echoing malformed article body text", async () => {
    const result = await validateContentTree({
      rootDir: path.join(process.cwd(), "tests/fixtures/invalid-content"),
    });

    expect(result.valid).toBe(false);
    expect(result.publishedCount).toBe(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "article", path: "articles/anime/broken.mdx" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("TOP_SECRET_BODY");
  });
});
