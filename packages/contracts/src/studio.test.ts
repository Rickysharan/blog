import { describe, expect, test } from "vitest";

import {
  reportEnvelopeSchema,
  studioTaskInputSchema,
  studioTaskSchema
} from "./studio";

const categories = ["anime", "movies", "politics", "sports", "finance", "share-market"] as const;

describe("Studio contracts", () => {
  test.each(categories)("accepts the supported %s task category", (category) => {
    expect(
      studioTaskSchema.parse({
        id: "00000000-0000-4000-8000-000000000001",
        evidenceKey: `coverage:${category}`,
        kind: "writing",
        title: `Write ${category}`,
        detail: null,
        category,
        state: "open",
        priority: 50,
        source: "editorial",
        postponedUntil: null,
        completedAt: null,
        createdAt: "2026-10-02T08:00:00.000Z",
        updatedAt: "2026-10-02T08:00:00.000Z"
      }).category
    ).toBe(category);
  });

  test.each(["business", "share_market", "Anime"])("rejects unsupported task category %s", (category) => {
    expect(() =>
      studioTaskInputSchema.parse({
        evidenceKey: "coverage:invalid",
        kind: "writing",
        title: "Invalid category",
        category,
        source: "editorial"
      })
    ).toThrow();
  });

  test.each([
    ["completed", null, null, "completed tasks require a completion timestamp"],
    ["completed", "2026-10-02T08:00:00.000Z", "2026-10-03T08:00:00.000Z", "completed tasks cannot be postponed"],
    ["postponed", null, null, "postponed tasks require a postponement timestamp"],
    ["postponed", "2026-10-02T08:00:00.000Z", "2026-10-03T08:00:00.000Z", "postponed tasks cannot be completed"],
    ["open", "2026-10-02T08:00:00.000Z", null, "open tasks cannot retain a completion timestamp"],
    ["open", null, "2026-10-03T08:00:00.000Z", "open tasks cannot retain a postponement timestamp"]
  ] as const)("rejects %s task timestamps: %s", (state, completedAt, postponedUntil, reason) => {
    const input = {
      evidenceKey: `state:${state}:${completedAt ?? "none"}:${postponedUntil ?? "none"}`,
      kind: "writing" as const,
      title: "Validate task timestamps",
      source: "editorial",
      state,
      completedAt,
      postponedUntil
    };

    expect(reason).toBeTruthy();
    expect(() => studioTaskInputSchema.parse(input)).toThrow();
    expect(() =>
      studioTaskSchema.parse({
        ...input,
        id: "00000000-0000-4000-8000-000000000001",
        createdAt: "2026-10-02T08:00:00.000Z",
        updatedAt: "2026-10-02T08:00:00.000Z"
      })
    ).toThrow();
  });

  test.each([
    ["open", null, null],
    ["completed", "2026-10-02T08:00:00.000Z", null],
    ["postponed", null, "2026-10-03T08:00:00.000Z"]
  ] as const)("accepts valid %s task timestamps", (state, completedAt, postponedUntil) => {
    expect(
      studioTaskInputSchema.parse({
        evidenceKey: `state:${state}`,
        kind: "writing",
        title: "Validate task timestamps",
        source: "editorial",
        state,
        completedAt,
        postponedUntil
      }).state
    ).toBe(state);
  });

  test.each(["connected", "delayed", "stale", "unavailable", "disconnected"] as const)(
    "accepts the truthful %s report state",
    (state) => {
      const report = reportEnvelopeSchema.parse({
        source: "Google Analytics",
        range: { start: "2026-09-05", end: "2026-10-02" },
        fetchedAt: state === "disconnected" || state === "unavailable" ? null : "2026-10-02T08:00:00.000Z",
        state,
        data: state === "disconnected" || state === "unavailable" ? null : { users: 12 }
      });

      expect(report.state).toBe(state);
    }
  );

  test("rejects invented report states and reports without source context", () => {
    expect(() =>
      reportEnvelopeSchema.parse({
        source: "",
        range: { start: "2026-09-05", end: "2026-10-02" },
        fetchedAt: null,
        state: "healthy",
        data: { users: 0 }
      })
    ).toThrow();
  });
});
