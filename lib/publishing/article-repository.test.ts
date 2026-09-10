import { describe, expect, it, vi } from "vitest";

import { renderPublicationMdx } from "./render-mdx";
import { ArticleRepositoryError, GitHubArticleRepository } from "./article-repository";

const publicationId = "10000000-0000-4000-8000-000000000001";
const origin = "https://project-id.supabase.co/storage/v1/object/public/published-images";
const HEAD_SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);
const BLOB_SHA = "c".repeat(40);
const NEW_BLOB_SHA = "d".repeat(40);
const NEW_TREE_SHA = "e".repeat(40);
const NEW_COMMIT_SHA = "f".repeat(40);
const EXISTING_COMMIT_SHA = "1".repeat(40);
const EXISTING_BLOB_SHA = "2".repeat(40);
const HEAD_ONE_SHA = "3".repeat(40);
const HEAD_TWO_SHA = "4".repeat(40);
const TREE_ONE_SHA = "5".repeat(40);
const TREE_TWO_SHA = "6".repeat(40);
const NEW_TREE_ONE_SHA = "7".repeat(40);
const NEW_TREE_TWO_SHA = "8".repeat(40);
const COMMIT_ONE_SHA = "9".repeat(40);
const COMMIT_TWO_SHA = "0".repeat(40);

function articleMdx(id = publicationId, title = "A contributor report", slug = "contributor-report") {
  return renderPublicationMdx({
    publishedImageOrigin: origin,
    publication: {
      publicationId: id,
      submissionId: "20000000-0000-4000-8000-000000000001",
      submissionVersion: 1,
      title,
      slug,
      date: "2026-08-28",
      category: "finance",
      tags: ["markets"],
      contributorId: "30000000-0000-4000-8000-000000000001",
      contributorName: "Test Contributor",
      excerpt: "A bounded contributor report.",
      coverImage: `${origin}/${id}.webp`,
      readTime: 3,
      sourceName: "Example Source",
      sourceUrl: "https://example.test/source",
      region: "global",
      language: "en",
      contentDocument: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Verified facts and context." }] }],
      },
      guidelinesVersion: "2026-08-27",
    },
  });
}

function blob(content: string) {
  return Response.json({ encoding: "base64", content: Buffer.from(content).toString("base64"), sha: BLOB_SHA });
}

function repository(fetchImpl: typeof fetch) {
  return new GitHubArticleRepository({
    repository: "owner/repo",
    branch: "main",
    token: "secret-token",
    apiBase: "https://api.github.test",
    fetchImpl,
  });
}

