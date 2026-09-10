import { z } from "zod";

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Expected an HTTPS URL");

const booleanEnvironmentSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const supabasePublishableKeySchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith("sb_publishable_"),
    "Expected an sb_publishable_ browser key"
  );

const supabaseSecretKeySchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith("sb_secret_"),
    "Expected an sb_secret_ server key"
  );

export const supabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpsUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKeySchema
});

export const supabaseServerEnvSchema = supabasePublicEnvSchema.extend({
  SUPABASE_SECRET_KEY: supabaseSecretKeySchema
});

export const supabaseAdminEnvSchema = z.object({
  SUPABASE_URL: httpsUrlSchema,
  SUPABASE_SECRET_KEY: supabaseSecretKeySchema
});

export const publicEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: httpsUrlSchema,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKeySchema,
    NEXT_PUBLIC_BLOG_URL: httpsUrlSchema,
    NEXT_PUBLIC_CONTRIBUTOR_URL: httpsUrlSchema
  })
  .strip();

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: supabaseSecretKeySchema,
  REDEMPTIONS_ENABLED: booleanEnvironmentSchema,
  ALLOW_FUNDED_REDEMPTIONS: booleanEnvironmentSchema
});

type Environment = Record<string, string | undefined>;

export function parsePublicEnv(environment: Environment): z.infer<typeof publicEnvSchema> {
  return publicEnvSchema.parse(environment);
}

export function parseServerEnv(environment: Environment): z.infer<typeof serverEnvSchema> {
  const parsed = serverEnvSchema.parse(environment);

  if (parsed.REDEMPTIONS_ENABLED && !parsed.ALLOW_FUNDED_REDEMPTIONS) {
    throw new Error("REDEMPTIONS_ENABLED=true requires ALLOW_FUNDED_REDEMPTIONS=true");
  }

  return parsed;
}

export function parseSupabasePublicEnv(environment: Environment): z.infer<typeof supabasePublicEnvSchema> {
  return supabasePublicEnvSchema.parse(environment);
}

export function parseSupabaseServerEnv(environment: Environment): z.infer<typeof supabaseServerEnvSchema> {
  return supabaseServerEnvSchema.parse(environment);
}

export function parseSupabaseAdminEnv(environment: Environment): z.infer<typeof supabaseAdminEnvSchema> {
  return supabaseAdminEnvSchema.parse(environment);
}
