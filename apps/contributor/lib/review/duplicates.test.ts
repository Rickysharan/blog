import { describe, expect, test } from "vitest";

import { recentSameCategory, routeDuplicateTopic } from "./duplicates";

const candidates = [
  { id: "a", category: "anime", createdAt: "2026-08-28T00:00:00.000Z", similarity: 0.7, title: "A" },
  { id: "b", category: "anime", createdAt: "2026-08-27T00:00:00.000Z", similarity: 0.55, title: "B" },
  { id: "c", category: "finance", createdAt: "2026-08-28T00:00:00.000Z", similarity: 0.99, title: "C" }
];

describe("recent topic comparison", () => {
  test("filters by category and a 48-hour window", () => {
    expect(recentSameCategory(candidates, "anime", new Date("2026-08-28T12:00:00.000Z")).map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("routes ties and high similarity to manual review, clear leaders to pass", () => {
    expect(routeDuplicateTopic([{ ...candidates[0], similarity: 0.7 }, { ...candidates[1], similarity: 0.68 }]).outcome).toBe("manual_review");
    expect(routeDuplicateTopic([{ ...candidates[0], similarity: 0.99 }, { ...candidates[1], similarity: 0.4 }]).outcome).toBe("manual_review");
    expect(routeDuplicateTopic([{ ...candidates[0], similarity: 0.7 }, { ...candidates[1], similarity: 0.4 }]).outcome).toBe("pass");
  });
});
