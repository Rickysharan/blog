export class PublicationValidationError extends Error {
  readonly code = "publication_validation_failed";

  constructor() {
    super("Publication content failed validation");
    this.name = "PublicationValidationError";
  }
}

function invalidPublication(): never {
  throw new PublicationValidationError();
}

function isAmbiguousUrlInput(value: string): boolean {
  return value !== value.trim() || /%/i.test(value) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(value);
}

function parseExactHttpsUrl(value: string): URL {
  if (isAmbiguousUrlInput(value)) return invalidPublication();

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalidPublication();
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.port !== ""
  ) {
    return invalidPublication();
  }

  return parsed;
}

/**
 * Validates the server-configured public derivative prefix without silently
 * accepting URL normalization (for example, an uppercase host or :443).
 */
export function validatePublishedImageOrigin(value: string): string {
  const parsed = parseExactHttpsUrl(value);
  if (
    parsed.href !== value ||
    parsed.pathname === "/" ||
    parsed.pathname.endsWith("/") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("/object/sign/") ||
    parsed.pathname.includes("/submission-images/")
  ) {
    return invalidPublication();
  }

  return value;
}

/**
 * Confirms a contributor image is the sole public WebP derivative for this publication.
 * The origin is injected by the server-side publication receiver; this module never reads env.
 */
export function validateContributorCoverImage(input: {
  coverImage: string;
  publicationId: string;
  publishedImageOrigin: string;
}): string {
  const originValue = validatePublishedImageOrigin(input.publishedImageOrigin);

  const candidate = parseExactHttpsUrl(input.coverImage);
  if (
    candidate.pathname.includes("/object/sign/") ||
    candidate.pathname.includes("/submission-images/")
  ) {
    return invalidPublication();
  }

  const expected = originValue + "/" + input.publicationId + ".webp";
  if (input.coverImage !== expected || candidate.href !== expected) return invalidPublication();

  return expected;
}

/**
 * Retains the existing article-library cover-image allowance. Do not use for contributor output.
 */
export function validateEditorialCoverImage(coverImage: string): string {
  if (coverImage.startsWith("/") && !coverImage.startsWith("//") && !isAmbiguousUrlInput(coverImage)) {
    return coverImage;
  }

  return parseExactHttpsUrl(coverImage).href;
}
