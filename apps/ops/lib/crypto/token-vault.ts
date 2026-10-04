import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type SealedToken = {
  version: 1;
  ciphertext: string;
  iv: string;
  authenticationTag: string;
};

function decodeKey(key: string | Uint8Array): Buffer {
  const decoded = typeof key === "string" ? Buffer.from(key, "base64") : Buffer.from(key);
  if (decoded.byteLength !== 32) throw new Error("Token encryption key must be exactly 32 bytes");
  return decoded;
}

function decodePart(value: string, expectedLength?: number): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (!value || decoded.toString("base64") !== value || (expectedLength !== undefined && decoded.byteLength !== expectedLength)) {
    throw new Error("Unable to open protected credential");
  }
  return decoded;
}

export function sealToken(plaintext: string, key: string | Uint8Array): SealedToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: 1,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64")
  };
}

export function openToken(sealed: SealedToken, key: string | Uint8Array): string {
  const decodedKey = decodeKey(key);
  try {
    if (sealed.version !== 1) throw new Error("unsupported version");
    const decipher = createDecipheriv("aes-256-gcm", decodedKey, decodePart(sealed.iv, 12));
    decipher.setAuthTag(decodePart(sealed.authenticationTag, 16));
    return Buffer.concat([decipher.update(decodePart(sealed.ciphertext)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Unable to open protected credential");
  }
}
