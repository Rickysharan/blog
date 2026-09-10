import "server-only";

import { randomUUID } from "node:crypto";

import {
  publicationPayloadSchema,
  type Category,
  type EditorDocument,
  type PublicationPayload,
  type Region,
} from "@omnilede/contracts";
import { z } from "zod";

import {
  publicationRetryDelayMs,
  sendPublication,
  type PublicationClientResult,
  type PublicationReceipt,
} from "./client";
import {
  createSupabasePublicationImageStore,
  preparePublicationImage,
  type PublicationStorageGateway,
} from "./prepare-image";
import { createServiceSupabaseClient } from "../supabase/server";

export type PublicationOutboxClaim = {
  outboxId: string;
  publicationId: string;
  submissionId: string;
  submissionVersion: number;
  authorId: string;
  contributorName: string;
  title: string;
  slug: string;
  approvedAt: string;
  category: Category;
  region: Region;
  language: string;
  sourceName: string;
  sourceUrl: string;
  privateImagePath: string;
  guidelinesVersion: string;
  contentDocument: EditorDocument;
  rewardPoints: number;
  attemptCount: number;
  leaseToken: string;
};

export type FailureDisposition = "retry" | "permanent" | "paused" | "manual_review";

export interface PublicationOutboxStore {
  claim(input: { workerId: string; leaseSeconds: number; signal: AbortSignal }): Promise<PublicationOutboxClaim | null>;
  complete(input: {
    outboxId: string;
    workerId: string;
    leaseToken: string;
    receipt: PublicationReceipt;
    signal: AbortSignal;
  }): Promise<void>;
  fail(input: {
    outboxId: string;
    workerId: string;
    leaseToken: string;
    disposition: FailureDisposition;
    code: string;
    reason: string;
    retryAt: string | null;
    signal: AbortSignal;
  }): Promise<void>;
}

type RpcResult = { data: unknown; error: { message?: string } | null };
type PublicationRpcQuery = {
  abortSignal(signal: AbortSignal): PromiseLike<RpcResult>;
};
export type PublicationRpcGateway = {
  rpc(name: string, args: Record<string, unknown>): PublicationRpcQuery;
};

const claimSchema = z
  .object({
    outboxId: z.string().uuid(),
    publicationId: z.string().uuid(),
    submissionId: z.string().uuid(),
    submissionVersion: z.number().int().positive().safe(),
    authorId: z.string().uuid(),
    contributorName: z.string().trim().min(1).max(100),
    title: publicationPayloadSchema.shape.title,
    slug: publicationPayloadSchema.shape.slug,
    approvedAt: z.string().datetime({ offset: true }),
    category: publicationPayloadSchema.shape.category,
    region: publicationPayloadSchema.shape.region,
    language: publicationPayloadSchema.shape.language,
    sourceName: publicationPayloadSchema.shape.sourceName,
    sourceUrl: publicationPayloadSchema.shape.sourceUrl,
    privateImagePath: z.string().max(240),
    guidelinesVersion: publicationPayloadSchema.shape.guidelinesVersion,
    contentDocument: publicationPayloadSchema.shape.contentDocument,
    rewardPoints: z.number().positive().max(1_000_000),
    attemptCount: z.number().int().positive().max(100),
    leaseToken: z.string().uuid(),
  })
  .strict();

const leasedClaimEnvelopeSchema = z.object({
  outboxId: z.string().uuid(),
  leaseToken: z.string().uuid(),
}).passthrough();

function rpcError(operation: string, error: RpcResult["error"]): Error {
  return new Error(`Publication outbox ${operation} failed`, { cause: error ?? undefined });
}

