import { createHmac, timingSafeEqual } from "node:crypto";

export const HMAC_CLOCK_SKEW_SECONDS = 300;

export function signPayload(secret: string, timestamp: number, nonce: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

export function verifyPayload(secret: string, signature: string | null, timestampValue: string | null, nonce: string | null, body: string, now = Date.now()): boolean {
  if (!secret || !signature || !timestampValue || !nonce || !/^[-_a-zA-Z0-9]{16,128}$/.test(nonce) || body.length > 512 * 1024) return false;
  const timestamp = Number(timestampValue);
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > HMAC_CLOCK_SKEW_SECONDS) return false;
  const expected = signPayload(secret, timestamp, nonce, body);
  const actual = signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
