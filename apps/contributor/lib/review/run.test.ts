import { describe, expect, test } from "vitest";

import { runReview } from "./run";
import { stageResult } from "./types";

const input = { title: "A sourced global update", contentDocument: { type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "word ".repeat(140) }] }] }, category: "movies" as const, region: "global" as const, language: "en", primarySourceName: "Source", primarySourceUrl: "https://source.example/a", privateImagePath: "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.webp", guidelinesVersion: "2026-08-27", guidelinesAccepted: true as const };

describe("review runner", () => {
  test("fails closed when a provider is uncertain", async () => {
    const providers = { classifyText: async () => stageResult("text_safety", "manual_review", ["provider_timeout"], null, "fake", "1", true) };
    const result = await runReview(input, providers, { firstAuthor: false, idempotencyKey: "submission:1:text" });
    expect(result.state).toBe("manual_review");
  });
});