export function createSupabasePublicationOutboxStore(gateway: PublicationRpcGateway): PublicationOutboxStore {
  return {
    async claim(input) {
      while (!input.signal.aborted) {
        const result = await gateway
          .rpc("claim_publication_outbox", {
            p_worker_id: input.workerId,
            p_lease_seconds: input.leaseSeconds,
          })
          .abortSignal(input.signal);
        if (result.error) throw rpcError("claim", result.error);
        if (result.data === null) return null;
        const parsed = claimSchema.safeParse(result.data);
        if (parsed.success) return parsed.data;

        const envelope = leasedClaimEnvelopeSchema.safeParse(result.data);
        if (!envelope.success) {
          throw new Error("Publication outbox returned an invalid claim envelope");
        }
        const failure = await gateway
          .rpc("fail_publication_outbox", {
            p_outbox_id: envelope.data.outboxId,
            p_worker_id: input.workerId,
            p_lease_token: envelope.data.leaseToken,
            p_disposition: "manual_review",
            p_error_code: "publication_claim_invalid",
            p_reason: "Publication claim requires manual review",
            p_retry_at: null,
          })
          .abortSignal(input.signal);
        if (failure.error) throw rpcError("invalid claim quarantine", failure.error);
      }
      throw input.signal.reason ?? new Error("Publication outbox claim aborted");
    },
    async complete(input) {
      const result = await gateway
        .rpc("complete_publication_outbox", {
          p_outbox_id: input.outboxId,
          p_worker_id: input.workerId,
          p_lease_token: input.leaseToken,
          p_commit_sha: input.receipt.commitSha,
          p_commit_url: input.receipt.commitUrl,
          p_article_path: input.receipt.articlePath,
          p_article_url: input.receipt.articleUrl,
        })
        .abortSignal(input.signal);
      if (result.error) throw rpcError("completion", result.error);
    },
    async fail(input) {
      const result = await gateway
        .rpc("fail_publication_outbox", {
          p_outbox_id: input.outboxId,
          p_worker_id: input.workerId,
          p_lease_token: input.leaseToken,
          p_disposition: input.disposition,
          p_error_code: input.code,
          p_reason: input.reason,
          p_retry_at: input.retryAt,
        })
        .abortSignal(input.signal);
      if (result.error) throw rpcError("failure", result.error);
    },
  };
}

export function buildPublicationPayload(
  claim: PublicationOutboxClaim,
  coverImage: string,
): PublicationPayload {
  const text: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as { text?: unknown; content?: unknown };
    if (typeof record.text === "string") text.push(record.text);
    if (Array.isArray(record.content)) record.content.forEach(visit);
  };
  visit(claim.contentDocument);
  const body = text.join(" ").replace(/\s+/g, " ").trim();
  const excerpt = (body || claim.title).slice(0, 320).trim();
  const wordCount = body.length === 0 ? 1 : body.split(/\s+/).length;
  return publicationPayloadSchema.parse({
    publicationId: claim.publicationId,
    submissionId: claim.submissionId,
    submissionVersion: claim.submissionVersion,
    title: claim.title,
    slug: claim.slug,
    date: claim.approvedAt.slice(0, 10),
    category: claim.category,
    tags: [claim.category, claim.region],
    contributorId: claim.authorId,
    contributorName: claim.contributorName,
    excerpt,
    coverImage,
    readTime: Math.min(120, Math.max(1, Math.ceil(wordCount / 220))),
    sourceName: claim.sourceName,
    sourceUrl: claim.sourceUrl,
    region: claim.region,
    language: claim.language,
    contentDocument: claim.contentDocument,
    guidelinesVersion: claim.guidelinesVersion,
  });
}

const failureReason: Record<string, string> = {
  invalid_request: "Publication payload was rejected",
  invalid_signature: "Publication integration credentials require attention",
  publication_conflict: "Publication conflicts with existing content",
  rate_limited: "Publication receiver is temporarily rate limited",
  service_unavailable: "Publication receiver is temporarily unavailable",
  receiver_timeout: "Publication receiver timed out",
  receiver_unavailable: "Publication receiver is temporarily unavailable",
  invalid_receiver_response: "Publication receiver returned an invalid acknowledgement",
  publication_validation_failed: "Approved content requires manual publication review",
  image_validation_failed: "Approved image requires manual publication review",
  image_service_unavailable: "Publication image storage is temporarily unavailable",
  deployment_not_ready: "Published commit is awaiting a successful site deployment",
};

function reasonFor(code: string): string {
  return failureReason[code] ?? "Publication processing failed safely";
}

function isImageValidationFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    ["publication_image.path_invalid", "publication_image.size_invalid", "publication_image.decode_failed", "publication_image.output_invalid", "publication_image.object_conflict"].includes(
      error.message,
    )
  );
}

const DEPLOYMENT_PROBE_LIMIT_BYTES = 512 * 1024;

export async function verifyPublicationDeployment(input: {
  publication: PublicationPayload;
  receipt: PublicationReceipt;
  expectedSiteOrigin: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  let expectedUrl: URL;
  let receivedUrl: URL;
  try {
    const origin = new URL(input.expectedSiteOrigin);
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return false;
    expectedUrl = new URL(`/article/${input.publication.slug}`, origin);
    receivedUrl = new URL(input.receipt.articleUrl);
  } catch {
    return false;
  }
  if (receivedUrl.href !== expectedUrl.href) return false;

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(expectedUrl, {
      cache: "no-store",
      headers: { accept: "text/html" },
      redirect: "error",
      signal: input.signal,
    });
  } catch {
    return false;
  }
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
    return false;
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > DEPLOYMENT_PROBE_LIMIT_BYTES) return false;
  if (!response.body) return false;

  const marker = `data-publication-id="${input.publication.publicationId}"`;
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let observedBytes = 0;
  let tail = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return tail.includes(marker);
      observedBytes += value.byteLength;
      if (observedBytes > DEPLOYMENT_PROBE_LIMIT_BYTES) {
        await reader.cancel();
        return false;
      }
      const text = tail + decoder.decode(value, { stream: true });
      if (text.includes(marker)) {
        await reader.cancel();
        return true;
      }
      tail = text.slice(-(marker.length - 1));
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

