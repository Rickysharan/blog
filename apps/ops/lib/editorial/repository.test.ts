import { describe, expect, it } from "vitest";
import { createStudioContentRepository } from "./repository";
import { parseOpsPublicEnv, parseStudioContentEnv } from "../env";

const environment = {
  GITHUB_REPOSITORY: "owner/content",
  GITHUB_CONTENT_BRANCH: "editorial/main",
  GITHUB_CONTENT_TOKEN: "test-only-placeholder",
};

describe("Studio content repository", () => {
  it.each(["GITHUB_REPOSITORY", "GITHUB_CONTENT_BRANCH", "GITHUB_CONTENT_TOKEN"])("requires %s even when legacy/local storage is configured", (key) => {
    const env: Record<string, string | undefined> = { ...environment, NODE_ENV: "production", DRAFT_STORAGE: "local", GITHUB_TOKEN: "legacy-placeholder", GITHUB_BRANCH: "main" };
    delete env[key];
    expect(() => createStudioContentRepository(env)).toThrow(key);
  });

  it.each([
    { GITHUB_REPOSITORY: "../repo" },
    { GITHUB_REPOSITORY: "owner/.." },
    { GITHUB_CONTENT_BRANCH: "../main" },
    { GITHUB_CONTENT_BRANCH: "main//other" },
    { GITHUB_CONTENT_BRANCH: "branch.lock" },
    { GITHUB_CONTENT_BRANCH: "" },
    { GITHUB_CONTENT_TOKEN: "   " },
  ])("rejects invalid configuration %j", (override) => {
    expect(() => createStudioContentRepository({ ...environment, ...override })).toThrow();
  });

  it("reads only the selected repository and branch using the server credential", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const responses = [Response.json({ object: { sha: head } }), Response.json({ tree: { sha: tree } }), Response.json({ truncated: false, tree: [] })];
    const repository = createStudioContentRepository(environment, async (input, init) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
      return responses.shift()!;
    });
    expect(await repository.list()).toEqual([]);
    expect(calls.map(call => call.url)).toEqual([
      "https://api.github.com/repos/owner/content/git/ref/heads/editorial/main",
      `https://api.github.com/repos/owner/content/git/commits/${head}`,
      `https://api.github.com/repos/owner/content/git/trees/${tree}?recursive=1`,
    ]);
    expect(calls.every(call => call.auth === `Bearer ${environment.GITHUB_CONTENT_TOKEN}`)).toBe(true);
  });

  it("does not turn a GitHub failure into an empty/local repository", async () => {
    const repository = createStudioContentRepository(environment, async () => new Response(null, { status: 503 }));
    await expect(repository.list()).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it("strips unrelated private content configuration from public parsing", () => {
    const parsed = parseOpsPublicEnv({ ...environment, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", NEXT_PUBLIC_BLOG_URL: "https://blog.example", NEXT_PUBLIC_CONTRIBUTOR_URL: "https://contributors.example", NEXT_PUBLIC_STUDIO_URL: "https://studio.example" });
    expect(parsed).not.toHaveProperty("GITHUB_CONTENT_TOKEN");
    expect(parsed).not.toHaveProperty("GITHUB_CONTENT_BRANCH");
    expect(parseStudioContentEnv({ ...environment, SECRET_EXTRA: "excluded" })).toEqual(environment);
  });
});
