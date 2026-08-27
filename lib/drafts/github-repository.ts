import path from "node:path";

import {
  DraftRepositoryError,
  type DraftDocument,
  type DraftRef,
  type DraftRepository,
  type DraftSummary,
  type PublishResult,
} from "@/lib/drafts/types";
import { validateDraftMdx, validateDraftRef } from "@/lib/drafts/validation";
import type { FetchLike } from "@/lib/pipeline/types";

const GITHUB_API_VERSION = "2026-03-10";
const MAX_API_RESPONSE_CHARACTERS = 8 * 1024 * 1024;

interface GitHubDraftRepositoryOptions {
  repository: string;
  branch: string;
  token: string;
  fetchImpl?: FetchLike;
  apiBase?: string;
}

interface GitHubRefResponse {
  object?: { sha?: string };
}

interface GitHubCommitResponse {
  sha?: string;
  html_url?: string;
  tree?: { sha?: string };
}

interface GitHubTreeEntry {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string | null;
}

interface GitHubTreeResponse {
  sha?: string;
  truncated?: boolean;
  tree?: GitHubTreeEntry[];
}

interface GitHubBlobResponse {
  sha?: string;
  encoding?: string;
  content?: string;
}

interface Snapshot {
  headSha: string;
  treeSha: string;
  entries: GitHubTreeEntry[];
}

type TreeMutation = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
};

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]+$/;

function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function draftGitPath(ref: DraftRef): string {
  return `content/drafts/${ref.category}/${ref.filename}`;
}

function articleGitPath(ref: DraftRef): string {
  return `content/articles/${ref.category}/${ref.filename}`;
}

function decodeBlob(blob: GitHubBlobResponse): string {
  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    throw new DraftRepositoryError(
      "storage_unavailable",
      "GitHub returned an unsupported draft encoding",
    );
  }
  return Buffer.from(blob.content.replace(/\s+/g, ""), "base64").toString("utf8");
}

function toSummary(document: DraftDocument): DraftSummary {
  return {
    ref: document.ref,
    title: document.title,
    date: document.date,
    excerpt: document.excerpt,
    category: document.category,
    version: document.version,
  };
}

export class GitHubDraftRepository implements DraftRepository {
  private readonly repository: string;
  private readonly branch: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly apiBase: string;

  constructor(options: GitHubDraftRepositoryOptions) {
    if (!REPOSITORY_PATTERN.test(options.repository)) {
      throw new DraftRepositoryError(
        "invalid_input",
        "GITHUB_REPOSITORY must use owner/repository format",
      );
    }
    if (!BRANCH_PATTERN.test(options.branch) || !options.branch) {
      throw new DraftRepositoryError("invalid_input", "GITHUB_BRANCH is invalid");
    }
    if (!options.token) {
      throw new DraftRepositoryError("invalid_input", "GITHUB_TOKEN is required");
    }
    const apiUrl = new URL(options.apiBase ?? "https://api.github.com");
    if (apiUrl.protocol !== "https:") {
      throw new DraftRepositoryError("invalid_input", "GitHub API base must use HTTPS");
    }

    this.repository = options.repository;
    this.branch = options.branch;
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBase = apiUrl.toString().replace(/\/$/, "");
  }

  private endpoint(pathname: string): string {
    return `${this.apiBase}/repos/${this.repository}/${pathname}`;
  }

  private async api<T>(
    pathname: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint(pathname), {
        method: init.method ?? "GET",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
          "x-github-api-version": GITHUB_API_VERSION,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub could not be reached",
        { cause: error },
      );
    }

    if (!response.ok) {
      if (response.status === 409 || response.status === 422) {
        throw new DraftRepositoryError(
          "conflict",
          "GitHub rejected the change because the branch moved or validation failed",
        );
      }
      if (response.status === 404) {
        throw new DraftRepositoryError(
          "not_found",
          "The requested GitHub draft or repository object was not found",
        );
      }
      throw new DraftRepositoryError(
        "storage_unavailable",
        `GitHub request failed with HTTP ${response.status}`,
      );
    }

