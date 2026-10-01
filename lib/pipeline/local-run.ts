import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { isCategorySlug } from "@/lib/config/categories";
import { GitHubDraftRepository } from "@/lib/drafts/github-repository";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import type { DraftRef } from "@/lib/drafts/types";
import { validateDeliverable } from "@/lib/pipeline/deliverable";
import { fetchTrendingStories, writeTrendingQueue } from "@/lib/pipeline/fetch";
import {
  buildDraftMdx,
  GenerationValidationError,
  requestOllamaDraft,
  type GeneratedDraftContent,
} from "@/lib/pipeline/generate";
import {
  findRequiredArticlePhotos,
  type PhotoSearchResult,
} from "@/lib/pipeline/images";
import { resolveLocalGitHubTarget } from "@/lib/pipeline/local-github";
import {
  acquireWriterLock,
  ensureLocalModel,
  LocalRuntimeError,
  type RuntimeCheckResult,
  type WriterLock,
} from "@/lib/pipeline/local-runtime";
import type {
  LocalRunResult,
  LocalRunStage,
  LocalRunState,
  LocalWriterEvent,
  RecoveryCategory,
} from "@/lib/pipeline/local-run-types";
import { archiveInvalidRunState, loadRunState, saveRunState } from "@/lib/pipeline/run-state";
import { deliverDraft, type DeliveryResult } from "@/lib/pipeline/sync";
import type { FetchTrendingResult, QueueStory } from "@/lib/pipeline/types";

const queueStorySchema = z.object({
  title: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.string().url().refine((value) => new URL(value).protocol === "https:"),
  date: z.string().datetime({ offset: true }),
  snippet: z.string().min(1),
  category: z.string().refine(isCategorySlug),
}).strict();

export interface LocalRunDependencies {
  acquireLock(options: { lockPath: string }): Promise<WriterLock>;
  ensureModel(options: { model: string }): Promise<RuntimeCheckResult>;
  discover(options: { contentRoot: string }): Promise<FetchTrendingResult>;
  generate(
    story: QueueStory,
    options: { model: string; attempt: number; validationReason?: string },
  ): Promise<GeneratedDraftContent>;
  findPhotos(story: QueueStory, tags: string[]): Promise<PhotoSearchResult>;
  deliver(
    contentRoot: string,
    ref: DraftRef,
    env: Record<string, string | undefined>,
  ): Promise<DeliveryResult>;
  now(): Date;
  runId(): string;
}

export interface RunLocalWriterOptions {
  projectRoot?: string;
  contentRoot?: string;
  auditRoot?: string;
  env?: Record<string, string | undefined>;
  limit?: number;
  sync?: boolean;
  queueOnly?: boolean;
  syncOnly?: boolean;
  localOnly?: boolean;
  onEvent?: (event: LocalWriterEvent) => void | Promise<void>;
  signal?: AbortSignal;
  dependencies?: Partial<LocalRunDependencies>;
}

const defaultDependencies: LocalRunDependencies = {
  acquireLock: (options) => acquireWriterLock(options),
  ensureModel: (options) => ensureLocalModel(options),
  discover: (options) => fetchTrendingStories(options),
  generate: (story, options) => requestOllamaDraft(story, { model: options.model }),
  findPhotos: (story, tags) => findRequiredArticlePhotos(story, tags),
  async deliver(contentRoot, ref, env) {
    const targetConfig = await resolveLocalGitHubTarget(env);
    return deliverDraft(
      new LocalDraftRepository({ contentRoot }),
      new GitHubDraftRepository(targetConfig),
      ref,
    );
  },
  now: () => new Date(),
  runId: () => crypto.randomUUID(),
};

const stagePercent: Record<LocalRunStage, number> = {
  preflight: 5,
  discovery: 15,
  generation: 35,
  "article-normalization": 50,
  "image-selection": 70,
  "local-validation": 82,
  "dashboard-delivery": 92,
  "delivery-verification": 100,
};

function safeTerminalMessage(category: RecoveryCategory): string {
  switch (category) {
    case "discovery-unavailable": return "No current or saved source story is available. Your existing queue was preserved.";
    case "generation-invalid": return "The local model could not produce a valid article after three attempts.";
    case "generation-unavailable": return "The local model stopped responding after repair attempts.";
    case "insufficient-images": return "The article text was saved, but two suitable credited pictures could not be found.";
    case "local-model-missing": return "The configured local model is not installed. Install it in Ollama, then try again.";
    case "local-model-unavailable": return "Ollama could not be started locally after two repair attempts.";
    case "already-running": return "Another OmniLede writer is already running.";
    case "authentication": return "GitHub authentication needs attention before delivery can resume.";
    case "permission": return "GitHub permission needs attention before delivery can resume.";
    case "published-conflict": return "An article with this slug is already published.";
    case "content-conflict": return "The dashboard contains different editor changes; nothing was overwritten.";
    case "network":
    case "rate-limited":
    case "remote-service": return "The dashboard could not verify delivery. The local draft is safe and resumable.";
    default: return "The run could not finish. Completed work is safe and resumable.";
  }
}

