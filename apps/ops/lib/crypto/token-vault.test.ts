import { describe, expect, it } from "vitest";

import { openToken, sealToken } from "./token-vault";

const key = Buffer.alloc(32, 7).toString("base64");

describe("token vault", () => {
  it("round-trips with AES-256-GCM and a random 96-bit IV", () => {
    const first = sealToken("refresh-fixture", key);
    const second = sealToken("refresh-fixture", key);

    expect(first).not.toEqual(second);
    expect(Buffer.from(first.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(first.authenticationTag, "base64")).toHaveLength(16);
    expect(openToken(first, key)).toBe("refresh-fixture");
  });

  it("rejects tampering and keys that are not exactly 256 bits", () => {
    const sealed = sealToken("refresh-fixture", key);
    const ciphertext = Buffer.from(sealed.ciphertext, "base64");
    ciphertext[0] ^= 1;

    expect(() => openToken({ ...sealed, ciphertext: ciphertext.toString("base64") }, key)).toThrow(
      "Unable to open protected credential"
    );
    expect(() => sealToken("x", Buffer.alloc(31).toString("base64"))).toThrow("32 bytes");
    expect(() => openToken(sealed, Buffer.alloc(32, 8).toString("base64"))).toThrow(
      "Unable to open protected credential"
    );
  });
});
