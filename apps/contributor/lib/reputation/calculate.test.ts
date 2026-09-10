import { describe, expect, test } from "vitest";

import { calculateReputation } from "./calculate";

describe("reputation", () => {
  test("never treats missing analytics as zero engagement", () => {
    const result = calculateReputation({ approved: 3, rejected: 0, changesRequested: 0, engagement: null });
    expect(result.tier).toBe("Trusted");
    expect(result.engagementStatus).toBe("unavailable");
    expect(result.engagement).toBeNull();
  });

  test("supports tier downgrade after rejection", () => {
    expect(calculateReputation({ approved: 12, rejected: 0, changesRequested: 0, engagement: 1 }).tier).toBe("Verified");
    expect(calculateReputation({ approved: 12, rejected: 5, changesRequested: 0, engagement: 1 }).tier).toBe("Trusted");
  });
});
