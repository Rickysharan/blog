import "server-only";

import type { FetchLike } from "@/lib/pipeline/types";

export const GITHUB_API_VERSION = "2026-03-10";
export const MAX_GITHUB_RESPONSE_BYTES = 8 * 1024 * 1024;

export type GitDataErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "storage_unavailable";

export class GitDataClientError extends Error {
  constructor(
    public readonly code: GitDataErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GitDataClientError";
  }
}

export interface GitHubTreeEntry {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string | null;
}

export interface GitSnapshot {
  headSha: string;
  treeSha: string;
  entries: GitHubTreeEntry[];
}

export type GitTreeMutation = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
};

export interface GitCommitResult {
  sha: string;
  htmlUrl?: string;
}

export interface GitDataClientOptions {
  repository: string;
  branch: string;
  token: string;
  fetchImpl?: FetchLike;
  apiBase?: string;
}

type RefResponse = { object?: { sha?: unknown } };
type CommitResponse = { sha?: unknown; html_url?: unknown; tree?: { sha?: unknown } };
type TreeResponse = { sha?: unknown; truncated?: unknown; tree?: unknown };
type BlobResponse = { sha?: unknown; encoding?: unknown; content?: unknown };

const REPOSITORY_PATTERN = /^(?!\.\.?\/)(?![^/]+\/\.\.?$)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_CHARACTERS_PATTERN = /^[A-Za-z0-9._/-]+$/;
const GITHUB_OBJECT_SHA_PATTERN = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const TREE_PATH_SEGMENT_PATTERN = /^[^\0/]+$/;
const TREE_MODES = new Set(["100644", "100755", "040000", "120000", "160000"]);

function invalid(message: string): never {
  throw new GitDataClientError("invalid_input", message);
}

function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function assertObjectSha(value: unknown, message: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !GITHUB_OBJECT_SHA_PATTERN.test(value)
  ) {
    throw new GitDataClientError("storage_unavailable", message);
  }
  return value;
}

function assertRequestSha(value: unknown, message = "GitHub object SHA is invalid"): string {
  if (
    typeof value !== "string" ||
    !GITHUB_OBJECT_SHA_PATTERN.test(value)
  ) {
    invalid(message);
  }
  return value;
}

function isSafeTreePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    value.split("/").every((segment) => TREE_PATH_SEGMENT_PATTERN.test(segment) && segment !== "." && segment !== "..")
  );
}

function isValidBranch(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 255 &&
    BRANCH_CHARACTERS_PATTERN.test(value) &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.endsWith(".") &&
    !value.toLowerCase().endsWith(".lock") &&
    !value.includes("//") &&
    !value.includes("..") &&
    value.split("/").every((part) => part.length > 0 && !part.startsWith("."))
  );
}

function isTreeEntry(value: unknown): value is GitHubTreeEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.path === "string" &&
    isSafeTreePath(entry.path) &&
    typeof entry.mode === "string" &&
    TREE_MODES.has(entry.mode) &&
    ((entry.mode === "040000" && entry.type === "tree") ||
      (entry.mode === "160000" && entry.type === "commit") ||
      (["100644", "100755", "120000"].includes(entry.mode) && entry.type === "blob")) &&
    typeof entry.sha === "string" &&
    GITHUB_OBJECT_SHA_PATTERN.test(entry.sha)
  );
}

