import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseArticleFile } from "@/lib/content/schema";
import { GitHubArticleRepository, ArticleRepositoryError, type ArticleRepository } from "./article-repository";
import { claimPublicationNonce, type PublicationNonceClaim } from "./nonce-store";
import { renderPublicationMdx, PublicationValidationError } from "./render-mdx";
import { PUBLICATION_AUDIENCE, verifyPublicationSignature } from "./signature";
import { validatePublishedImageOrigin } from "./validate-image";
import { publicationPayloadSchema, type PublicationPayload } from "@omnilede/contracts";
import { z } from "zod";

export const PUBLICATION_BODY_LIMIT_BYTES = 300 * 1024;
export const PUBLICATION_NONCE_WINDOW_MS = 5 * 60 * 1000;

const canonicalOriginSchema = z.string().refine((value) => {
  if (value !== value.trim()) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.origin === value &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.pathname === "/"
    );
  } catch {
    return false;
  }
}, "Expected a canonical HTTPS origin");

const siteOriginSchema = z.union([canonicalOriginSchema, z.literal("http://localhost:3000")]);

const publicationEnvironmentSchema = z.object({
  CONTRIBUTOR_PUBLISH_HMAC_SECRET: z.string().min(32),
  GITHUB_PUBLISH_TOKEN: z.string().min(1),
  GITHUB_REPOSITORY: z.string().min(1),
  GITHUB_BRANCH: z.string().min(1),
  PUBLISHED_IMAGE_ORIGIN: z.string().refine((value) => {
    try {
      validatePublishedImageOrigin(value);
      return true;
    } catch {
      return false;
    }
  }, "Expected a canonical published-image HTTPS prefix"),
  CONTRIBUTOR_APP_ORIGIN: canonicalOriginSchema,
  NEXT_PUBLIC_SITE_URL: siteOriginSchema,
  SUPABASE_URL: z.string().url().refine((value) => new URL(value).protocol === "https:", "Expected an HTTPS Supabase URL"),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_")
});

type Environment = Record<string, string | undefined>;
export type PublicationEnvironment = z.infer<typeof publicationEnvironmentSchema>;

export function parsePublicationEnvironment(environment: Environment = process.env): PublicationEnvironment {
  return publicationEnvironmentSchema.parse(environment);
}

export interface PublicationNonceStore {
  claim(input: {
    nonce: string;
    audience: string;
    publicationId: string;
    body: unknown;
    receivedAt: Date;
    expiresAt: Date;
  }): Promise<PublicationNonceClaim>;
}

export interface PublicationServiceDependencies {
  publishedImageOrigin: string;
  siteOrigin: string;
  nonceStore: PublicationNonceStore;
  articleRepository: ArticleRepository;
  renderer?: typeof renderPublicationMdx;
  renderPublicationMdx?: typeof renderPublicationMdx;
}

export class PublicationServiceError extends Error {
  constructor(
    public readonly code: "invalid_publication" | "nonce_conflict" | "service_unavailable" | "repository_conflict",
    message: string,
  ) {
    super(message);
    this.name = "PublicationServiceError";
  }
}

function invalidPublication(): never {
  throw new PublicationServiceError("invalid_publication", "Publication content is invalid");
}

function serviceUnavailable(): never {
  throw new PublicationServiceError("service_unavailable", "Publication service is unavailable");
}

function canonicalArticlePath(publication: Pick<PublicationPayload, "category" | "slug">): string {
  return `content/articles/${publication.category}/${publication.slug}.mdx`;
}

function buildDependencies(environment: PublicationEnvironment): PublicationServiceDependencies {
  const supabase = createSupabaseAdminClient({
    SUPABASE_URL: environment.SUPABASE_URL,
    SUPABASE_SECRET_KEY: environment.SUPABASE_SECRET_KEY,
  });
  return {
    publishedImageOrigin: environment.PUBLISHED_IMAGE_ORIGIN,
    siteOrigin: environment.NEXT_PUBLIC_SITE_URL,
    nonceStore: {
      claim: (input) => claimPublicationNonce(supabase, input),
    },
    articleRepository: new GitHubArticleRepository({
      repository: environment.GITHUB_REPOSITORY,
      branch: environment.GITHUB_BRANCH,
      token: environment.GITHUB_PUBLISH_TOKEN,
    }),
  };
}

