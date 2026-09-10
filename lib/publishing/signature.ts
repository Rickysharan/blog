import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { canonicalJson } from "@omnilede/contracts";

export const PUBLICATION_AUDIENCE = "omnilede-blog-publish-v1";
export const PUBLICATION_SIGNATURE_MAX_AGE_SECONDS = 300;

type SignatureHeaders = {
  timestamp: string;
  nonce: string;
  audience: string;
  signature: string;
};

type SigningInput = Omit<SignatureHeaders, "signature"> & {
  secret: string;
  body: unknown;
};

type VerificationResult =
  | { valid: true }
  | { valid: false; error: { code: "invalid_signature"; message: "Invalid publication signature" } };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (): VerificationResult => ({
  valid: false,
  error: { code: "invalid_signature", message: "Invalid publication signature" },
});

function signingBytes({ timestamp, nonce, audience, body }: Omit<SigningInput, "secret">): string {
  return `${timestamp}.${nonce}.${audience}.${canonicalJson(body as Record<string, unknown>)}`;
}

function hmacHex(secret: string, signed: string): string {
  return createHmac("sha256", secret).update(signed, "utf8").digest("hex");
}

/** Creates the exact `v1=<lowercase hex HMAC-SHA256>` header value. */
export function signPublicationPayload(input: SigningInput): string {
  if (input.secret.length === 0) {
    throw new Error("Publication signing secret is required");
  }
  return `v1=${hmacHex(input.secret, signingBytes(input))}`;
}

function validTimestamp(timestamp: string, now: number, maxAgeSeconds: number): boolean {
  if (!/^\d{1,10}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds)) return false;
  return Math.abs(now - seconds * 1000) <= maxAgeSeconds * 1000;
}

/**
 * Verifies a publication wire signature without returning secret, body, or supplied-signature data.
 */
export function verifyPublicationSignature(input: {
  secret: string;
  body: unknown;
  headers: SignatureHeaders;
  now?: number;
}): VerificationResult {
  const now = input.now ?? Date.now();
  const { timestamp, nonce, audience, signature } = input.headers;

  if (
    input.secret.length === 0 ||
    !Number.isFinite(now) ||
    audience !== PUBLICATION_AUDIENCE ||
    !uuidPattern.test(nonce) ||
    !validTimestamp(timestamp, now, PUBLICATION_SIGNATURE_MAX_AGE_SECONDS) ||
    !/^v1=[0-9a-f]+$/.test(signature)
  ) {
    return failure();
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(hmacHex(input.secret, signingBytes({ timestamp, nonce, audience, body: input.body })), "hex");
  } catch {
    return failure();
  }

  const supplied = Buffer.from(signature.slice(3), "hex");
  const sameLength = supplied.length === expected.length;
  const comparable = sameLength ? supplied : Buffer.alloc(expected.length);
  const matches = timingSafeEqual(expected, comparable);

  return sameLength && matches ? { valid: true } : failure();
}