const publicationWorkerEnvSchema = z
  .object({
    BLOG_PUBLISH_URL: z.string().url().refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    }),
    BLOG_PUBLISH_HMAC_SECRET: z.string().min(32),
    PUBLISHED_IMAGE_ORIGIN: z.string().url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/storage/v1/object/public/published-images" &&
        value === `${url.origin}${url.pathname}`
      );
    }),
  })
  .strict();

function publicationWorkerEnvironment(environment: Record<string, string | undefined>) {
  return publicationWorkerEnvSchema.parse({
    BLOG_PUBLISH_URL: environment.BLOG_PUBLISH_URL,
    BLOG_PUBLISH_HMAC_SECRET: environment.BLOG_PUBLISH_HMAC_SECRET,
    PUBLISHED_IMAGE_ORIGIN: environment.PUBLISHED_IMAGE_ORIGIN,
  });
}

function withinRuntime<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const reason = new Error("publication_step_timeout");
      controller.abort(reason);
      reject(reason);
    }, Math.max(1, timeoutMs));
    let pending: PromiseLike<T>;
    try {
      pending = operation(controller.signal);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
      return;
    }
    pending.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function runPublicationBatch(options: { maxItems: number; maxRuntimeMs: number }) {
  const environment = publicationWorkerEnvironment(process.env);
  const supabase = createServiceSupabaseClient();
  const rpcGateway: PublicationRpcGateway = {
    rpc: (name, args) => supabase.rpc(name, args),
  };
  const storageGateway: PublicationStorageGateway = {
    storage: {
      from(bucket) {
        const storage = supabase.storage.from(bucket);
        return {
          download: (path) => storage.download(path),
          upload: (path, bytes, uploadOptions) => storage.upload(path, bytes, uploadOptions),
        };
      },
    },
  };
  const store = createSupabasePublicationOutboxStore(rpcGateway);
  const imageStore = createSupabasePublicationImageStore(storageGateway);
  return processPublicationOutbox(
    {
      store,
      prepareImage: async (item) => {
        const image = await preparePublicationImage({
          authorId: item.authorId,
          submissionId: item.submissionId,
          publicationId: item.publicationId,
          privateImagePath: item.privateImagePath,
          store: imageStore,
        });
        return { coverImage: `${environment.PUBLISHED_IMAGE_ORIGIN}/${image.objectPath}` };
      },
      publish: (publication, requestOptions) =>
        sendPublication({
          endpoint: environment.BLOG_PUBLISH_URL,
          secret: environment.BLOG_PUBLISH_HMAC_SECRET,
          publication,
          timeoutMs: requestOptions.timeoutMs,
        }),
      verifyDeployment: (publication, receipt, requestOptions) =>
        verifyPublicationDeployment({
          publication,
          receipt,
          expectedSiteOrigin: new URL(environment.BLOG_PUBLISH_URL).origin,
          signal: requestOptions.signal,
        }),
    },
    { ...options, workerId: randomUUID() },
  );
}

