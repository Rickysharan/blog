import { describe, expect, it } from "vitest";

import {
  assertSameOrigin,
  readBoundedJson,
  RequestGuardError,
} from "@/lib/auth/request";
import {
  checkLoginThrottle,
  clearLoginThrottle,
  recordLoginFailure,
} from "@/lib/auth/throttle";

describe("assertSameOrigin", () => {
  it("accepts an exact HTTPS origin", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://omnilede.test/api/admin/login", {
          method: "POST",
          headers: { origin: "https://omnilede.test" },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects missing, malformed and cross-origin mutation requests", () => {
    for (const origin of [undefined, "not-a-url", "https://evil.test"]) {
      const headers = origin ? { origin } : undefined;
      expect(() =>
        assertSameOrigin(
          new Request("https://omnilede.test/api/admin/login", {
            method: "POST",
            headers,
          }),
        ),
      ).toThrowError(RequestGuardError);
    }
  });
});

describe("readBoundedJson", () => {
  it("reads a small JSON request", async () => {
    await expect(
      readBoundedJson(
        new Request("https://omnilede.test/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: "secret" }),
        }),
      ),
    ).resolves.toEqual({ password: "secret" });
  });

  it("rejects non-JSON and bodies over 32 KiB", async () => {
    await expect(
      readBoundedJson(
        new Request("https://omnilede.test/api", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "password=secret",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });

    await expect(
      readBoundedJson(
        new Request("https://omnilede.test/api", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": String(32 * 1024 + 1),
          },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe("login throttling", () => {
  it("temporarily blocks a key after five failures without exposing the raw key", () => {
    clearLoginThrottle();
    const key = "hashed-client-key";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordLoginFailure(key, { now: 1_000 + attempt });
    }

    expect(checkLoginThrottle(key, { now: 2_000 })).toEqual(
      expect.objectContaining({ allowed: false, retryAfterSeconds: expect.any(Number) }),
    );
    expect(checkLoginThrottle(key, { now: 16 * 60 * 1_000 })).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    clearLoginThrottle();
  });
});
