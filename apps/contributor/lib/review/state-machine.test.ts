import { describe, expect, test } from "vitest";

import { executionKey, routeAutomatedReview, runIdempotent, transition } from "./state-machine";
import { stageResult } from "./types";

describe("review state machine", () => {
  test("allows only documented transitions", () => {
    expect(transition("draft", "under_review")).toBe("under_review");
    expect(() => transition("draft", "approved")).toThrow("invalid_transition");
    expect(transition("publishing", "published")).toBe("published");
  });

  test("prioritizes safety rejection and routes uncertainty or first-author work to review", () => {
    expect(routeAutomatedReview([stageResult("quality", "pass"), stageResult("text_safety", "reject")], false)).toBe("rejected");
    expect(routeAutomatedReview([stageResult("quality", "pass")], true)).toBe("manual_review");
    expect(routeAutomatedReview([stageResult("quality", "manual_review")], false)).toBe("manual_review");
    expect(routeAutomatedReview([stageResult("quality", "pass"), stageResult("text_safety", "pass")], false)).toBe("approved");
  });

  test("replays a committed stage without a second operation", async () => {
    const store = new Map<string, number>(); let calls = 0;
    const key = executionKey("submission", 2, "quality");
    await expect(runIdempotent(key, store, async () => { calls += 1; return 42; })).resolves.toBe(42);
    await expect(runIdempotent(key, store, async () => { calls += 1; return 99; })).resolves.toBe(42);
    expect(calls).toBe(1);
  });
});
