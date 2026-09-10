import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProfileForm } from "./profile-form";
import { isProfileComplete } from "../lib/profiles/completion";
import type { ProfileRecord } from "../lib/profiles/types";

const profile: ProfileRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Contributor",
  countryCode: null,
  preferredLanguage: "en",
  payoutPreference: "not_configured",
  accountStatus: "active",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("ProfileForm", () => {
  test("requires onboarding identity fields and explains the payout boundary", () => {
    render(<ProfileForm initialProfile={profile} />);
    expect(screen.getByLabelText("Display name")).toBeRequired();
    expect(screen.getByLabelText(/country code/i)).toBeVisible();
    expect(screen.getByText(/do not enter bank, card, or payment details/i)).toBeVisible();
    expect(isProfileComplete(profile)).toBe(false);
  });

  test("recognizes a completed profile", () => {
    expect(isProfileComplete({ ...profile, displayName: "Asha", countryCode: "IN" })).toBe(true);
  });
});
