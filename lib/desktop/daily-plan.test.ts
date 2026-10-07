import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDailyPlanSnapshot,
  readDailyPlanV1,
  recordDailyPlanRun,
  replaceDailyPlanTask,
} from "@/lib/desktop/daily-plan";
import type { LocalRunResult } from "@/lib/pipeline/local-run-types";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "omnilede-daily-plan-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

function articleMdx(slug: string, category: string, date: string): string {
  return `---
title: ${slug} title
slug: ${slug}
date: ${date}
category: ${category}
tags:
  - reporting
author: OmniLede Editorial
excerpt: A valid daily planning fixture.
coverImage: /images/articles/${category}.svg
readTime: 3
sourceName: Example Newsroom
sourceUrl: https://example.com/${slug}
---

Fixture body.
`;
}

async function writeContent(
  contentRoot: string,
  directory: "articles" | "drafts",
  category: string,
  slug: string,
  date: string,
): Promise<string> {
  const folder = path.join(contentRoot, directory, category);
  await mkdir(folder, { recursive: true });
  const filename = `${slug}.mdx`;
  await writeFile(path.join(folder, filename), articleMdx(slug, category, date), "utf8");
  return filename;
}

function input(root: string, now = new Date("2026-10-02T09:00:00+01:00")) {
  return {
    contentRoot: path.join(root, "content"),
    auditRoot: path.join(root, ".audit"),
    env: {},
    now,
  };
}

function completedResult(category: string, filename: string): LocalRunResult {
  return {
    runId: "run-001",
    status: "completed",
    stage: "delivery-verification",
    draftRef: { category, filename },
    imageCount: 2,
    repairs: [],
    message: "Draft ready",
    deliveryStatus: "not-delivered",
  };
}

