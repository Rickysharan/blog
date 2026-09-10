import { randomUUID } from "node:crypto";

import { canonicalJson, type PublicationPayload } from "@omnilede/contracts";
import { describe, expect, test } from "vitest";

import {
  sendPublication,
  type PublicationReceipt,
} from "@/apps/contributor/lib/publication/client";
import {
  buildPublicationPayload,
  processPublicationOutbox,
  verifyPublicationDeployment,
  type PublicationOutboxClaim,
  type PublicationOutboxStore,
} from "@/apps/contributor/lib/publication/outbox";
import { parseArticleFile } from "@/lib/content/schema";
import { GitHubArticleRepository } from "@/lib/publishing/article-repository";
import { PUBLICATION_AUDIENCE, signPublicationPayload } from "@/lib/publishing/signature";
import {
  receivePublicationRequest,
  type PublicationEnvironment,
  type PublicationNonceStore,
  type PublicationServiceDependencies,
} from "@/lib/publishing/service";

const SECRET = "publication-chain-fixture-secret-at-least-32-chars";
const NOW = Date.parse("2026-08-28T10:00:00.000Z");
const IMAGE_ORIGIN = "https://images.example.test/storage/v1/object/public/published-images";
const RECEIVER_URL = "https://omnilede.example.test/api/internal/publications";

function uuid(): string {
  return randomUUID();
}

function makeClaim(): PublicationOutboxClaim {
  const publicationId = uuid();
  const submissionId = uuid();
  const authorId = uuid();
  return {
    outboxId: uuid(),
    publicationId,
    submissionId,
    submissionVersion: 1,
    authorId,
    contributorName: "Publication Fixture Contributor",
    title: "A verified contributor publication",
    slug: `verified-contributor-publication-${publicationId.slice(0, 8)}`,
    approvedAt: "2026-08-28T10:00:00.000Z",
    category: "finance",
    region: "global",
    language: "en",
    sourceName: "Fixture Source",
    sourceUrl: "https://example.test/fixture-source",
    privateImagePath: `${authorId}/${submissionId}/${uuid()}.webp`,
    guidelinesVersion: "2026-08-27",
    contentDocument: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A human-approved fixture article for the signed publication chain." }] }],
    },
    rewardPoints: 25,
    attemptCount: 1,
    leaseToken: uuid(),
  };
}

/** In-memory model of the rows the outbox completion RPC changes atomically. */
class MemorySupabaseOutbox implements PublicationOutboxStore {
  readonly publicationRows: Array<{ publicationId: string; articlePath: string; commitSha: string }> = [];
  readonly walletTransactions: Array<{ publicationId: string; points: number }> = [];
  readonly failures: string[] = [];
  private state: "pending" | "leased" | "completed" = "pending";
  private failAcknowledgement = false;

  constructor(readonly item: PublicationOutboxClaim) {}

  failNextAcknowledgement(): void {
    this.failAcknowledgement = true;
  }

  retryLeasedClaim(): void {
    if (this.state === "leased") this.state = "pending";
  }

  async claim(): Promise<PublicationOutboxClaim | null> {
    if (this.state !== "pending") return null;
    this.state = "leased";
    return { ...this.item, leaseToken: uuid() };
  }

  async complete(input: Parameters<PublicationOutboxStore["complete"]>[0]): Promise<void> {
    if (this.failAcknowledgement) {
      this.failAcknowledgement = false;
      throw new Error("disposable database acknowledgement outage");
    }
    if (this.state !== "leased" || input.outboxId !== this.item.outboxId) throw new Error("invalid outbox acknowledgement");
    this.state = "completed";
    this.publicationRows.push({
      publicationId: this.item.publicationId,
      articlePath: input.receipt.articlePath,
      commitSha: input.receipt.commitSha,
    });
    this.walletTransactions.push({ publicationId: this.item.publicationId, points: this.item.rewardPoints });
  }

  async fail(input: Parameters<PublicationOutboxStore["fail"]>[0]): Promise<void> {
    this.failures.push(input.code);
    this.state = "pending";
  }
}

