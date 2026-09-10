import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import sharp from "sharp";

export const MAX_PUBLISHED_IMAGE_DIMENSION = 1_600;
export const MAX_PRIVATE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PUBLISHED_IMAGE_BYTES = 4 * 1024 * 1024;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const privatePathPattern = new RegExp(`^(${UUID})/(${UUID_V4})/(${UUID})\\.(jpe?g|png|webp)$`);
const uuidV4Pattern = new RegExp(`^${UUID_V4}$`);

export class PublicationImageError extends Error {
  override name = "PublicationImageError";
}

export interface PublicationImageStore {
  downloadPrivate(path: string): Promise<Uint8Array>;
  putPublished(
    path: string,
    bytes: Uint8Array,
    contentType: "image/webp",
  ): Promise<"created" | "existing-identical">;
}

type StorageFailure = { statusCode?: string | number; message?: string } | null;
type StoredBlob = { size: number; arrayBuffer(): Promise<ArrayBufferLike> };
type StorageBucket = {
  download(path: string): Promise<{ data: StoredBlob | null; error: StorageFailure }>;
  upload(
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; cacheControl: string; upsert: boolean },
  ): Promise<{ data: unknown; error: StorageFailure }>;
};
export type PublicationStorageGateway = {
  storage: { from(bucket: string): StorageBucket };
};

function digest(bytes: Uint8Array): Buffer {
  return createHash("sha256").update(bytes).digest();
}

function isObjectConflict(error: Exclude<StorageFailure, null>): boolean {
  return String(error.statusCode ?? "") === "409" || /already exists/i.test(error.message ?? "");
}

export function createSupabasePublicationImageStore(gateway: PublicationStorageGateway): PublicationImageStore {
  return {
    async downloadPrivate(path) {
      const { data, error } = await gateway.storage.from("submission-images").download(path);
      if (error || !data || data.size === 0 || data.size > MAX_PRIVATE_IMAGE_BYTES) {
        throw new Error("publication_image.download_failed");
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async putPublished(path, bytes, contentType) {
      if (!uuidV4Pattern.test(path.slice(0, -5)) || path !== `${path.slice(0, -5)}.webp`) {
        throw new Error("publication_image.output_path_invalid");
      }
      const bucket = gateway.storage.from("published-images");
      const uploaded = await bucket.upload(path, bytes, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (!uploaded.error) return "created";
      if (!isObjectConflict(uploaded.error)) throw new Error("publication_image.upload_failed");

      const existing = await bucket.download(path);
      if (existing.error || !existing.data || existing.data.size !== bytes.byteLength) {
        throw new Error("publication_image.object_conflict");
      }
      const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
      if (!timingSafeEqual(digest(existingBytes), digest(bytes))) {
        throw new Error("publication_image.object_conflict");
      }
      return "existing-identical";
    },
  };
}

export async function preparePublicationImage(input: {
  authorId: string;
  submissionId: string;
  publicationId: string;
  privateImagePath: string;
  store: PublicationImageStore;
}): Promise<{
  objectPath: string;
  contentType: "image/webp";
  width: number;
  height: number;
  byteLength: number;
  reused: boolean;
}> {
  const match = privatePathPattern.exec(input.privateImagePath);
  if (
    !match ||
    match[1] !== input.authorId ||
    match[2] !== input.submissionId ||
    !uuidV4Pattern.test(input.publicationId)
  ) {
    throw new PublicationImageError("publication_image.path_invalid");
  }

  let source: Uint8Array;
  try {
    source = await input.store.downloadPrivate(input.privateImagePath);
  } catch {
    throw new PublicationImageError("publication_image.download_failed");
  }
  if (source.byteLength === 0 || source.byteLength > MAX_PRIVATE_IMAGE_BYTES) {
    throw new PublicationImageError("publication_image.size_invalid");
  }

  let derivative: Uint8Array;
  let width: number;
  let height: number;
  try {
    const decoder = sharp(source, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
      sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    const expectedFormat = match[4] === "jpg" || match[4] === "jpeg" ? "jpeg" : match[4];
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 8_000 ||
      metadata.height > 8_000 ||
      metadata.width * metadata.height > 40_000_000
    ) {
      throw new Error("unsafe_dimensions");
    }
    const encoded = await decoder
      .rotate()
      .resize({
        width: MAX_PUBLISHED_IMAGE_DIMENSION,
        height: MAX_PUBLISHED_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    derivative = new Uint8Array(encoded.data);
    width = encoded.info.width;
    height = encoded.info.height;
  } catch {
    throw new PublicationImageError("publication_image.decode_failed");
  }
  if (
    derivative.byteLength === 0 ||
    derivative.byteLength > MAX_PUBLISHED_IMAGE_BYTES ||
    width > MAX_PUBLISHED_IMAGE_DIMENSION ||
    height > MAX_PUBLISHED_IMAGE_DIMENSION
  ) {
    throw new PublicationImageError("publication_image.output_invalid");
  }

  const objectPath = `${input.publicationId}.webp`;
  let stored: "created" | "existing-identical";
  try {
    stored = await input.store.putPublished(objectPath, derivative, "image/webp");
  } catch (error) {
    if (error instanceof Error && error.message === "publication_image.object_conflict") {
      throw new PublicationImageError("publication_image.object_conflict");
    }
    throw new PublicationImageError("publication_image.upload_failed");
  }
  return {
    objectPath,
    contentType: "image/webp",
    width,
    height,
    byteLength: derivative.byteLength,
    reused: stored === "existing-identical",
  };
}
