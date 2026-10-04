import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../../../../../lib/auth/authorization";

const d = vi.hoisted(() => ({
  auth: vi.fn(), cookies: { get: vi.fn(), delete: vi.fn() }, open: vi.fn(), verify: vi.fn(), exchange: vi.fn(), persist: vi.fn(), config: vi.fn()
}));
vi.mock("../../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("next/headers", () => ({ cookies: async () => d.cookies }));
vi.mock("../../../../../lib/crypto/token-vault", () => ({ openToken: d.open }));
vi.mock("../../../../../lib/google/oauth", () => ({ GOOGLE_OAUTH_TRANSACTION_COOKIE: "__Host-omnilede-google-oauth", verifyOAuthTransaction: d.verify, exchangeAuthorizationCode: d.exchange }));
vi.mock("../../../../../lib/google/connections", () => ({ persistGoogleCredentials: d.persist }));
vi.mock("../../../../../lib/env", () => ({ parseGoogleOAuthEnv: d.config }));

import { GET } from "./route";

const transaction = { state: "state-fixture", verifier: "verifier-fixture", nonce: "nonce-fixture", expiresAt: "2026-10-04T10:10:00.000Z" };
const request = (state = "state-fixture") => new Request(`https://studio.example/api/connections/google/callback?code=code-fixture&state=${state}`);

beforeEach(() => {
  vi.resetAllMocks();
  d.auth.mockResolvedValue({ email: "operator@example.com" });
  d.cookies.get.mockReturnValue({ value: JSON.stringify({ version: 1, ciphertext: "YQ==", iv: "YQ==", authenticationTag: "YQ==" }) });
  d.open.mockReturnValue(JSON.stringify(transaction));
  d.config.mockReturnValue({ clientId: "client", clientSecret: "secret", redirectUri: "https://studio.example/api/connections/google/callback", encryptionKey: "key", operatorEmail: "operator@example.com", studioOrigin: "https://studio.example" });
  d.exchange.mockResolvedValue({ refreshToken: "refresh-fixture", accessToken: "access-fixture", expiresAt: "2026-10-04T11:00:00.000Z", scopes: ["openid"], email: "operator@example.com", subject: "sub" });
});

describe("Google OAuth callback", () => {
  it("consumes the one-time transaction before exchange and stores credentials server-side", async () => {
    const response = await GET(request());
    expect(d.cookies.delete).toHaveBeenCalledBefore(d.exchange);
    expect(d.verify).toHaveBeenCalledWith(transaction, "state-fixture");
    expect(d.persist).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://studio.example/settings/connections?connected=1");
    expect(await response.text()).not.toContain("refresh-fixture");
  });

  it("rejects a valid state when Google returns a different operator email", async () => {
    d.exchange.mockResolvedValue({ refreshToken: "refresh-fixture", accessToken: "access-fixture", expiresAt: null, scopes: ["openid"], email: "attacker@example.com", subject: "sub" });
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://studio.example/settings/connections?error=identity");
    expect(d.persist).not.toHaveBeenCalled();
    expect(d.cookies.delete).toHaveBeenCalledOnce();
  });

  it("rejects replay when the transaction cookie is absent", async () => {
    d.cookies.get.mockReturnValue(undefined);
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://studio.example/settings/connections?error=verification");
    expect(d.exchange).not.toHaveBeenCalled();
  });

  it("authorizes the exact Studio operator before touching OAuth or storage", async () => {
    d.auth.mockRejectedValue(new AuthorizationError("denied"));
    const response = await GET(request());
    expect(response.headers.get("location")).toContain("error=verification");
    expect(d.cookies.get).not.toHaveBeenCalled();
    expect(d.exchange).not.toHaveBeenCalled();
    expect(d.persist).not.toHaveBeenCalled();
  });

  it("uses only the configured Studio origin or inert fallback for error redirects", async () => {
    d.auth.mockRejectedValue(new Error("denied"));
    const poisoned = new Request("https://poisoned.example/api/connections/google/callback?code=x&state=y", { headers: { "x-forwarded-host": "evil.example" } });
    expect((await GET(poisoned)).headers.get("location")).toBe("https://studio.example/settings/connections?error=verification");
    d.config.mockImplementation(() => { throw new Error("invalid env"); });
    expect((await GET(poisoned)).headers.get("location")).toBe("https://invalid.local/settings/connections?error=verification");
  });
});
