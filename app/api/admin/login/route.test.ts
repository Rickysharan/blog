import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/login/route";
import { clearLoginThrottle } from "@/lib/auth/throttle";

function loginRequest(password: string, origin = "https://omnilede.test"): Request {
  return new Request("https://omnilede.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ password }),
  });
}

describe("admin login route", () => {
  beforeEach(() => {
    clearLoginThrottle();
    vi.stubEnv("ADMIN_PASSWORD", "correct horse battery staple");
    vi.stubEnv(
      "ADMIN_SESSION_SECRET",
      "a-production-length-session-secret-for-tests",
    );
  });

  afterEach(() => {
    clearLoginThrottle();
    vi.unstubAllEnvs();
  });

  it("sets an HttpOnly strict session cookie after a valid login", async () => {
    const response = await POST(loginRequest("correct horse battery staple"));
    const cookie = response.headers.get("set-cookie");

    expect(response.status).toBe(204);
    expect(cookie).toMatch(/omnilede_admin=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Max-Age=28800/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a cross-origin request before checking credentials", async () => {
    const response = await POST(
      loginRequest("correct horse battery staple", "https://evil.test"),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 429 with retry advice on the fifth failed attempt", async () => {
    const responses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      responses.push(await POST(loginRequest("wrong password")));
    }

    expect(responses.slice(0, 4).every(({ status }) => status === 401)).toBe(true);
    expect(responses[4]?.status).toBe(429);
    expect(responses[4]?.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});
