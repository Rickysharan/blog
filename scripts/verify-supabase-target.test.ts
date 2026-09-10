import { describe, expect, test } from "vitest";

import { TargetVerificationError, verifySupabaseTarget, type SupabaseTarget } from "./verify-supabase-target";

const target: SupabaseTarget = {
  projectRef: "omnilede-new",
  projectUrl: "https://omnilede-new.supabase.co"
};

describe("Supabase target guard", () => {
  test("refuses an unknown or missing target", () => {
    expect(() => verifySupabaseTarget({ target: null, expectedProjectRef: "omnilede-new" })).toThrow(
      TargetVerificationError
    );
  });

  test("refuses a target whose URL does not match the expected project ref", () => {
    expect(() =>
      verifySupabaseTarget({
        target: { ...target, projectUrl: "https://different.supabase.co" },
        expectedProjectRef: target.projectRef
      })
    ).toThrow(/does not match/);
  });

  test("refuses an environment ref mismatch", () => {
    expect(() =>
      verifySupabaseTarget({ target, expectedProjectRef: "another-project" })
    ).toThrow(/SUPABASE_PROJECT_REF/);
  });

  test("requires exact confirmation for a known existing project", () => {
    expect(() =>
      verifySupabaseTarget({ target, expectedProjectRef: target.projectRef, knownProjectRefs: [target.projectRef] })
    ).toThrow(/explicit confirmation/);
    expect(() =>
      verifySupabaseTarget({
        target,
        expectedProjectRef: target.projectRef,
        knownProjectRefs: [target.projectRef],
        confirmedProjectRef: "wrong-project"
      })
    ).toThrow(/exactly/);
    expect(
      verifySupabaseTarget({
        target,
        expectedProjectRef: target.projectRef,
        knownProjectRefs: [target.projectRef],
        confirmedProjectRef: target.projectRef
      })
    ).toMatchObject({ projectRef: target.projectRef });
  });

  test("accepts a new project with matching URL and environment ref", () => {
    expect(verifySupabaseTarget({ target, expectedProjectRef: target.projectRef })).toEqual(target);
  });

  test("returns redacted diagnostics without echoing a URL", () => {
    try {
      verifySupabaseTarget({ target: { ...target, projectUrl: "https://wrong.supabase.co" }, expectedProjectRef: target.projectRef });
    } catch (error) {
      expect(error).toBeInstanceOf(TargetVerificationError);
      expect(String(error)).not.toContain("https://wrong.supabase.co");
    }
  });
});