async function boundedResponseText(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_GITHUB_RESPONSE_BYTES) {
      throw new GitDataClientError("storage_unavailable", "GitHub response exceeded the safety limit");
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_GITHUB_RESPONSE_BYTES) {
        await reader.cancel();
        throw new GitDataClientError("storage_unavailable", "GitHub response exceeded the safety limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseJson<T>(text: string): T {
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GitDataClientError("storage_unavailable", "GitHub returned malformed JSON");
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export class GitDataClient {
  readonly repository: string;
  readonly branch: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly apiBase: string;

  constructor(options: GitDataClientOptions) {
    if (!REPOSITORY_PATTERN.test(options.repository)) invalid("GitHub repository must use owner/repository format");
    if (!isValidBranch(options.branch)) invalid("GitHub branch is invalid");
    if (!options.token) invalid("GitHub token is required");

    let apiUrl: URL;
    try {
      apiUrl = new URL(options.apiBase ?? "https://api.github.com");
    } catch {
      invalid("GitHub API base is invalid");
    }
    if (
      apiUrl.protocol !== "https:" ||
      apiUrl.username !== "" ||
      apiUrl.password !== "" ||
      apiUrl.search !== "" ||
      apiUrl.hash !== ""
    ) {
      invalid("GitHub API base must use HTTPS");
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

  private async api<T>(pathname: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
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
    } catch {
      throw new GitDataClientError("storage_unavailable", "GitHub could not be reached");
    }

    if (!response.ok) {
      if (response.status === 409 || response.status === 422) {
        throw new GitDataClientError("conflict", "GitHub rejected the ref update");
      }
      if (response.status === 404) {
        throw new GitDataClientError("not_found", "GitHub repository object was not found");
      }
      throw new GitDataClientError("storage_unavailable", `GitHub request failed with HTTP ${response.status}`);
    }

    let text: string;
    try {
      text = await boundedResponseText(response);
    } catch (error) {
      if (error instanceof GitDataClientError) throw error;
      throw new GitDataClientError("storage_unavailable", "GitHub response could not be decoded");
    }
    return parseJson<T>(text);
  }

  async snapshot(): Promise<GitSnapshot> {
    const branchPath = encodePath(this.branch);
    const reference = await this.api<RefResponse>(`git/ref/heads/${branchPath}`);
    const headSha = assertObjectSha(reference.object?.sha, "GitHub branch response omitted its commit SHA");

    const commit = await this.api<CommitResponse>(`git/commits/${headSha}`);
    const treeSha = assertObjectSha(commit.tree?.sha, "GitHub commit response omitted its tree SHA");

    const tree = await this.api<TreeResponse>(`git/trees/${treeSha}?recursive=1`);
    if (tree.truncated !== false) {
      throw new GitDataClientError("storage_unavailable", "GitHub repository tree was truncated");
    }
    if (!Array.isArray(tree.tree)) {
      throw new GitDataClientError("storage_unavailable", "GitHub tree response was malformed");
    }
    if (!tree.tree.every(isTreeEntry)) {
      throw new GitDataClientError("storage_unavailable", "GitHub tree response was malformed");
    }
    return { headSha, treeSha, entries: tree.tree };
  }

  /** Returns the immutable commit receipt for the latest change to one exact path. */
  async latestCommitForPath(path: string): Promise<GitCommitResult> {
    if (!isSafeTreePath(path)) invalid("GitHub article path is invalid");
    const commits = await this.api<unknown>(
      `commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(this.branch)}&per_page=1`,
    );
    if (!Array.isArray(commits) || commits.length === 0) {
      throw new GitDataClientError("storage_unavailable", "GitHub returned no path commit receipt");
    }
    const first = commits[0];
    if (typeof first !== "object" || first === null || Array.isArray(first)) {
      throw new GitDataClientError("storage_unavailable", "GitHub path commit receipt was malformed");
    }
    const sha = assertObjectSha((first as { sha?: unknown }).sha, "GitHub path commit receipt omitted its SHA");
    const htmlUrl = (first as { html_url?: unknown }).html_url;
    if (typeof htmlUrl !== "string") {
      throw new GitDataClientError("storage_unavailable", "GitHub path commit receipt omitted its URL");
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(htmlUrl);
    } catch {
      throw new GitDataClientError("storage_unavailable", "GitHub path commit receipt URL was malformed");
    }
    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.port !== "" ||
      parsedUrl.href !== htmlUrl ||
      parsedUrl.username !== "" ||
      parsedUrl.password !== "" ||
      parsedUrl.search !== "" ||
      parsedUrl.hash !== ""
    ) {
      throw new GitDataClientError("storage_unavailable", "GitHub path commit receipt URL was unsafe");
    }
    return { sha, htmlUrl: parsedUrl.href };
  }

  async readBlob(sha: string): Promise<string> {
    if (!sha) invalid("GitHub blob SHA is required");
    const blob = await this.api<BlobResponse>(`git/blobs/${encodeURIComponent(assertRequestSha(sha))}`);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new GitDataClientError("storage_unavailable", "GitHub returned an unsupported blob encoding");
    }
    const normalized = blob.content.replace(/[\t\n\f\r ]+/g, "");
    if (
      normalized.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
    ) {
      throw new GitDataClientError("storage_unavailable", "GitHub returned malformed blob content");
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(normalized, "base64");
      if (bytes.toString("base64") !== normalized) throw new Error("non-canonical base64");
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new GitDataClientError("storage_unavailable", "GitHub returned malformed blob content");
    }
  }

  async createBlob(content: string): Promise<string> {
    const blob = await this.api<BlobResponse>("git/blobs", {
      method: "POST",
      body: { content, encoding: "utf-8" },
    });
    return assertObjectSha(blob.sha, "GitHub did not return a blob SHA");
  }

  async commitMutation(snapshot: GitSnapshot, entries: GitTreeMutation[], message: string): Promise<GitCommitResult> {
    const baseTreeSha = assertRequestSha(snapshot.treeSha, "GitHub base tree SHA is invalid");
    const parentSha = assertRequestSha(snapshot.headSha, "GitHub parent commit SHA is invalid");
    if (!entries.every((entry) => isSafeTreePath(entry.path))) {
      invalid("GitHub tree mutation path is invalid");
    }
    const safeEntries = entries.map((entry) => ({
      ...entry,
      sha: entry.sha === null ? null : assertRequestSha(entry.sha, "GitHub tree mutation SHA is invalid"),
    }));
    const tree = await this.api<TreeResponse>("git/trees", {
      method: "POST",
      body: { base_tree: baseTreeSha, tree: safeEntries },
    });
    const treeSha = assertObjectSha(tree.sha, "GitHub did not return a new tree SHA");

    const commit = await this.api<CommitResponse>("git/commits", {
      method: "POST",
      body: { message, tree: treeSha, parents: [parentSha] },
    });
    const commitSha = assertObjectSha(commit.sha, "GitHub did not return a new commit SHA");

    const ref = await this.api<RefResponse>(`git/refs/heads/${encodePath(this.branch)}`, {
      method: "PATCH",
      body: { sha: commitSha, force: false },
    });
    if (ref.object?.sha !== commitSha) {
      throw new GitDataClientError("storage_unavailable", "GitHub ref update returned an unexpected commit SHA");
    }
    return { sha: commitSha, htmlUrl: stringValue(commit.html_url) };
  }

  commitUrl(sha: string): string {
    return `https://github.com/${this.repository}/commit/${encodeURIComponent(assertRequestSha(sha))}`;
  }
}
