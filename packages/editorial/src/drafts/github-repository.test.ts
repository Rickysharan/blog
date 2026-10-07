import { describe, expect, it } from "vitest";
import { createGitHubDraftRepository, DraftRepositoryError } from "../index";
import { makeValidMdx } from "../test-fixtures";
import matter from "gray-matter";

const A = "a".repeat(40);
const B = "b".repeat(40);
const TREE = "c".repeat(40);
const BLOB = "d".repeat(40);
const NEW_TREE = "e".repeat(40);
const COMMIT = "f".repeat(40);
const ref = { category: "anime", filename: "story.mdx" } as const;
const draftPath = "content/drafts/anime/story.mdx";
const articlePath = "content/articles/anime/story.mdx";
const topRef = { category: "top-10", filename: "top-story.mdx" } as const;
const topDraftPath = "content/drafts/top-10/top-story.mdx";

function topTenMdx(entryCount = 10): string {
  const body = [
    "A grounded introduction to the ten choices.",
    ...Array.from({ length: entryCount }, (_, index) => `## ${index + 1}. Choice ${index + 1}\n\nSupported detail.`),
    "## Why it matters\n\nThis comparison makes the source easier to use.",
    "![First](https://upload.wikimedia.org/first.jpg)\n\nPhoto: One / [Source](https://commons.wikimedia.org/first).",
    "![Second](https://upload.wikimedia.org/second.jpg)\n\nPhoto: Two / [Source](https://commons.wikimedia.org/second).",
    "Source: [Example Outlet](https://example.com/story)",
  ].join("\n\n");
  return matter.stringify(body, {
    title: "A Valid Top Ten Draft", slug: "top-story", date: "2026-10-08", category: "top-10",
    tags: ["Lists", "Global"], author: "Ricky Sharan", excerpt: "A supported list.",
    coverImage: "https://upload.wikimedia.org/first.jpg", readTime: 5,
    sourceName: "Example Outlet", sourceUrl: "https://example.com/story",
  });
}

function github(paths = [draftPath, "content/drafts/anime/other.mdx"]) {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  const state = { head: A, refStatus: 200, blobStatus: 200 };
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    calls.push({ url, method, body });
    if (url.endsWith("/git/ref/heads/editorial/content")) return Response.json({ object: { sha: state.head } });
    if (url.endsWith(`/git/commits/${state.head}`)) return Response.json({ tree: { sha: TREE } });
    if (url.endsWith(`/git/trees/${TREE}?recursive=1`)) return Response.json({ truncated: false, tree: paths.map(path => ({ path, type: "blob", mode: "100644", sha: BLOB })) });
    if (url.endsWith(`/git/blobs/${BLOB}`)) return Response.json({ encoding: "base64", content: Buffer.from(makeValidMdx()).toString("base64") }, { status: state.blobStatus });
    if (url.endsWith("/git/blobs") && method === "POST") return Response.json({ sha: BLOB }, { status: 201 });
    if (url.endsWith("/git/trees") && method === "POST") return Response.json({ sha: NEW_TREE }, { status: 201 });
    if (url.endsWith("/git/commits") && method === "POST") return Response.json({ sha: COMMIT }, { status: 201 });
    if (url.endsWith("/git/refs/heads/editorial/content") && method === "PATCH") return Response.json({ object: { sha: COMMIT } }, { status: state.refStatus });
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  return { calls, state, repository: createGitHubDraftRepository({ repository: "owner/repo", branch: "editorial/content", token: "test-only-placeholder", fetchImpl }) };
}

