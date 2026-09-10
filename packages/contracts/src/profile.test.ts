import { describe, expect, test } from "vitest";

import { profileUpdateSchema } from "./profile";

describe("profile contracts", () => {
  test("normalizes country codes and accepts supported language tags", () => {
    const parsed = profileUpdateSchema.parse({ expectedVersion: 2, displayName: "Asha", countryCode: " in ", preferredLanguage: "en-GB" });
    expect(parsed.countryCode).toBe("IN");
  });

  test("rejects unsafe or server-managed fields", () => {
    expect(profileUpdateSchema.safeParse({ expectedVersion: 1, accountStatus: "banned" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ expectedVersion: 1, countryCode: "IND" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ expectedVersion: 1, preferredLanguage: "en-12" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
  });
});