    const text = await response.text();
    if (text.length > MAX_API_RESPONSE_CHARACTERS) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub response exceeded the safety limit",
      );
    }
    if (!text) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub returned malformed JSON",
        { cause: error },
      );
    }
  }

  private async snapshot(): Promise<Snapshot> {
    const branchPath = encodePath(this.branch);
    const reference = await this.api<GitHubRefResponse>(`git/ref/heads/${branchPath}`);
    const headSha = reference.object?.sha;
    if (!headSha) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub branch response did not include a commit SHA",
      );
    }
    const commit = await this.api<GitHubCommitResponse>(`git/commits/${headSha}`);
    const treeSha = commit.tree?.sha;
    if (!treeSha) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub commit response did not include a tree SHA",
      );
    }
    const tree = await this.api<GitHubTreeResponse>(`git/trees/${treeSha}?recursive=1`);
    if (tree.truncated) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub repository tree was truncated; draft operations are paused",
      );
    }
    return { headSha, treeSha, entries: tree.tree ?? [] };
  }

  private assertExpectedVersion(snapshot: Snapshot, expectedVersion?: string): void {
    if (expectedVersion && expectedVersion !== snapshot.headSha) {
      throw new DraftRepositoryError(
        "conflict",
        "Repository changed since the draft was loaded; refresh before trying again",
      );
    }
  }

  private findDraft(snapshot: Snapshot, ref: DraftRef): GitHubTreeEntry {
    const entry = snapshot.entries.find(
      (candidate) =>
        candidate.path === draftGitPath(ref) &&
        candidate.type === "blob" &&
        typeof candidate.sha === "string",
    );
    if (!entry) {
      throw new DraftRepositoryError("not_found", "Draft was not found in GitHub");
    }
    return entry;
  }

  private async readBlob(sha: string): Promise<string> {
    return decodeBlob(await this.api<GitHubBlobResponse>(`git/blobs/${sha}`));
  }

  private document(ref: DraftRef, mdx: string, version: string): DraftDocument {
    const article = validateDraftMdx(ref, mdx);
    return {
      ref,
      title: article.title,
      date: article.date,
      excerpt: article.excerpt,
      category: article.category,
      version,
      mdx,
      article,
    };
  }

  async list(): Promise<DraftSummary[]> {
    const snapshot = await this.snapshot();
    const draftEntries = snapshot.entries.filter(
      (entry) =>
        entry.type === "blob" &&
        typeof entry.sha === "string" &&
        entry.path?.startsWith("content/drafts/") &&
        entry.path.endsWith(".mdx"),
    );
    const drafts = await Promise.all(
      draftEntries.map(async (entry) => {
        const parts = entry.path?.split("/") ?? [];
        const ref = validateDraftRef({
          category: parts[2] ?? "",
          filename: parts[3] ?? "",
        });
        return this.document(ref, await this.readBlob(entry.sha as string), snapshot.headSha);
      }),
    );
    return drafts
      .map(toSummary)
      .sort(
        (left, right) =>
          left.category.localeCompare(right.category) ||
          right.date.localeCompare(left.date) ||
          left.title.localeCompare(right.title),
      );
  }

  async read(refInput: DraftRef): Promise<DraftDocument> {
    const ref = validateDraftRef(refInput);
    const snapshot = await this.snapshot();
    const entry = this.findDraft(snapshot, ref);
    return this.document(ref, await this.readBlob(entry.sha as string), snapshot.headSha);
  }

  async create(refInput: DraftRef, mdx: string): Promise<DraftDocument> {
    const ref = validateDraftRef(refInput);
    validateDraftMdx(ref, mdx);
    const snapshot = await this.snapshot();
    const draftPath = draftGitPath(ref);
    if (snapshot.entries.some((entry) => entry.path === draftPath)) {
      throw new DraftRepositoryError("conflict", "A draft with this slug already exists");
    }
    const articlePath = articleGitPath(ref);
    if (snapshot.entries.some((entry) => entry.path === articlePath)) {
      throw new DraftRepositoryError(
        "conflict",
        "A published article with this slug already exists",
      );
    }
    const blobSha = await this.createBlob(mdx);
    const commit = await this.commitMutation(
      snapshot,
      [{ path: draftPath, mode: "100644", type: "blob", sha: blobSha }],
      `Create draft: ${path.basename(ref.filename, ".mdx")}`,
    );
    return this.document(ref, mdx, commit.sha as string);
  }

  private async createBlob(mdx: string): Promise<string> {
    const blob = await this.api<GitHubBlobResponse>("git/blobs", {
      method: "POST",
      body: { content: mdx, encoding: "utf-8" },
    });
    if (!blob.sha) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub did not return a blob SHA",
      );
    }
    return blob.sha;
  }

  private async commitMutation(
    snapshot: Snapshot,
    entries: TreeMutation[],
    message: string,
  ): Promise<GitHubCommitResponse> {
    const tree = await this.api<GitHubTreeResponse>("git/trees", {
      method: "POST",
      body: { base_tree: snapshot.treeSha, tree: entries },
    });
    if (!tree.sha) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub did not return a new tree SHA",
      );
    }
    const commit = await this.api<GitHubCommitResponse>("git/commits", {
      method: "POST",
      body: { message, tree: tree.sha, parents: [snapshot.headSha] },
    });
    if (!commit.sha) {
      throw new DraftRepositoryError(
        "storage_unavailable",
        "GitHub did not return a new commit SHA",
      );
    }
    await this.api(`git/refs/heads/${encodePath(this.branch)}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });
    return commit;
  }

  async save(
    refInput: DraftRef,
    mdx: string,
    expectedVersion?: string,
  ): Promise<DraftDocument> {
    const ref = validateDraftRef(refInput);
    validateDraftMdx(ref, mdx);
    const snapshot = await this.snapshot();
    this.assertExpectedVersion(snapshot, expectedVersion);
    this.findDraft(snapshot, ref);
    const blobSha = await this.createBlob(mdx);
    const commit = await this.commitMutation(
      snapshot,
      [{ path: draftGitPath(ref), mode: "100644", type: "blob", sha: blobSha }],
      `Update draft: ${path.basename(ref.filename, ".mdx")}`,
    );
    return this.document(ref, mdx, commit.sha as string);
  }

  async publish(
    refInput: DraftRef,
    mdx: string,
    expectedVersion?: string,
  ): Promise<PublishResult> {
    const ref = validateDraftRef(refInput);
    validateDraftMdx(ref, mdx);
    const snapshot = await this.snapshot();
    this.assertExpectedVersion(snapshot, expectedVersion);
    this.findDraft(snapshot, ref);
    const articlePath = articleGitPath(ref);
    if (snapshot.entries.some((entry) => entry.path === articlePath)) {
      throw new DraftRepositoryError(
        "conflict",
        "A published article with this slug already exists",
      );
    }
    const blobSha = await this.createBlob(mdx);
    const commit = await this.commitMutation(
      snapshot,
      [
        { path: articlePath, mode: "100644", type: "blob", sha: blobSha },
        { path: draftGitPath(ref), mode: "100644", type: "blob", sha: null },
      ],
      `Publish article: ${path.basename(ref.filename, ".mdx")}`,
    );
    return {
      articlePath,
      commitUrl:
        commit.html_url ??
        `https://github.com/${this.repository}/commit/${commit.sha as string}`,
    };
  }

  async discard(refInput: DraftRef, expectedVersion?: string): Promise<void> {
    const ref = validateDraftRef(refInput);
    const snapshot = await this.snapshot();
    this.assertExpectedVersion(snapshot, expectedVersion);
    this.findDraft(snapshot, ref);
    await this.commitMutation(
      snapshot,
      [{ path: draftGitPath(ref), mode: "100644", type: "blob", sha: null }],
      `Discard draft: ${path.basename(ref.filename, ".mdx")}`,
    );
  }
}