async function readQueue(queuePath: string): Promise<{ stories: QueueStory[]; valid: boolean }> {
  try {
    const value = JSON.parse(await readFile(queuePath, "utf8"));
    const parsed = z.array(queueStorySchema).safeParse(value);
    return parsed.success
      ? { stories: parsed.data as QueueStory[], valid: true }
      : { stories: [], valid: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { stories: [], valid: true };
    return { stories: [], valid: false };
  }
}

async function writeQueueBytes(queuePath: string, stories: QueueStory[]): Promise<void> {
  await mkdir(path.dirname(queuePath), { recursive: true });
  const temporary = `${queuePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(stories, null, 2)}\n`, "utf8");
  await import("node:fs/promises").then(({ rename }) => rename(temporary, queuePath));
}

function stateStory(state: LocalRunState | null): QueueStory | undefined {
  const candidate = state?.selectedStory;
  if (!candidate || !isCategorySlug(candidate.category)) return undefined;
  return { ...candidate, category: candidate.category };
}

function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function generatedFromSavedDraft(mdx: string): GeneratedDraftContent | undefined {
  const parsed = matter(mdx);
  const title = parsed.data.title;
  const excerpt = parsed.data.excerpt;
  const tags = parsed.data.tags;
  if (typeof title !== "string" || typeof excerpt !== "string" ||
      !Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
    return undefined;
  }
  const body = parsed.content
    .replace(/^!\[[^\n]+\]\([^\n]+\)\n\nRelated archive image:[^\n]+(?:\n|$)/gm, "")
    .replace(/^\s*Source:\s*\[[^\]]+\]\(https:\/\/[^\s)]+\)\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, excerpt, tags, body };
}

