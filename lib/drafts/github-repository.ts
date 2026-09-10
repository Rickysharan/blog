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
import {
  GitDataClient,
  GitDataClientError,
  type GitCommitResult,
  type GitDataClientOptions,
  type GitHubTreeEntry,
  type GitSnapshot,
  type GitTreeMutation,
} from "@/lib/github/git-data-client";

type GitHubDraftRepositoryOptions = GitDataClientOptions;

function draftGitPath(ref: DraftRef): string {
  return `content/drafts/${ref.category}/${ref.filename}`;
}

function articleGitPath(ref: DraftRef): string {
  return `content/articles/${ref.category}/${ref.filename}`;
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
  private readonly client: GitDataClient;

  constructor(options: GitHubDraftRepositoryOptions) {
    try {
      this.client = new GitDataClient(options);
    } catch (error) {
      throw this.asDraftError(error);
    }
  }

  private asDraftError(error: unknown): DraftRepositoryError {
    if (error instanceof DraftRepositoryError) return error;
    if (error instanceof GitDataClientError) {
      return new DraftRepositoryError(error.code, error.message);
    }
    return new DraftRepositoryError("storage_unavailable", "GitHub draft operation failed");
  }

  private async snapshot(): Promise<GitSnapshot> {
    try {
      return await this.client.snapshot();
    } catch (error) {
      throw this.asDraftError(error);
    }
  }

  private assertExpectedVersion(snapshot: GitSnapshot, expectedVersion?: string): void {
    if (expectedVersion && expectedVersion !== snapshot.headSha) {
      throw new DraftRepositoryError(
        "conflict",
        "Repository changed since the draft was loaded; refresh before trying again",
      );
    }
  }

  private findDraft(snapshot: GitSnapshot, ref: DraftRef): GitHubTreeEntry {
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
    try {
      return await this.client.readBlob(sha);
    } catch (error) {
      throw this.asDraftError(error);
    }
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
    try {
      return await this.client.createBlob(mdx);
    } catch (error) {
      throw this.asDraftError(error);
    }
  }

  private async commitMutation(
    snapshot: GitSnapshot,
    entries: GitTreeMutation[],
    message: string,
  ): Promise<GitCommitResult> {
    try {
      return await this.client.commitMutation(snapshot, entries, message);
    } catch (error) {
      throw this.asDraftError(error);
    }
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
        commit.htmlUrl ?? this.client.commitUrl(commit.sha),
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
