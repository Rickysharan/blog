import { describe, expect, it, vi } from "vitest";

import { GitHubDraftRepository } from "@/lib/drafts/github-repository";
import { makeValidMdx } from "@/tests/helpers/temp-content";

const HEAD_SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);
const DRAFT_BLOB_SHA = "c".repeat(40);
const ARTICLE_BLOB_SHA = "d".repeat(40);
const NEW_TREE_SHA = "e".repeat(40);
const NEW_COMMIT_SHA = "f".repeat(40);

describe("GitHubDraftRepository", () => {
  it("constructs one Git tree containing the article addition and draft deletion", async () => {
    const recordedTreeEntries: unknown[] = [];
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      if (url.endsWith("/git/ref/heads/main")) {
        return Response.json({ object: { sha: HEAD_SHA } });
      }
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) {
        return Response.json({ tree: { sha: TREE_SHA } });
      }
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return Response.json({
          truncated: false,
          tree: [
            {
              path: "content/drafts/anime/story.mdx",
              type: "blob",
              mode: "100644",
              sha: DRAFT_BLOB_SHA,
            },
          ],
        });
      }
      if (url.endsWith("/git/blobs") && method === "POST") {
        return Response.json({ sha: ARTICLE_BLOB_SHA }, { status: 201 });
      }
      if (url.endsWith("/git/trees") && method === "POST") {
        recordedTreeEntries.push(...(body.tree as unknown[]));
        return Response.json({ sha: NEW_TREE_SHA }, { status: 201 });
      }
      if (url.endsWith("/git/commits") && method === "POST") {
        return Response.json(
          { sha: NEW_COMMIT_SHA, html_url: `https://github.test/commit/${NEW_COMMIT_SHA}` },
          { status: 201 },
        );
      }
      if (url.endsWith("/git/refs/heads/main") && method === "PATCH") {
        return Response.json({ object: { sha: NEW_COMMIT_SHA } });
      }
      return new Response("not found", { status: 404 });
    });
    const repository = new GitHubDraftRepository({
      repository: "owner/repo",
      branch: "main",
      token: "secret-token",
      fetchImpl,
      apiBase: "https://api.github.test",
    });

    const result = await repository.publish(
      { category: "anime", filename: "story.mdx" },
      makeValidMdx(),
      HEAD_SHA,
    );

    expect(recordedTreeEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "content/articles/anime/story.mdx",
          mode: "100644",
          type: "blob",
          sha: ARTICLE_BLOB_SHA,
        }),
        expect.objectContaining({
          path: "content/drafts/anime/story.mdx",
          mode: "100644",
          type: "blob",
          sha: null,
        }),
      ]),
    );
    expect(
      calls.find(({ method, url }) => method === "PATCH" && url.includes("/git/refs/"))
        ?.body,
    ).toEqual({ sha: NEW_COMMIT_SHA, force: false });
    expect(result.commitUrl).toBe(`https://github.test/commit/${NEW_COMMIT_SHA}`);
  });

  it("maps a non-fast-forward ref update to a typed conflict", async () => {
    const responses = [
      Response.json({ object: { sha: HEAD_SHA } }),
      Response.json({ tree: { sha: TREE_SHA } }),
      Response.json({
        truncated: false,
        tree: [
          { path: "content/drafts/anime/story.mdx", mode: "100644", type: "blob", sha: DRAFT_BLOB_SHA },
        ],
      }),
      Response.json({ sha: ARTICLE_BLOB_SHA }, { status: 201 }),
      Response.json({ sha: NEW_TREE_SHA }, { status: 201 }),
      Response.json({ sha: NEW_COMMIT_SHA }, { status: 201 }),
      new Response("conflict", { status: 422 }),
    ];
    const repository = new GitHubDraftRepository({
      repository: "owner/repo",
      branch: "main",
      token: "secret-token",
      fetchImpl: vi.fn(async () => responses.shift() as Response),
    });

    await expect(
      repository.publish(
        { category: "anime", filename: "story.mdx" },
        makeValidMdx(),
        HEAD_SHA,
      ),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