export async function publishPublication(input: {
  publication: unknown;
  nonce: string;
  dependencies: PublicationServiceDependencies;
  now?: Date;
}): Promise<{
  publicationId: string;
  commitSha: string;
  commitUrl: string;
  articlePath: string;
  articleUrl: string;
  replayed: boolean;
}> {
  const parsed = publicationPayloadSchema.safeParse(input.publication);
  if (!parsed.success) invalidPublication();
  const publication = parsed.data;

  let mdx: string;
  try {
    mdx = (input.dependencies.renderer ?? input.dependencies.renderPublicationMdx ?? renderPublicationMdx)({
      publication,
      publishedImageOrigin: input.dependencies.publishedImageOrigin,
    });
  } catch (error) {
    if (error instanceof PublicationValidationError) invalidPublication();
    serviceUnavailable();
  }

  try {
    const parsedArticle = parseArticleFile(mdx, `${publication.slug}.mdx`);
    if (
      parsedArticle.slug !== publication.slug ||
      parsedArticle.category !== publication.category ||
      parsedArticle.publicationId !== publication.publicationId
    ) {
      invalidPublication();
    }
  } catch {
    invalidPublication();
  }

  const receivedAt = input.now ?? new Date();
  if (!Number.isFinite(receivedAt.getTime())) serviceUnavailable();
  const expiresAt = new Date(receivedAt.getTime() + PUBLICATION_NONCE_WINDOW_MS);
  let claim: PublicationNonceClaim;
  try {
    claim = await input.dependencies.nonceStore.claim({
      nonce: input.nonce,
      audience: PUBLICATION_AUDIENCE,
      publicationId: publication.publicationId,
      body: publication,
      receivedAt,
      expiresAt,
    });
  } catch {
    serviceUnavailable();
  }
  if (claim.status === "conflict") {
    throw new PublicationServiceError("nonce_conflict", "Publication nonce conflicts with another request");
  }
  if (claim.status === "unavailable") serviceUnavailable();

  let result: Awaited<ReturnType<ArticleRepository["publish"]>>;
  try {
    result = await input.dependencies.articleRepository.publish({
      category: publication.category,
      slug: publication.slug,
      publicationId: publication.publicationId,
      mdx,
    });
  } catch (error) {
    if (error instanceof ArticleRepositoryError && error.code === "conflict") {
      throw new PublicationServiceError("repository_conflict", "Publication conflicts with an existing article");
    }
    serviceUnavailable();
  }

  const expectedPath = canonicalArticlePath(publication);
  let commitUrlIsSafe = false;
  if (typeof result.commitUrl === "string") {
    try {
      const commitUrl = new URL(result.commitUrl);
      commitUrlIsSafe =
        commitUrl.protocol === "https:" &&
        commitUrl.username === "" &&
        commitUrl.password === "" &&
        commitUrl.search === "" &&
        commitUrl.hash === "";
    } catch {
      commitUrlIsSafe = false;
    }
  }
  if (
    typeof result.commitSha !== "string" ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(result.commitSha) ||
    typeof result.commitUrl !== "string" ||
    !commitUrlIsSafe ||
    result.articlePath !== expectedPath ||
    typeof result.replayed !== "boolean"
  ) {
    serviceUnavailable();
  }

  return {
    publicationId: publication.publicationId,
    commitSha: result.commitSha,
    commitUrl: result.commitUrl,
    articlePath: expectedPath,
    articleUrl: `${input.dependencies.siteOrigin}/article/${publication.slug}`,
    replayed: claim.status === "replayed" || result.replayed,
  };
}

export interface PublicationRateLimiter {
  allow(key: string, now?: number): boolean;
}

type RateLimitOptions = { maxRequests?: number; windowMs?: number; maxKeys?: number };

/** A finite, process-local limiter. The route supplies the fixed integration audience as its key. */
export class BoundedPublicationRateLimiter implements PublicationRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly buckets = new Map<string, { count: number; startedAt: number }>();

  constructor(options: RateLimitOptions = {}) {
    this.maxRequests = options.maxRequests ?? 60;
    this.windowMs = options.windowMs ?? 60_000;
    this.maxKeys = options.maxKeys ?? 8;
  }

  allow(_key: string, now = Date.now()): boolean {
    if (!Number.isFinite(now)) return false;
    const bucketKey = PUBLICATION_AUDIENCE;
    for (const [bucketKey, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(bucketKey);
    }
    const existing = this.buckets.get(bucketKey);
    if (!existing) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      this.buckets.set(bucketKey, { count: 1, startedAt: now });
      return true;
    }
    if (existing.count >= this.maxRequests) return false;
    existing.count += 1;
    return true;
  }
}

