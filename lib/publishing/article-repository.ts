import "server-only";

import type { CategorySlug } from "@/lib/config/categories";
import { isCategorySlug } from "@/lib/config/categories";
import { parseArticleFile } from "@/lib/content/schema";
import {
  GitDataClient,
  GitDataClientError,
  type GitCommitResult,
  type GitDataClientOptions,
  type GitHubTreeEntry,
  type GitSnapshot,
} from "@/lib/github/git-data-client";

export interface ArticleRepository {
  publish(input: {
    category: CategorySlug;
    slug: string;
    publicationId: string;
    mdx: string;
  }): Promise<{
    commitSha: string;
    commitUrl: string;
    articlePath: string;
    replayed: boolean;
  }>;
}

export type ArticleRepositoryErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "storage_unavailable";

export class ArticleRepositoryError extends Error {
  constructor(
    public readonly code: ArticleRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArticleRepositoryError";
  }
}

const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_ARTICLE_BYTES = 300 * 1024;
const MAX_ARTICLE_SCAN_ENTRIES = 1_000;
const ARTICLE_SCAN_CONCURRENCY = 8;
const CANONICAL_ARTICLE_PATH_PATTERN = /^content\/articles\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.mdx$/;

type PublishInput = Parameters<ArticleRepository["publish"]>[0];
type PublishOutput = Awaited<ReturnType<ArticleRepository["publish"]>>;

function invalid(): never {
  throw new ArticleRepositoryError("invalid_input", "Article publication input is invalid");
}

function articlePath(input: Pick<PublishInput, "category" | "slug">): string {
  return `content/articles/${input.category}/${input.slug}.mdx`;
}

function isCanonicalArticlePath(value: string): boolean {
  const match = CANONICAL_ARTICLE_PATH_PATTERN.exec(value);
  return match !== null && isCategorySlug(match[1]);
}

function mapGitError(error: unknown): ArticleRepositoryError {
  if (error instanceof ArticleRepositoryError) return error;
  if (error instanceof GitDataClientError) {
    return new ArticleRepositoryError(error.code, error.message);
  }
  return new ArticleRepositoryError("storage_unavailable", "GitHub publication failed");
}

function safeCommitUrl(client: GitDataClient, result: { sha: string; htmlUrl?: string }): string {
  if (result.htmlUrl) {
    try {
      const parsed = new URL(result.htmlUrl);
      if (
        parsed.protocol === "https:" &&
        parsed.username === "" &&
        parsed.password === "" &&
        parsed.search === "" &&
        parsed.hash === ""
      ) {
        return parsed.href;
      }
    } catch {
      // Fall through to the repository-derived URL.
    }
  }
  return client.commitUrl(result.sha);
}

export class GitHubArticleRepository implements ArticleRepository {
  private readonly client: GitDataClient;

  constructor(options: GitDataClientOptions) {
    try {
      this.client = new GitDataClient(options);
    } catch (error) {
      throw mapGitError(error);
    }
  }

  private validate(input: PublishInput): void {
    if (
      !isCategorySlug(input.category) ||
      !ARTICLE_SLUG_PATTERN.test(input.slug) ||
      input.slug.length > 120 ||
      !UUID_PATTERN.test(input.publicationId) ||
      Buffer.byteLength(input.mdx, "utf8") > MAX_ARTICLE_BYTES
    ) {
      invalid();
    }

    try {
      const article = parseArticleFile(input.mdx, `${input.slug}.mdx`);
      if (
        article.category !== input.category ||
        article.slug !== input.slug ||
        article.publicationId !== input.publicationId
      ) {
        invalid();
      }
    } catch (error) {
      if (error instanceof ArticleRepositoryError) throw error;
      invalid();
    }
  }

  private targetEntry(snapshot: GitSnapshot, path: string): GitHubTreeEntry | undefined {
    return snapshot.entries.find((entry) => entry.path === path);
  }

