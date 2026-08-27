import { describe, expect, it, vi } from "vitest";

import { runContentPipeline } from "@/lib/pipeline/run";

describe("runContentPipeline", () => {
  it("fetches before optional generation and never publishes", async () => {
    const calls: string[] = [];
    const publishSpy = vi.fn();

    const result = await runContentPipeline({
      fetchStories: async () => {
        calls.push("fetch");
        return {
          stories: [],
          summaries: [],
          successCount: 1,
          failureCount: 0,
          skippedCount: 0,
        };
      },
      writeQueue: async () => {
        calls.push("queue");
        return { queuePath: "/tmp/trending.json", stories: [], written: 0, skippedExisting: 0 };
      },
      generateDrafts: async () => {
        calls.push("generate");
        return { status: "completed", created: ["draft.mdx"], skipped: [], failed: [] };
      },
      generationEnabled: true,
      publish: publishSpy,
    });

    expect(calls).toEqual(["fetch", "queue", "generate"]);
    expect(publishSpy).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ fetched: 0, generated: 1, failed: 0 }),
    );
  });

  it("caps Vercel generation at three drafts", async () => {
    const generateDrafts = vi.fn().mockResolvedValue({
      status: "completed",
      created: [],
      skipped: [],
      failed: [],
    });

    await runContentPipeline({
      mode: "vercel",
      fetchStories: async () => ({
        stories: [],
        summaries: [],
        successCount: 1,
        failureCount: 0,
        skippedCount: 0,
      }),
      writeQueue: async () => ({
        queuePath: "/tmp/trending.json",
        stories: [],
        written: 0,
        skippedExisting: 0,
      }),
      generateDrafts,
      generationEnabled: true,
    });

    expect(generateDrafts).toHaveBeenCalledWith(expect.objectContaining({ maxDrafts: 3 }));
  });

  it("does not invoke generation when it is disabled", async () => {
    const generateDrafts = vi.fn();
    const result = await runContentPipeline({
      fetchStories: async () => ({
        stories: [],
        summaries: [],
        successCount: 1,
        failureCount: 0,
        skippedCount: 0,
      }),
      writeQueue: async () => ({
        queuePath: "/tmp/trending.json",
        stories: [],
        written: 0,
        skippedExisting: 0,
      }),
      generateDrafts,
      generationEnabled: false,
    });

    expect(generateDrafts).not.toHaveBeenCalled();
    expect(result.generated).toBe(0);
  });
});
