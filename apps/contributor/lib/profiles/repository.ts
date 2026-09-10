import "server-only";

import { createServiceSupabaseClient } from "../supabase/server";
import type { ProfileFields, ProfileUpdate } from "@omnilede/contracts";
import type { ProfileRecord } from "./types";

export type { ProfileRecord } from "./types";

export class ProfileConflictError extends Error {
  override name = "ProfileConflictError";
}

type ProfileRow = {
  id: string;
  display_name: string;
  country_code: string | null;
  preferred_language: string;
  payout_preference: ProfileFields["payoutPreference"];
  account_status: ProfileRecord["accountStatus"];
  version: number;
  created_at: string;
  updated_at: string;
};

function shapeProfile(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    countryCode: row.country_code,
    preferredLanguage: row.preferred_language,
    payoutPreference: row.payout_preference,
    accountStatus: row.account_status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toProfilePatch(input: ProfileUpdate): Partial<ProfileRow> {
  const patch: Partial<ProfileRow> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.countryCode !== undefined) patch.country_code = input.countryCode;
  if (input.preferredLanguage !== undefined) patch.preferred_language = input.preferredLanguage;
  if (input.payoutPreference !== undefined) patch.payout_preference = input.payoutPreference;
  return patch;
}

export async function getProfile(userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from("profiles")
    .select("id,display_name,country_code,preferred_language,payout_preference,account_status,version,created_at,updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to load profile", { cause: error });
  return data ? shapeProfile(data as ProfileRow) : null;
}

export async function updateProfile(userId: string, input: ProfileUpdate): Promise<ProfileRecord> {
  const patch = toProfilePatch(input);
  const { data, error } = await createServiceSupabaseClient()
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .eq("version", input.expectedVersion)
    .select("id,display_name,country_code,preferred_language,payout_preference,account_status,version,created_at,updated_at")
    .maybeSingle();

  if (error) throw new Error("Unable to update profile", { cause: error });
  if (!data) throw new ProfileConflictError("Profile changed in another tab");
  return shapeProfile(data as ProfileRow);
}
