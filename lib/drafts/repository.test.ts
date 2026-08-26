import { describe, expect, it } from "vitest";

import { GitHubDraftRepository } from "@/lib/drafts/github-repository";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import {
  DraftConfigurationError,
  getDraftRepository,
} from "@/lib/drafts/repository";

describe("getDraftRepository", () => {
  it("uses local storage outside production", () => {
    expect(
      getDraftRepository({ env: { NODE_ENV: "development" }, contentRoot: "/tmp/content" }),
    ).toBeInstanceOf(LocalDraftRepository);
  });

  it("refuses ephemeral production writes when GitHub is not fully configured", () => {
    expect(() =>
      getDraftRepository({
        env: { NODE_ENV: "production", GITHUB_REPOSITORY: "owner/repo" },
      }),
    ).toThrowError(DraftConfigurationError);
  });

  it("uses GitHub in production only when all credentials are present", () => {
    expect(
      getDraftRepository({
        env: {
          NODE_ENV: "production",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_BRANCH: "main",
          GITHUB_TOKEN: "token",
        },
      }),
    ).toBeInstanceOf(GitHubDraftRepository);
  });
});
