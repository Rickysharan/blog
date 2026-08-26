export const ADMIN_COOKIE_NAME = "omnilede_admin";
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export interface AdminSession {
  version: 1;
  issuedAt: number;
  expiresAt: number;
}

interface SessionOptions {
  now?: number;
}

interface CreateSessionOptions extends SessionOptions {
  ttlMs?: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value");
  }
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeText(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeText(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string, secret: string): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(value),
  );
  return new Uint8Array(signature);
}

function isAdminSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Number.isSafeInteger(candidate.issuedAt) &&
    Number.isSafeInteger(candidate.expiresAt) &&
    (candidate.issuedAt as number) < (candidate.expiresAt as number)
  );
}

export async function createSessionToken(
  secret: string,
  options: CreateSessionOptions = {},
): Promise<string> {
  if (!secret) {
    throw new Error("Session secret is required");
  }
  const issuedAt = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? ADMIN_SESSION_TTL_MS;
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("Session timing configuration is invalid");
  }

  const payload = encodeText(
    JSON.stringify({ version: 1, issuedAt, expiresAt: issuedAt + ttlMs }),
  );
  const signature = bytesToBase64Url(await sign(payload, secret));
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  options: SessionOptions = {},
): Promise<AdminSession | null> {
  try {
    if (!secret || token.length > 2_048) {
      return null;
    }
    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }
    const [payload, encodedSignature] = parts;
    if (!payload || !encodedSignature) {
      return null;
    }

    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      ownedBuffer(base64UrlToBytes(encodedSignature)),
      new TextEncoder().encode(payload),
    );
    if (!validSignature) {
      return null;
    }

    const parsed: unknown = JSON.parse(decodeText(payload));
    if (!isAdminSession(parsed)) {
      return null;
    }
    const now = options.now ?? Date.now();
    if (now < parsed.issuedAt || now > parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

export async function readAdminSession(
  request: Request,
  secret: string,
  options: SessionOptions = {},
): Promise<AdminSession | null> {
  const token = cookieValue(request.headers.get("cookie"), ADMIN_COOKIE_NAME);
  return token ? verifySessionToken(token, secret, options) : null;
}