describe("GitHubArticleRepository", () => {
  it("publishes one fixed article path using one tree, commit, and ref update", async () => {
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: HEAD_SHA } });
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) return Response.json({ tree: { sha: TREE_SHA } });
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) return Response.json({ truncated: false, tree: [] });
      if (url.endsWith("/git/blobs") && method === "POST") return Response.json({ sha: NEW_BLOB_SHA }, { status: 201 });
      if (url.endsWith("/git/trees") && method === "POST") return Response.json({ sha: NEW_TREE_SHA }, { status: 201 });
      if (url.endsWith("/git/commits") && method === "POST") {
        return Response.json({ sha: NEW_COMMIT_SHA, html_url: `https://github.test/commit/${NEW_COMMIT_SHA}` }, { status: 201 });
      }
      if (url.endsWith("/git/refs/heads/main") && method === "PATCH") return Response.json({ object: { sha: NEW_COMMIT_SHA } });
      return new Response("not found", { status: 404 });
    });

    await expect(
      repository(fetchImpl).publish({ category: "finance", slug: "contributor-report", publicationId, mdx: articleMdx() }),
    ).resolves.toEqual({
      commitSha: NEW_COMMIT_SHA,
      commitUrl: `https://github.test/commit/${NEW_COMMIT_SHA}`,
      articlePath: "content/articles/finance/contributor-report.mdx",
      replayed: false,
    });
    expect(calls.filter(({ method, url }) => method === "POST" && url.endsWith("/git/trees"))).toHaveLength(1);
    expect(calls.filter(({ method, url }) => method === "POST" && url.endsWith("/git/commits"))).toHaveLength(1);
    expect(calls.filter(({ method }) => method === "PATCH")).toHaveLength(1);
    expect(calls.find(({ url, method }) => url.endsWith("/git/trees") && method === "POST")?.body?.tree).toEqual([
      { path: "content/articles/finance/contributor-report.mdx", mode: "100644", type: "blob", sha: NEW_BLOB_SHA },
    ]);
    expect(calls.find(({ url, method }) => url.endsWith("/git/commits") && method === "POST")?.body?.message).toBe(
      "publish contributor article: contributor-report",
    );
  });

  it("returns an identical existing publication as a replay without writing", async () => {
    const mdx = articleMdx();
    const fetchImpl = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      void _init;
      const url = input.toString();
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: HEAD_SHA } });
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) return Response.json({ tree: { sha: TREE_SHA } });
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return Response.json({ truncated: false, tree: [{ path: "content/articles/finance/contributor-report.mdx", mode: "100644", type: "blob", sha: EXISTING_BLOB_SHA }] });
      }
      if (url.endsWith(`/git/blobs/${EXISTING_BLOB_SHA}`)) return blob(mdx);
      if (url.endsWith("/commits?path=content%2Farticles%2Ffinance%2Fcontributor-report.mdx&sha=main&per_page=1")) {
        return Response.json([{ sha: EXISTING_COMMIT_SHA, html_url: `https://github.test/commit/${EXISTING_COMMIT_SHA}` }]);
      }
      return new Response("unexpected", { status: 500 });
    });

    await expect(repository(fetchImpl).publish({ category: "finance", slug: "contributor-report", publicationId, mdx })).resolves.toMatchObject({
      commitSha: EXISTING_COMMIT_SHA,
      articlePath: "content/articles/finance/contributor-report.mdx",
      replayed: true,
    });
    expect(fetchImpl.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("fails closed when the immutable replay receipt is unavailable", async () => {
    const mdx = articleMdx();
    const fetchImpl = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      void _init;
      const url = input.toString();
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: HEAD_SHA } });
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) return Response.json({ tree: { sha: TREE_SHA } });
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) return Response.json({ truncated: false, tree: [{ path: "content/articles/finance/contributor-report.mdx", mode: "100644", type: "blob", sha: EXISTING_BLOB_SHA }] });
      if (url.endsWith(`/git/blobs/${EXISTING_BLOB_SHA}`)) return blob(mdx);
      if (url.includes("/commits?path=")) return Response.json([{ sha: "bad" }]);
      return new Response("unexpected", { status: 500 });
    });

    await expect(repository(fetchImpl).publish({ category: "finance", slug: "contributor-report", publicationId, mdx })).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(fetchImpl.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("rejects the same path with different body or publication identity", async () => {
    const existing = articleMdx();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: HEAD_SHA } });
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) return Response.json({ tree: { sha: TREE_SHA } });
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) return Response.json({ truncated: false, tree: [{ path: "content/articles/finance/contributor-report.mdx", mode: "100644", type: "blob", sha: EXISTING_BLOB_SHA }] });
      if (url.endsWith(`/git/blobs/${EXISTING_BLOB_SHA}`)) return blob(existing);
      return new Response("unexpected", { status: 500 });
    });

    await expect(
      repository(fetchImpl).publish({ category: "finance", slug: "contributor-report", publicationId, mdx: articleMdx(publicationId, "Changed") }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      repository(fetchImpl).publish({ category: "finance", slug: "contributor-report", publicationId: "10000000-0000-4000-8000-000000000002", mdx: existing }),
    ).rejects.toBeInstanceOf(ArticleRepositoryError);
  });

  it("retries once after the branch moves without recreating the blob", async () => {
    let snapshot = 0;
    let patch = 0;
    let blobPosts = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      if (url.endsWith("/git/ref/heads/main")) {
        snapshot += 1;
        return Response.json({ object: { sha: snapshot === 1 ? HEAD_ONE_SHA : HEAD_TWO_SHA } });
      }
      if (url.includes("/git/commits/")) return Response.json({ tree: { sha: snapshot === 1 ? TREE_ONE_SHA : TREE_TWO_SHA } });
      if (url.endsWith(`/git/trees/${TREE_ONE_SHA}?recursive=1`) || url.endsWith(`/git/trees/${TREE_TWO_SHA}?recursive=1`)) return Response.json({ truncated: false, tree: [] });
      if (url.endsWith("/git/blobs") && method === "POST") {
        blobPosts += 1;
        return Response.json({ sha: NEW_BLOB_SHA }, { status: 201 });
      }
      if (url.endsWith("/git/trees") && method === "POST") return Response.json({ sha: snapshot === 1 ? NEW_TREE_ONE_SHA : NEW_TREE_TWO_SHA }, { status: 201 });
      if (url.endsWith("/git/commits") && method === "POST") return Response.json({ sha: snapshot === 1 ? COMMIT_ONE_SHA : COMMIT_TWO_SHA }, { status: 201 });
      if (url.endsWith("/git/refs/heads/main") && method === "PATCH") {
        patch += 1;
        return patch === 1 ? new Response("moved", { status: 422 }) : Response.json({ object: { sha: COMMIT_TWO_SHA } });
      }
      return new Response("unexpected", { status: 500 });
    });

    await expect(repository(fetchImpl).publish({ category: "finance", slug: "contributor-report", publicationId, mdx: articleMdx() })).resolves.toMatchObject({
      commitSha: COMMIT_TWO_SHA,
      replayed: false,
    });
    expect(blobPosts).toBe(1);
    expect(patch).toBe(2);
  });

  it("does not publish a duplicate publication found at another canonical article path", async () => {
    const mdx = articleMdx();
    const existing = articleMdx(publicationId, "A contributor report", "old-slug");
    let postSeen = false;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      postSeen ||= init?.method === "POST";
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: HEAD_SHA } });
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) return Response.json({ tree: { sha: TREE_SHA } });
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return Response.json({
          truncated: false,
          tree: [{ path: "content/articles/finance/old-slug.mdx", mode: "100644", type: "blob", sha: EXISTING_BLOB_SHA }],
        });
      }
      if (url.endsWith(`/git/blobs/${EXISTING_BLOB_SHA}`)) return blob(existing);
      return new Response("unexpected", { status: 500 });
    });

    await expect(
      repository(fetchImpl).publish({
        category: "finance",
        slug: "contributor-report",
        publicationId,
        mdx,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(postSeen).toBe(false);
  });

  it("fails closed on malformed canonical article content before creating a blob", async () => {
    let postSeen = false;
    const malformed = `---\npublicationId: ${publicationId}\ncategory: finance\n---\nmalformed`;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      postSeen ||= init?.method === "POST";
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: HEAD_SHA } });
      if (url.endsWith(`/git/commits/${HEAD_SHA}`)) return Response.json({ tree: { sha: TREE_SHA } });
      if (url.endsWith(`/git/trees/${TREE_SHA}?recursive=1`)) {
        return Response.json({
          truncated: false,
          tree: [{ path: "content/articles/finance/old-slug.mdx", mode: "100644", type: "blob", sha: EXISTING_BLOB_SHA }],
        });
      }
      if (url.endsWith(`/git/blobs/${EXISTING_BLOB_SHA}`)) {
        return Response.json({ encoding: "base64", content: Buffer.from(malformed).toString("base64"), sha: BLOB_SHA });
      }
      if (url.endsWith("/git/blobs") && init?.method === "POST") return Response.json({ sha: NEW_BLOB_SHA }, { status: 201 });
      return new Response("unexpected", { status: 500 });
    });

    await expect(
      repository(fetchImpl).publish({ category: "finance", slug: "contributor-report", publicationId, mdx: articleMdx() }),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(postSeen).toBe(false);
  });
});
