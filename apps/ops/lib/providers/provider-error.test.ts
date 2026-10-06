import { describe, expect, it } from "vitest";

import { safeProviderFailure } from "./provider-error";

describe("safeProviderFailure", () => {
  it("keeps the provider failure category without exposing the original message", () => {
    const error = Object.assign(new Error("secret-token-value"), { kind: "rate-limited" });

    expect(safeProviderFailure("google-analytics", error)).toEqual({
      provider: "google-analytics",
      kind: "rate-limited",
    });
  });

  it("classifies parser failures without returning their message", () => {
    expect(safeProviderFailure("google-search-console", new Error("foreign URL"))).toEqual({
      provider: "google-search-console",
      kind: "invalid-report",
    });
  });

  it("keeps a bounded internal validation code", () => {
    const error = Object.assign(new Error("secret-token-value"), {
      kind: "invalid-report:ga4-summary-columns",
    });
    expect(safeProviderFailure("google-analytics", error)).toEqual({
      provider: "google-analytics",
      kind: "invalid-report:ga4-summary-columns",
    });
  });
});
