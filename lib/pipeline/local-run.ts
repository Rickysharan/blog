import { access, appendFile, constants, mkdir, readFile, rename, rm, statfs, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { isCategorySlug, type CategorySlug } from "@/lib/config/categories";
import { GitHubDraftRepository } from "@/lib/drafts/github-repository";
import { GitDataClientError } from "@/lib/github/git-data-client";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import type { DraftDocument, DraftRef } from "@/lib/drafts/types";
import { parseArticleFile } from "@/lib/content/schema";
import { validateDeliverable } from "@/lib/pipeline/deliverable";
import { fetchTrendingStories, writeTrendingQueue } from "@/lib/pipeline/fetch";
import { fetchSourceContext } from "@/lib/pipeline/source-context";
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
  enrichSource(
    story: QueueStory,
    options: { signal?: AbortSignal },
  ): Promise<string | undefined>;
  generate(
    story: QueueStory,
    options: {
      model: string;
      attempt: number;
      validationReason?: string;
      sourceContext?: string;
      signal?: AbortSignal;
    },
  ): Promise<GeneratedDraftContent>;
  findPhotos(
    story: QueueStory,
    tags: string[],
    options: { sourceContext?: string },
  ): Promise<PhotoSearchResult>;
  deliver(
    contentRoot: string,
    ref: DraftRef,
    env: Record<string, string | undefined>,
    validatedMdx: string,
  ): Promise<DeliveryResult>;
  preflight?(options: {
    contentRoot: string;
    env: Record<string, string | undefined>;
    syncEnabled: boolean;
  }): Promise<{ ok: true } | { ok: false; category: RecoveryCategory }>;
  wait?(milliseconds: number): Promise<void>;
  now(): Date;
  runId(): string;
}

export interface RunLocalWriterOptions {
  projectRoot?: string;
  contentRoot?: string;
  auditRoot?: string;
  env?: Record<string, string | undefined>;
  sync?: boolean;
  queueOnly?: boolean;
  syncOnly?: boolean;
  localOnly?: boolean;
  newRun?: boolean;
  category?: CategorySlug;
  onEvent?: (event: LocalWriterEvent) => void | Promise<void>;
  signal?: AbortSignal;
  dependencies?: Partial<LocalRunDependencies>;
}

