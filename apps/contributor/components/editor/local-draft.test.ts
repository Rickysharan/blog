import { beforeEach, describe, expect, test } from "vitest";

import { clearLocalDraft, restoreLocalDraft, saveLocalDraft } from "./local-draft";

describe("local draft storage", () => {
  beforeEach(() => window.localStorage.clear());

  test("restores a draft by user and submission, not globally", () => {
    const draft = {
      savedAt: "2026-08-28T00:00:00.000Z",
      expectedVersion: 1,
      payload: { title: "A local draft" } as never
    };
    saveLocalDraft("user-a", "submission-a", draft);
    expect(restoreLocalDraft("user-a", "submission-a")).toEqual(draft);
    expect(restoreLocalDraft("user-b", "submission-a")).toBeNull();
    clearLocalDraft("user-a", "submission-a");
    expect(restoreLocalDraft("user-a", "submission-a")).toBeNull();
  });

  test("ignores malformed local storage", () => {
    window.localStorage.setItem("omnilede:contributor:draft:user:submission", "{bad json");
    expect(restoreLocalDraft("user", "submission")).toBeNull();
  });
});
