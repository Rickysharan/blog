import { createHmac } from "node:crypto";

import { canonicalJson, type PublicationPayload } from "@omnilede/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  PUBLICATION_AUDIENCE,
  publicationRetryDelayMs,
  sendPublication,
} from "./client";

const publication: PublicationPayload = {
  publicationId: "10000000-0000-4000-8000-000000000001",
  submissionId: "10000000-0000-4000-8000-000000000002",
  submissionVersion: 3,
  title: "Global markets test",
  slug: "global-markets-test",
  date: "2026-08-28",
  category: "finance",
  tags: ["finance", "global"],
  contributorId: "10000000-0000-4000-8000-000000000003",
  contributorName: "Fixture Contributor",
  excerpt: "A fixture summary.",
  coverImage:
    "https://project.supabase.co/storage/v1/object/public/published-images/10000000-0000-4000-8000-000000000001.webp",
  readTime: 3,
  sourceName: "Fixture Source",
  sourceUrl: "https://example.test/source",
  region: "global",
  language: "en",
  contentDocument: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }],
  },
  guidelinesVersion: "2026-08-27",
};

const receipt = {
  publicationId: publication.publicationId,
  commitSha: "a".repeat(40),
  commitUrl: `https://github.com/owner/repository/commit/${"a".repeat(40)}`,
  articlePath: "content/articles/finance/global-markets-test.mdx",
  articleUrl: "https://omnilede.example/article/global-markets-test",
  replayed: false,
};

describe("sendPublication", () => {
  test("sends canonical JSON with the blog receiver's exact HMAC envelope", async () => {
    const fetchImpl = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = String(init?.body);
      expect(String(request)).toBe("https://omnilede.example/api/internal/publications");
      expect(body).toBe(canonicalJson(publication));
      expect(headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(headers.get("x-omnilede-timestamp")).toBe("1787911200");
      expect(headers.get("x-omnilede-nonce")).toBe("10000000-0000-4000-8000-000000000009");
      expect(headers.get("x-omnilede-audience")).toBe(PUBLICATION_AUDIENCE);
      expect(init?.redirect).toBe("error");
      const expected = createHmac("sha256", "a-secret-that-is-at-least-32-characters")
        .update(`1787911200.10000000-0000-4000-8000-000000000009.${PUBLICATION_AUDIENCE}.${body}`)
        .digest("hex");
      expect(headers.get("x-omnilede-signature")).toBe(`v1=${expected}`);
      return Response.json(receipt, { status: 201 });
    });

    const result = await sendPublication({
      endpoint: "https://omnilede.example/api/internal/publications",
      secret: "a-secret-that-is-at-least-32-characters",
      publication,
      fetchImpl,
      now: () => Date.parse("2026-08-28T10:00:00Z"),
      nonce: () => "10000000-0000-4000-8000-000000000009",
    });

    expect(result).toEqual({ disposition: "published", receipt });
  });

  test.each([
    [400, "permanent", "invalid_request"],
    [401, "paused", "invalid_signature"],
    [409, "manual_review", "publication_conflict"],
    [429, "retry", "rate_limited"],
    [503, "retry", "service_unavailable"],
  ] as const)("classifies HTTP %s as %s without returning the receiver body", async (status, disposition, code) => {
    const result = await sendPublication({
      endpoint: "https://omnilede.example/api/internal/publications",
      secret: "a-secret-that-is-at-least-32-characters",
      publication,
      fetchImpl: async () => Response.json({ code, message: "sensitive upstream detail" }, { status }),
    });

    expect(result).toEqual({ disposition, code });
    expect(JSON.stringify(result)).not.toContain("sensitive upstream detail");
  });

  test.each([
    [
      "a commit URL whose SHA does not match the receipt",
      { ...receipt, commitSha: "b".repeat(40) },
    ],
    [
      "an article URL on a different origin",
      { ...receipt, articleUrl: "https://attacker.example/article/global-markets-test" },
    ],
    [
      "a commit URL with query data",
      { ...receipt, commitUrl: `${receipt.commitUrl}?token=sensitive` },
    ],
  ])("rejects %s", async (_label, unsafeReceipt) => {
    const result = await sendPublication({
      endpoint: "https://omnilede.example/api/internal/publications",
      secret: "a-secret-that-is-at-least-32-characters",
      publication,
      fetchImpl: async () => Response.json(unsafeReceipt, { status: 201 }),
    });

    expect(result).toEqual({ disposition: "retry", code: "invalid_receiver_response" });
  });

  test("classifies an aborted request as retryable", async () => {
    const fetchImpl = vi.fn(
      async (_request: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
            once: true,
          });
        }),
    );

    const result = await sendPublication({
      endpoint: "https://omnilede.example/api/internal/publications",
      secret: "a-secret-that-is-at-least-32-characters",
      publication,
      fetchImpl,
      timeoutMs: 5,
    });

    expect(result).toEqual({ disposition: "retry", code: "receiver_timeout" });
  });

  test("keeps the timeout active while reading the receiver acknowledgement", async () => {
    const result = await sendPublication({
      endpoint: "https://omnilede.example/api/internal/publications",
      secret: "a-secret-that-is-at-least-32-characters",
      publication,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            pull() {
              return new Promise(() => undefined);
            },
          }),
          { status: 201 },
        ),
      timeoutMs: 5,
    });

    expect(result).toEqual({ disposition: "retry", code: "receiver_timeout" });
  });

  test("cancels an undeclared oversized acknowledgement without buffering the entire body", async () => {
    let pulls = 0;
    let cancelled = false;
    const result = await sendPublication({
      endpoint: "https://omnilede.example/api/internal/publications",
      secret: "a-secret-that-is-at-least-32-characters",
      publication,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulls += 1;
              if (pulls > 128) controller.close();
              else controller.enqueue(new Uint8Array(1_024));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 201 },
        ),
    });

    expect(result).toEqual({ disposition: "retry", code: "invalid_receiver_response" });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(128);
  });

  test("uses a bounded exponential retry schedule", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(publicationRetryDelayMs)).toEqual([
      30_000,
      60_000,
      120_000,
      240_000,
      480_000,
      900_000,
      900_000,
    ]);
  });
});
