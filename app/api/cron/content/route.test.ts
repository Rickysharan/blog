import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/cron/content/route";
import { runContentPipeline } from "@/lib/pipeline/run";

vi.mock("@/lib/pipeline/run", () => ({
  runContentPipeline: vi.fn(),
}));

describe("GET /api/cron/content", () => {
  it("rejects requests without the configured bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");

    const response = await GET(new Request("https://omnilede.test/api/cron/content"));

    expect(response.status).toBe(401);
    expect(runContentPipeline).not.toHaveBeenCalled();
  });

  it("returns only safe summary counts after an authorized run", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.mocked(runContentPipeline).mockResolvedValue({
      status: "completed",
      fetched: 8,
      generated: 3,
      skipped: 1,
      failed: 0,
      queueRemaining: 4,
      activeFeeds: 9,
    });

    const response = await GET(
      new Request("https://omnilede.test/api/cron/content", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "completed",
      fetched: 8,
      generated: 3,
      skipped: 1,
      failed: 0,
      queueRemaining: 4,
      activeFeeds: 9,
    });
    expect(vi.mocked(runContentPipeline)).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "vercel", maxDrafts: 3 }),
    );
  });
});
