import { describe, expect, test } from "vitest";

import { calculateReviewScore } from "./scoring";

describe("review score", () => {
  test("is bounded and stable regardless of key order", () => {
    const first = calculateReviewScore({ originality: 1, sourcedFactualDensity: 0.8, structure: 0.9, wordBandFit: 0.7 });
    const second = calculateReviewScore({ wordBandFit: 0.7, structure: 0.9, sourcedFactualDensity: 0.8, originality: 1 });
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(1);
  });
});
