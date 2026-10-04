import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriterLock } from "@/lib/pipeline/local-runtime";
import { GenerationValidationError, type GeneratedDraftContent } from "@/lib/pipeline/generate";
import { runLocalWriter, type LocalRunDependencies } from "@/lib/pipeline/local-run";
import type { LocalWriterEvent } from "@/lib/pipeline/local-run-types";
import type { QueueStory } from "@/lib/pipeline/types";
import type { ArticlePhoto, PhotoSearchResult } from "@/lib/pipeline/images";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  vi.restoreAllMocks();
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "omnilede-local-run-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "content", "queue"), { recursive: true });
  return root;
}

const story: QueueStory = {
  title: "Baker Mayfield provides a team update",
  source: "Example Outlet",
  sourceUrl: "https://example.com/story",
  date: "2026-09-30T10:00:00.000Z",
  snippet: "Baker Mayfield spoke after the Tampa Bay Buccaneers team session.",
  category: "sports",
};

const reporting = Array.from({ length: 45 }, (_, index) =>
  `reporting${index} describes the confirmed update from the supplied source`).join(" ");
const analysis = Array.from({ length: 40 }, (_, index) =>
  `analysis${index} explains why the confirmed update matters to readers`).join(" ");
const generated: GeneratedDraftContent = {
  title: "Baker Mayfield Provides Team Update",
  excerpt: "A source-grounded summary of the team update.",
  tags: ["Baker Mayfield", "Tampa Bay Buccaneers"],
  body: `## What happened\n\n${reporting}\n\n## Why it matters\n\n${analysis}`,
};

const photos: ArticlePhoto[] = [1, 2].map((id) => ({
  title: `Baker Mayfield ${id}`,
  url: `https://upload.wikimedia.org/photo${id}.jpg`,
  page: `https://commons.wikimedia.org/wiki/File:Baker_Mayfield_${id}.jpg`,
  artist: `Photographer ${id}`,
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
}));

function dependencies(overrides: Partial<LocalRunDependencies> = {}): LocalRunDependencies {
  const lock: WriterLock = { repairs: [], release: vi.fn(async () => undefined) };
  return {
    acquireLock: vi.fn(async () => lock),
    ensureModel: vi.fn(async () => ({ ok: true as const, repairs: [] })),
    discover: vi.fn(async () => ({
      stories: [story], summaries: [], successCount: 1, failureCount: 0, skippedCount: 0,
    })),
    generate: vi.fn(async () => generated),
    findPhotos: vi.fn(async () => ({ ok: true as const, photos, attempts: 1 })),
    deliver: vi.fn(async (_contentRoot, ref) => ({ status: "created" as const, ref, attempts: 1 })),
    preflight: vi.fn(async () => ({ ok: true as const })),
    wait: vi.fn(async () => undefined),
    now: vi.fn(() => new Date("2026-09-30T10:00:00.000Z")),
    runId: vi.fn(() => "run-test-001"),
    ...overrides,
  };
}

async function run(root: string, deps: LocalRunDependencies, events: LocalWriterEvent[] = [], signal?: AbortSignal) {
  return runLocalWriter({
    projectRoot: root,
    contentRoot: path.join(root, "content"),
    auditRoot: path.join(root, ".audit"),
    env: { OLLAMA_MODEL: "qwen2.5:7b", LOCAL_WRITER_SYNC: "true" },
    sync: true,
    dependencies: deps,
    onEvent: (event) => { events.push(event); },
    signal,
  });
}

