import { z } from "zod";

import { bcp47LanguageSchema } from "./content";

export const payoutPreferenceSchema = z.enum([
  "not_configured",
  "bank_transfer_interest",
  "gift_card_interest"
]);

export const countryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Expected an ISO 3166-1 alpha-2 country code");

export const profileFieldsSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  countryCode: countryCodeSchema.nullable(),
  preferredLanguage: bcp47LanguageSchema,
  payoutPreference: payoutPreferenceSchema
}).strict();

export const profileUpdateSchema = profileFieldsSchema.partial().extend({
  expectedVersion: z.number().int().positive().safe()
}).strict().superRefine((value, context) => {
  if (!("displayName" in value || "countryCode" in value || "preferredLanguage" in value || "payoutPreference" in value)) {
    context.addIssue({ code: "custom", message: "At least one profile field is required" });
  }
});

export type ProfileFields = z.infer<typeof profileFieldsSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
