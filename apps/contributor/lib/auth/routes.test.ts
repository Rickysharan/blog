import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auth = {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    exchangeCodeForSession: vi.fn()
  };
  const supabase = { auth };
  const rpc = vi.fn();
  const service = { schema: vi.fn(() => ({ rpc })) };
  return { auth, supabase, rpc, service };
});

vi.mock("../supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => mocks.supabase),
  createServiceSupabaseClient: vi.fn(() => mocks.service)
}));

import { POST as login } from "../../app/api/auth/login/route";
import { POST as signup } from "../../app/api/auth/signup/route";
import { POST as forgotPassword } from "../../app/api/auth/forgot-password/route";
import { GET as callback } from "../../app/auth/callback/route";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://contributors.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://contributors.example", ...headers },
    body: JSON.stringify(body)
  });
}

describe("contributor authentication routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_ALLOWED_ORIGINS = "https://contributors.example";
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    mocks.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  });

  test("normalizes email and rejects an open redirect", async () => {
    const response = await login(post("/api/auth/login?next=https%3A%2F%2Fevil.example", {
      email: "  NEWS@Example.COM ",
      password: "correct horse battery staple"
    }));

    expect(response.status).toBe(200);
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "news@example.com",
      password: "correct horse battery staple"
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, next: "/dashboard" });
  });

  test("rejects an invalid origin before reading credentials", async () => {
    const response = await login(post("/api/auth/login", { email: "news@example.com", password: "correct horse battery staple" }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test("rejects short passwords and oversized bodies", async () => {
    const short = await login(post("/api/auth/login", { email: "news@example.com", password: "short" }));
    expect(short.status).toBe(400);

    const large = await signup(new Request("https://contributors.example/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://contributors.example", "content-length": "20000" },
      body: JSON.stringify({ email: "news@example.com", password: "correct horse battery staple" })
    }));
    expect(large.status).toBe(413);
  });

  test("returns a generic reset response even if the provider reports an error", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: new Error("unknown email") });
    const response = await forgotPassword(post("/api/auth/forgot-password", { email: "news@example.com" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  test("returns a rate-limit response without calling Supabase Auth", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await login(post("/api/auth/login", { email: "news@example.com", password: "correct horse battery staple" }));
    expect(response.status).toBe(429);
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test("callback accepts a code and keeps the destination internal", async () => {
    const response = await callback(new Request("https://contributors.example/auth/callback?code=pkce-code&next=%2Fdashboard%3Ftab%3Dsecurity"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://contributors.example/dashboard?tab=security");
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("callback rejects a missing code", async () => {
    const response = await callback(new Request("https://contributors.example/auth/callback?next=https%3A%2F%2Fevil.example"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://contributors.example/login?error=invalid_callback");
    expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
