import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPublicationBatch: vi.fn().mockResolvedValue({ claimed: 1, published: 1, failed: 0, stopped: "max_items" }),
}));

vi.mock("../../../../lib/publication/outbox", () => ({ runPublicationBatch: mocks.runPublicationBatch }));

import { POST } from "./route";

describe("internal publication route", () => {
  beforeEach(() => {
    mocks.runPublicationBatch.mockClear();
    process.env.PUBLICATION_INTERNAL_SECRET = "internal-publication-secret-at-least-32-characters";
  });

  test("requires its timing-safe server bearer secret", async () => {
    const response = await POST(new Request("https://contributors.example/api/internal/publish", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.runPublicationBatch).not.toHaveBeenCalled();
  });

  test("processes one bounded item for an authenticated request", async () => {
    const response = await POST(
      new Request("https://contributors.example/api/internal/publish", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.PUBLICATION_INTERNAL_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.runPublicationBatch).toHaveBeenCalledWith({ maxItems: 1, maxRuntimeMs: 15_000 });
  });
});
