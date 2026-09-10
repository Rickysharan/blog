import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPublicationBatch: vi.fn().mockResolvedValue({ claimed: 0, published: 0, failed: 0, stopped: "empty" }),
}));

vi.mock("../../../../lib/publication/outbox", () => ({ runPublicationBatch: mocks.runPublicationBatch }));

import { POST } from "./route";

describe("publication cron route", () => {
  beforeEach(() => {
    mocks.runPublicationBatch.mockClear();
    process.env.PUBLICATION_CRON_SECRET = "cron-publication-secret-at-least-32-characters";
  });

  test("rejects a missing or wrong bearer secret", async () => {
    expect((await POST(new Request("https://contributors.example/api/cron/publish", { method: "POST" }))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("https://contributors.example/api/cron/publish", {
            method: "POST",
            headers: { authorization: "Bearer wrong" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.runPublicationBatch).not.toHaveBeenCalled();
  });

  test("caps an authenticated cron invocation", async () => {
    const response = await POST(
      new Request("https://contributors.example/api/cron/publish", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.PUBLICATION_CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.runPublicationBatch).toHaveBeenCalledWith({ maxItems: 5, maxRuntimeMs: 20_000 });
  });
});
