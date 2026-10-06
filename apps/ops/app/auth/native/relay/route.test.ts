import { beforeEach, describe, expect, test } from "vitest";

import { GET } from "./route";

describe("native OAuth relay", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STUDIO_URL = "https://studio.example";
    process.env.AUTH_ALLOWED_ORIGINS = "https://studio.example";
  });

  test("returns a valid one-time code to the installed OmniLede app", async () => {
    const response = await GET(new Request("https://studio.example/auth/native/relay?code=pkce-code"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("com.rickysharan.omnilede://auth-callback?code=pkce-code");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("rejects incomplete and untrusted callbacks without exposing a custom scheme", async () => {
    const missing = await GET(new Request("https://studio.example/auth/native/relay"));
    const hostile = await GET(new Request("https://evil.example/auth/native/relay?code=pkce-code"));

    expect(missing.headers.get("location")).toBe("https://studio.example/login?error=invalid_callback");
    expect(hostile.headers.get("location")).toBe("https://studio.example/login?error=invalid_callback");
  });
});
