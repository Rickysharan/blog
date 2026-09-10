import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { canonicalJson, publicationPayloadSchema, type PublicationPayload } from "@omnilede/contracts";
import { z } from "zod";

export const PUBLICATION_AUDIENCE = "omnilede-blog-publish-v1";

export type PublicationReceipt = {
  publicationId: string;
  commitSha: string;
  commitUrl: string;
  articlePath: string;
  articleUrl: string;
  replayed: boolean;
};

export type PublicationClientResult =
  | { disposition: "published"; receipt: PublicationReceipt }
  | { disposition: "permanent" | "paused" | "manual_review" | "retry"; code: string };

const MAX_RECEIVER_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_RECEIVER_TIMEOUT_MS = 10_000;

const receiptSchema = z
  .object({
    publicationId: z.string().uuid(),
    commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
    commitUrl: z.string().url().refine((value) => new URL(value).protocol === "https:"),
    articlePath: z.string().regex(/^content\/articles\/(?:anime|movies|politics|sports|finance|share-market)\/[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/),
    articleUrl: z.string().url().refine((value) => new URL(value).protocol === "https:"),
    replayed: z.boolean(),
  })
  .strict();

function sign(secret: string, timestamp: string, nonce: string, body: string): string {
  return `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${PUBLICATION_AUDIENCE}.${body}`, "utf8")
    .digest("hex")}`;
}

function failureForStatus(status: number): Exclude<PublicationClientResult, { disposition: "published" }> {
  if (status === 401 || status === 403) return { disposition: "paused", code: "invalid_signature" };
  if (status === 409) return { disposition: "manual_review", code: "publication_conflict" };
  if (status === 429) return { disposition: "retry", code: "rate_limited" };
  if (status >= 500) return { disposition: "retry", code: "service_unavailable" };
  return { disposition: "permanent", code: "invalid_request" };
}

function receiptUrlsAreBound(
  receipt: PublicationReceipt,
  endpoint: URL,
  publication: PublicationPayload,
): boolean {
  try {
    const commitUrl = new URL(receipt.commitUrl);
    const articleUrl = new URL(receipt.articleUrl);
    return (
      commitUrl.protocol === "https:" &&
      commitUrl.hostname === "github.com" &&
      !commitUrl.username &&
      !commitUrl.password &&
      !commitUrl.search &&
      !commitUrl.hash &&
      new RegExp(`^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/commit/${receipt.commitSha}$`).test(commitUrl.pathname) &&
      articleUrl.origin === endpoint.origin &&
      !articleUrl.username &&
      !articleUrl.password &&
      !articleUrl.search &&
      !articleUrl.hash &&
      articleUrl.pathname === `/article/${publication.slug}`
    );
  } catch {
    return false;
  }
}

function timeoutError(): DOMException {
  return new DOMException("Publication receiver timed out", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function boundedReceipt(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_RECEIVER_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error("receiver_response_invalid");
    }
  }

  if (!response.body) throw new Error("receiver_response_invalid");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let rejectForAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectForAbort = reject;
  });
  const onAbort = () => rejectForAbort?.(timeoutError());
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw timeoutError();
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RECEIVER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("receiver_response_invalid");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (isAbortError(error)) await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export function publicationRetryDelayMs(attempt: number): number {
  const safeAttempt = Number.isSafeInteger(attempt) ? Math.max(1, attempt) : 1;
  return Math.min(30_000 * 2 ** Math.min(safeAttempt - 1, 10), 15 * 60_000);
}

export async function sendPublication(input: {
  endpoint: string;
  secret: string;
  publication: PublicationPayload;
  fetchImpl?: typeof fetch;
  now?: () => number;
  nonce?: () => string;
  timeoutMs?: number;
}): Promise<PublicationClientResult> {
  const publication = publicationPayloadSchema.parse(input.publication);
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || input.secret.length < 32) {
    throw new Error("Invalid publication client configuration");
  }
  const now = input.now?.() ?? Date.now();
  if (!Number.isFinite(now)) throw new Error("Invalid publication client clock");
  const timestamp = String(Math.floor(now / 1000));
  const nonce = input.nonce?.() ?? randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(nonce)) {
    throw new Error("Invalid publication nonce");
  }
  const body = canonicalJson(publication);
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? DEFAULT_RECEIVER_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, 30_000)));
  try {
    let response: Response;
    try {
      response = await (input.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        body,
        signal: controller.signal,
        redirect: "error",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-omnilede-timestamp": timestamp,
          "x-omnilede-nonce": nonce,
          "x-omnilede-audience": PUBLICATION_AUDIENCE,
          "x-omnilede-signature": sign(input.secret, timestamp, nonce, body),
        },
      });
    } catch (error) {
      return {
        disposition: "retry",
        code: isAbortError(error) || controller.signal.aborted ? "receiver_timeout" : "receiver_unavailable",
      };
    }

    if (!response.ok) return failureForStatus(response.status);
    if (response.status !== 200 && response.status !== 201) {
      return { disposition: "retry", code: "invalid_receiver_response" };
    }
    try {
      const receipt = receiptSchema.parse(await boundedReceipt(response, controller.signal));
      const expectedPath = `content/articles/${publication.category}/${publication.slug}.mdx`;
      if (
        receipt.publicationId !== publication.publicationId ||
        receipt.articlePath !== expectedPath ||
        !receiptUrlsAreBound(receipt, endpoint, publication)
      ) {
        return { disposition: "retry", code: "invalid_receiver_response" };
      }
      return { disposition: "published", receipt };
    } catch (error) {
      return {
        disposition: "retry",
        code: isAbortError(error) || controller.signal.aborted ? "receiver_timeout" : "invalid_receiver_response",
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}
