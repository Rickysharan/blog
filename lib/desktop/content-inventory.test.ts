import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEditorialInventory } from "@/lib/desktop/content-inventory";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function temporaryContentRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "omnilede-inventory-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

function articleMdx(input: { slug: string; category: string; date: string }): string {
  return `---
title: ${input.slug} title
slug: ${input.slug}
date: ${input.date}
category: ${input.category}
tags:
  - reporting
author: OmniLede Editorial
excerpt: A valid editorial inventory fixture.
coverImage: /images/articles/${input.category}.svg
readTime: 3
sourceName: Example Newsroom
sourceUrl: https://example.com/${input.slug}
---

Fixture body.
`;
}

async function writeArticle(
  root: string,
  kind: "articles" | "drafts",
  category: string,
  slug: string,
  date: string,
): Promise<void> {
  const directory = path.join(root, kind, category);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${slug}.mdx`), articleMdx({ slug, category, date }), "utf8");
}

describe("desktop editorial content inventory", () => {
  it("returns validated local drafts and published articles and skips invalid MDX", async () => {
    const contentRoot = await temporaryContentRoot();
    await writeArticle(contentRoot, "articles", "politics", "policy-update", "2026-09-28");
    await writeArticle(contentRoot, "drafts", "anime", "anime-preview", "2026-10-01");
    await mkdir(path.join(contentRoot, "articles", "movies"), { recursive: true });
    await writeFile(path.join(contentRoot, "articles", "movies", "broken.mdx"), "not frontmatter", "utf8");

    const inventory = await loadEditorialInventory({ contentRoot, env: {} });

    expect(inventory).toEqual({
      source: "local",
      items: [
        {
          kind: "draft",
          category: "anime",
          filename: "anime-preview.mdx",
          slug: "anime-preview",
          date: "2026-10-01T00:00:00.000Z",
        },
        {
          kind: "published",
          category: "politics",
          filename: "policy-update.mdx",
          slug: "policy-update",
          date: "2026-09-28T00:00:00.000Z",
        },
      ],
    });
  });

  it("uses the configured GitHub tree as the authoritative synced inventory", async () => {
    const contentRoot = await temporaryContentRoot();
    await writeArticle(contentRoot, "articles", "sports", "local-only", "2026-09-20");
    const head = "1".repeat(40);
    const tree = "2".repeat(40);
    const draftBlob = "3".repeat(40);
    const articleBlob = "4".repeat(40);
    const blobs = new Map([
      [draftBlob, articleMdx({ slug: "market-draft", category: "share-market", date: "2026-10-01" })],
      [articleBlob, articleMdx({ slug: "finance-report", category: "finance", date: "2026-09-30" })],
    ]);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: head } });
      if (url.endsWith(`/git/commits/${head}`)) return Response.json({ tree: { sha: tree } });
      if (url.endsWith(`/git/trees/${tree}?recursive=1`)) {
        return Response.json({
          truncated: false,
          tree: [
            { path: "content/drafts/share-market/market-draft.mdx", mode: "100644", type: "blob", sha: draftBlob },
            { path: "content/articles/finance/finance-report.mdx", mode: "100644", type: "blob", sha: articleBlob },
          ],
        });
      }
      const sha = url.split("/").at(-1) ?? "";
      const content = blobs.get(sha);
      return content
        ? Response.json({ sha, encoding: "base64", content: Buffer.from(content).toString("base64") })
        : new Response("missing", { status: 404 });
    });

    const inventory = await loadEditorialInventory({
      contentRoot,
      env: {
        LOCAL_WRITER_SYNC: "true",
        GITHUB_REPOSITORY: "owner/repository",
        GITHUB_BRANCH: "main",
        GITHUB_TOKEN: "test-token",
      },
      fetchImpl,
    });

    expect(inventory.source).toBe("github");
    expect(inventory.items.map(({ kind, category, slug }) => ({ kind, category, slug }))).toEqual([
      { kind: "published", category: "finance", slug: "finance-report" },
      { kind: "draft", category: "share-market", slug: "market-draft" },
    ]);
    expect(inventory.items.some((item) => item.slug === "local-only")).toBe(false);
  });

  it("rejects a failed synced inventory instead of reporting local counts", async () => {
    const contentRoot = await temporaryContentRoot();
    await writeArticle(contentRoot, "articles", "sports", "local-only", "2026-09-20");

    await expect(loadEditorialInventory({
      contentRoot,
      env: {
        LOCAL_WRITER_SYNC: "true",
        GITHUB_REPOSITORY: "owner/repository",
        GITHUB_BRANCH: "main",
        GITHUB_TOKEN: "test-token",
      },
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
    })).rejects.toThrow(/github could not be reached/i);
  });
});
