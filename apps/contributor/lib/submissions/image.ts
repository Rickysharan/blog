export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MIN_IMAGE_DIMENSION = 320;
export const MAX_IMAGE_DIMENSION = 8000;

export type ValidatedImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
};

export class ImageValidationError extends Error {
  override name = "ImageValidationError";
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function uintLE(data: DataView, offset: number, length: number): number {
  let value = 0;
  for (let index = 0; index < length; index += 1) value += data.getUint8(offset + index) * 2 ** (8 * index);
  return value;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const data = view(bytes);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    const segmentLength = data.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && segmentLength >= 7) return { height: data.getUint16(offset + 3), width: data.getUint16(offset + 5) };
    offset += segmentLength;
  }
  return null;
}

function dimensions(bytes: Uint8Array, mimeType: ValidatedImage["mimeType"]): { width: number; height: number } | null {
  if (mimeType === "image/jpeg") return jpegDimensions(bytes);
  if (mimeType === "image/png" && bytes.length >= 24) {
    const data = view(bytes);
    return { width: data.getUint32(16), height: data.getUint32(20) };
  }
  if (mimeType === "image/webp" && bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    const data = view(bytes);
    if (chunk === "VP8X") return { width: 1 + uintLE(data, 24, 3), height: 1 + uintLE(data, 27, 3) };
    if (chunk === "VP8 ") {
      const start = 20;
      if (bytes.length >= start + 10) return { width: data.getUint16(start + 6, true) & 0x3fff, height: data.getUint16(start + 8, true) & 0x3fff };
    }
  }
  return null;
}

function hasMagic(bytes: Uint8Array, mimeType: ValidatedImage["mimeType"]): boolean {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export function validateImage(bytes: Uint8Array, declaredMime: string, filename: string): ValidatedImage {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new ImageValidationError("image.size_invalid");
  const mimeType = declaredMime as ValidatedImage["mimeType"];
  if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(mimeType)) throw new ImageValidationError("image.mime_invalid");
  if (!hasMagic(bytes, mimeType)) throw new ImageValidationError("image.magic_invalid");
  const extension = filename.toLowerCase().split(".").pop();
  const expected = mimeType === "image/jpeg" ? ["jpg", "jpeg"] : [mimeType.slice(6)];
  if (!extension || !expected.includes(extension)) throw new ImageValidationError("image.extension_mismatch");
  const size = dimensions(bytes, mimeType);
  if (!size || size.width < MIN_IMAGE_DIMENSION || size.height < MIN_IMAGE_DIMENSION || size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION || size.width * size.height > 40_000_000) {
    throw new ImageValidationError("image.dimensions_invalid");
  }
  return { mimeType, extension: extension === "jpeg" ? "jpg" : extension as ValidatedImage["extension"], ...size };
}