describe("shared GitHub draft repository", () => {
  it("lists and reads immutable snapshot versions without changing MDX bytes", async () => {
    const { repository } = github([draftPath]);
    expect(await repository.list()).toEqual([{ ref, title: "A Valid Editorial Draft", date: "2026-08-25", excerpt: "A valid draft used to verify the editorial repository.", category: "anime", version: A }]);
    expect(await repository.read(ref)).toMatchObject({ ref, version: A, mdx: makeValidMdx(), article: { slug: "story" } });
  });

  it("creates a new draft on the configured repository and branch", async () => {
    const { repository, calls } = github([]);
    expect(await repository.create(ref, makeValidMdx())).toMatchObject({ version: COMMIT, mdx: makeValidMdx() });
    expect(calls.every(call => call.url.startsWith("https://api.github.com/repos/owner/repo/"))).toBe(true);
    expect(calls.find(call => call.url.endsWith("/git/trees"))?.body).toEqual({ base_tree: TREE, tree: [{ path: draftPath, mode: "100644", type: "blob", sha: BLOB }] });
  });

  it("saves the submitted bytes and returns the new version", async () => {
    const { repository, calls } = github();
    const mdx = makeValidMdx({ title: "Updated — café" }) + "\n\n";
    expect(await repository.save(ref, mdx, A)).toMatchObject({ version: COMMIT, mdx });
    expect(calls.find(call => call.url.endsWith("/git/blobs"))?.body).toEqual({ content: mdx, encoding: "utf-8" });
    expect(calls.find(call => call.url.endsWith("/git/trees"))?.body.tree).toEqual([{ path: draftPath, mode: "100644", type: "blob", sha: BLOB }]);
  });

  it("publishes exact submitted bytes and deletes only the matching draft in one tree", async () => {
    const { repository, calls } = github();
    const mdx = makeValidMdx({ title: "Final — 日本語" }) + "\n\n";
    expect(await repository.publish(ref, mdx, A)).toEqual({ articlePath, commitUrl: `https://github.com/owner/repo/commit/${COMMIT}` });
    expect(calls.find(call => call.url.endsWith("/git/blobs"))?.body).toEqual({ content: mdx, encoding: "utf-8" });
    expect(calls.find(call => call.url.endsWith("/git/trees"))?.body).toEqual({ base_tree: TREE, tree: [
      { path: articlePath, mode: "100644", type: "blob", sha: BLOB },
      { path: draftPath, mode: "100644", type: "blob", sha: null },
    ] });
    expect(calls.find(call => call.url.endsWith("/git/commits"))?.body).toEqual({ message: "Publish article: story", tree: NEW_TREE, parents: [A] });
    expect(calls.find(call => call.method === "PATCH")?.body).toEqual({ sha: COMMIT, force: false });
  });

  it("saves an incomplete Top 10 privately but rejects publishing it before any mutation", async () => {
    const incomplete = topTenMdx(9);
    const saved = github([topDraftPath]);
    await expect(saved.repository.save(topRef, incomplete, A)).resolves.toMatchObject({ mdx: incomplete });

    const publishing = github([topDraftPath]);
    await expect(publishing.repository.publish(topRef, incomplete, A)).rejects.toMatchObject({ code: "invalid_input" });
    expect(publishing.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("discards only the selected draft without creating a blob", async () => {
    const { repository, calls } = github();
    expect(await repository.discard(ref, A)).toEqual({
      version: COMMIT, commitUrl: `https://github.com/owner/repo/commit/${COMMIT}`,
    });
    expect(calls.filter(call => call.method !== "GET").map(call => call.body)).toEqual([
      { base_tree: TREE, tree: [{ path: draftPath, mode: "100644", type: "blob", sha: null }] },
      { message: "Discard draft: story", tree: NEW_TREE, parents: [A] },
      { sha: COMMIT, force: false },
    ]);
  });

  it.each(["save", "publish", "discard"] as const)("rejects %s at B after loading A without any mutation", async (operation) => {
    const { repository, calls, state } = github([draftPath]);
    const loaded = await repository.read(ref);
    state.head = B;
    const action = operation === "discard" ? repository.discard(ref, loaded.version) : repository[operation](ref, loaded.mdx, loaded.version);
    await expect(action).rejects.toBeInstanceOf(DraftRepositoryError);
    await expect(action).rejects.toMatchObject({ code: "conflict" });
    expect(calls.filter(call => call.method !== "GET")).toEqual([]);
  });

  it.each([draftPath, articlePath])("rejects creation collisions at %s before mutation", async (path) => {
    const { repository, calls } = github([path]);
    await expect(repository.create(ref, makeValidMdx())).rejects.toMatchObject({ code: "conflict" });
    expect(calls.filter(call => call.method !== "GET")).toEqual([]);
  });

  it("rejects publication collisions without mutation", async () => {
    const { repository, calls } = github([draftPath, articlePath]);
    await expect(repository.publish(ref, makeValidMdx(), A)).rejects.toMatchObject({ code: "conflict" });
    expect(calls.filter(call => call.method !== "GET")).toEqual([]);
  });

  it("reports a missing draft", async () => {
    await expect(github([]).repository.read(ref)).rejects.toMatchObject({ code: "not_found" });
  });

  it.each([409, 422])("maps concurrent ref update HTTP %s to conflict", async (status) => {
    const { repository, state } = github();
    state.refStatus = status;
    await expect(repository.publish(ref, makeValidMdx(), A)).rejects.toMatchObject({ code: "conflict" });
  });

  it.each([[401, "storage_unavailable"], [403, "storage_unavailable"], [404, "not_found"], [429, "storage_unavailable"], [503, "storage_unavailable"]])("maps GitHub HTTP %s failures", async (status, code) => {
    const repository = createGitHubDraftRepository({ repository: "owner/repo", branch: "main", token: "test-only-placeholder", fetchImpl: async () => new Response("untrusted upstream details", { status: Number(status) }) });
    await expect(repository.list()).rejects.toMatchObject({ code });
    await expect(repository.list()).rejects.not.toThrow("untrusted upstream details");
  });

  it("maps transport failures without exposing upstream secrets", async () => {
    const repository = createGitHubDraftRepository({ repository: "owner/repo", branch: "main", token: "test-only-placeholder", fetchImpl: async () => { throw new Error("sensitive upstream detail"); } });
    await expect(repository.list()).rejects.toMatchObject({ code: "storage_unavailable" });
    await expect(repository.list()).rejects.not.toThrow("sensitive upstream detail");
  });
});
