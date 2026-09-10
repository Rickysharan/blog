import { describe, expect, test } from "vitest";

import {
  PUBLICATION_AUDIENCE,
  signPublicationPayload,
  verifyPublicationSignature,
} from "./signature";

const secret = "signing-secret-for-tests";
const nonce = "10000000-0000-4000-8000-000000000001";
const timestamp = 1_725_000_000;
const body = { publicationId: "20000000-0000-4000-8000-000000000001", title: "Café", tags: ["news", "東京"] };

function signedHeaders(overrides: Partial<{ timestamp: string; nonce: string; audience: string; signature: string }> = {}) {
  const headers = {
    timestamp: String(timestamp),
    nonce,
    audience: PUBLICATION_AUDIENCE,
  };
  return {
    ...headers,
    signature: signPublicationPayload({ secret, body, ...headers }),
    ...overrides,
  };
}

describe("publication signatures", () => {
  test("creates the specified HMAC-SHA256 wire vector", () => {
    expect(signedHeaders().signature).toBe(
      "v1=6bf4cc20eea2febbd207a7eca4641c678fc84a581a22c5f03774bf64ee9904a5",
    );
  });

  test("accepts a current signature and returns no sensitive material", () => {
    expect(
      verifyPublicationSignature({ secret, body, headers: signedHeaders(), now: timestamp * 1000 }),
    ).toEqual({ valid: true });
  });

  test("does not allow callers to override the production audience or timestamp window", () => {
    const overriddenAudience = "test-audience";
    const overriddenTimestamp = timestamp - 3_601;
    const headers = {
      timestamp: String(overriddenTimestamp),
      nonce,
      audience: overriddenAudience,
    };
    const policyOverrideInput = {
      secret,
      body,
      headers: {
        ...headers,
        signature: signPublicationPayload({ secret, body, ...headers }),
      },
      now: timestamp * 1000,
      expectedAudience: overriddenAudience,
      maxAgeSeconds: 4_000,
    };

    expect(verifyPublicationSignature(policyOverrideInput)).toEqual({
      valid: false,
      error: { code: "invalid_signature", message: "Invalid publication signature" },
    });
  });

  test.each([
    ["changed body", { body: { ...body, title: "Changed" } }],
    ["changed timestamp", { headers: signedHeaders({ timestamp: String(timestamp + 1) }) }],
    ["changed nonce", { headers: signedHeaders({ nonce: "10000000-0000-4000-0000-000000000001" }) }],
    ["wrong secret", { secret: "different-secret" }],
    ["wrong audience", { headers: signedHeaders({ audience: "other-audience" }) }],
  ])("rejects a %s", (_label, overrides) => {
    expect(
      verifyPublicationSignature({
        secret,
        body,
        headers: signedHeaders(),
        now: timestamp * 1000,
        ...overrides,
      }),
    ).toEqual({ valid: false, error: { code: "invalid_signature", message: "Invalid publication signature" } });
  });

  test.each([
    ["expired", timestamp - 301],
    ["future", timestamp + 301],
  ])("rejects a %s timestamp", (_label, invalidTimestamp) => {
    expect(
      verifyPublicationSignature({
        secret,
        body,
        headers: signedHeaders({ timestamp: String(invalidTimestamp) }),
        now: timestamp * 1000,
      }),
    ).toEqual({ valid: false, error: { code: "invalid_signature", message: "Invalid publication signature" } });
  });

  test.each([
    "v1=ABCDEF",
    "v1=abc",
    "sha256=" + "a".repeat(64),
    "v1=" + "g".repeat(64),
  ])("rejects malformed or uppercase signature hex", (signature) => {
    expect(
      verifyPublicationSignature({ secret, body, headers: signedHeaders({ signature }), now: timestamp * 1000 }),
    ).toEqual({ valid: false, error: { code: "invalid_signature", message: "Invalid publication signature" } });
  });

  test("uses a constant-time comparison after rejecting a length mismatch", () => {
    expect(
      verifyPublicationSignature({
        secret,
        body,
        headers: signedHeaders({ signature: "v1=" + "a".repeat(62) }),
        now: timestamp * 1000,
      }),
    ).toEqual({ valid: false, error: { code: "invalid_signature", message: "Invalid publication signature" } });
  });

  test("serializes verification failures without secrets, signatures, or bodies", () => {
    const result = verifyPublicationSignature({
      secret,
      body,
      headers: signedHeaders({ signature: "v1=" + "a".repeat(64) }),
      now: timestamp * 1000,
    });

    expect(result).toEqual({ valid: false, error: { code: "invalid_signature", message: "Invalid publication signature" } });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("a".repeat(64));
    expect(serialized).not.toContain("Café");
  });
});