describe("desktop daily plan", () => {
  it("reads an existing v1 plan for Studio import without rewriting a byte", async () => {
    const root = await temporaryRoot();
    const pathname = path.join(root, ".audit", "daily-plans", "2026-10-02.json");
    const bytes = JSON.stringify({
      version: 1,
      date: "2026-10-02",
      createdAt: "2026-10-02T08:00:00.000Z",
      updatedAt: "2026-10-02T08:00:00.000Z",
      tasks: ["anime", "movies", "sports"].map((category, index) => ({
        category,
        selectedAt: `2026-10-02T08:0${index}:00.000Z`,
        reason: `Task ${index + 1}`,
        outcome: "todo"
      }))
    }, null, 4) + "\n\n";
    await mkdir(path.dirname(pathname), { recursive: true });
    await writeFile(pathname, bytes, "utf8");

    const imported = await readDailyPlanV1({ auditRoot: path.join(root, ".audit"), date: "2026-10-02" });

    expect(imported?.tasks).toHaveLength(3);
    await expect(readFile(pathname, "utf8")).resolves.toBe(bytes);
  });

  it("ranks oldest coverage, then lower count, and keeps the same three tasks all day", async () => {
    const root = await temporaryRoot();
    const contentRoot = path.join(root, "content");
    await writeContent(contentRoot, "articles", "anime", "anime-new", "2026-10-01");
    await writeContent(contentRoot, "articles", "movies", "movies-old", "2026-09-01");
    await writeContent(contentRoot, "articles", "politics", "politics-old", "2026-09-01");
    await writeContent(contentRoot, "articles", "sports", "sports-older", "2026-08-01");
    await writeContent(contentRoot, "articles", "finance", "finance-old", "2026-09-01");
    await writeContent(contentRoot, "articles", "finance", "finance-new", "2026-09-15");
    await writeContent(contentRoot, "articles", "share-market", "shares-oldest", "2026-07-01");

    const first = await getDailyPlanSnapshot(input(root));
    expect(first.date).toBe("2026-10-02");
    expect(first.tasks.map((task) => task.category)).toEqual(["top-10", "share-market", "sports"]);

    await writeContent(contentRoot, "articles", "share-market", "shares-today", "2026-10-02");
    const second = await getDailyPlanSnapshot(input(root, new Date("2026-10-02T20:00:00+01:00")));
    expect(second.tasks.map((task) => task.category)).toEqual(["top-10", "share-market", "sports"]);
  });

  it("assigns the newest existing draft and follows its exact filename through publication", async () => {
    const root = await temporaryRoot();
    const contentRoot = path.join(root, "content");
    await writeContent(contentRoot, "drafts", "anime", "older-draft", "2026-09-29");
    const filename = await writeContent(contentRoot, "drafts", "anime", "newer-draft", "2026-10-01");

    const draftSnapshot = await getDailyPlanSnapshot(input(root));
    expect(draftSnapshot.tasks[0]).toMatchObject({
      category: "anime",
      status: "draft-ready",
      draftRef: { category: "anime", filename },
    });
    expect(draftSnapshot.completedCount).toBe(1);

    await mkdir(path.join(contentRoot, "articles", "anime"), { recursive: true });
    await rename(
      path.join(contentRoot, "drafts", "anime", filename),
      path.join(contentRoot, "articles", "anime", filename),
    );
    const publishedSnapshot = await getDailyPlanSnapshot(input(root));
    expect(publishedSnapshot.tasks[0]?.status).toBe("published");
    expect(publishedSnapshot.completedCount).toBe(1);
  });

  it("records completed and attention outcomes against the exact task", async () => {
    const root = await temporaryRoot();
    const planInput = input(root);
    await getDailyPlanSnapshot(planInput);
    const filename = await writeContent(planInput.contentRoot, "drafts", "anime", "generated-anime", "2026-10-02");

    await recordDailyPlanRun({
      auditRoot: planInput.auditRoot,
      date: "2026-10-02",
      category: "anime",
      result: completedResult("anime", filename),
      now: planInput.now,
    });
    await recordDailyPlanRun({
      auditRoot: planInput.auditRoot,
      date: "2026-10-02",
      category: "movies",
      result: {
        runId: "run-002",
        status: "human-required",
        stage: "discovery",
        imageCount: 0,
        repairs: [],
        message: "No story",
        deliveryStatus: "not-delivered",
        errorCategory: "discovery-unavailable",
        resumable: true,
      },
      now: planInput.now,
    });

    const snapshot = await getDailyPlanSnapshot(planInput);
    expect(snapshot.tasks.find((task) => task.category === "anime")?.status).toBe("draft-ready");
    expect(snapshot.tasks.find((task) => task.category === "movies")?.status).toBe("needs-attention");
  });

  it("replaces only an unstarted task with the next ranked category", async () => {
    const root = await temporaryRoot();
    const planInput = input(root);
    expect((await getDailyPlanSnapshot(planInput)).tasks.map((task) => task.category)).toEqual([
      "anime", "movies", "politics",
    ]);

    const replaced = await replaceDailyPlanTask({ ...planInput, category: "anime" });
    expect(replaced.tasks.map((task) => task.category)).toEqual(["sports", "movies", "politics"]);

    const filename = await writeContent(planInput.contentRoot, "drafts", "movies", "movie-draft", "2026-10-02");
    await recordDailyPlanRun({
      auditRoot: planInput.auditRoot,
      date: "2026-10-02",
      category: "movies",
      result: completedResult("movies", filename),
      now: planInput.now,
    });
    await expect(replaceDailyPlanTask({ ...planInput, category: "movies" })).rejects.toThrow(/cannot be replaced/i);
  });

  it("preserves malformed plan bytes and reports the load error", async () => {
    const root = await temporaryRoot();
    const planPath = path.join(root, ".audit", "daily-plans", "2026-10-02.json");
    await mkdir(path.dirname(planPath), { recursive: true });
    await writeFile(planPath, "{broken plan", "utf8");

    await expect(getDailyPlanSnapshot(input(root))).rejects.toThrow(/daily plan is malformed/i);
    await expect(readFile(planPath, "utf8")).resolves.toBe("{broken plan");
  });

  it("creates a new local-date plan without changing yesterday's plan", async () => {
    const root = await temporaryRoot();
    const yesterday = await getDailyPlanSnapshot(input(root, new Date(2026, 9, 2, 23, 55)));
    const yesterdayPath = path.join(root, ".audit", "daily-plans", "2026-10-02.json");
    const yesterdayBytes = await readFile(yesterdayPath, "utf8");

    const today = await getDailyPlanSnapshot(input(root, new Date(2026, 9, 3, 0, 5)));

    expect(yesterday.date).toBe("2026-10-02");
    expect(today.date).toBe("2026-10-03");
    await expect(readFile(yesterdayPath, "utf8")).resolves.toBe(yesterdayBytes);
    await expect(readFile(path.join(root, ".audit", "daily-plans", "2026-10-03.json"), "utf8")).resolves.toContain("2026-10-03");
  });

  it("keeps an unfinished saved category in the next day's plan and makes it retryable", async () => {
    const root = await temporaryRoot();
    const auditRoot = path.join(root, ".audit");
    await mkdir(auditRoot, { recursive: true });
    await writeFile(path.join(auditRoot, "current-run.json"), JSON.stringify({
      version: 1,
      runId: "saved-sports-run",
      status: "human-required",
      stage: "preflight",
      attempt: 1,
      percent: 5,
      message: "Install the local model, then try again.",
      imageCount: 0,
      repairs: [],
      errorCategory: "local-model-missing",
      deliveryStatus: "not-delivered",
      requestedCategory: "sports",
      startedAt: "2026-10-02T20:00:00.000Z",
      updatedAt: "2026-10-02T20:01:00.000Z",
    }), "utf8");

    const nextDay = await getDailyPlanSnapshot(input(root, new Date("2026-10-03T09:00:00+01:00")));

    expect(nextDay.tasks.map((task) => task.category)).toEqual(["sports", "anime", "movies"]);
    expect(nextDay.tasks[0]).toMatchObject({
      category: "sports",
      status: "needs-attention",
    });
    await expect(replaceDailyPlanTask({
      ...input(root, new Date("2026-10-03T09:05:00+01:00")),
      category: "sports",
    })).rejects.toThrow(/cannot be replaced/i);
  });

  it("keeps a failed run in needs-attention even when its partial draft is valid", async () => {
    const root = await temporaryRoot();
    const planInput = input(root);
    await getDailyPlanSnapshot(planInput);
    const filename = await writeContent(planInput.contentRoot, "drafts", "anime", "partial-anime", "2026-10-02");

    await recordDailyPlanRun({
      auditRoot: planInput.auditRoot,
      date: "2026-10-02",
      category: "anime",
      result: {
        runId: "run-with-partial-draft",
        status: "human-required",
        stage: "image-selection",
        draftRef: { category: "anime", filename },
        imageCount: 1,
        repairs: [],
        message: "Choose another picture, then try again.",
        deliveryStatus: "not-delivered",
        errorCategory: "insufficient-images",
        resumable: true,
      },
      now: planInput.now,
    });

    expect((await getDailyPlanSnapshot(planInput)).tasks[0]?.status).toBe("needs-attention");
  });
});
