import { describe, expect, test } from "vitest";

import { signPayload, verifyPayload } from "./hmac";

describe("review HMAC", () => {
  test("verifies canonical payloads within the clock window", () => {
    const now = 1_700_000_000_000;
    const signature = signPayload("secret", now / 1000, "nonce-1234567890", '{"id":"1"}');
    expect(verifyPayload("secret", `sha256=${signature}`, String(now / 1000), "nonce-1234567890", '{"id":"1"}', now)).toBe(true);
    expect(verifyPayload("secret", `sha256=${signature}`, String(now / 1000 - 301), "nonce-1234567890", '{"id":"1"}', now)).toBe(false);
  });

  test("rejects tampered bodies and invalid signatures", () => {
    const now = 1_700_000_000_000;
    const signature = signPayload("secret", now / 1000, "nonce-1234567890", "body");
    expect(verifyPayload("secret", signature, String(now / 1000), "nonce-1234567890", "tampered", now)).toBe(false);
    expect(verifyPayload("secret", "bad", String(now / 1000), "nonce-1234567890", "body", now)).toBe(false);
  });
});
