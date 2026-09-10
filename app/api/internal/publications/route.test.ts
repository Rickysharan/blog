import { describe, expect, test, vi } from "vitest";

import { PUBLICATION_AUDIENCE, signPublicationPayload } from "@/lib/publishing/signature";
import { receivePublicationRequest, type PublicationEnvironment, type PublicationServiceDependencies } from "@/lib/publishing/service";
import { POST } from "./route";

const secret = "publication-route-test-secret-32-characters";
const nonce = "10000000-0000-4000-8000-000000000001";
const body = JSON.stringify({
  publicationId: "10000000-0000-4000-8000-000000000001",
  submissionId: "10000000-0000-4000-8000-000000000002",
  submissionVersion: 1,
  title: "Report",
  slug: "report",
  date: "2026-08-28",
  category: "finance",
  tags: ["markets"],
  contributorId: "10000000-0000-4000-8000-000000000003",
  contributorName: "Contributor",
  excerpt: "Excerpt",
  coverImage: "https://images.example/published/10000000-0000-4000-8000-000000000001.webp",
  readTime: 3,
  sourceName: "Source",
  sourceUrl: "https://example.com/source",
  region: "europe",
  language: "en-GB",
  contentDocument: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }] },
  guidelinesVersion: "2026-08-28",
});

const environment: PublicationEnvironment = {
  CONTRIBUTOR_PUBLISH_HMAC_SECRET: secret,
  GITHUB_PUBLISH_TOKEN: "github-test-token",
  GITHUB_REPOSITORY: "owner/repository",
  GITHUB_BRANCH: "main",
  PUBLISHED_IMAGE_ORIGIN: "https://images.example/published",
  CONTRIBUTOR_APP_ORIGIN: "https://contributors.example",
  NEXT_PUBLIC_SITE_URL: "https://omnilede.example",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test-key",
};

function dependencies(claim: "claimed" | "replayed" | "conflict" | "unavailable" = "claimed"): PublicationServiceDependencies {
  return {
    publishedImageOrigin: environment.PUBLISHED_IMAGE_ORIGIN,
    siteOrigin: environment.NEXT_PUBLIC_SITE_URL,
    nonceStore: { claim: vi.fn().mockResolvedValue({ status: claim }) },
    articleRepository: {
      publish: vi.fn().mockResolvedValue({
        commitSha: "a".repeat(40),
        commitUrl: "https://github.com/owner/repository/commit/" + "a".repeat(40),
        articlePath: "content/articles/finance/report.mdx",
        replayed: false,
      }),
    },
  };
}

function request(input = body, overrides: Record<string, string> = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  let parsed: unknown = {};
  try { parsed = JSON.parse(input); } catch { /* Signature is intentionally irrelevant for malformed JSON. */ }
  const headers = {
    "content-type": "application/json",
    "x-omnilede-timestamp": timestamp,
    "x-omnilede-nonce": nonce,
    "x-omnilede-audience": PUBLICATION_AUDIENCE,
    "x-omnilede-signature": signPublicationPayload({ secret, body: parsed, timestamp, nonce, audience: PUBLICATION_AUDIENCE }),
    ...overrides,
  };
  const result = new Request("https://omnilede.example/api/internal/publications", { method: "POST", body: input, headers });
  return result;
}

describe("publication route", () => {
  test("rejects wrong content type and malformed JSON", async () => {
    expect((await POST(request(body, { "content-type": "text/plain" }))).status).toBe(400);
    expect((await POST(request("{", {}))).status).toBe(400);
  });

  test("rejects missing or tampered signatures without consulting the service", async () => {
    expect((await POST(request(body, { "x-omnilede-signature": "" }))).status).toBe(401);
    expect((await POST(request(body, { "x-omnilede-audience": "wrong" }))).status).toBe(401);
  });

  test("does not require a browser origin", async () => {
    const withOrigin = await receivePublicationRequest(request(body, { origin: "https://attacker.example" }), {
      environment,
      dependencies: dependencies(),
      rateLimiter: { allow: () => true },
    });
    const withoutOrigin = await receivePublicationRequest(request(body), {
      environment,
      dependencies: dependencies(),
      rateLimiter: { allow: () => true },
    });
    expect(withOrigin.status).toBe(withoutOrigin.status);
    expect(withOrigin.status).toBe(201);
  });

  test.each([
    ["first publication", "claimed", 201],
    ["identical replay", "replayed", 200],
    ["nonce conflict", "conflict", 409],
    ["nonce store outage", "unavailable", 503],
  ] as const)("returns %s as %s", async (_label, claim, status) => {
    const response = await receivePublicationRequest(request(body), { environment, dependencies: dependencies(claim), rateLimiter: { allow: () => true } });
    expect(response.status).toBe(status);
  });

  test("returns 429 before constructing publication dependencies", async () => {
    const response = await receivePublicationRequest(request(body), { environment, rateLimiter: { allow: () => false } });
    expect(response.status).toBe(429);
  });

  test("returns only the six success fields", async () => {
    const response = await receivePublicationRequest(request(body), { environment, dependencies: dependencies(), rateLimiter: { allow: () => true } });
    expect(Object.keys(await response.json()).sort()).toEqual(["articlePath", "articleUrl", "commitSha", "commitUrl", "publicationId", "replayed"]);
  });

  test("rejects declared and streamed bodies over 300 KiB", async () => {
    const oversized = "{" + "x".repeat(300 * 1024) + "}";
    expect((await POST(request(oversized, { "content-length": String(new TextEncoder().encode(oversized).byteLength) }))).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(300 * 1024 + 1)); controller.close(); } });
    const streamed = new Request("https://omnilede.example/api/internal/publications", { method: "POST", body: stream, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit);
    expect((await POST(streamed)).status).toBe(413);
  });

  test("returns no-store security headers", async () => {
    const response = await POST(request(body, { "x-omnilede-signature": "v1=bad" }));
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