export async function runLocalWriter(
  options: RunLocalWriterOptions = {},
): Promise<LocalRunResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const contentRoot = options.contentRoot ?? path.join(projectRoot, "content");
  const auditRoot = options.auditRoot ?? path.join(projectRoot, ".audit");
  const statePath = path.join(auditRoot, "current-run.json");
  const logPath = path.join(auditRoot, "desktop-writer.log");
  const queuePath = path.join(contentRoot, "queue", "trending.json");
  const env = options.env ?? process.env;
  const deps: LocalRunDependencies = { ...defaultDependencies, ...options.dependencies };
  const syncEnabled = !options.localOnly && Boolean(
    options.sync || options.syncOnly || env.LOCAL_WRITER_SYNC === "true",
  );
  await mkdir(auditRoot, { recursive: true });

  let previous: LocalRunState | null = null;
  try {
    previous = await loadRunState(statePath);
  } catch {
    await archiveInvalidRunState(statePath, deps.now());
  }
  const startedAt = previous?.startedAt ?? deps.now().toISOString();
  const runId = previous?.runId ?? deps.runId();
  let repairs = previous?.repairs ?? [];
  let draftRef = previous?.draftRef as DraftRef | undefined;
  let draftHash = previous?.draftHash;
  let imageCount = previous?.imageCount ?? 0;
  let selectedStory = stateStory(previous);
  let lock: WriterLock | undefined;

  const persistAndEmit = async (
    stage: LocalRunStage,
    status: LocalWriterEvent["status"],
    message: string,
    attempt = 1,
    errorCategory?: RecoveryCategory,
    deliveryStatus: LocalRunState["deliveryStatus"] = "pending",
  ) => {
    const terminalStatus = status === "completed" ? "completed" :
      status === "cancelled" ? "cancelled" :
      status === "human-required" || status === "failed" ? "human-required" : "running";
    const state: LocalRunState = {
      version: 1,
      runId,
      status: terminalStatus,
      stage,
      attempt,
      percent: stagePercent[stage],
      message,
      draftRef,
      draftHash,
      imageCount,
      repairs,
      errorCategory,
      deliveryStatus,
      selectedStory,
      startedAt,
      updatedAt: deps.now().toISOString(),
    };
    await saveRunState(statePath, state);
    const base = {
      runId,
      stage,
      attempt,
      percent: stagePercent[stage],
      status,
      message,
      draftRef,
      imageCount,
      repairs,
    };
    const event = (
      status === "completed" ? { ...base, deliveryStatus: deliveryStatus === "delivered" ? "delivered" as const : "not-delivered" as const } :
      status === "cancelled" ? { ...base, errorCategory: "cancelled" as const } :
      status === "retrying" || status === "human-required" || status === "failed"
        ? { ...base, errorCategory: errorCategory ?? "unknown" }
        : base
    ) as LocalWriterEvent;
    await appendFile(logPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
    await options.onEvent?.(event);
  };

  const humanRequired = async (
    stage: LocalRunStage,
    category: RecoveryCategory,
    attempt = 1,
  ): Promise<LocalRunResult> => {
    const message = safeTerminalMessage(category);
    await persistAndEmit(stage, "human-required", message, attempt, category, "not-delivered");
    return {
      runId, status: "human-required", stage, draftRef, imageCount, repairs,
      message, errorCategory: category, deliveryStatus: "not-delivered", resumable: true,
    };
  };

  const cancelled = async (stage: LocalRunStage): Promise<LocalRunResult> => {
    const message = "The run was cancelled. Completed work is safe and resumable.";
    await persistAndEmit(stage, "cancelled", message, 1, "cancelled", "not-delivered");
    return {
      runId, status: "cancelled", stage, draftRef, imageCount, repairs,
      message, errorCategory: "cancelled", deliveryStatus: "not-delivered", resumable: true,
    };
  };

  try {
    if (options.signal?.aborted) return await cancelled("preflight");
    lock = await deps.acquireLock({ lockPath: path.join(auditRoot, "local-writer.lock") });
    repairs = [...repairs, ...lock.repairs];

    let resumableMdx: string | undefined;
    let pictureRepairDraft: GeneratedDraftContent | undefined;
    if (draftRef && previous?.deliveryStatus !== "delivered") {
      try {
        resumableMdx = await readFile(
          path.join(contentRoot, "drafts", draftRef.category, draftRef.filename),
          "utf8",
        );
        const currentHash = contentHash(resumableMdx);
        if (draftHash && currentHash !== draftHash) {
          return await humanRequired("local-validation", "content-conflict");
        }
        const validation = await validateDeliverable(draftRef, resumableMdx);
        if (!validation.ok) {
          if (previous?.errorCategory === "insufficient-images" && selectedStory) {
            pictureRepairDraft = generatedFromSavedDraft(resumableMdx);
          }
          resumableMdx = undefined;
        } else {
          imageCount = validation.imageCount;
        }
      } catch {
        resumableMdx = undefined;
      }
    }

    if (!options.syncOnly && !resumableMdx && !pictureRepairDraft) {
      const model = env.OLLAMA_MODEL?.trim() ?? "";
      const runtime = await deps.ensureModel({ model });
      repairs = [...repairs, ...runtime.repairs];
      for (const repair of runtime.repairs) {
        await persistAndEmit("preflight", "repaired", repair);
      }
      if (!runtime.ok) return await humanRequired("preflight", runtime.category);
    }
    await persistAndEmit("preflight", "progress", "Local checks passed.");
    if (options.signal?.aborted) return await cancelled("preflight");

    if (options.syncOnly && !resumableMdx) {
      const drafts = await new LocalDraftRepository({ contentRoot }).list();
      draftRef = drafts[0]?.ref;
      if (!draftRef) return await humanRequired("local-validation", "validation-failed");
      resumableMdx = (await new LocalDraftRepository({ contentRoot }).read(draftRef)).mdx;
    }

    if (!resumableMdx) {
      let queue: QueueStory[] = [];
      let generated = pictureRepairDraft;
      const repairingPictures = Boolean(generated && selectedStory && draftRef);
      if (!generated) {
        const savedQueue = await readQueue(queuePath);
        queue = savedQueue.stories;
        if (!options.queueOnly) {
          const discovered = await deps.discover({ contentRoot });
          if (discovered.successCount > 0) {
            const written = await writeTrendingQueue([...queue, ...discovered.stories], { contentRoot });
            queue = written.stories;
          } else if (!savedQueue.valid || queue.length === 0) {
            return await humanRequired("discovery", "discovery-unavailable");
          }
        } else if (!savedQueue.valid || queue.length === 0) {
          return await humanRequired("discovery", "discovery-unavailable");
        }
        selectedStory = queue[0];
        if (!selectedStory) return await humanRequired("discovery", "discovery-unavailable");
        await persistAndEmit("discovery", "progress", "Selected a recent source story.");
        if (options.signal?.aborted) return await cancelled("discovery");

        let validationReason: string | undefined;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            generated = await deps.generate(selectedStory, {
              model: env.OLLAMA_MODEL?.trim() ?? "",
              attempt,
              validationReason,
            });
            await persistAndEmit("generation", "progress", "The local article draft is written.", attempt);
            break;
          } catch (error) {
            const validation = error instanceof GenerationValidationError;
            validationReason = validation ? error.category : "local-model-unavailable";
            if (attempt < 3) {
              await persistAndEmit(
                "generation",
                "retrying",
                validation ? "The draft needed correction; regenerating from the original source." : "The local model stopped responding; trying again.",
                attempt + 1,
                validation ? "generation-invalid" : "generation-unavailable",
              );
              continue;
            }
            return await humanRequired(
              "generation",
              validation ? "generation-invalid" : "generation-unavailable",
              attempt,
            );
          }
        }
      }
      if (!generated) return await humanRequired("generation", "generation-invalid", 3);
      if (!selectedStory) return await humanRequired("discovery", "discovery-unavailable");
      await persistAndEmit("article-normalization", "progress", "Article formatting was checked and corrected.");
      if (options.signal?.aborted) return await cancelled("article-normalization");

      const photoResult = await deps.findPhotos(selectedStory, generated.tags);
      imageCount = photoResult.photos.length;
      await persistAndEmit(
        "image-selection",
        "progress",
        photoResult.ok ? `${imageCount} related credited pictures are ready.` : `${imageCount} suitable credited pictures were found.`,
      );

      let mdx: string;
      try {
        mdx = buildDraftMdx(selectedStory, generated, true, photoResult.photos);
      } catch {
        return await humanRequired("article-normalization", "generation-invalid");
      }
      const frontmatter = matter(mdx).data as { slug?: unknown };
      if (typeof frontmatter.slug !== "string" || !isCategorySlug(selectedStory.category)) {
        return await humanRequired("article-normalization", "validation-failed");
      }
      draftRef = { category: selectedStory.category, filename: `${frontmatter.slug}.mdx` };
      const draftPath = path.join(contentRoot, "drafts", draftRef.category, draftRef.filename);
      await mkdir(path.dirname(draftPath), { recursive: true });
      if (repairingPictures) {
        const existing = await readFile(draftPath, "utf8");
        if (draftHash && contentHash(existing) !== draftHash) {
          return await humanRequired("local-validation", "content-conflict");
        }
        const temporary = `${draftPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, mdx, "utf8");
        await import("node:fs/promises").then(({ rename }) => rename(temporary, draftPath));
      } else {
        try {
          await writeFile(draftPath, mdx, { encoding: "utf8", flag: "wx" });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const existing = await readFile(draftPath, "utf8");
          if (existing !== mdx) return await humanRequired("local-validation", "content-conflict");
        }
      }
      draftHash = contentHash(mdx);
      if (!repairingPictures) {
        await writeQueueBytes(queuePath, queue.filter((candidate) => candidate.sourceUrl !== selectedStory!.sourceUrl));
      }
      resumableMdx = mdx;
      if (!photoResult.ok) return await humanRequired("image-selection", "insufficient-images");
    }

    if (!draftRef || !resumableMdx) return await humanRequired("local-validation", "validation-failed");
    const validation = await validateDeliverable(draftRef, resumableMdx);
    if (!validation.ok) return await humanRequired("local-validation", validation.category);
    imageCount = validation.imageCount;
    await persistAndEmit("local-validation", "progress", "The article and picture credits passed local checks.");
    if (options.signal?.aborted) return await cancelled("local-validation");

    if (!syncEnabled) {
      const message = "The validated article was saved locally for review.";
      await persistAndEmit("delivery-verification", "completed", message, 1, undefined, "not-delivered");
      return { runId, status: "completed", stage: "delivery-verification", draftRef, imageCount, repairs, message, deliveryStatus: "not-delivered" };
    }

    await persistAndEmit("dashboard-delivery", "progress", "Sending the validated draft to the review dashboard.");
    const delivery = await deps.deliver(contentRoot, draftRef, env);
    if (delivery.status === "conflict" || delivery.status === "humanRequired" || delivery.status === "retryableFailure") {
      return await humanRequired("dashboard-delivery", delivery.category, delivery.attempts);
    }
    await persistAndEmit("delivery-verification", "completed", "Draft delivered and verified. Review it, then click Publish.", delivery.attempts || 1, undefined, "delivered");
    return {
      runId, status: "completed", stage: "delivery-verification", draftRef, imageCount,
      repairs, message: "Draft delivered and verified. Review it, then click Publish.", deliveryStatus: "delivered",
    };
  } catch (error) {
    return await humanRequired(
      previous?.stage ?? "preflight",
      error instanceof LocalRuntimeError ? error.category : "unknown",
    );
  } finally {
    await lock?.release();
  }
}
