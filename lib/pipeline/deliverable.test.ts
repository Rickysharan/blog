import { describe, expect, it } from "vitest";
import { validateDeliverable } from "@/lib/pipeline/deliverable";
import { makeValidMdx } from "@/tests/helpers/temp-content";

const ref = { category: "sports", filename: "story.mdx" } as const;

function photoBlock(id: number, page = `Photo${id}.jpg`) {
  return `![Baker Mayfield ${id}](https://upload.wikimedia.org/photo${id}.jpg)

Related archive image: Baker Mayfield ${id}. Photo: Photographer ${id} / [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:${page}), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Not a photograph of this news event.`;
}

function withPhotos(count: number): string {
  const mdx = makeValidMdx({ category: "sports" });
  const blocks = Array.from({ length: count }, (_, index) => photoBlock(index + 1)).join("\n\n");
  return mdx.replace("\nSource: ", `\n${blocks}\n\nSource: `);
}

describe("deliverable validation", () => {
  it.each([2, 3])("accepts a complete draft with %i distinct credited photos", async (count) => {
    await expect(validateDeliverable(ref, withPhotos(count))).resolves.toMatchObject({
      ok: true,
      imageCount: count,
    });
  });

  it("rejects one photo while preserving the local text bytes", async () => {
    const mdx = withPhotos(1);
    const before = mdx;

    await expect(validateDeliverable(ref, mdx)).resolves.toMatchObject({
      ok: false,
      category: "insufficient-images",
      imageCount: 1,
    });
    expect(mdx).toBe(before);
  });

  it("rejects duplicate photo pages", async () => {
    const mdx = withPhotos(2).replace("File:Photo2.jpg", "File:Photo1.jpg");
    await expect(validateDeliverable(ref, mdx)).resolves.toMatchObject({
      ok: false,
      category: "insufficient-images",
    });
  });

  it.each([
    {
      name: "duplicate headline",
      change: (mdx: string) => mdx.replace("## What happened", "# A Valid Editorial Draft\n\n## What happened"),
      category: "generation-invalid",
    },
    {
      name: "duplicate source",
      change: (mdx: string) => `${mdx}\nSource: [Example Outlet](https://example.com/story)\n`,
      category: "validation-failed",
    },
    {
      name: "unsafe MDX",
      change: (mdx: string) => mdx.replace("## What happened", "import Danger from 'x'\n\n## What happened"),
      category: "generation-invalid",
    },
    {
      name: "multiline MDX expression",
      change: (mdx: string) => mdx.replace("## What happened", "{\n  1 + 1\n}\n\n## What happened"),
      category: "generation-invalid",
    },
    {
      name: "missing analysis",
      change: (mdx: string) => mdx.replace("## Why it matters", "## Context"),
      category: "generation-invalid",
    },
    {
      name: "insecure destination",
      change: (mdx: string) => mdx.replace("https://upload.wikimedia.org/photo1.jpg", "http://upload.wikimedia.org/photo1.jpg"),
      category: "validation-failed",
    },
  ])("rejects $name", async ({ change, category }) => {
    await expect(validateDeliverable(ref, change(withPhotos(2)))).resolves.toMatchObject({
      ok: false,
      category,
    });
  });
});