  private async articleContents(
    snapshot: GitSnapshot,
  ): Promise<Array<{ path: string; content: string; publicationId?: string }>> {
    const entries = snapshot.entries.filter(
      (entry): entry is GitHubTreeEntry & { path: string; sha: string } =>
        entry.type === "blob" &&
        typeof entry.path === "string" &&
        typeof entry.sha === "string" &&
        isCanonicalArticlePath(entry.path),
    );
    if (entries.length > MAX_ARTICLE_SCAN_ENTRIES) {
      throw new ArticleRepositoryError("storage_unavailable", "The article identity scan exceeded its safety limit");
    }

    const results: Array<{ path: string; content: string; publicationId?: string }> = [];
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < entries.length) {
        const entry = entries[next];
        next += 1;
        try {
          const content = await this.client.readBlob(entry.sha);
          let article;
          try {
            article = parseArticleFile(content, entry.path);
          } catch {
            throw new ArticleRepositoryError(
              "storage_unavailable",
              "A canonical GitHub article could not be verified",
            );
          }
          results.push({ path: entry.path, content, publicationId: article.publicationId });
        } catch (error) {
          throw mapGitError(error);
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(ARTICLE_SCAN_CONCURRENCY, entries.length) },
        () => worker(),
      ),
    );
    return results;
  }

  private async identityReplayOrConflict(
    snapshot: GitSnapshot,
    input: PublishInput,
    path: string,
  ): Promise<PublishOutput | undefined> {
    const target = this.targetEntry(snapshot, path);
    if (target && (target.type !== "blob" || typeof target.sha !== "string" || !target.sha)) {
      throw new ArticleRepositoryError("conflict", "The article path is already occupied");
    }

    const contents = await this.articleContents(snapshot);
    const targetContent = contents.find((entry) => entry.path === path)?.content;
    if (target) {
      if (targetContent !== input.mdx) {
        throw new ArticleRepositoryError("conflict", "The article path already contains different content");
      }
      try {
        const parsed = parseArticleFile(targetContent as string, `${input.slug}.mdx`);
        if (
          parsed.publicationId !== input.publicationId ||
          parsed.category !== input.category ||
          parsed.slug !== input.slug
        ) {
          throw new ArticleRepositoryError("conflict", "The publication identity does not match the existing article");
        }
      } catch (error) {
        if (error instanceof ArticleRepositoryError) throw error;
        throw new ArticleRepositoryError("conflict", "The existing article could not be verified");
      }
      let receipt: GitCommitResult;
      try {
        receipt = await this.client.latestCommitForPath(path);
      } catch (error) {
        throw mapGitError(error);
      }
      return {
        commitSha: receipt.sha,
        commitUrl: receipt.htmlUrl ?? this.client.commitUrl(receipt.sha),
        articlePath: path,
        replayed: true,
      };
    }

    for (const candidate of contents) {
      if (candidate.publicationId === input.publicationId) {
        throw new ArticleRepositoryError(
          "conflict",
          "The publication identity already exists at another article path",
        );
      }
    }
    return undefined;
  }

  private async replayIfPresent(
    snapshot: GitSnapshot,
    input: PublishInput,
    path: string,
  ): Promise<PublishOutput | undefined> {
    return this.identityReplayOrConflict(snapshot, input, path);
  }

  async publish(input: PublishInput): Promise<PublishOutput> {
    this.validate(input);
    const path = articlePath(input);

    let snapshot: GitSnapshot;
    try {
      snapshot = await this.client.snapshot();
    } catch (error) {
      throw mapGitError(error);
    }
    const replay = await this.replayIfPresent(snapshot, input, path);
    if (replay) return replay;

    let blobSha: string;
    try {
      blobSha = await this.client.createBlob(input.mdx);
    } catch (error) {
      throw mapGitError(error);
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const commit = await this.client.commitMutation(
          snapshot,
          [{ path, mode: "100644", type: "blob", sha: blobSha }],
          `publish contributor article: ${input.slug}`,
        );
        return {
          commitSha: commit.sha,
          commitUrl: safeCommitUrl(this.client, commit),
          articlePath: path,
          replayed: false,
        };
      } catch (error) {
        if (!(error instanceof GitDataClientError) || error.code !== "conflict" || attempt === 1) {
          throw mapGitError(error);
        }
      }

      try {
        snapshot = await this.client.snapshot();
      } catch (error) {
        throw mapGitError(error);
      }
      const movedReplay = await this.replayIfPresent(snapshot, input, path);
      if (movedReplay) return movedReplay;
    }

    throw new ArticleRepositoryError("conflict", "The GitHub branch changed during publication");
  }
}