describe("resumable local writer controller", () => {
  it("runs every successful stage in order and verifies delivery", async () => {
    const root = await temporaryRoot();
    const events: LocalWriterEvent[] = [];
    const result = await run(root, dependencies(), events);

    expect(result).toMatchObject({ status: "completed", deliveryStatus: "delivered", imageCount: 2 });
    expect(events.filter((event) => event.status === "progress" || event.status === "completed").map((event) => event.stage)).toEqual([
      "preflight", "discovery", "generation", "article-normalization",
      "image-selection", "local-validation", "dashboard-delivery", "delivery-verification",
    ]);
  });

  it("corrects generation on the second attempt from the original story", async () => {
    const root = await temporaryRoot();
    const generate = vi.fn()
      .mockRejectedValueOnce(new GenerationValidationError("missing-analysis", "missing heading"))
      .mockResolvedValueOnce(generated);
    const events: LocalWriterEvent[] = [];

    const result = await run(root, dependencies({ generate }), events);

    expect(result.status).toBe("completed");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]?.[0]).toEqual(story);
    expect(generate.mock.calls[1]?.[0]).toEqual(story);
    expect(events).toContainEqual(expect.objectContaining({ status: "retrying", stage: "generation", attempt: 2 }));
  });

  it("reports an Ollama restart as a repair", async () => {
    const root = await temporaryRoot();
    const events: LocalWriterEvent[] = [];
    await run(root, dependencies({
      ensureModel: vi.fn(async () => ({ ok: true as const, repairs: ["Ollama stopped; restarted locally (1/2)"] })),
    }), events);
    expect(events).toContainEqual(expect.objectContaining({
      status: "repaired",
      stage: "preflight",
      message: "Ollama stopped; restarted locally (1/2)",
    }));
  });

  it("uses a valid saved queue when every live feed fails", async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, "content/queue/trending.json"), JSON.stringify([story]), "utf8");
    const generate = vi.fn(async () => generated);
    const deps = dependencies({
      discover: vi.fn(async () => ({ stories: [], summaries: [], successCount: 0, failureCount: 3, skippedCount: 0 })),
      generate,
    });

    expect((await run(root, deps)).status).toBe("completed");
    expect(generate).toHaveBeenCalledWith(story, expect.anything());
  });

  it.each([
    { name: "empty", bytes: "[]" },
    { name: "corrupt", bytes: "{broken json" },
  ])("preserves an $name saved queue when all feeds fail", async ({ bytes }) => {
    const root = await temporaryRoot();
    const queuePath = path.join(root, "content/queue/trending.json");
    await writeFile(queuePath, bytes, "utf8");
    const deps = dependencies({
      discover: vi.fn(async () => ({ stories: [], summaries: [], successCount: 0, failureCount: 3, skippedCount: 0 })),
    });

    const result = await run(root, deps);

    expect(result).toMatchObject({ status: "human-required", errorCategory: "discovery-unavailable" });
    await expect(readFile(queuePath, "utf8")).resolves.toBe(bytes);
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("preserves a local text draft and blocks upload when fewer than two images pass", async () => {
    const root = await temporaryRoot();
    const onePhoto: PhotoSearchResult = {
      ok: false, category: "insufficient-images", message: "Only one photo was found.", photos: [photos[0]], attempts: 2,
    };
    const deps = dependencies({ findPhotos: vi.fn(async () => onePhoto) });

    const result = await run(root, deps);

    expect(result).toMatchObject({ status: "human-required", errorCategory: "insufficient-images", imageCount: 1 });
    expect(result.draftRef).toBeDefined();
    await expect(readFile(path.join(root, "content/drafts", result.draftRef!.category, result.draftRef!.filename), "utf8")).resolves.toContain("## Why it matters");
    expect(deps.deliver).not.toHaveBeenCalled();
  });

  it("resumes an unchanged picture-blocked draft without regenerating the article", async () => {
    const root = await temporaryRoot();
    const onePhoto: PhotoSearchResult = {
      ok: false, category: "insufficient-images", message: "Only one photo was found.", photos: [photos[0]], attempts: 2,
    };
    const first = dependencies({ findPhotos: vi.fn(async () => onePhoto) });
    expect((await run(root, first)).status).toBe("human-required");

    const generate = vi.fn(async () => generated);
    const discover = vi.fn(async () => ({
      stories: [story], summaries: [], successCount: 1, failureCount: 0, skippedCount: 0,
    }));
    const second = dependencies({ generate, discover });
    const resumed = await run(root, second);

    expect(resumed).toMatchObject({ status: "completed", deliveryStatus: "delivered", imageCount: 2 });
    expect(generate).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
    expect(second.findPhotos).toHaveBeenCalledTimes(1);
  });

  it("resumes a preserved draft without generating another article", async () => {
    const root = await temporaryRoot();
    const firstDeps = dependencies({
      deliver: vi.fn(async (_contentRoot, ref) => ({
        status: "retryableFailure" as const, ref, attempts: 3, category: "network" as const, message: "The dashboard could not be reached.",
      })),
    });
    expect((await run(root, firstDeps)).status).toBe("human-required");

    const generate = vi.fn(async () => generated);
    const secondDeps = dependencies({ generate });
    const resumed = await run(root, secondDeps);

    expect(resumed).toMatchObject({ status: "completed", deliveryStatus: "delivered" });
    expect(generate).not.toHaveBeenCalled();
    expect(secondDeps.discover).not.toHaveBeenCalled();
  });

  it("stops after the initial generation attempt and two retries", async () => {
    const root = await temporaryRoot();
    const generate = vi.fn(async () => {
      throw new GenerationValidationError("invalid-json", "bad output with github_pat_secretvalue");
    });
    const events: LocalWriterEvent[] = [];
    const result = await run(root, dependencies({ generate }), events);

    expect(result).toMatchObject({ status: "human-required", errorCategory: "generation-invalid" });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(JSON.stringify({ result, events })).not.toContain("github_pat_secretvalue");
    expect(await readFile(path.join(root, ".audit/desktop-writer.log"), "utf8")).not.toContain("github_pat_secretvalue");
  });

  it("cancels without starting discovery or generation", async () => {
    const root = await temporaryRoot();
    const controller = new AbortController();
    controller.abort();
    const deps = dependencies();

    const result = await run(root, deps, [], controller.signal);

    expect(result).toMatchObject({ status: "cancelled", resumable: true, errorCategory: "cancelled" });
    expect(deps.discover).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("does not mutate shared state when another writer owns the lock", async () => {
    const root = await temporaryRoot();
    const first = dependencies({
      deliver: vi.fn(async (_contentRoot, ref) => ({
        status: "retryableFailure" as const,
        ref,
        attempts: 3,
        category: "network" as const,
        message: "offline",
      })),
    });
    await run(root, first);
    const statePath = path.join(root, ".audit/current-run.json");
    const before = await readFile(statePath, "utf8");
    const result = await run(root, dependencies({
      acquireLock: vi.fn(async () => {
        const error = new Error("already running") as Error & { category: "already-running" };
        error.category = "already-running";
        error.name = "LocalRuntimeError";
        throw error;
      }),
    }));
    expect(result).toMatchObject({ status: "human-required", errorCategory: "already-running" });
    await expect(readFile(statePath, "utf8")).resolves.toBe(before);
  });

  it("requires manual reconciliation before repairing a hashless draft", async () => {
    const root = await temporaryRoot();
    const onePhoto: PhotoSearchResult = {
      ok: false, category: "insufficient-images", message: "one", photos: [photos[0]], attempts: 2,
    };
    const firstResult = await run(root, dependencies({ findPhotos: vi.fn(async () => onePhoto) }));
    const statePath = path.join(root, ".audit/current-run.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    delete state.draftHash;
    await writeFile(statePath, `${JSON.stringify(state)}\n`, "utf8");
    const draftPath = path.join(root, "content/drafts", firstResult.draftRef!.category, firstResult.draftRef!.filename);
    const edited = (await readFile(draftPath, "utf8")).replace("OmniLede Editorial", "Human Editor");
    await writeFile(draftPath, edited, "utf8");

    const second = dependencies();
    const result = await run(root, second);
    expect(result).toMatchObject({ status: "human-required", errorCategory: "content-conflict" });
    await expect(readFile(draftPath, "utf8")).resolves.toBe(edited);
    expect(second.findPhotos).not.toHaveBeenCalled();
  });

  it("starts a fresh run after a completed article", async () => {
    const root = await temporaryRoot();
    const runId = vi.fn().mockReturnValueOnce("run-one").mockReturnValueOnce("run-two");
    await run(root, dependencies({ runId }));
    const generate = vi.fn(async () => ({ ...generated, title: "A Different Team Update" }));
    const nextStory = { ...story, title: "A different team update", sourceUrl: "https://example.com/story-two" };
    const second = await run(root, dependencies({
      runId,
      generate,
      discover: vi.fn(async () => ({
        stories: [nextStory], summaries: [], successCount: 1, failureCount: 0, skippedCount: 0,
      })),
    }));
    expect(second.runId).toBe("run-two");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries discovery twice before requiring a person", async () => {
    const root = await temporaryRoot();
    const discover = vi.fn()
      .mockResolvedValueOnce({ stories: [], summaries: [], successCount: 0, failureCount: 3, skippedCount: 0 })
      .mockResolvedValueOnce({ stories: [], summaries: [], successCount: 0, failureCount: 3, skippedCount: 0 })
      .mockResolvedValueOnce({ stories: [story], summaries: [], successCount: 1, failureCount: 2, skippedCount: 0 });
    const result = await run(root, dependencies({ discover }));
    expect(result.status).toBe("completed");
    expect(discover).toHaveBeenCalledTimes(3);
  });

  it("repairs Ollama after a transport generation failure", async () => {
    const root = await temporaryRoot();
    const generate = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(generated);
    const ensureModel = vi.fn(async () => ({ ok: true as const, repairs: [] }));
    const result = await run(root, dependencies({ generate, ensureModel }));
    expect(result.status).toBe("completed");
    expect(ensureModel).toHaveBeenCalledTimes(2);
  });

  it("does not deliver bytes changed after local validation", async () => {
    const root = await temporaryRoot();
    const deliver = vi.fn(async (_contentRoot, ref) => ({ status: "created" as const, ref, attempts: 1 }));
    const events: LocalWriterEvent[] = [];
    const result = await runLocalWriter({
      projectRoot: root,
      contentRoot: path.join(root, "content"),
      auditRoot: path.join(root, ".audit"),
      env: { OLLAMA_MODEL: "qwen2.5:7b", LOCAL_WRITER_SYNC: "true" },
      sync: true,
      dependencies: dependencies({ deliver }),
      onEvent: async (event) => {
        events.push(event);
        if (event.stage === "local-validation" && event.status === "progress" && event.draftRef) {
          const draftPath = path.join(root, "content/drafts", event.draftRef.category, event.draftRef.filename);
          await writeFile(draftPath, `${await readFile(draftPath, "utf8")}\n{\n  1 + 1\n}\n`, "utf8");
        }
      },
    });
    expect(result).toMatchObject({ status: "human-required", errorCategory: "content-conflict" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("reports a zero-create remote conflict without corrupting run state", async () => {
    const root = await temporaryRoot();
    const result = await run(root, dependencies({
      deliver: vi.fn(async (_contentRoot, ref) => ({
        status: "conflict" as const,
        ref,
        attempts: 0,
        category: "content-conflict" as const,
        message: "different",
      })),
    }));
    expect(result).toMatchObject({ status: "human-required", errorCategory: "content-conflict" });
    const state = JSON.parse(await readFile(path.join(root, ".audit/current-run.json"), "utf8"));
    expect(state.attempt).toBe(1);
  });

  it("resumes a durably checkpointed generated article after interruption", async () => {
    const root = await temporaryRoot();
    let interrupted = false;
    const controller = new AbortController();
    const firstDeps = dependencies();
    const first = await runLocalWriter({
      projectRoot: root,
      contentRoot: path.join(root, "content"),
      auditRoot: path.join(root, ".audit"),
      env: { OLLAMA_MODEL: "qwen2.5:7b", LOCAL_WRITER_SYNC: "true" },
      sync: true,
      dependencies: firstDeps,
      signal: controller.signal,
      onEvent(event) {
        if (!interrupted && event.stage === "generation" && event.status === "progress") {
          interrupted = true;
          controller.abort();
        }
      },
    });
    expect(first.status).toBe("cancelled");
    const state = JSON.parse(await readFile(path.join(root, ".audit/current-run.json"), "utf8"));
    expect(state.generatedDraft).toMatchObject({ title: generated.title });

    const generate = vi.fn(async () => generated);
    const discover = vi.fn();
    const resumed = await run(root, dependencies({ generate, discover }));
    expect(resumed.status).toBe("completed");
    expect(generate).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
  });

  it("stops before model work when a delivery preflight is not configured", async () => {
    const root = await temporaryRoot();
    const deps = dependencies({
      preflight: vi.fn(async () => ({ ok: false as const, category: "configuration" as const })),
    });
    const result = await run(root, deps);
    expect(result).toMatchObject({ status: "human-required", errorCategory: "configuration" });
    expect(deps.ensureModel).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });
});
