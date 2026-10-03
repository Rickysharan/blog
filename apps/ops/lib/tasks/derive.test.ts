import { describe, expect, it } from "vitest";

import type { EditorialInventory } from "@omnilede/editorial";

import { deriveTodayTasks } from "./derive";

const inventory: EditorialInventory = {
  source: "github",
  items: [
    { kind: "draft", category: "sports", filename: "waiting.mdx", slug: "waiting", date: "2026-10-02T00:00:00.000Z" },
    { kind: "published", category: "anime", filename: "old.mdx", slug: "old", date: "2026-09-01T00:00:00.000Z" },
    { kind: "published", category: "movies", filename: "fresh.mdx", slug: "fresh", date: "2026-10-02T00:00:00.000Z" }
  ]
};

describe("deriveTodayTasks", () => {
  it("derives every required operational evidence type with stable unique keys", () => {
    const input = {
      inventory,
      now: new Date("2026-10-03T12:00:00.000Z"),
      writerRun: {
        runId: "run-7",
        status: "human-required" as const,
        category: "finance" as const,
        resumable: true,
        message: "Local model stopped during generation."
      },
      providers: [
        { provider: "google-analytics" as const, state: "disconnected" as const },
        { provider: "google-search-console" as const, state: "connected" as const }
      ],
      seoWarnings: [{ code: "not-indexed", url: "https://omnilede.example/story", detail: "Canonical page is not indexed." }],
      adsense: { state: "setup-required" as const, detail: "Connect AdSense when the site is ready for review." },
      deployment: { state: "failed" as const, id: "deploy-9", url: "https://omnilede.example", detail: "Latest production deploy failed." }
    };

    const first = deriveTodayTasks(input);
    const second = deriveTodayTasks(input);

    expect(second).toEqual(first);
    expect(new Set(first.map(({ evidenceKey }) => evidenceKey)).size).toBe(first.length);
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceKey: "draft:sports:waiting.mdx", kind: "review", category: "sports" }),
      expect.objectContaining({ evidenceKey: "writer:run-7", kind: "writing", category: "finance" }),
      expect.objectContaining({ evidenceKey: "coverage:anime:2026-09-01", kind: "writing", category: "anime" }),
      expect.objectContaining({ evidenceKey: "coverage:politics:none", kind: "writing", category: "politics" }),
      expect.objectContaining({ evidenceKey: "provider:google-analytics", kind: "provider" }),
      expect.objectContaining({ evidenceKey: "seo:not-indexed:https%3A%2F%2Fomnilede.example%2Fstory", kind: "seo" }),
      expect.objectContaining({ evidenceKey: "adsense:setup-required", kind: "provider" }),
      expect.objectContaining({ evidenceKey: "deployment:deploy-9", kind: "maintenance" })
    ]));
    expect(first.some(({ evidenceKey }) => evidenceKey === "coverage:movies:2026-10-02")).toBe(false);
  });

  it("only returns task descriptions and never accepts executable writer or publication callbacks", () => {
    const writer = () => { throw new Error("must not run"); };
    const publish = () => { throw new Error("must not run"); };
    const result = deriveTodayTasks({ inventory: { source: "github", items: [] }, writer, publish } as never);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every(({ state }) => state === "open")).toBe(true);
  });

  it("imports unfinished local daily-plan v1 work as tasks without changing the plan", () => {
    const tasks = deriveTodayTasks({
      inventory: { source: "local", items: [] },
      dailyPlan: {
        version: 1,
        date: "2026-10-03",
        tasks: [
          { category: "anime", reason: "Oldest coverage", outcome: "todo" },
          { category: "movies", reason: "Saved run needs attention", outcome: "attention", runId: "run-2" },
          { category: "sports", reason: "Draft delivered", outcome: "completed", draftRef: { category: "sports", filename: "story.mdx" } }
        ]
      }
    });

    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceKey: "daily-plan:2026-10-03:anime", kind: "writing", category: "anime" }),
      expect.objectContaining({ evidenceKey: "daily-plan:2026-10-03:movies", kind: "writing", category: "movies", priority: 95 })
    ]));
    expect(tasks.some(({ evidenceKey }) => evidenceKey === "daily-plan:2026-10-03:sports")).toBe(false);
    expect(tasks.some(({ evidenceKey }) => evidenceKey.startsWith("coverage:anime:"))).toBe(false);
  });

  it("keeps long evidence URLs distinct while respecting the task-key bound", () => {
    const prefix = `https://omnilede.example/${"same/".repeat(60)}`;
    const tasks = deriveTodayTasks({
      inventory: { source: "github", items: [] },
      seoWarnings: [
        { code: "index", url: `${prefix}first`, detail: "First warning" },
        { code: "index", url: `${prefix}second`, detail: "Second warning" }
      ]
    }).filter(({ kind }) => kind === "seo");

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.evidenceKey).not.toBe(tasks[1]?.evidenceKey);
    expect(tasks.every(({ evidenceKey }) => evidenceKey.length <= 240)).toBe(true);
  });
});
