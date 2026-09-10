import { describe, expect, test } from "vitest";

import { decisionInputSchema } from "./decisions";

describe("review decision input", () => {
  test("requires a reason and evidence acknowledgment", () => {
    expect(decisionInputSchema.safeParse({ expectedVersion: 1, decision: "approve", reason: "too short", evidenceAcknowledged: true }).success).toBe(false);
    expect(decisionInputSchema.safeParse({ expectedVersion: 1, decision: "reject", reason: "Evidence reviewed and documented.", evidenceAcknowledged: true }).success).toBe(true);
    expect(decisionInputSchema.safeParse({ expectedVersion: 1, decision: "approve", reason: "Evidence reviewed and documented.", evidenceAcknowledged: false }).success).toBe(false);
  });
});