export async function processPublicationOutbox(
  dependencies: {
    store: PublicationOutboxStore;
    prepareImage(claim: PublicationOutboxClaim): Promise<{ coverImage: string }>;
    publish(payload: PublicationPayload, options: { timeoutMs: number }): Promise<PublicationClientResult>;
    verifyDeployment(
      payload: PublicationPayload,
      receipt: PublicationReceipt,
      options: { signal: AbortSignal },
    ): Promise<boolean>;
    now?: () => number;
  },
  options: { workerId: string; maxItems: number; maxRuntimeMs: number },
): Promise<{
  claimed: number;
  published: number;
  failed: number;
  stopped: "empty" | "max_items" | "max_runtime" | "integration_paused" | "acknowledgement_unavailable" | "outbox_unavailable";
}> {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const maxItems = Math.max(1, Math.min(Math.trunc(options.maxItems), 10));
  const maxRuntimeMs = Math.max(1, Math.min(Math.trunc(options.maxRuntimeMs), 20_000));
  let claimed = 0;
  let published = 0;
  let failed = 0;
  const acknowledgementReserveMs = Math.min(1_500, Math.max(100, Math.floor(maxRuntimeMs / 5)));
  const remainingRuntime = () => maxRuntimeMs - (now() - startedAt);
  const workBudget = () => remainingRuntime() - acknowledgementReserveMs;
  const rpcBudget = (remaining: number) => Math.max(1, Math.min(1_500, remaining));

  const failClaim = async (
    item: PublicationOutboxClaim,
    disposition: FailureDisposition,
    code: string,
  ): Promise<boolean> => {
    const retryAt = disposition === "retry"
      ? new Date(now() + publicationRetryDelayMs(item.attemptCount)).toISOString()
      : null;
    try {
      await withinRuntime(
        (signal) => dependencies.store.fail({
          outboxId: item.outboxId,
          workerId: options.workerId,
          leaseToken: item.leaseToken,
          disposition,
          code,
          reason: reasonFor(code),
          retryAt,
          signal,
        }),
        rpcBudget(remainingRuntime()),
      );
      failed += 1;
      return true;
    } catch {
      failed += 1;
      return false;
    }
  };

  while (claimed < maxItems) {
    if (workBudget() <= 0) {
      return { claimed, published, failed, stopped: "max_runtime" };
    }
    let item: PublicationOutboxClaim | null;
    try {
      item = await withinRuntime(
        (signal) => dependencies.store.claim({ workerId: options.workerId, leaseSeconds: 60, signal }),
        rpcBudget(workBudget()),
      );
    } catch {
      return { claimed, published, failed, stopped: "outbox_unavailable" };
    }
    if (!item) return { claimed, published, failed, stopped: "empty" };
    claimed += 1;

    let coverImage: string;
    try {
      const remainingRuntimeMs = workBudget();
      if (remainingRuntimeMs <= 0) {
        return { claimed, published, failed, stopped: "max_runtime" };
      }
      coverImage = (await withinRuntime(() => dependencies.prepareImage(item), remainingRuntimeMs)).coverImage;
    } catch (error) {
      const disposition: FailureDisposition = isImageValidationFailure(error) ? "manual_review" : "retry";
      const stored = await failClaim(
        item,
        disposition,
        disposition === "manual_review" ? "image_validation_failed" : "image_service_unavailable",
      );
      if (!stored) return { claimed, published, failed, stopped: "acknowledgement_unavailable" };
      continue;
    }

    let publication: PublicationPayload;
    try {
      publication = buildPublicationPayload(item, coverImage);
    } catch {
      const stored = await failClaim(item, "manual_review", "publication_validation_failed");
      if (!stored) return { claimed, published, failed, stopped: "acknowledgement_unavailable" };
      continue;
    }

    const remainingRuntimeMs = workBudget();
    if (remainingRuntimeMs <= 0) {
      return { claimed, published, failed, stopped: "max_runtime" };
    }

    let result: PublicationClientResult;
    try {
      result = await withinRuntime(
        () => dependencies.publish(publication, { timeoutMs: remainingRuntimeMs }),
        remainingRuntimeMs,
      );
    } catch {
      result = { disposition: "retry", code: "receiver_unavailable" };
    }
    if (result.disposition === "published") {
      let deploymentReady = false;
      try {
        const remainingRuntimeMs = workBudget();
        if (remainingRuntimeMs > 0) {
          deploymentReady = await withinRuntime(
            (signal) => dependencies.verifyDeployment(publication, result.receipt, { signal }),
            remainingRuntimeMs,
          );
        }
      } catch {
        deploymentReady = false;
      }
      if (!deploymentReady) {
        const stored = await failClaim(item, "retry", "deployment_not_ready");
        if (!stored) return { claimed, published, failed, stopped: "acknowledgement_unavailable" };
        continue;
      }
      try {
        await withinRuntime(
          (signal) => dependencies.store.complete({
            outboxId: item.outboxId,
            workerId: options.workerId,
            leaseToken: item.leaseToken,
            receipt: result.receipt,
            signal,
          }),
          rpcBudget(remainingRuntime()),
        );
        published += 1;
      } catch {
        failed += 1;
        return { claimed, published, failed, stopped: "acknowledgement_unavailable" };
      }
      continue;
    }

    const stored = await failClaim(item, result.disposition, result.code);
    if (!stored) return { claimed, published, failed, stopped: "acknowledgement_unavailable" };
    if (result.disposition === "paused") {
      return { claimed, published, failed, stopped: "integration_paused" };
    }
  }
  return { claimed, published, failed, stopped: "max_items" };
}
