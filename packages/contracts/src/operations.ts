import { z } from "zod";

export const CATEGORIES = [
  "anime",
  "movies",
  "politics",
  "sports",
  "finance",
  "share-market"
] as const;

export const SUBMISSION_STATUSES = [
  "draft",
  "under_review",
  "manual_review",
  "changes_requested",
  "rejected",
  "approved",
  "publishing",
  "published",
  "publishing_failed"
] as const;

export const PROVIDER_HEALTH = ["available", "degraded", "exhausted", "disabled"] as const;

export const ROLES = ["contributor", "reviewer", "admin"] as const;

export const REGIONS = [
  "global",
  "africa",
  "asia",
  "europe",
  "middle-east",
  "north-america",
  "latin-america",
  "oceania"
] as const;

export const categorySchema = z.enum(CATEGORIES);
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export const providerHealthSchema = z.enum(PROVIDER_HEALTH);
export const roleSchema = z.enum(ROLES);
export const regionSchema = z.enum(REGIONS);

export type Category = z.infer<typeof categorySchema>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;
export type ProviderHealth = z.infer<typeof providerHealthSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Region = z.infer<typeof regionSchema>;
