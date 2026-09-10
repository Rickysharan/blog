import { describe, expect, test } from "vitest";

import {
  PublicationValidationError,
  validateContributorCoverImage,
  validateEditorialCoverImage,
  validatePublishedImageOrigin,
} from "./validate-image";

const publishedImageOrigin = "https://project-id.supabase.co/storage/v1/object/public/published-images";
const publicationId = "10000000-0000-4000-8000-000000000001";
const approvedImage = publishedImageOrigin + "/" + publicationId + ".webp";

describe("contributor cover-image validation", () => {
  test("accepts exactly the configured public derivative URL", () => {
    expect(validateContributorCoverImage({ coverImage: approvedImage, publicationId, publishedImageOrigin })).toBe(
      approvedImage,
    );
  });

  test.each([
    ["private signed bucket", "https://project-id.supabase.co/storage/v1/object/sign/submission-images/owner/image.webp"],
    ["private bucket path", "https://project-id.supabase.co/storage/v1/object/public/submission-images/image.webp"],
    ["query token", approvedImage + "?token=secret"],
    ["fragment token", approvedImage + "#token"],
    ["foreign host", "https://attacker.example/storage/v1/object/public/published-images/" + publicationId + ".webp"],
    ["alternate port", "https://project-id.supabase.co:8443/storage/v1/object/public/published-images/" + publicationId + ".webp"],
    ["explicit default port", "https://project-id.supabase.co:443/storage/v1/object/public/published-images/" + publicationId + ".webp"],
    ["alternate path", publishedImageOrigin + "/other/" + publicationId + ".webp"],
    ["publication ID mismatch", publishedImageOrigin + "/10000000-0000-4000-8000-000000000002.webp"],
    ["extra suffix", approvedImage + ".bak"],
    ["encoded path ambiguity", "https://project-id.supabase.co/storage/v1/object/public/published-images/%2e%2e/" + publicationId + ".webp"],
    ["credentials", "https://user:pass@project-id.supabase.co/storage/v1/object/public/published-images/" + publicationId + ".webp"],
  ])("rejects a %s", (_label, coverImage) => {
    expect(() => validateContributorCoverImage({ coverImage, publicationId, publishedImageOrigin })).toThrow(
      PublicationValidationError,
    );
  });

  test.each([
    "https://PROJECT-ID.supabase.co/storage/v1/object/public/published-images",
    "https://project-id.supabase.co:443/storage/v1/object/public/published-images",
    "http://project-id.supabase.co/storage/v1/object/public/published-images",
    publishedImageOrigin + "/",
    publishedImageOrigin + "?token=secret",
    "https://user:pass@project-id.supabase.co/storage/v1/object/public/published-images",
    "https://project-id.supabase.co/storage/v1/object/public/%2e%2e/published-images",
    "https://project-id.supabase.co/storage/v1/object/public/published-images/../published-images",
  ])("rejects an ambiguous or unsafe configured origin", (origin) => {
    const exactCandidate = origin + "/" + publicationId + ".webp";
    expect(() => validateContributorCoverImage({ coverImage: exactCandidate, publicationId, publishedImageOrigin: origin })).toThrow(
      PublicationValidationError,
    );
  });

  test.each([
    "https://PROJECT-ID.supabase.co/storage/v1/object/public/published-images",
    "https://project-id.supabase.co:443/storage/v1/object/public/published-images",
  ])("rejects non-canonical origin configuration before rendering", (origin) => {
    expect(() => validatePublishedImageOrigin(origin)).toThrow(PublicationValidationError);
  });

  test("accepts a canonical origin with its exact canonical derivative", () => {
    expect(
      validateContributorCoverImage({
        coverImage: approvedImage,
        publicationId,
        publishedImageOrigin,
      }),
    ).toBe(approvedImage);
  });

  test("keeps legacy local editorial image compatibility separate from contributor publication", () => {
    expect(validateEditorialCoverImage("/images/articles/politics.svg")).toBe("/images/articles/politics.svg");
    expect(validateEditorialCoverImage("https://cdn.example/article.webp")).toBe("https://cdn.example/article.webp");
    expect(() => validateEditorialCoverImage("//cdn.example/article.webp")).toThrow(PublicationValidationError);
    expect(() => validateEditorialCoverImage("http://cdn.example/article.webp")).toThrow(PublicationValidationError);
  });
});
