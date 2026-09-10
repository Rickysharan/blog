import type { ProfileRecord } from "./types";

export function isProfileComplete(profile: ProfileRecord | null): boolean {
  return Boolean(profile && profile.displayName.trim() && profile.displayName !== "Contributor" && profile.countryCode);
}
