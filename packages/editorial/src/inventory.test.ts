import { describe, expect, it } from "vitest";
import { loadGitHubEditorialInventory } from "./index";
import { makeValidMdx } from "./test-fixtures";

const head = "1".repeat(40);
const tree = "2".repeat(40);
const blobs = new Map([
  ["3".repeat(40), makeValidMdx({ category: "share-market", slug: "market-draft" })],
  ["4".repeat(40), makeValidMdx({ category: "finance", slug: "finance-report" })],
  ["5".repeat(40), "invalid frontmatter"],
]);
const options = { repository: "owner/repo", branch: "main", token: "test-only-placeholder" };

describe("GitHub editorial inventory", () => {
  it("validates draft/article blobs from one version and skips invalid or unrelated paths", async () => {
    const requests: string[] = [];
    const inventory = await loadGitHubEditorialInventory({ ...options, fetchImpl: async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: head } });
      if (url.endsWith(`/git/commits/${head}`)) return Response.json({ tree: { sha: tree } });
      if (url.endsWith(`/git/trees/${tree}?recursive=1`)) return Response.json({ truncated: false, tree: [
        { path: "content/drafts/share-market/market-draft.mdx", mode: "100644", type: "blob", sha: "3".repeat(40) },
        { path: "content/articles/finance/finance-report.mdx", mode: "100644", type: "blob", sha: "4".repeat(40) },
        { path: "content/articles/anime/broken.mdx", mode: "100644", type: "blob", sha: "5".repeat(40) },
        { path: "content/articles/movies/finance-report.mdx", mode: "100644", type: "blob", sha: "4".repeat(40) },
        { path: "content/queue/queue.json", mode: "100644", type: "blob", sha: "6".repeat(40) },
        { path: "content/drafts/anime/nested/story.mdx", mode: "100644", type: "blob", sha: "6".repeat(40) },
        { path: "content/articles/unsupported/story.mdx", mode: "100644", type: "blob", sha: "6".repeat(40) },
      ] });
      const content = blobs.get(url.split("/").at(-1)!);
      if (content === undefined) throw new Error("Unexpected blob");
      return Response.json({ encoding: "base64", content: Buffer.from(content).toString("base64") });
    } });
    expect(inventory).toEqual({ source: "github", version: head, items: [
      { kind: "published", category: "finance", filename: "finance-report.mdx", slug: "finance-report", date: "2026-08-25T00:00:00.000Z" },
      { kind: "draft", category: "share-market", filename: "market-draft.mdx", slug: "market-draft", date: "2026-08-25T00:00:00.000Z" },
    ] });
    expect(requests.some(url => url.endsWith("6".repeat(40)))).toBe(false);
  });

  it("rejects unavailable GitHub rather than returning local or empty counts", async () => {
    await expect(loadGitHubEditorialInventory({ ...options, fetchImpl: async () => new Response(null, { status: 503 }) })).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it("rejects unavailable blobs rather than returning a partial inventory", async () => {
    const responses = [
      Response.json({ object: { sha: head } }),
      Response.json({ tree: { sha: tree } }),
      Response.json({ truncated: false, tree: [{ path: "content/drafts/anime/story.mdx", mode: "100644", type: "blob", sha: "3".repeat(40) }] }),
      new Response(null, { status: 503 }),
    ];
    await expect(loadGitHubEditorialInventory({ ...options, fetchImpl: async () => responses.shift()! })).rejects.toMatchObject({ code: "storage_unavailable" });
  });
});
