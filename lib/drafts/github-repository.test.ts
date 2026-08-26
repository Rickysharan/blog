import { describe, expect, it, vi } from "vitest";

import { GitHubDraftRepository } from "@/lib/drafts/github-repository";
import { makeValidMdx } from "@/tests/helpers/temp-content";

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
        return Response.json({ object: { sha: "expected-head" } });
      }
      if (url.endsWith("/git/commits/expected-head")) {
        return Response.json({ tree: { sha: "base-tree" } });
      }
      if (url.endsWith("/git/trees/base-tree?recursive=1")) {
        return Response.json({
          truncated: false,
          tree: [
            {
              path: "content/drafts/anime/story.mdx",
              type: "blob",
              mode: "100644",
              sha: "draft-blob",
            },
          ],
        });
      }
      if (url.endsWith("/git/blobs") && method === "POST") {
        return Response.json({ sha: "article-blob" }, { status: 201 });
      }
      if (url.endsWith("/git/trees") && method === "POST") {
        recordedTreeEntries.push(...(body.tree as unknown[]));
        return Response.json({ sha: "new-tree" }, { status: 201 });
      }
      if (url.endsWith("/git/commits") && method === "POST") {
        return Response.json(
          { sha: "new-commit", html_url: "https://github.test/commit/new-commit" },
          { status: 201 },
        );
      }
      if (url.endsWith("/git/refs/heads/main") && method === "PATCH") {
        return Response.json({ object: { sha: "new-commit" } });
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
      "expected-head",
    );

    expect(recordedTreeEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "content/articles/anime/story.mdx",
          mode: "100644",
          type: "blob",
          sha: "article-blob",
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
    ).toEqual({ sha: "new-commit", force: false });
    expect(result.commitUrl).toBe("https://github.test/commit/new-commit");
  });

  it("maps a non-fast-forward ref update to a typed conflict", async () => {
    const responses = [
      Response.json({ object: { sha: "head" } }),
      Response.json({ tree: { sha: "tree" } }),
      Response.json({
        truncated: false,
        tree: [
          { path: "content/drafts/anime/story.mdx", type: "blob", sha: "draft" },
        ],
      }),
      Response.json({ sha: "blob" }, { status: 201 }),
      Response.json({ sha: "new-tree" }, { status: 201 }),
      Response.json({ sha: "commit" }, { status: 201 }),
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
        "head",
      ),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
