import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn()
}));

vi.mock("../../../lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: mocks }))
}));

import { GET } from "./route";

describe("Studio OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_STUDIO_URL = "https://studio.example";
    process.env.AUTH_ALLOWED_ORIGINS = "https://studio.example";
    mocks.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  });

  test("exchanges the code and redirects to a safe same-origin destination", async () => {
    const response = await GET(
      new Request("https://studio.example/auth/callback?code=pkce-code&next=%2Fcontent%3Fstate%3Ddraft")
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://studio.example/content?state=draft");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("uses the overview when the exact production callback has no next query", async () => {
    const response = await GET(new Request("https://studio.example/auth/callback?code=pkce-code"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(response.headers.get("location")).toBe("https://studio.example/overview");
  });

  test.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal"
  ])("replaces an unsafe destination with the overview: %s", async (next) => {
    const response = await GET(
      new Request(`https://studio.example/auth/callback?code=pkce-code&next=${encodeURIComponent(next)}`)
    );

    expect(response.headers.get("location")).toBe("https://studio.example/overview");
  });

  test("does not exchange a code delivered through an unconfigured callback origin", async () => {
    const response = await GET(new Request("https://evil.example/auth/callback?code=pkce-code"));

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://studio.example/login?error=invalid_callback");
  });

  test("keeps redirects on an allowed preview callback origin", async () => {
    process.env.AUTH_ALLOWED_ORIGINS = "https://studio.example,https://preview.example";

    const response = await GET(
      new Request("https://preview.example/auth/callback?code=pkce-code&next=%2Foverview")
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(response.headers.get("location")).toBe("https://preview.example/overview");
  });

  test("fails closed when the callback is incomplete or the exchange fails", async () => {
    const missing = await GET(new Request("https://studio.example/auth/callback"));
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(missing.headers.get("location")).toBe("https://studio.example/login?error=invalid_callback");

    mocks.exchangeCodeForSession.mockResolvedValue({ data: null, error: new Error("expired") });
    const failed = await GET(new Request("https://studio.example/auth/callback?code=expired-code"));
    expect(failed.headers.get("location")).toBe("https://studio.example/login?error=invalid_callback");
  });
});
