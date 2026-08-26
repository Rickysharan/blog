import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import matter from "gray-matter";

import type { CategorySlug } from "@/lib/config/categories";

export async function createTemporaryContentRoot(prefix = "omnilede-content-") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    root,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

export function makeValidMdx(options: {
  category?: CategorySlug;
  slug?: string;
  title?: string;
  sourceUrl?: string;
} = {}): string {
  const category = options.category ?? "anime";
  const slug = options.slug ?? "story";
  const title = options.title ?? "A Valid Editorial Draft";
  const sourceUrl = options.sourceUrl ?? "https://example.com/story";
  const reporting = Array.from(
    { length: 40 },
    (_, index) => `reporting${index} explains the confirmed update in clear factual language`,
  ).join(" ");
  const analysis = Array.from(
    { length: 40 },
    (_, index) => `analysis${index} describes why the confirmed development matters to readers`,
  ).join(" ");
  const body = `## What happened\n\n${reporting}\n\n## Why it matters\n\n${analysis}\n\nSource: [Example Outlet](${sourceUrl})\n`;

  return matter.stringify(body, {
    title,
    slug,
    date: "2026-08-25",
    category,
    tags: ["Test", "Global"],
    author: "OmniLede Editorial",
    excerpt: "A valid draft used to verify the editorial repository.",
    coverImage: `/images/articles/${category}.svg`,
    readTime: 4,
    sourceName: "Example Outlet",
    sourceUrl,
  });
}
