import { describe, expect, test } from "vitest";

import { ImageValidationError, validateImage } from "./image";

function png(width = 640, height = 480): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width = 640, height = 480): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
}

function webp(width = 640, height = 480): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([..."RIFF"].map((value) => value.charCodeAt(0)), 0);
  bytes.set([..."WEBP"].map((value) => value.charCodeAt(0)), 8);
  bytes.set([..."VP8X"].map((value) => value.charCodeAt(0)), 12);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: number) => { bytes[offset] = value & 0xff; bytes[offset + 1] = (value >> 8) & 0xff; bytes[offset + 2] = (value >> 16) & 0xff; };
  write(24, width - 1); write(27, height - 1); view.setUint32(4, 22, true);
  return bytes;
}

describe("validateImage", () => {
  test.each([
    [png(), "image/png", "cover.png"],
    [jpeg(), "image/jpeg", "cover.jpeg"],
    [webp(), "image/webp", "cover.webp"]
  ])("accepts a real %s signature and dimensions", (bytes, mime, filename) => {
    expect(validateImage(bytes, mime, filename)).toMatchObject({ width: 640, height: 480, mimeType: mime });
  });

  test.each([
    [png(), "image/jpeg", "cover.jpg", "image.magic_invalid"],
    [png(), "image/png", "cover.jpg", "image.extension_mismatch"],
    [new Uint8Array([1, 2, 3]), "image/png", "cover.png", "image.magic_invalid"],
    [png(20, 20), "image/png", "cover.png", "image.dimensions_invalid"]
  ])("rejects an unsafe image (%s)", (bytes, mime, filename, reason) => {
    expect(() => validateImage(bytes, mime, filename)).toThrow(new ImageValidationError(reason));
  });

  test("rejects images larger than the free upload bound", () => {
    const bytes = new Uint8Array(8 * 1024 * 1024 + 1);
    expect(() => validateImage(bytes, "image/png", "cover.png")).toThrow("image.size_invalid");
  });
});
