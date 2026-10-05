import "server-only";

import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";

export const GOOGLE_READ_ONLY_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/adsense.readonly"
] as const;

const GOOGLE_SCOPE_ALIASES: Readonly<Record<string, (typeof GOOGLE_READ_ONLY_SCOPES)[number]>> = {
  "https://www.googleapis.com/auth/userinfo.email": "email"
};

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const TRANSACTION_LIFETIME_MS = 10 * 60_000;
export const GOOGLE_OAUTH_TRANSACTION_COOKIE = "__Host-omnilede-google-oauth";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  operatorEmail: string;
};

export type OAuthTransaction = {
  state: string;
  verifier: string;
  nonce: string;
  expiresAt: string;
};

export type GoogleCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string[];
  email: string;
  subject: string;
};

const opaque = (size = 32) => randomBytes(size).toString("base64url");

export function createAuthorizationRequest(config: GoogleOAuthConfig, now = new Date()) {
  const transaction: OAuthTransaction = {
    state: opaque(),
    verifier: opaque(48),
    nonce: opaque(),
    expiresAt: new Date(now.getTime() + TRANSACTION_LIFETIME_MS).toISOString()
  };
  const codeChallenge = createHash("sha256").update(transaction.verifier).digest("base64url");
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_READ_ONLY_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  }).toString();
  return { authorizationUrl: url.toString(), transaction };
}

function equalOpaque(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export function verifyOAuthTransaction(transaction: OAuthTransaction, state: string, now = new Date()): void {
  const expiry = Date.parse(transaction.expiresAt);
  if (!transaction.state || !transaction.verifier || !transaction.nonce || !state || !equalOpaque(transaction.state, state) || !Number.isFinite(expiry) || expiry < now.getTime()) {
    throw new Error("OAuth response could not be verified");
  }
}

function parseJwtPart(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid token");
  return parsed as Record<string, unknown>;
}

async function validateIdToken(
  token: string,
  config: GoogleOAuthConfig,
  nonce: string,
  fetcher: typeof fetch,
  now = new Date()
): Promise<{ email: string; subject: string }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("invalid token");
    const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];
    const header = parseJwtPart(encodedHeader);
    const claims = parseJwtPart(encodedPayload);
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("invalid token");
    const response = await fetcher(JWKS_ENDPOINT, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("invalid token");
    const body = (await response.json()) as { keys?: Array<Record<string, unknown>> };
    const jwk = body.keys?.find((candidate) =>
      candidate.kid === header.kid && candidate.kty === "RSA" && candidate.alg === "RS256" && candidate.use === "sig" &&
      (!Array.isArray(candidate.key_ops) || candidate.key_ops.includes("verify"))
    );
    if (!jwk) throw new Error("invalid token");
    const key = createPublicKey({ key: jwk as import("node:crypto").JsonWebKey, format: "jwk" });
    if (!verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), key, Buffer.from(signature, "base64url"))) {
      throw new Error("invalid token");
    }
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const issuerOkay = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
    if (!issuerOkay || claims.aud !== config.clientId || typeof claims.exp !== "number" || claims.exp <= nowSeconds ||
        typeof claims.iat !== "number" || claims.iat > nowSeconds + 60 || claims.nonce !== nonce || claims.email_verified !== true ||
        typeof claims.email !== "string" || claims.email.trim().toLowerCase() !== config.operatorEmail.trim().toLowerCase() ||
        typeof claims.sub !== "string" || !claims.sub) throw new Error("invalid token");
    return { email: claims.email.trim().toLowerCase(), subject: claims.sub };
  } catch {
    throw new Error("Google identity could not be verified");
  }
}

type ExchangeInput = {
  code: string;
  verifier: string;
  nonce: string;
  config: GoogleOAuthConfig;
  fetcher?: typeof fetch;
  now?: Date;
};

export async function exchangeAuthorizationCode(input: ExchangeInput): Promise<GoogleCredentials> {
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
        redirect_uri: input.config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: input.verifier
      }),
      cache: "no-store"
    });
    if (!response.ok) throw new Error("exchange failed");
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string" || typeof body.id_token !== "string") {
      throw new Error("exchange failed");
    }
    const returnedScopes = typeof body.scope === "string"
      ? [...new Set(body.scope.split(/\s+/).filter(Boolean).map((scope) => GOOGLE_SCOPE_ALIASES[scope] ?? scope))]
      : [];
    const allowedScopes = new Set<string>(GOOGLE_READ_ONLY_SCOPES);
    if (returnedScopes.length !== GOOGLE_READ_ONLY_SCOPES.length ||
        !returnedScopes.every((scope) => allowedScopes.has(scope)) ||
        !GOOGLE_READ_ONLY_SCOPES.every((required) => returnedScopes.includes(required))) {
      throw new Error("invalid scopes");
    }
    const identity = await validateIdToken(body.id_token, input.config, input.nonce, fetcher, input.now);
    const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : null;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: expiresIn ? new Date((input.now ?? new Date()).getTime() + expiresIn * 1000).toISOString() : null,
      scopes: returnedScopes,
      ...identity
    };
  } catch {
    throw new Error("Google authorization could not be completed");
  }
}
