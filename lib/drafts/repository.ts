import { GitHubDraftRepository } from "@/lib/drafts/github-repository";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import type { DraftRepository } from "@/lib/drafts/types";
import type { FetchLike } from "@/lib/pipeline/types";

export class DraftConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftConfigurationError";
  }
}

interface RepositoryOptions {
  env?: Record<string, string | undefined>;
  contentRoot?: string;
  fetchImpl?: FetchLike;
}

export function getDraftRepository(options: RepositoryOptions = {}): DraftRepository {
  const env = options.env ?? process.env;
  if (env.NODE_ENV !== "production") {
    return new LocalDraftRepository({ contentRoot: options.contentRoot });
  }

  const repository = env.GITHUB_REPOSITORY?.trim();
  const branch = env.GITHUB_BRANCH?.trim();
  const token = env.GITHUB_TOKEN?.trim();
  if (!repository || !branch || !token) {
    throw new DraftConfigurationError(
      "Production draft moderation requires GITHUB_REPOSITORY, GITHUB_BRANCH, and GITHUB_TOKEN; ephemeral storage is disabled",
    );
  }

  return new GitHubDraftRepository({
    repository,
    branch,
    token,
    fetchImpl: options.fetchImpl,
  });
}
