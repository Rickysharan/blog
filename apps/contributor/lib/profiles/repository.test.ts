import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn()
  };
  const service = { from: vi.fn(() => query) };
  return { query, service };
});

vi.mock("../supabase/server", () => ({ createServiceSupabaseClient: vi.fn(() => mocks.service) }));

import { profileUpdateSchema } from "@omnilede/contracts";
import { ProfileConflictError, getProfile, toProfilePatch, updateProfile } from "./repository";

const userId = "00000000-0000-4000-8000-000000000001";
const row = {
  id: userId,
  display_name: "Asha",
  country_code: "IN",
  preferred_language: "en",
  payout_preference: "not_configured" as const,
  account_status: "active" as const,
  version: 2,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z"
};

describe("profile repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.update.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.maybeSingle.mockResolvedValue({ data: row, error: null });
  });

  test("shapes only editable profile fields and derives the owner from the caller", async () => {
    const profile = await updateProfile(userId, {
      expectedVersion: 1,
      displayName: "Asha",
      countryCode: "IN",
      preferredLanguage: "en",
      payoutPreference: "not_configured"
    });
    expect(mocks.service.from).toHaveBeenCalledWith("profiles");
    expect(mocks.query.eq).toHaveBeenNthCalledWith(1, "id", userId);
    expect(mocks.query.eq).toHaveBeenNthCalledWith(2, "version", 1);
    expect(mocks.query.update).toHaveBeenCalledWith({
      display_name: "Asha",
      country_code: "IN",
      preferred_language: "en",
      payout_preference: "not_configured"
    });
    expect(profile.accountStatus).toBe("active");
    expect(profile.version).toBe(2);
  });

  test("does not allow role, status, points, or another id in the update contract", () => {
    expect(profileUpdateSchema.safeParse({ expectedVersion: 1, accountStatus: "banned" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ expectedVersion: 1, userId, displayName: "Other" }).success).toBe(false);
    expect(toProfilePatch({ expectedVersion: 1, displayName: "Asha" })).toEqual({ display_name: "Asha" });
  });

  test("returns a conflict when the optimistic version no longer matches", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(updateProfile(userId, { expectedVersion: 1, displayName: "Asha" })).rejects.toBeInstanceOf(ProfileConflictError);
  });

  test("shapes a read without exposing raw database names", async () => {
    const profile = await getProfile(userId);
    expect(profile).toMatchObject({ id: userId, displayName: "Asha", countryCode: "IN", payoutPreference: "not_configured" });
    expect(profile).not.toHaveProperty("display_name");
  });
});
