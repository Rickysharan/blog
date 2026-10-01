import { DraftRepositoryError, type DraftRef, type DraftRepository } from "@/lib/drafts/types";
import { GitDataClientError } from "@/lib/github/git-data-client";
import type { RecoveryCategory } from "@/lib/pipeline/local-run-types";

export type DeliveryResult =
  | { status: "created"; ref: DraftRef; attempts: number }
  | { status: "alreadyDelivered"; ref: DraftRef; attempts: number }
  | { status: "conflict"; ref: DraftRef; attempts: number; category: "content-conflict"; message: string }
  | { status: "retryableFailure"; ref: DraftRef; attempts: number; category: RecoveryCategory; message: string }
  | { status: "humanRequired"; ref: DraftRef; attempts: number; category: RecoveryCategory; message: string };

interface DeliverDraftOptions {
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

type ReadCreateRepository = Pick<DraftRepository, "read" | "create">;

function gitError(error: unknown): GitDataClientError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current instanceof GitDataClientError) return current;
    current = current.cause;
  }
  return undefined;
}

function isNotFound(error: unknown): boolean {
  return error instanceof DraftRepositoryError && error.code === "not_found";
}

function failureCategory(error: unknown): { category: RecoveryCategory; retryable: boolean } {
  const transport = gitError(error);
  if (transport) return { category: transport.category, retryable: transport.retryable };
  if (error instanceof DraftRepositoryError) {
    if (error.code === "storage_unavailable") return { category: "remote-service", retryable: true };
    if (error.code === "invalid_input") return { category: "configuration", retryable: false };
    if (error.code === "conflict") return { category: "content-conflict", retryable: false };
  }
  return { category: "unknown", retryable: false };
}

function safeMessage(category: RecoveryCategory): string {
  switch (category) {
    case "network": return "The dashboard could not be reached.";
    case "rate-limited": return "GitHub temporarily rate-limited the delivery.";
    case "remote-service": return "GitHub is temporarily unavailable.";
    case "authentication": return "GitHub authentication needs attention.";
    case "permission": return "GitHub permission needs attention.";
    case "published-conflict": return "An article with this slug is already published.";
    case "content-conflict": return "The dashboard draft contains different editor changes.";
    default: return "Draft delivery needs attention.";
  }
}

async function readForReconciliation(
  target: Pick<DraftRepository, "read">,
  ref: DraftRef,
  expectedMdx: string,
): Promise<"missing" | "matching" | "different" | { error: unknown }> {
  try {
    const existing = await target.read(ref);
    return existing.mdx === expectedMdx ? "matching" : "different";
  } catch (error) {
    if (isNotFound(error)) return "missing";
    return { error };
  }
}

/** Creates one remote draft and verifies exact bytes without ever saving or publishing. */
export async function deliverDraft(
  source: Pick<DraftRepository, "read">,
  target: ReadCreateRepository,
  ref: DraftRef,
  options: DeliverDraftOptions = {},
): Promise<DeliveryResult> {
  const sourceDraft = await source.read(ref);
  const maximumAttempts = 1 + (options.maxRetries ?? 2);
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let attemptedCreate = false;
  let lastCategory: RecoveryCategory = "remote-service";

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const before = await readForReconciliation(target, ref, sourceDraft.mdx);
    if (before === "matching") {
      return { status: attemptedCreate ? "created" : "alreadyDelivered", ref, attempts: attemptedCreate ? attempt - 1 : 0 };
    }
    if (before === "different") {
      return { status: "conflict", ref, attempts: attemptedCreate ? attempt - 1 : 0, category: "content-conflict", message: safeMessage("content-conflict") };
    }
    if (typeof before === "object") {
      const classified = failureCategory(before.error);
      lastCategory = classified.category;
      if (!classified.retryable) {
        return { status: "humanRequired", ref, attempts: attempt, category: classified.category, message: safeMessage(classified.category) };
      }
      if (attempt < maximumAttempts) {
        await sleep(Math.min(250 * 2 ** (attempt - 1), 1_000));
        continue;
      }
      break;
    }

    attemptedCreate = true;
    try {
      await target.create(ref, sourceDraft.mdx);
    } catch (error) {
      if (error instanceof DraftRepositoryError &&
          error.code === "conflict" && /published article/i.test(error.message)) {
        return { status: "humanRequired", ref, attempts: attempt, category: "published-conflict", message: safeMessage("published-conflict") };
      }

      const afterFailure = await readForReconciliation(target, ref, sourceDraft.mdx);
      if (afterFailure === "matching") {
        return { status: "created", ref, attempts: attempt };
      }
      if (afterFailure === "different") {
        return { status: "conflict", ref, attempts: attempt, category: "content-conflict", message: safeMessage("content-conflict") };
      }
      if (typeof afterFailure === "object") {
        const reconciliationFailure = failureCategory(afterFailure.error);
        if (!reconciliationFailure.retryable) {
          return { status: "humanRequired", ref, attempts: attempt, category: reconciliationFailure.category, message: safeMessage(reconciliationFailure.category) };
        }
      }

      const classified = failureCategory(error);
      lastCategory = classified.category;
      const branchMoved = error instanceof DraftRepositoryError &&
        error.code === "conflict" && /ref update/i.test(error.message);
      if (!classified.retryable && !branchMoved) {
        return { status: "humanRequired", ref, attempts: attempt, category: classified.category, message: safeMessage(classified.category) };
      }
      if (attempt < maximumAttempts) {
        await sleep(Math.min(250 * 2 ** (attempt - 1), 1_000));
        continue;
      }
      break;
    }

    const verified = await readForReconciliation(target, ref, sourceDraft.mdx);
    if (verified === "matching") return { status: "created", ref, attempts: attempt };
    if (verified === "different") {
      return { status: "conflict", ref, attempts: attempt, category: "content-conflict", message: safeMessage("content-conflict") };
    }
    if (typeof verified === "object") lastCategory = failureCategory(verified.error).category;
    if (attempt < maximumAttempts) {
      await sleep(Math.min(250 * 2 ** (attempt - 1), 1_000));
    }
  }

  return {
    status: "retryableFailure",
    ref,
    attempts: maximumAttempts,
    category: lastCategory,
    message: safeMessage(lastCategory),
  };
}

/** Only creation is permitted: never save, discard, or publish a remote article. */
export async function syncDrafts(
  source: Pick<DraftRepository, "list" | "read">,
  target: Pick<DraftRepository, "read" | "create">,
  selectedRefs?: readonly DraftRef[],
) {
  const result: { created: DraftRef[]; unchanged: DraftRef[]; failed: Array<{ ref: DraftRef; code: string }> } = {
    created: [], unchanged: [], failed: [],
  };
  const selectedKeys = selectedRefs === undefined
    ? undefined
    : new Set(selectedRefs.map((ref) => `${ref.category}/${ref.filename}`));
  for (const { ref } of await source.list()) {
    if (selectedKeys && !selectedKeys.has(`${ref.category}/${ref.filename}`)) continue;
    try {
      const delivery = await deliverDraft(source, target, ref);
      if (delivery.status === "created") result.created.push(ref);
      else if (delivery.status === "alreadyDelivered") result.unchanged.push(ref);
      else result.failed.push({ ref, code: delivery.category === "content-conflict" || delivery.category === "published-conflict" ? "conflict" : delivery.category });
    } catch {
      result.failed.push({ ref, code: "storage_unavailable" });
    }
  }
  return result;
}
