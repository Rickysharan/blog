import { describe, expect, test } from "vitest";

import { runImageSafetyGate } from "./image";

const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
new DataView(png.buffer).setUint32(16, 640); new DataView(png.buffer).setUint32(20, 480);

describe("image review gate", () => {
  test("passes validated images and fails closed for corrupt input", () => {
    expect(runImageSafetyGate(png, "image/png", "cover.png").outcome).toBe("pass");
    expect(runImageSafetyGate(new Uint8Array([1]), "image/png", "cover.png").outcome).toBe("manual_review");
  });
});
