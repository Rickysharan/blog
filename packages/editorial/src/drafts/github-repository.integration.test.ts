import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createGitHubDraftRepository } from "../index";
import { makeValidMdx } from "../test-fixtures";

/** GitHub transport fixture backed by real local Git blobs, trees, commits and refs. */
function localGitFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "studio-publication-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "Studio Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Studio Test", GIT_COMMITTER_EMAIL: "test@example.com", GIT_INDEX_FILE: path.join(root, "fixture-index") };
  const git = (args: string[], input?: string) => execFileSync("git", args, { cwd: root, env, input, encoding: "utf8" });
  git(["init", "--quiet"]);
  const original = makeValidMdx();
  const blob = git(["hash-object", "-w", "--stdin"], original).trim();
  git(["read-tree", "--empty"]);
  git(["update-index", "--add", "--cacheinfo", `100644,${blob},content/drafts/anime/story.mdx`]);
  const tree = git(["write-tree"]).trim();
  const head = git(["commit-tree", tree, "-m", "Fixture draft"]).trim();
  git(["update-ref", "refs/heads/editorial", head]);
  const state = { rejectRef: false, checkedBeforeRef: false };
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split("/git/")[1]!;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (method === "GET" && endpoint === "ref/heads/editorial") return Response.json({ object: { sha: git(["rev-parse", "refs/heads/editorial"]).trim() } });
    if (method === "GET" && endpoint.startsWith("commits/")) return Response.json({ tree: { sha: git(["rev-parse", `${endpoint.slice(8)}^{tree}`]).trim() } });
    if (method === "GET" && endpoint.startsWith("trees/")) {
      const entries = git(["ls-tree", "-r", endpoint.slice(6)]).trim().split("\n").filter(Boolean).map(line => {
        const [metadata, filePath] = line.split("\t"); const [mode, type, sha] = metadata!.split(" "); return { mode, type, sha, path: filePath };
      });
      return Response.json({ truncated: false, tree: entries });
    }
    if (method === "GET" && endpoint.startsWith("blobs/")) return Response.json({ encoding: "base64", content: Buffer.from(git(["cat-file", "blob", endpoint.slice(6)])).toString("base64") });
    if (method === "POST" && endpoint === "blobs") return Response.json({ sha: git(["hash-object", "-w", "--stdin"], body.content).trim() });
    if (method === "POST" && endpoint === "trees") {
      git(["read-tree", body.base_tree]);
      for (const entry of body.tree) {
        if (entry.sha === null) git(["update-index", "--force-remove", entry.path]);
        else git(["update-index", "--add", "--cacheinfo", `${entry.mode},${entry.sha},${entry.path}`]);
      }
      return Response.json({ sha: git(["write-tree"]).trim() });
    }
    if (method === "POST" && endpoint === "commits") return Response.json({ sha: git(["commit-tree", body.tree, "-p", body.parents[0], "-m", body.message]).trim() });
    if (method === "PATCH" && endpoint === "refs/heads/editorial") {
      // The draft remains reachable until the only ref update succeeds.
      expect(git(["show", "refs/heads/editorial:content/drafts/anime/story.mdx"])).toBe(original);
      expect(git(["ls-tree", "-r", "refs/heads/editorial"])).not.toContain("content/articles/anime/story.mdx");
      state.checkedBeforeRef = true;
      if (state.rejectRef) return Response.json({}, { status: 409 });
      git(["update-ref", "refs/heads/editorial", body.sha, head]);
      return Response.json({ object: { sha: body.sha } });
    }
    throw new Error(`Unexpected local fixture endpoint ${method} ${endpoint}`);
  };
  return { git, head, state, cleanup: () => rmSync(root, { recursive: true, force: true }), repository: createGitHubDraftRepository({ repository: "fixture/studio", branch: "editorial", token: "fixture-only", fetchImpl }) };
}
const ref = { category: "anime", filename: "story.mdx" } as const;
const reviewed = makeValidMdx({ title: "Reviewed — 日本語 café" }).replace("## What happened", "![First image](https://images.example.com/first.jpg)\n\n![Second image](https://images.example.com/second.jpg)\n\n## What happened") + "\n\n\n";
it("publishes the exact Unicode/image/trailing-newline editor payload in a real local Git commit", async () => {
  const fixture = localGitFixture();
  try {
    const loaded = await fixture.repository.read(ref);
    const result = await fixture.repository.publish(ref, reviewed, loaded.version);
    expect(fixture.state.checkedBeforeRef).toBe(true);
    expect(Buffer.from(fixture.git(["show", "refs/heads/editorial:content/articles/anime/story.mdx"]))).toEqual(Buffer.from(reviewed));
    expect(fixture.git(["ls-tree", "-r", "refs/heads/editorial"])).not.toContain("content/drafts/anime/story.mdx");
    expect(fixture.git(["show", `${fixture.head}:content/drafts/anime/story.mdx`])).toBe(makeValidMdx());
    expect(result.commitUrl).toBe(`https://github.com/fixture/studio/commit/${fixture.git(["rev-parse", "refs/heads/editorial"]).trim()}`);
  } finally { fixture.cleanup(); }
});
it("keeps the draft reachable and publication absent when the final Git ref update fails", async () => {
  const fixture = localGitFixture();
  try {
    fixture.state.rejectRef = true;
    await expect(fixture.repository.publish(ref, reviewed, fixture.head)).rejects.toMatchObject({ code: "conflict" });
    expect(fixture.state.checkedBeforeRef).toBe(true);
    expect(fixture.git(["rev-parse", "refs/heads/editorial"]).trim()).toBe(fixture.head);
    expect(fixture.git(["show", "refs/heads/editorial:content/drafts/anime/story.mdx"])).toBe(makeValidMdx());
    expect(fixture.git(["ls-tree", "-r", "refs/heads/editorial"])).not.toContain("content/articles/anime/story.mdx");
  } finally { fixture.cleanup(); }
});
