import { describe, expect, test } from "vitest";

import { calculateReward } from "./calculate";

describe("reward calculation", () => {
  test("chooses the category-specific effective rule at approval time", () => {
    const rules = [
      { id: "wild", category: "*", minWords: 100, maxWords: 1000, points: 10, effectiveFrom: "2026-01-01", effectiveTo: null },
      { id: "finance", category: "finance", minWords: 100, maxWords: 1000, points: 20, effectiveFrom: "2026-08-01", effectiveTo: null }
    ];
    expect(calculateReward({ category: "finance", wordCount: 200, approvedAt: "2026-08-28" }, rules)?.id).toBe("finance");
    expect(calculateReward({ category: "anime", wordCount: 50, approvedAt: "2026-08-28" }, rules)).toBeNull();
  });
});
