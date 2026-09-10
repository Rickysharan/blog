import { describe, expect, it, vi } from "vitest";

import { GitDataClient, GitDataClientError } from "./git-data-client";

function client(fetchImpl: typeof fetch) {
  return new GitDataClient({
    repository: "owner/repo",
    branch: "main",
    token: "super-secret-token",
    apiBase: "https://api.github.test",
    fetchImpl,
  });
}

const HEAD_SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);
const BLOB_SHA = "c".repeat(40);
const NEW_TREE_SHA = "d".repeat(40);
const NEW_COMMIT_SHA = "e".repeat(40);
const DIFFERENT_COMMIT_SHA = "f".repeat(40);

describe("GitDataClient", () => {
  it.each([
    [{ repository: "owner", branch: "main", token: "token" }, "repository"],
    [{ repository: "owner/repo", branch: "../main", token: "token" }, "branch"],
    [{ repository: "owner/repo", branch: "feature..branch", token: "token" }, "branch"],
    [{ repository: "owner/repo", branch: "main/", token: "token" }, "branch"],
    [{ repository: "owner/repo", branch: "main.lock", token: "token" }, "branch"],
    [{ repository: "owner/repo", branch: "main", token: "" }, "token"],
    [{ repository: "owner/repo", branch: "main", token: "token", apiBase: "http://api.github.test" }, "HTTPS"],
  ])("rejects unsafe configuration", (override, expected) => {
    expect(
      () => new GitDataClient(override),
    ).toThrow(expected);
  });

  it("loads a complete snapshot with the pinned API version", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      expect(new Headers(init?.headers).get("x-github-api-version")).toBe("2026-03-10");
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: HEAD_SHA } });
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) return Response.json({ tree: { sha: TREE_SHA } });
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return Response.json({ truncated: false, tree: [{ path: "a", mode: "100644", type: "blob", sha: BLOB_SHA }] });
      }
      return new Response("not found", { status: 404 });
    });

    await expect(client(fetchImpl).snapshot()).resolves.toEqual({
      headSha: HEAD_SHA,
      treeSha: TREE_SHA,
      entries: [{ path: "a", mode: "100644", type: "blob", sha: BLOB_SHA }],
    });
  });

  it("retrieves the immutable latest commit receipt for an exact article path", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      expect(input.toString()).toBe(
        "https://api.github.test/repos/owner/repo/commits?path=content%2Farticles%2Ffinance%2Freport.mdx&sha=main&per_page=1",
      );
      return Response.json([{ sha: NEW_COMMIT_SHA, html_url: `https://github.test/commit/${NEW_COMMIT_SHA}` }]);
    });

    await expect(client(fetchImpl).latestCommitForPath("content/articles/finance/report.mdx")).resolves.toEqual({
      sha: NEW_COMMIT_SHA,
      htmlUrl: `https://github.test/commit/${NEW_COMMIT_SHA}`,
    });
  });

  it.each([
    [{ sha: "not-a-sha", html_url: "https://github.test/commit/nope" }],
    [{ sha: NEW_COMMIT_SHA, html_url: "http://github.test/commit/nope" }],
    [{ sha: NEW_COMMIT_SHA, html_url: "https://github.test/commit/nope?token=secret" }],
    [{}],
  ])("fails closed for malformed path commit receipts", async (receipt) => {
    await expect(
      client(vi.fn(async () => Response.json([receipt]))).latestCommitForPath("content/articles/finance/report.mdx"),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it("fails closed for truncated trees and malformed responses", async () => {
    const responses = [
      Response.json({ object: { sha: HEAD_SHA } }),
      Response.json({ tree: { sha: TREE_SHA } }),
      Response.json({ truncated: true, tree: [] }),
    ];
    await expect(client(vi.fn(async () => responses.shift() as Response)).snapshot()).rejects.toMatchObject({
      code: "storage_unavailable",
    });

    await expect(client(vi.fn(async () => new Response("not-json"))).snapshot()).rejects.toBeInstanceOf(
      GitDataClientError,
    );

    const malformedTree = [
      Response.json({ object: { sha: HEAD_SHA } }),
      Response.json({ tree: { sha: TREE_SHA } }),
      Response.json({ truncated: false, tree: [{ path: 42, type: "blob", sha: BLOB_SHA }] }),
    ];
    await expect(client(vi.fn(async () => malformedTree.shift() as Response)).snapshot()).rejects.toMatchObject({
      code: "storage_unavailable",
    });

    const missingTruncatedFlag = [
      Response.json({ object: { sha: HEAD_SHA } }),
      Response.json({ tree: { sha: TREE_SHA } }),
      Response.json({ tree: [] }),
    ];
    await expect(
      client(vi.fn(async () => missingTruncatedFlag.shift() as Response)).snapshot(),
    ).rejects.toMatchObject({ code: "storage_unavailable" });

    const missingTreeShape = [
      Response.json({ object: { sha: HEAD_SHA } }),
      Response.json({ tree: { sha: TREE_SHA } }),
      Response.json({ truncated: false, tree: [{ path: "a", type: "blob" }] }),
    ];
    await expect(
      client(vi.fn(async () => missingTreeShape.shift() as Response)).snapshot(),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it("rejects an oversized response before reading the body", async () => {
    const response = new Response("", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } });
    await expect(client(vi.fn(async () => response)).snapshot()).rejects.toMatchObject({
      code: "storage_unavailable",
    });
  });

  it.each([
    { path: "a", type: "blob", sha: BLOB_SHA },
    { path: "a", mode: "999999", type: "blob", sha: BLOB_SHA },
    { path: "a", mode: "100644", type: "blob", sha: null },
    { path: "a", mode: "040000", type: "blob", sha: BLOB_SHA },
  ])("rejects a snapshot entry with an invalid mode or shape", async (entry) => {
    const responses = [
      Response.json({ object: { sha: HEAD_SHA } }),
      Response.json({ tree: { sha: TREE_SHA } }),
      Response.json({ truncated: false, tree: [entry] }),
    ];
    await expect(client(vi.fn(async () => responses.shift() as Response)).snapshot()).rejects.toMatchObject({
      code: "storage_unavailable",
    });
  });

  it("rejects a traversal ref head SHA before requesting its commit", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls.push(input.toString());
      return Response.json({ object: { sha: "../unsafe" } });
    });
    await expect(client(fetchImpl).snapshot()).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("rejects a traversal commit tree SHA before requesting its tree", async () => {
    const calls: string[] = [];
    const responses = [
      Response.json({ object: { sha: HEAD_SHA } }),
      Response.json({ tree: { sha: "../unsafe" } }),
    ];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls.push(input.toString());
      return responses.shift() as Response;
    });
    await expect(client(fetchImpl).snapshot()).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(calls).toHaveLength(2);
  });

  it("rejects an oversized streamed response", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const response = new Response(stream);
    await expect(client(vi.fn(async () => response)).snapshot()).rejects.toMatchObject({
      code: "storage_unavailable",
    });
  });

  it("rejects traversal in blob object SHAs", async () => {
    await expect(client(vi.fn(async () => Response.json({}))).readBlob("../secret")).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it.each([
    { encoding: "base64", content: "not base64!" },
    { encoding: "base64", content: "////wA==" },
  ])("rejects malformed blob content", async (payload) => {
    const response = Response.json(payload);
    await expect(
      client(vi.fn(async () => response)).readBlob(BLOB_SHA),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it("rejects a malformed or mismatched successful ref update", async () => {
    const snapshot = {
      headSha: HEAD_SHA,
      treeSha: TREE_SHA,
      entries: [],
    };
    const responses = [
      Response.json({ sha: NEW_TREE_SHA }, { status: 201 }),
      Response.json({ sha: NEW_COMMIT_SHA }, { status: 201 }),
      Response.json({ object: { sha: DIFFERENT_COMMIT_SHA } }),
    ];
    await expect(
      client(vi.fn(async () => responses.shift() as Response)).commitMutation(
        snapshot,
        [{ path: "article.mdx", mode: "100644", type: "blob", sha: BLOB_SHA }],
        "publish",
      ),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it("never includes the token in transport errors", async () => {
    const repository = client(
      vi.fn(async () => {
        throw new Error("network failed with super-secret-token");
      }),
    );
    let caught: unknown;
    try {
      await repository.snapshot();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitDataClientError);
    expect(String(caught)).not.toContain("super-secret-token");
    expect(JSON.stringify(caught)).not.toContain("super-secret-token");
  });
});
