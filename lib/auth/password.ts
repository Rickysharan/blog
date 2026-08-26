import { createHash, timingSafeEqual } from "node:crypto";

function passwordDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyPassword(candidate: string, expected: string): boolean {
  return timingSafeEqual(passwordDigest(candidate), passwordDigest(expected));
}
