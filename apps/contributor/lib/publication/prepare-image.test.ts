import { describe, expect, test, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";

import {
  MAX_PUBLISHED_IMAGE_DIMENSION,
  PublicationImageError,
  createSupabasePublicationImageStore,
  preparePublicationImage,
  type PublicationImageStore,
} from "./prepare-image";

const authorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const submissionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const objectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const publicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const privateImagePath = `${authorId}/${submissionId}/${objectId}.webp`;

async function sourceImage(): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  return sharp({
    create: { width: 2400, height: 1800, channels: 3, background: { r: 20, g: 90, b: 160 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Artist: "private author metadata" },
      },
    })
    .webp({ quality: 90 })
    .toBuffer();
}

async function sourceImageAs(format: "jpeg" | "png"): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const image = sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 20, g: 90, b: 160 } },
  });
  return format === "jpeg" ? image.jpeg().toBuffer() : image.png().toBuffer();
}

function store(source: Uint8Array): PublicationImageStore & { uploaded?: Uint8Array } {
  const result: PublicationImageStore & { uploaded?: Uint8Array } = {
    uploaded: undefined,
    downloadPrivate: vi.fn(async () => source),
    putPublished: vi.fn(async (_path, bytes) => {
      result.uploaded = bytes;
      return "created" as const;
    }),
  };
  return result;
}

describe("preparePublicationImage", () => {
  test("downloads only the bound private original and writes a metadata-free bounded WebP derivative", async () => {
    const { default: sharp } = await import("sharp");
    const imageStore = store(await sourceImage());

    const result = await preparePublicationImage({
      authorId,
      submissionId,
      publicationId,
      privateImagePath,
      store: imageStore,
    });

    expect(imageStore.downloadPrivate).toHaveBeenCalledWith(privateImagePath);
    expect(imageStore.putPublished).toHaveBeenCalledWith(
      `${publicationId}.webp`,
      expect.any(Uint8Array),
      "image/webp",
    );
    expect(result).toMatchObject({
      objectPath: `${publicationId}.webp`,
      contentType: "image/webp",
    });
    const metadata = await sharp(imageStore.uploaded).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeLessThanOrEqual(MAX_PUBLISHED_IMAGE_DIMENSION);
    expect(metadata.height).toBeLessThanOrEqual(MAX_PUBLISHED_IMAGE_DIMENSION);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  test.each([
    ["jpeg", "jpg"],
    ["png", "png"],
  ] as const)("accepts an uploaded %s original and publishes only its WebP derivative", async (format, extension) => {
    const imageStore = store(await sourceImageAs(format));
    const sourcePath = `${authorId}/${submissionId}/${objectId}.${extension}`;

    const result = await preparePublicationImage({
      authorId,
      submissionId,
      publicationId,
      privateImagePath: sourcePath,
      store: imageStore,
    });

    expect(imageStore.downloadPrivate).toHaveBeenCalledWith(sourcePath);
    expect(result.objectPath).toBe(`${publicationId}.webp`);
    expect(imageStore.putPublished).toHaveBeenCalledOnce();
  });

  test("accepts canonical owner and object UUID versions allowed by the private storage contract", async () => {
    const versionSevenAuthorId = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa1";
    const versionOneObjectId = "aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaa3";
    const imageStore = store(await sourceImage());
    const sourcePath = `${versionSevenAuthorId}/${submissionId}/${versionOneObjectId}.webp`;

    await expect(
      preparePublicationImage({
        authorId: versionSevenAuthorId,
        submissionId,
        publicationId,
        privateImagePath: sourcePath,
        store: imageStore,
      }),
    ).resolves.toMatchObject({ objectPath: `${publicationId}.webp` });
  });

  test("rejects foreign, malformed, and unsupported source paths before reading storage", async () => {
    const imageStore = store(await sourceImage());
    const paths = [
      `10000000-0000-4000-8000-000000000099/${submissionId}/${objectId}.webp`,
      `${authorId}/10000000-0000-4000-8000-000000000099/${objectId}.webp`,
      `${authorId}/${submissionId}/${objectId}.gif`,
      `${authorId}/${submissionId}/../../private.webp`,
      `${authorId.toUpperCase()}/${submissionId}/${objectId}.webp`,
    ];

    for (const path of paths) {
      await expect(
        preparePublicationImage({ authorId, submissionId, publicationId, privateImagePath: path, store: imageStore }),
      ).rejects.toThrow(new PublicationImageError("publication_image.path_invalid"));
    }
    expect(imageStore.downloadPrivate).not.toHaveBeenCalled();
    expect(imageStore.putPublished).not.toHaveBeenCalled();
  });

  test("rejects a supported-looking path whose decoded format is not an allowed uploaded raster", async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="red"/></svg>',
    );
    const imageStore = store(svg);

    await expect(
      preparePublicationImage({
        authorId,
        submissionId,
        publicationId,
        privateImagePath: `${authorId}/${submissionId}/${objectId}.png`,
        store: imageStore,
      }),
    ).rejects.toThrow(new PublicationImageError("publication_image.decode_failed"));
    expect(imageStore.putPublished).not.toHaveBeenCalled();
  });

  test("rejects corrupt image bytes without publishing them", async () => {
    const imageStore = store(new Uint8Array([1, 2, 3, 4]));

    await expect(
      preparePublicationImage({ authorId, submissionId, publicationId, privateImagePath, store: imageStore }),
    ).rejects.toThrow(new PublicationImageError("publication_image.decode_failed"));
    expect(imageStore.putPublished).not.toHaveBeenCalled();
  });

  test("uses the same immutable publication object on retry", async () => {
    const source = await sourceImage();
    const stored = new Map<string, Uint8Array>();
    const imageStore: PublicationImageStore = {
      downloadPrivate: async () => source,
      putPublished: async (path, bytes) => {
        const previous = stored.get(path);
        if (previous) {
          expect(Buffer.from(bytes).equals(Buffer.from(previous))).toBe(true);
          return "existing-identical";
        }
        stored.set(path, bytes);
        return "created";
      },
    };

    const first = await preparePublicationImage({ authorId, submissionId, publicationId, privateImagePath, store: imageStore });
    const second = await preparePublicationImage({ authorId, submissionId, publicationId, privateImagePath, store: imageStore });

    expect(first.objectPath).toBe(`${publicationId}.webp`);
    expect(second).toEqual({ ...first, reused: true });
    expect([...stored.keys()]).toEqual([`${publicationId}.webp`]);
  });

  test("the Supabase adapter keeps the original private and accepts only an identical existing derivative", async () => {
    const published = new Uint8Array([8, 9, 10]);
    const from = vi.fn((bucket: string) => ({
      download: vi.fn(async (path: string) => {
        if (bucket === "submission-images") return { data: new NodeBlob([new Uint8Array([1, 2, 3])]), error: null };
        expect(path).toBe(`${publicationId}.webp`);
        return { data: new NodeBlob([published]), error: null };
      }),
      upload: vi.fn(async () => ({ data: null, error: { statusCode: "409", message: "Asset Already Exists" } })),
    }));
    const adapter = createSupabasePublicationImageStore({ storage: { from } });

    await expect(adapter.downloadPrivate(privateImagePath)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(adapter.putPublished(`${publicationId}.webp`, published, "image/webp")).resolves.toBe(
      "existing-identical",
    );
    expect(from).toHaveBeenCalledWith("submission-images");
    expect(from).toHaveBeenCalledWith("published-images");
  });
});