/** Disposable, stateful GitHub REST adapter; it never leaves this process. */
class FakeGitHubApi {
  private next = 1;
  private readonly blobs = new Map<string, string>();
  private readonly trees = new Map<string, Map<string, string>>();
  private readonly commits = new Map<string, { tree: string; paths: string[] }>();
  private readonly pathCommits = new Map<string, string>();
  private head = "a".repeat(40);
  private tree = "b".repeat(40);
  commitCount = 0;

  constructor() {
    this.trees.set(this.tree, new Map());
    this.commits.set(this.head, { tree: this.tree, paths: [] });
  }

  articlePaths(): string[] {
    return [...(this.trees.get(this.tree)?.keys() ?? [])]
      .filter((articlePath) => articlePath.startsWith("content/articles/"))
      .sort();
  }

  articleContent(articlePath: string): string | undefined {
    const blobSha = this.trees.get(this.tree)?.get(articlePath);
    return blobSha ? this.blobs.get(blobSha) : undefined;
  }

  private sha(): string {
    const value = (this.next++).toString(16);
    return value.repeat(40).slice(0, 40);
  }

  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(input.toString());
    const method = init?.method ?? "GET";
    const path = url.pathname;
    const json = (value: unknown, status = 200) => Response.json(value, { status });
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

    if (method === "GET" && path.endsWith("/git/ref/heads/main")) return json({ object: { sha: this.head } });
    if (method === "GET" && path.includes("/git/commits/")) {
      const sha = path.split("/").at(-1)!;
      const commit = this.commits.get(sha);
      return commit ? json({ tree: { sha: commit.tree } }) : new Response("missing", { status: 404 });
    }
    if (method === "GET" && path.endsWith("/git/trees/" + this.tree) && url.searchParams.get("recursive") === "1") {
      return json({ truncated: false, tree: [...this.trees.get(this.tree)!.entries()].map(([articlePath, sha]) => ({ path: articlePath, mode: "100644", type: "blob", sha })) });
    }
    if (method === "GET" && path.includes("/git/trees/")) {
      const sha = path.split("/").at(-1)!;
      const tree = this.trees.get(sha);
      return tree ? json({ truncated: false, tree: [...tree.entries()].map(([articlePath, blobSha]) => ({ path: articlePath, mode: "100644", type: "blob", sha: blobSha })) }) : new Response("missing", { status: 404 });
    }
    if (method === "GET" && path.includes("/git/blobs/")) {
      const sha = path.split("/").at(-1)!;
      const content = this.blobs.get(sha);
      return content === undefined ? new Response("missing", { status: 404 }) : json({ sha, encoding: "base64", content: Buffer.from(content).toString("base64") });
    }
    if (method === "POST" && path.endsWith("/git/blobs")) {
      const sha = this.sha();
      this.blobs.set(sha, String(body.content));
      return json({ sha }, 201);
    }
    if (method === "POST" && path.endsWith("/git/trees")) {
      const base = this.trees.get(String(body.base_tree));
      if (!base || !Array.isArray(body.tree)) return new Response("invalid", { status: 422 });
      const nextTree = new Map(base);
      const paths: string[] = [];
      for (const entry of body.tree as Array<{ path: string; sha: string }>) {
        nextTree.set(entry.path, entry.sha);
        paths.push(entry.path);
      }
      const sha = this.sha();
      this.trees.set(sha, nextTree);
      this.commits.set(sha, { tree: sha, paths });
      return json({ sha }, 201);
    }
    if (method === "POST" && path.endsWith("/git/commits")) {
      const tree = String(body.tree);
      const staged = this.commits.get(tree);
      if (!staged) return new Response("invalid", { status: 422 });
      const sha = this.sha();
      this.commits.set(sha, { tree, paths: staged.paths });
      return json({ sha, html_url: `https://github.com/owner/repository/commit/${sha}` }, 201);
    }
    if (method === "PATCH" && path.endsWith("/git/refs/heads/main")) {
      const sha = String(body.sha);
      const commit = this.commits.get(sha);
      if (!commit) return new Response("missing", { status: 422 });
      this.head = sha;
      this.tree = commit.tree;
      this.commitCount += 1;
      for (const articlePath of commit.paths) this.pathCommits.set(articlePath, sha);
      return json({ object: { sha } });
    }
    if (method === "GET" && path.endsWith("/commits")) {
      const articlePath = url.searchParams.get("path") ?? "";
      const sha = this.pathCommits.get(articlePath);
      return sha ? json([{ sha, html_url: `https://github.com/owner/repository/commit/${sha}` }]) : json([]);
    }
    return new Response(`Unhandled fake GitHub request: ${method} ${url}`, { status: 500 });
  }
}