const defaultDependencies: LocalRunDependencies = {
  acquireLock: (options) => acquireWriterLock(options),
  ensureModel: (options) => ensureLocalModel(options),
  discover: (options) => fetchTrendingStories(options),
  enrichSource: (story, options) => fetchSourceContext(story, {
    signal: options.signal,
  }),
  generate: (story, options) => requestOllamaDraft(story, {
    model: options.model,
    validationReason: options.validationReason,
    sourceContext: options.sourceContext,
    signal: options.signal,
  }),
  findPhotos: (story, tags, options) =>
    findRequiredArticlePhotos(
      story,
      tags,
      { sourceContext: options.sourceContext },
    ),
  async deliver(_contentRoot, ref, env, validatedMdx) {
    const targetConfig = await resolveLocalGitHubTarget(env);
    const article = parseArticleFile(validatedMdx, ref.filename);
    const document: DraftDocument = {
      ref,
      title: article.title,
      date: article.date,
      excerpt: article.excerpt,
      category: article.category,
      version: contentHash(validatedMdx),
      mdx: validatedMdx,
      article,
    };
    return deliverDraft(
      { read: async () => document },
      new GitHubDraftRepository(targetConfig),
      ref,
    );
  },
  async preflight({ contentRoot, env, syncEnabled }) {
    try {
      const draftsRoot = path.join(contentRoot, "drafts");
      await mkdir(draftsRoot, { recursive: true });
      await access(draftsRoot, constants.W_OK);
      const probe = path.join(draftsRoot, `.omnilede-write-check-${process.pid}-${crypto.randomUUID()}`);
      await writeFile(probe, "ok", { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rm(probe, { force: true });
      const disk = await statfs(draftsRoot);
      if (Number(disk.bavail) * Number(disk.bsize) < 100 * 1024 * 1024) {
        return { ok: false as const, category: "disk-space" as const };
      }
      if (syncEnabled) {
        const target = await resolveLocalGitHubTarget(env);
        await new GitHubDraftRepository(target).list();
      }
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, category: preflightCategory(error) };
    }
  },
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
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
    case "configuration": return "The dashboard repository settings need attention before writing starts.";
    case "credentials": return "Sign in to GitHub locally before writing starts.";
    case "disk-space": return "The draft folder is not writable or this Mac needs more free disk space.";
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

function storyForCategory(
  stories: QueueStory[],
  category?: CategorySlug,
): QueueStory | undefined {
  return category
    ? stories.find((story) => story.category === category)
    : stories[0];
}

function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function preflightCategory(error: unknown): RecoveryCategory {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current instanceof GitDataClientError) return current.category;
    current = current.cause;
  }
  const message = error instanceof Error ? error.message : "";
  if (/Sign in|GITHUB_TOKEN|credential/i.test(message)) return "credentials";
  if (/GITHUB_REPOSITORY|GITHUB_BRANCH|repository and branch/i.test(message)) return "configuration";
  return "disk-space";
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
  let requestedCategory = isCategorySlug(options.category ?? "") ? options.category : undefined;
  const syncEnabled = !options.localOnly && Boolean(
    options.sync || options.syncOnly || env.LOCAL_WRITER_SYNC === "true",
  );
  await mkdir(auditRoot, { recursive: true });
  let lock: WriterLock | undefined;

  const ephemeralTerminal = async (
    runId: string,
    status: "human-required" | "cancelled",
    category: RecoveryCategory,
    message: string,
  ): Promise<LocalRunResult> => {
    const event = {
      runId,
      stage: "preflight" as const,
      attempt: 1,
      percent: stagePercent.preflight,
      status,
      message,
      imageCount: 0,
      repairs: [],
      category: requestedCategory,
      errorCategory: category,
    } as LocalWriterEvent;
    await options.onEvent?.(event);
    return {
      runId,
      status,
      stage: "preflight",
      imageCount: 0,
      repairs: [],
      message,
      errorCategory: status === "cancelled" ? "cancelled" : category,
      deliveryStatus: "not-delivered",
      resumable: true,
    } as LocalRunResult;
  };

  const initialRunId = deps.runId();
  if (options.category !== undefined && !isCategorySlug(options.category)) {
    return ephemeralTerminal(
      initialRunId,
      "human-required",
      "configuration",
      "Choose one of OmniLede's supported article categories.",
    );
  }
  if (options.signal?.aborted) {
    return ephemeralTerminal(
      initialRunId,
      "cancelled",
      "cancelled",
      "The run was cancelled before it changed any saved work.",
    );
  }
  try {
    lock = await deps.acquireLock({ lockPath: path.join(auditRoot, "local-writer.lock") });
  } catch (error) {
    const category = error instanceof LocalRuntimeError
      ? error.category
      : (error as { category?: RecoveryCategory }).category ?? "unknown";
    return ephemeralTerminal(initialRunId, "human-required", category, safeTerminalMessage(category));
  }

  let previous: LocalRunState | null = null;
  try {
    try {
      previous = await loadRunState(statePath);
    } catch {
      await archiveInvalidRunState(statePath, deps.now());
    }
    if (previous?.status === "completed") {
      const stamp = deps.now().toISOString().replace(/[-:.]/g, "");
      await rename(statePath, path.join(auditRoot, `completed-run-${stamp}-${crypto.randomUUID()}.json`));
      previous = null;
    }
    if (options.newRun && previous) {
      await lock.release();
      lock = undefined;
      return ephemeralTerminal(
        previous.runId,
        "human-required",
        "content-conflict",
        "Resume the saved article before starting a different one.",
      );
    }
    const savedCategoryCandidate = previous?.requestedCategory ??
      previous?.selectedStory?.category ??
      previous?.draftRef?.category;
    const savedCategory = isCategorySlug(savedCategoryCandidate ?? "")
      ? savedCategoryCandidate as CategorySlug
      : undefined;
    if (requestedCategory && savedCategory && requestedCategory !== savedCategory) {
      await lock.release();
      lock = undefined;
      return ephemeralTerminal(
        previous!.runId,
        "human-required",
        "content-conflict",
        "Resume the saved category before starting a different one.",
      );
    }
    requestedCategory = savedCategory ?? requestedCategory;
  } catch {
    await lock?.release();
    lock = undefined;
    return ephemeralTerminal(initialRunId, "human-required", "unknown", safeTerminalMessage("unknown"));
  }

  const startedAt = previous?.startedAt ?? deps.now().toISOString();
  const runId = previous?.runId ?? initialRunId;
  let repairs = [...(previous?.repairs ?? []), ...lock.repairs];
  let draftRef = previous?.draftRef as DraftRef | undefined;
  let draftHash = previous?.draftHash;
  let imageCount = previous?.imageCount ?? 0;
  let selectedStory = stateStory(previous);
  let generatedDraft = previous?.generatedDraft;
  let currentStage: LocalRunStage = previous?.stage ?? "preflight";

  const persistAndEmit = async (
    stage: LocalRunStage,
    status: LocalWriterEvent["status"],
    message: string,
    attempt = 1,
    errorCategory?: RecoveryCategory,
    deliveryStatus: LocalRunState["deliveryStatus"] = "pending",
  ) => {
    currentStage = stage;
    const safeAttempt = Math.max(1, Math.min(3, attempt));
    const terminalStatus = status === "completed" ? "completed" :
      status === "cancelled" ? "cancelled" :
      status === "human-required" || status === "failed" ? "human-required" : "running";
    const state: LocalRunState = {
      version: 1,
      runId,
      status: terminalStatus,
      stage,
      attempt: safeAttempt,
      percent: stagePercent[stage],
      message,
      draftRef,
      draftHash,
      imageCount,
      repairs,
      errorCategory,
      deliveryStatus,
      requestedCategory,
      selectedStory,
      generatedDraft,
      startedAt,
      updatedAt: deps.now().toISOString(),
    };
    await saveRunState(statePath, state);
    const base = {
      runId,
      stage,
      attempt: safeAttempt,
      percent: stagePercent[stage],
      status,
      message,
      draftRef,
      imageCount,
      repairs,
      category: requestedCategory,
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

    const preflight = await deps.preflight!({ contentRoot, env, syncEnabled });
    if (!preflight.ok) return await humanRequired("preflight", preflight.category);

    let resumableMdx: string | undefined;
    let pictureRepairDraft: GeneratedDraftContent | undefined;
    let sourceContext: string | undefined;
    if (draftRef && previous?.deliveryStatus !== "delivered") {
      try {
        resumableMdx = await readFile(
          path.join(contentRoot, "drafts", draftRef.category, draftRef.filename),
          "utf8",
        );
        const currentHash = contentHash(resumableMdx);
        if (!draftHash || currentHash !== draftHash) {
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

    if (!options.syncOnly && !resumableMdx && !pictureRepairDraft && !generatedDraft) {
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
      const savedQueue = await readQueue(queuePath);
      let queue: QueueStory[] = savedQueue.stories;
      let generated = pictureRepairDraft ?? generatedDraft;
      const repairingPictures = Boolean(generated && selectedStory && draftRef);
      if (!generated) {
        if (!selectedStory) {
          if (!options.queueOnly) {
            for (let attempt = 1; attempt <= 3; attempt += 1) {
              const discovered = await deps.discover({ contentRoot });
              if (discovered.successCount > 0) {
                const written = await writeTrendingQueue([...queue, ...discovered.stories], { contentRoot });
                queue = written.stories;
              }
              selectedStory = storyForCategory(queue, requestedCategory);
              if (selectedStory) break;
              if (attempt < 3) {
                await persistAndEmit(
                  "discovery",
                  "retrying",
                  "Recent sources were unavailable; trying discovery again.",
                  attempt + 1,
                  "discovery-unavailable",
                );
                await deps.wait!(Math.min(250 * 2 ** (attempt - 1), 1_000));
              }
            }
          }
          if (!savedQueue.valid && queue.length === 0) {
            return await humanRequired("discovery", "discovery-unavailable", 3);
          }
          selectedStory ??= storyForCategory(queue, requestedCategory);
        }
        if (!selectedStory) return await humanRequired("discovery", "discovery-unavailable");
        await persistAndEmit("discovery", "progress", "Selected a recent source story.");
        if (options.signal?.aborted) return await cancelled("discovery");

        sourceContext = await deps.enrichSource(selectedStory, {
          signal: options.signal,
        });
        if (options.signal?.aborted) return await cancelled("discovery");

        let validationReason: string | undefined;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            generated = await deps.generate(selectedStory, {
              model: env.OLLAMA_MODEL?.trim() ?? "",
              attempt,
              validationReason,
              sourceContext,
              signal: options.signal,
            });
            generatedDraft = generated;
            await persistAndEmit("generation", "progress", "The local article draft is written.", attempt);
            break;
          } catch (error) {
            if (options.signal?.aborted) return await cancelled("generation");
            const validation = error instanceof GenerationValidationError;
            validationReason = validation ? error.category : "local-model-unavailable";
            if (attempt < 3) {
              if (!validation) {
                const runtime = await deps.ensureModel({ model: env.OLLAMA_MODEL?.trim() ?? "" });
                repairs = [...repairs, ...runtime.repairs];
                for (const repair of runtime.repairs) {
                  await persistAndEmit("generation", "repaired", repair, attempt);
                }
                if (!runtime.ok) return await humanRequired("generation", runtime.category, attempt);
              }
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

      if (!sourceContext) {
        sourceContext = await deps.enrichSource(selectedStory, {
          signal: options.signal,
        });
      }
      if (options.signal?.aborted) return await cancelled("image-selection");

      const photoResult = await deps.findPhotos(
        selectedStory,
        generated.tags,
        { sourceContext },
      );
      imageCount = photoResult.photos.length;
      if (options.signal?.aborted) return await cancelled("image-selection");

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
      generatedDraft = undefined;
      await persistAndEmit(
        "image-selection",
        "progress",
        photoResult.ok ? `${imageCount} related credited pictures are ready.` : `${imageCount} suitable credited pictures were found.`,
      );
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

    if (selectedStory) {
      const currentQueue = await readQueue(queuePath);
      if (currentQueue.valid) {
        await writeQueueBytes(
          queuePath,
          currentQueue.stories.filter((candidate) => candidate.sourceUrl !== selectedStory!.sourceUrl),
        );
      }
    }

    if (!syncEnabled) {
      const message = `“${validation.article.title}” was validated and saved locally for review.`;
      await persistAndEmit("delivery-verification", "completed", message, 1, undefined, "not-delivered");
      return { runId, status: "completed", stage: "delivery-verification", draftRef, imageCount, repairs, message, deliveryStatus: "not-delivered" };
    }

    await persistAndEmit("dashboard-delivery", "progress", "Sending the validated draft to the review dashboard.");
    if (options.signal?.aborted) return await cancelled("dashboard-delivery");
    const currentBytes = await readFile(
      path.join(contentRoot, "drafts", draftRef.category, draftRef.filename),
      "utf8",
    );
    if (currentBytes !== resumableMdx || contentHash(currentBytes) !== draftHash) {
      return await humanRequired("local-validation", "content-conflict");
    }
    const delivery = await deps.deliver(contentRoot, draftRef, env, resumableMdx);
    if (delivery.status === "conflict" || delivery.status === "humanRequired" || delivery.status === "retryableFailure") {
      return await humanRequired("dashboard-delivery", delivery.category, delivery.attempts);
    }
    const completionMessage = `“${validation.article.title}” was delivered and verified. Review it, then click Publish.`;
    await persistAndEmit("delivery-verification", "completed", completionMessage, delivery.attempts || 1, undefined, "delivered");
    return {
      runId, status: "completed", stage: "delivery-verification", draftRef, imageCount,
      repairs, message: completionMessage, deliveryStatus: "delivered",
    };
  } catch (error) {
    return await humanRequired(
      currentStage,
      error instanceof LocalRuntimeError ? error.category : "unknown",
    );
  } finally {
    await lock?.release();
  }
}
