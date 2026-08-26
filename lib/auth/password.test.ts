import { describe, expect, it } from "vitest";

import { verifyPassword } from "@/lib/auth/password";

describe("verifyPassword", () => {
  it("accepts the configured password without comparing variable-length secrets", () => {
    expect(verifyPassword("correct horse", "correct horse")).toBe(true);
    expect(verifyPassword("wrong", "correct horse")).toBe(false);
    expect(verifyPassword("a much longer wrong password", "correct horse")).toBe(false);
  });

  it("handles Unicode inputs deterministically", () => {
    expect(verifyPassword("pässphrase 🔐", "pässphrase 🔐")).toBe(true);
    expect(verifyPassword("pässphrase", "pässphrase 🔐")).toBe(false);
  });
});