class MemoryNonceStore implements PublicationNonceStore {
  private readonly nonces = new Map<string, { publicationId: string; body: string }>();

  async claim(input: Parameters<PublicationNonceStore["claim"]>[0]) {
    const body = canonicalJson(input.body as Record<string, unknown>);
    const existing = this.nonces.get(input.nonce);
    if (!existing) {
      this.nonces.set(input.nonce, { publicationId: input.publicationId, body });
      return { status: "claimed" as const };
    }
    return existing.publicationId === input.publicationId && existing.body === body
      ? { status: "replayed" as const }
      : { status: "conflict" as const };
  }
}

/** Models the provider deploy that GitHub triggers after the durable publication commit. */
class FakeNetlifyDeployment {
  attempts = 0;

  async fetch(): Promise<Response> {
    this.attempts += 1;
    if (this.attempts === 1) return new Response("build failed", { status: 503 });
    return new Response(
      '<!doctype html><article data-publication-id="DEPLOYMENT_PUBLICATION_ID">Deployed</article>',
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

function fixture(
  claim = makeClaim(),
  verifyDeployment: (
    publication: PublicationPayload,
    receipt: PublicationReceipt,
    options: { signal: AbortSignal },
  ) => Promise<boolean> = async () => true,
) {
  const github = new FakeGitHubApi();
  const nonceStore = new MemoryNonceStore();
  const outbox = new MemorySupabaseOutbox(claim);
  const environment: PublicationEnvironment = {
    CONTRIBUTOR_PUBLISH_HMAC_SECRET: SECRET,
    GITHUB_PUBLISH_TOKEN: "disposable-fake-token",
    GITHUB_REPOSITORY: "owner/repository",
    GITHUB_BRANCH: "main",
    PUBLISHED_IMAGE_ORIGIN: IMAGE_ORIGIN,
    CONTRIBUTOR_APP_ORIGIN: "https://contributors.example.test",
    NEXT_PUBLIC_SITE_URL: "https://omnilede.example.test",
    SUPABASE_URL: "https://project.example.test",
    SUPABASE_SECRET_KEY: "sb_secret_disposable_fixture",
  };
  const dependencies: PublicationServiceDependencies = {
    publishedImageOrigin: IMAGE_ORIGIN,
    siteOrigin: environment.NEXT_PUBLIC_SITE_URL,
    nonceStore,
    articleRepository: new GitHubArticleRepository({
      repository: environment.GITHUB_REPOSITORY,
      branch: environment.GITHUB_BRANCH,
      token: environment.GITHUB_PUBLISH_TOKEN,
      fetchImpl: github.fetch.bind(github),
      apiBase: "https://fake.github.test",
    }),
  };
  const receiverFetch: typeof fetch = async (input, init) => receivePublicationRequest(
    new Request(input.toString(), { method: init?.method, headers: init?.headers, body: init?.body }),
    { environment, dependencies, rateLimiter: { allow: () => true }, now: NOW },
  );
  let nonceSequence = 0;
  const publish = (publication: PublicationPayload) => sendPublication({
    endpoint: RECEIVER_URL,
    secret: SECRET,
    publication,
    fetchImpl: receiverFetch,
    now: () => NOW,
    nonce: () => `10000000-0000-4000-8000-${String(++nonceSequence).padStart(12, "0")}`,
  });
  const run = () => processPublicationOutbox(
    {
      store: outbox,
      prepareImage: async () => ({ coverImage: `${IMAGE_ORIGIN}/${claim.publicationId}.webp` }),
      publish: (publication) => publish(publication),
      verifyDeployment,
      now: () => NOW,
    },
    { workerId: uuid(), maxItems: 1, maxRuntimeMs: 10_000 },
  );
  return { claim, dependencies, github, nonceStore, outbox, publish, receiverFetch, run };
}

describe("contributor publication chain", () => {
  test("publishes one approved outbox claim into one Git article, publication row, and wallet transaction", async () => {
    const chain = fixture();

    await expect(chain.run()).resolves.toMatchObject({ claimed: 1, published: 1, failed: 0 });

    const expectedPath = `content/articles/finance/${chain.claim.slug}.mdx`;
    expect(chain.github.commitCount).toBe(1);
    expect(chain.github.articlePaths()).toEqual([expectedPath]);
    expect(chain.outbox.publicationRows).toHaveLength(1);
    expect(chain.outbox.publicationRows[0]).toMatchObject({ publicationId: chain.claim.publicationId, articlePath: expectedPath });
    expect(chain.outbox.walletTransactions).toEqual([{ publicationId: chain.claim.publicationId, points: 25 }]);

    const mdx = chain.github.articleContent(expectedPath);
    expect(mdx).toBeDefined();
    const article = parseArticleFile(mdx!, expectedPath);
    expect(article).toMatchObject({
      contributorId: chain.claim.authorId,
      contributorName: chain.claim.contributorName,
      publicationId: chain.claim.publicationId,
      sourceName: chain.claim.sourceName,
      sourceUrl: chain.claim.sourceUrl,
      submissionId: chain.claim.submissionId,
    });
    expect(mdx!.trimEnd()).toMatch(
      /Source: \[Fixture Source\]\(https:\/\/example\.test\/fixture-source\)$/,
    );
  });

  test("replays the identical signed body and nonce without another Git commit or wallet credit", async () => {
    const chain = fixture();
    const publication = buildPublicationPayload(chain.claim, `${IMAGE_ORIGIN}/${chain.claim.publicationId}.webp`);
    const nonce = uuid();
    const timestamp = String(Math.floor(NOW / 1000));
    const headers = {
      "content-type": "application/json",
      "x-omnilede-timestamp": timestamp,
      "x-omnilede-nonce": nonce,
      "x-omnilede-audience": PUBLICATION_AUDIENCE,
      "x-omnilede-signature": signPublicationPayload({ secret: SECRET, body: publication, timestamp, nonce, audience: PUBLICATION_AUDIENCE }),
    };
    const request = () => chain.receiverFetch(RECEIVER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(publication),
    });

    await expect(request()).resolves.toHaveProperty("status", 201);
    const replay = await request();
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ replayed: true });

    expect(chain.github.commitCount).toBe(1);
    expect(chain.outbox.walletTransactions).toHaveLength(0);
  });

  test("rejects a tampered body and a validly signed changed body using the same nonce before another commit", async () => {
    const chain = fixture();
    const publication = buildPublicationPayload(chain.claim, `${IMAGE_ORIGIN}/${chain.claim.publicationId}.webp`);
    const nonce = uuid();
    const timestamp = String(Math.floor(NOW / 1000));
    const headers = {
      "content-type": "application/json",
      "x-omnilede-timestamp": timestamp,
      "x-omnilede-nonce": nonce,
      "x-omnilede-audience": PUBLICATION_AUDIENCE,
      "x-omnilede-signature": signPublicationPayload({ secret: SECRET, body: publication, timestamp, nonce, audience: PUBLICATION_AUDIENCE }),
    };
    const receiver = (body: unknown, signingHeaders = headers) => receivePublicationRequest(
      new Request(RECEIVER_URL, { method: "POST", headers: signingHeaders, body: JSON.stringify(body) }),
      {
        environment: {
          CONTRIBUTOR_PUBLISH_HMAC_SECRET: SECRET,
          GITHUB_PUBLISH_TOKEN: "disposable-fake-token",
          GITHUB_REPOSITORY: "owner/repository",
          GITHUB_BRANCH: "main",
          PUBLISHED_IMAGE_ORIGIN: IMAGE_ORIGIN,
          CONTRIBUTOR_APP_ORIGIN: "https://contributors.example.test",
          NEXT_PUBLIC_SITE_URL: "https://omnilede.example.test",
          SUPABASE_URL: "https://project.example.test",
          SUPABASE_SECRET_KEY: "sb_secret_disposable_fixture",
        },
        dependencies: chain.dependencies,
        rateLimiter: { allow: () => true },
        now: NOW,
      },
    );

    await expect(receiver({ ...publication, title: "Tampered after signing" })).resolves.toHaveProperty("status", 401);
    await expect(receiver(publication)).resolves.toHaveProperty("status", 201);
    const changed = { ...publication, title: "A valid but different body" };
    const changedHeaders = { ...headers, "x-omnilede-signature": signPublicationPayload({ secret: SECRET, body: changed, timestamp, nonce, audience: PUBLICATION_AUDIENCE }) };
    await expect(receiver(changed, changedHeaders)).resolves.toHaveProperty("status", 409);
    expect(chain.github.commitCount).toBe(1);
  });

  test("marks an existing article path with different content as a publication conflict", async () => {
    const chain = fixture();
    await chain.run();
    const conflictingPublicationId = uuid();
    const conflicting = {
      ...buildPublicationPayload(chain.claim, `${IMAGE_ORIGIN}/${chain.claim.publicationId}.webp`),
      publicationId: conflictingPublicationId,
      coverImage: `${IMAGE_ORIGIN}/${conflictingPublicationId}.webp`,
      title: "A different valid publication",
    };

    await expect(chain.publish(conflicting)).resolves.toEqual({ disposition: "manual_review", code: "publication_conflict" });

    expect(chain.github.commitCount).toBe(1);
    expect(chain.outbox.walletTransactions).toHaveLength(1);
  });

  test("reconciles a Git commit after database acknowledgement failure without duplicating rows or credit", async () => {
    const chain = fixture();
    chain.outbox.failNextAcknowledgement();

    await expect(chain.run()).resolves.toMatchObject({ claimed: 1, published: 0, failed: 1, stopped: "acknowledgement_unavailable" });
    expect(chain.github.commitCount).toBe(1);
    expect(chain.outbox.publicationRows).toHaveLength(0);

    chain.outbox.retryLeasedClaim();
    await expect(chain.run()).resolves.toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(chain.github.commitCount).toBe(1);
    expect(chain.outbox.publicationRows).toHaveLength(1);
    expect(chain.outbox.walletTransactions).toEqual([{ publicationId: chain.claim.publicationId, points: 25 }]);
  });

  test("retries a provider deploy from the existing commit without republishing or crediting twice", async () => {
    const deployment = new FakeNetlifyDeployment();
    const claim = makeClaim();
    const chain = fixture(claim, (publication, receipt, options) =>
      verifyPublicationDeployment({
        publication,
        receipt,
        expectedSiteOrigin: "https://omnilede.example.test",
        signal: options.signal,
        fetchImpl: async () => {
          const response = await deployment.fetch();
          if (response.ok) {
            return new Response(
              (await response.text()).replace("DEPLOYMENT_PUBLICATION_ID", publication.publicationId),
              { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
            );
          }
          return response;
        },
      }),
    );

    await expect(chain.run()).resolves.toMatchObject({ claimed: 1, published: 0, failed: 1 });
    expect(chain.outbox.failures).toContain("deployment_not_ready");
    expect(chain.github.commitCount).toBe(1);
    expect(chain.outbox.publicationRows).toHaveLength(0);
    expect(chain.outbox.walletTransactions).toHaveLength(0);

    await expect(chain.run()).resolves.toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect(deployment.attempts).toBe(2);
    expect(chain.github.commitCount).toBe(1);
    expect(chain.outbox.publicationRows).toHaveLength(1);
    expect(chain.outbox.walletTransactions).toHaveLength(1);
  });
});
