import { describe, expect, test } from "vitest";

import { claimExpiresAt, claimIsAvailable } from "./claims";

describe("topic claim rules", () => {
  const now = new Date("2026-08-28T00:00:00.000Z");
  test("expires claims after seven days and enforces one active topic plus user limit", () => {
    expect(claimExpiresAt(now)).toBe("2026-09-04T00:00:00.000Z");
    const claims = [{ topicId: "claimed", userId: "user", expiresAt: "2026-08-29T00:00:00.000Z", status: "active" as const }, { topicId: "expired", userId: "user", expiresAt: "2026-08-27T00:00:00.000Z", status: "active" as const }];
    expect(claimIsAvailable("claimed", "user", claims, 3, now)).toBe(false);
    expect(claimIsAvailable("new", "user", claims, 3, now)).toBe(true);
    expect(claimIsAvailable("new", "user", [{ ...claims[0], topicId: "other" }, { ...claims[0], topicId: "third" }], 2, now)).toBe(false);
  });
});
