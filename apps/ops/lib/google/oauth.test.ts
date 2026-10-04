import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";

import {
  GOOGLE_READ_ONLY_SCOPES,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  verifyOAuthTransaction
} from "./oauth";

const config = {
  clientId: "client.apps.googleusercontent.com",
  clientSecret: "client-secret-fixture",
  redirectUri: "https://studio.example/api/connections/google/callback",
  operatorEmail: "operator@example.com"
};

describe("Google OAuth", () => {
  it("creates bounded one-time state, nonce, S256 PKCE and exact redirect/scopes", () => {
    const now = new Date("2026-10-04T10:00:00.000Z");
    const request = createAuthorizationRequest(config, now);
    const url = new URL(request.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([...GOOGLE_READ_ONLY_SCOPES].sort());
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
    expect(url.searchParams.get("state")).toBe(request.transaction.state);
    expect(url.searchParams.get("nonce")).toBe(request.transaction.nonce);
    expect(new Date(request.transaction.expiresAt).getTime() - now.getTime()).toBeLessThanOrEqual(10 * 60_000);
    expect(verifyOAuthTransaction(request.transaction, request.transaction.state, now)).toBeUndefined();
    expect(() => verifyOAuthTransaction(request.transaction, "wrong-state", now)).toThrow("OAuth response could not be verified");
    expect(() => verifyOAuthTransaction(request.transaction, request.transaction.state, new Date(now.getTime() + 11 * 60_000))).toThrow(
      "OAuth response could not be verified"
    );
  });

  it("never leaks exchanged tokens or client secrets in returned errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", refresh_token: "leaked-refresh" }), { status: 400 }));
    let thrown: Error | undefined;
    try {
      await exchangeAuthorizationCode({ code: "code-fixture", verifier: "verifier-fixture", nonce: "nonce-fixture", config, fetcher });
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toBe("Google authorization could not be completed");
    expect(JSON.stringify(thrown)).not.toContain("leaked-refresh");
    expect(JSON.stringify(thrown)).not.toContain(config.clientSecret);
  });

  it("validates the signed ID token audience, expiry, nonce and exact operator email", async () => {
    const now = new Date("2026-10-04T10:00:00.000Z");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "key-1", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: "https://accounts.google.com", aud: config.clientId, sub: "google-subject", email: config.operatorEmail,
      email_verified: true, nonce: "nonce-fixture", iat: 1791107900, exp: 1791108600
    })).toString("base64url");
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
    const idToken = `${header}.${payload}.${signature}`;
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "key-1", alg: "RS256", use: "sig" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-fixture", refresh_token: "refresh-fixture", id_token: idToken, expires_in: 3600,
        scope: GOOGLE_READ_ONLY_SCOPES.join(" ")
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));

    const result = await exchangeAuthorizationCode({ code: "code", verifier: "verifier-fixture", nonce: "nonce-fixture", config, fetcher, now });
    expect(result).toMatchObject({ email: config.operatorEmail, subject: "google-subject", refreshToken: "refresh-fixture" });
    const tokenRequest = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(String(tokenRequest.body)).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
    expect(String(tokenRequest.body)).toContain("code_verifier=verifier-fixture");

    const badNonceFetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", id_token: idToken, expires_in: 3600, scope: GOOGLE_READ_ONLY_SCOPES.join(" ") }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
    await expect(exchangeAuthorizationCode({ code: "code", verifier: "verifier", nonce: "different", config, fetcher: badNonceFetcher, now }))
      .rejects.toThrow("Google authorization could not be completed");
  });

  it("rejects returned scopes outside the explicit read-only allowlist", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access", refresh_token: "refresh", id_token: "irrelevant",
      scope: `${GOOGLE_READ_ONLY_SCOPES.join(" ")} https://www.googleapis.com/auth/analytics.edit`
    }), { status: 200 }));
    await expect(exchangeAuthorizationCode({ code: "code", verifier: "verifier", nonce: "nonce", config, fetcher }))
      .rejects.toThrow("Google authorization could not be completed");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects a matching-kid JWKS entry unless it is an RS256 signing key permitted to verify", async () => {
    const now = new Date("2026-10-04T10:00:00.000Z");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "key-unsafe" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: config.clientId, sub: "sub", email: config.operatorEmail, email_verified: true, nonce: "nonce", iat: 1791107900, exp: 1791108600 })).toString("base64url");
    const idToken = `${header}.${payload}.${sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url")}`;
    const unsafeJwk = { ...publicKey.export({ format: "jwk" }), kid: "key-unsafe", alg: "RS256", use: "enc", key_ops: ["encrypt"] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", id_token: idToken, expires_in: 3600, scope: GOOGLE_READ_ONLY_SCOPES.join(" ") }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [unsafeJwk] }), { status: 200 }));
    await expect(exchangeAuthorizationCode({ code: "code", verifier: "verifier", nonce: "nonce", config, fetcher, now }))
      .rejects.toThrow("Google authorization could not be completed");
  });
});
