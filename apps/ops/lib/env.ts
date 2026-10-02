import { z } from "zod";

import { publicEnvSchema, supabaseServerEnvSchema } from "@omnilede/config";

const httpsOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value.replace(/\/$/, "") && url.pathname === "/";
  }, "Expected an HTTPS origin without a path");

const studioOperatorEnvSchema = z.object({
  STUDIO_OPERATOR_EMAIL: z.string().trim().email().transform((value) => value.toLowerCase())
});

const studioOriginEnvSchema = z.object({
  NEXT_PUBLIC_STUDIO_URL: httpsOriginSchema,
  AUTH_ALLOWED_ORIGINS: z
    .string()
    .trim()
    .min(1)
    .superRefine((value, context) => {
      for (const candidate of value.split(",").map((origin) => origin.trim())) {
        if (!httpsOriginSchema.safeParse(candidate).success) {
          context.addIssue({ code: "custom", message: "AUTH_ALLOWED_ORIGINS must contain HTTPS origins" });
        }
      }
    })
});

const opsPublicEnvSchema = publicEnvSchema.extend({
  NEXT_PUBLIC_STUDIO_URL: studioOriginEnvSchema.shape.NEXT_PUBLIC_STUDIO_URL
});

const opsServerEnvSchema = opsPublicEnvSchema
  .extend({
    SUPABASE_SECRET_KEY: supabaseServerEnvSchema.shape.SUPABASE_SECRET_KEY,
    GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    GITHUB_READ_TOKEN: z.string().min(1),
    NETLIFY_ACCOUNT_SLUG: z.string().trim().min(1),
    NETLIFY_READ_TOKEN: z.string().min(1),
    BLOG_NETLIFY_SITE_ID: z.string().trim().min(1),
    CONTRIBUTOR_NETLIFY_SITE_ID: z.string().trim().min(1),
    HEALTH_INGEST_HMAC_SECRET: z.string().min(32),
    STUDIO_OPERATOR_EMAIL: studioOperatorEnvSchema.shape.STUDIO_OPERATOR_EMAIL,
    AUTH_ALLOWED_ORIGINS: studioOriginEnvSchema.shape.AUTH_ALLOWED_ORIGINS
  })
  .strip();

type Environment = Record<string, string | undefined>;

export type OpsPublicEnv = z.infer<typeof opsPublicEnvSchema>;
export type OpsServerEnv = z.infer<typeof opsServerEnvSchema>;

export function parseOpsPublicEnv(environment: Environment): OpsPublicEnv {
  return opsPublicEnvSchema.parse(environment);
}

export function parseOpsServerEnv(environment: Environment): OpsServerEnv {
  return opsServerEnvSchema.parse(environment);
}

export function parseStudioOperatorEnv(environment: Environment) {
  return studioOperatorEnvSchema.parse(environment);
}

export function parseStudioOriginEnv(environment: Environment) {
  return studioOriginEnvSchema.parse(environment);
}
