import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  readAdminSession,
  verifySessionToken,
} from "@/lib/auth/session";

describe("signed admin sessions", () => {
  const secret = "a-test-secret-that-is-long-enough-for-production";

  it("accepts a live session and rejects expired or modified tokens", async () => {
    const token = await createSessionToken(secret, { now: 1_000, ttlMs: 500 });

    expect(await verifySessionToken(token, secret, { now: 1_400 })).toEqual({
      version: 1,
      issuedAt: 1_000,
      expiresAt: 1_500,
    });
    expect(await verifySessionToken(token, secret, { now: 1_501 })).toBeNull();
    expect(await verifySessionToken(`${token}x`, secret, { now: 1_200 })).toBeNull();
  });

  it("rejects tokens with malformed payloads or the wrong secret", async () => {
    const token = await createSessionToken(secret, { now: 2_000, ttlMs: 500 });

    expect(await verifySessionToken("not.a.valid.token", secret)).toBeNull();
    expect(
      await verifySessionToken(token, "another-secret-that-is-also-long-enough", {
        now: 2_100,
      }),
    ).toBeNull();
  });

  it("reads the signed token from the strict admin cookie", async () => {
    const token = await createSessionToken(secret, { now: 3_000, ttlMs: 500 });
    const request = new Request("https://omnilede.test/admin/review", {
      headers: { cookie: `other=value; omnilede_admin=${token}` },
    });

    expect(await readAdminSession(request, secret, { now: 3_200 })).toBeTruthy();
    expect(
      await readAdminSession(
        new Request("https://omnilede.test/admin/review"),
        secret,
      ),
    ).toBeNull();
  });
});
