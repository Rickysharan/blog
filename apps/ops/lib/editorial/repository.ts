import "server-only";

import {
  createGitHubDraftRepository,
  loadGitHubEditorialInventory,
  type DraftRepository,
  type EditorialInventory,
  type FetchLike,
} from "@omnilede/editorial";

import { parseStudioContentEnv } from "../env";

type Environment = Record<string, string | undefined>;

/**
 * Studio always operates on the configured GitHub content repository. Configure
 * a fine-grained token for that one repository, with Contents read/write access;
 * protect the configured branch with the repository's normal review policy.
 */
export function createStudioContentRepository(
  environment: Environment = process.env,
  fetchImpl?: FetchLike,
): DraftRepository {
  const { GITHUB_REPOSITORY: repository, GITHUB_CONTENT_BRANCH: branch, GITHUB_CONTENT_TOKEN: token } =
    parseStudioContentEnv(environment);
  return createGitHubDraftRepository({ repository, branch, token, fetchImpl });
}

export function loadStudioEditorialInventory(
  environment: Environment = process.env,
  fetchImpl?: FetchLike,
): Promise<EditorialInventory> {
  const { GITHUB_REPOSITORY: repository, GITHUB_CONTENT_BRANCH: branch, GITHUB_CONTENT_TOKEN: token } =
    parseStudioContentEnv(environment);
  return loadGitHubEditorialInventory({ repository, branch, token, fetchImpl });
}
