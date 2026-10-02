import { describe, expect, it, vi } from "vitest";
import { resolveLocalGitHubTarget } from "@/lib/pipeline/local-github";

const target = { GITHUB_REPOSITORY: "Rickysharan/blog", GITHUB_BRANCH: "main" };
describe("local dashboard credentials", () => {
  it("uses explicit credentials without accessing another account", async () => {
    const readToken = vi.fn();
    const result = await resolveLocalGitHubTarget({ ...target, GITHUB_TOKEN: "configured-token" }, readToken);
    expect(result).toEqual({ repository: "Rickysharan/blog", branch: "main", token: "configured-token" });
    expect(readToken).not.toHaveBeenCalled();
  });
  it("uses the existing GitHub CLI sign-in when no token is configured", async () => {
    const result = await resolveLocalGitHubTarget(target, async () => "  local-session-token\n");
    expect(result.token).toBe("local-session-token");
  });
  it("requires an explicit repository and branch before retrieving credentials", async () => {
    const readToken = vi.fn();
    await expect(resolveLocalGitHubTarget({}, readToken)).rejects.toThrow(/repository.*branch/i);
    expect(readToken).not.toHaveBeenCalled();
  });
  it("rejects malformed repository targets before retrieving credentials", async () => {
    const readToken = vi.fn();
    await expect(resolveLocalGitHubTarget({ ...target, GITHUB_REPOSITORY: "https://example.com/repo" }, readToken)).rejects.toThrow(/repository/i);
    expect(readToken).not.toHaveBeenCalled();
  });
  it("does not expose CLI output or credentials in a login failure", async () => {
    await expect(resolveLocalGitHubTarget(target, async () => {
      throw new Error("private-token-in-subprocess-output");
    })).rejects.toThrow("Sign in with gh auth login, or configure GITHUB_TOKEN locally.");
  });
  it("rejects an empty credential", async () => {
    await expect(resolveLocalGitHubTarget(target, async () => "\n")).rejects.toThrow(/sign in/i);
  });
});
