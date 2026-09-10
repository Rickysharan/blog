import { describe, expect, test } from "vitest";

import { POST } from "./route";

describe("review cron route", () => {
  test("requires the server cron secret", async () => {
    process.env.REVIEW_CRON_SECRET = "cron-secret";
    expect((await POST(new Request("https://contributors.example/api/cron/review", { method: "POST" }))).status).toBe(401);
    expect((await POST(new Request("https://contributors.example/api/cron/review", { method: "POST", headers: { authorization: "Bearer cron-secret" } }))).status).toBe(200);
  });
});