export const publicationRateLimiter = new BoundedPublicationRateLimiter();

export function createPublicationDependencies(environment: PublicationEnvironment): PublicationServiceDependencies {
  return buildDependencies(environment);
}

export function noStoreHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
}

export function jsonPublicationResponse(body: unknown, status: number): Response {
  const response = Response.json(body, { status, headers: noStoreHeaders() });
  return response;
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonPublicationResponse({ code, message }, status);
}

async function boundedRequestBody(request: Request): Promise<{ body?: unknown; error?: Response }> {
  const contentType = request.headers.get("content-type");
  if (!contentType) return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
  const parameters = contentType.split(";").map((part) => part.trim());
  if (parameters[0]?.toLowerCase() !== "application/json") {
    return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
  }
  for (const parameter of parameters.slice(1)) {
    const match = /^charset\s*=\s*["']?([^"']+)["']?$/i.exec(parameter);
    if (match && /^utf-?8$/i.test(match[1])) continue;
    return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
  }

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) {
      return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
    }
    if (length > PUBLICATION_BODY_LIMIT_BYTES) {
      return { error: errorResponse(413, "payload_too_large", "Publication payload is too large") };
    }
  }

  if (!request.body) return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || typeof value.byteLength !== "number") return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > PUBLICATION_BODY_LIMIT_BYTES) {
        await reader.cancel();
        return { error: errorResponse(413, "payload_too_large", "Publication payload is too large") };
      }
      chunks.push(chunk);
    }
  } catch {
    return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: errorResponse(400, "invalid_request", "Invalid publication request") };
  }
}

export async function receivePublicationRequest(
  request: Request,
  options: {
    environment?: PublicationEnvironment;
    dependencies?: PublicationServiceDependencies;
    rateLimiter?: PublicationRateLimiter;
    now?: number;
  } = {},
): Promise<Response> {
  const parsedBody = await boundedRequestBody(request);
  if (parsedBody.error) return parsedBody.error;

  const headers = {
    timestamp: request.headers.get("x-omnilede-timestamp") ?? "",
    nonce: request.headers.get("x-omnilede-nonce") ?? "",
    audience: request.headers.get("x-omnilede-audience") ?? "",
    signature: request.headers.get("x-omnilede-signature") ?? "",
  };
  if (
    headers.audience !== PUBLICATION_AUDIENCE ||
    headers.nonce.length === 0 ||
    headers.timestamp.length === 0 ||
    !/^v1=[0-9a-f]{64}$/.test(headers.signature)
  ) {
    return errorResponse(401, "invalid_signature", "Invalid publication signature");
  }

  // Read only the signing secret before verification. Full environment parsing validates
  // configured URLs and is deliberately deferred until after the authenticated boundary.
  const signingSecret = options.environment?.CONTRIBUTOR_PUBLISH_HMAC_SECRET ?? process.env.CONTRIBUTOR_PUBLISH_HMAC_SECRET ?? "";

  if (!verifyPublicationSignature({ secret: signingSecret, body: parsedBody.body, headers, now: options.now ?? Date.now() }).valid) {
    return errorResponse(401, "invalid_signature", "Invalid publication signature");
  }

  let environment: PublicationEnvironment;
  try {
    environment = options.environment ?? parsePublicationEnvironment();
  } catch {
    return errorResponse(503, "service_unavailable", "Publication service is unavailable");
  }

  const limiter = options.rateLimiter ?? publicationRateLimiter;
  if (!limiter.allow(PUBLICATION_AUDIENCE, options.now ?? Date.now())) {
    return errorResponse(429, "rate_limited", "Publication rate limit exceeded");
  }

  let dependencies: PublicationServiceDependencies;
  try {
    dependencies = options.dependencies ?? createPublicationDependencies(environment);
  } catch {
    return errorResponse(503, "service_unavailable", "Publication service is unavailable");
  }

  try {
    const result = await publishPublication({
      publication: parsedBody.body,
      nonce: headers.nonce,
      dependencies,
      now: options.now === undefined ? undefined : new Date(options.now),
    });
    return jsonPublicationResponse(result, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof PublicationServiceError) {
      if (error.code === "invalid_publication") return errorResponse(400, "invalid_request", "Invalid publication request");
      if (error.code === "nonce_conflict" || error.code === "repository_conflict") {
        return errorResponse(409, "publication_conflict", "Publication conflicts with an existing request");
      }
    }
    return errorResponse(503, "service_unavailable", "Publication service is unavailable");
  }
}
