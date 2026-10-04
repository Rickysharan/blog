import { beforeEach, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ auth: vi.fn(), set: vi.fn(), config: vi.fn(), create: vi.fn(), seal: vi.fn() }));
vi.mock("../../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: d.set }) }));
vi.mock("../../../../../lib/env", () => ({ parseGoogleOAuthEnv: d.config }));
vi.mock("../../../../../lib/google/oauth", () => ({
  GOOGLE_OAUTH_TRANSACTION_COOKIE: "__Host-omnilede-google-oauth",
  createAuthorizationRequest: d.create
}));
vi.mock("../../../../../lib/crypto/token-vault", () => ({ sealToken: d.seal }));

import { POST } from "./route";

const request = (origin = "https://studio.example") => new Request("https://studio.example/api/connections/google/start", { method: "POST", headers: { origin } });

beforeEach(() => {
  vi.resetAllMocks();
  d.auth.mockResolvedValue({ email: "operator@example.com" });
  d.config.mockReturnValue({ encryptionKey: "server-key" });
  d.create.mockReturnValue({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=safe", transaction: { state: "safe" } });
  d.seal.mockReturnValue({ version: 1, ciphertext: "sealed", iv: "iv", authenticationTag: "tag" });
});

it("requires same-origin operator intent before creating an OAuth transaction", async () => {
  const response = await POST(request("https://evil.example"));
  expect(response.headers.get("location")).toBe("https://studio.example/settings/connections?error=start");
  expect(d.create).not.toHaveBeenCalled();
  expect(d.set).not.toHaveBeenCalled();
});

it("sets a short-lived secure one-time cookie and redirects with POST-to-GET", async () => {
  const response = await POST(request());
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("https://accounts.google.com/");
  expect(d.set).toHaveBeenCalledWith("__Host-omnilede-google-oauth", expect.any(String), expect.objectContaining({
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600
  }));
});
