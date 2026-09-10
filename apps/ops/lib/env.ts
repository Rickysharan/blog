import { z } from "zod";

import { publicEnvSchema, supabaseServerEnvSchema } from "@omnilede/config";

const opsServerEnvSchema = publicEnvSchema
  .extend({
    SUPABASE_SECRET_KEY: supabaseServerEnvSchema.shape.SUPABASE_SECRET_KEY,
    GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    GITHUB_READ_TOKEN: z.string().min(1),
    NETLIFY_ACCOUNT_SLUG: z.string().trim().min(1),
    NETLIFY_READ_TOKEN: z.string().min(1),
    BLOG_NETLIFY_SITE_ID: z.string().trim().min(1),
    CONTRIBUTOR_NETLIFY_SITE_ID: z.string().trim().min(1),
    HEALTH_INGEST_HMAC_SECRET: z.string().min(32)
  });

type Environment = Record<string, string | undefined>;

export type OpsPublicEnv = z.infer<typeof publicEnvSchema>;
export type OpsServerEnv = z.infer<typeof opsServerEnvSchema>;

export function parseOpsPublicEnv(environment: Environment): OpsPublicEnv {
  return publicEnvSchema.parse(environment);
}

export function parseOpsServerEnv(environment: Environment): OpsServerEnv {
  return opsServerEnvSchema.parse(environment);
}
