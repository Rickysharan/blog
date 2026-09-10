import { z } from "zod";

import { parseServerEnv, publicEnvSchema, serverEnvSchema } from "@omnilede/config";

const publishedImageOriginSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === "/storage/v1/object/public/published-images" &&
    value === `${url.origin}${url.pathname}`
  );
}, "Expected the canonical published-images Storage origin");

const contributorServerEnvSchema = serverEnvSchema
  .extend({
    CLOUDFLARE_ACCOUNT_ID: z.string().trim().min(1),
    CLOUDFLARE_AI_TOKEN: z.string().min(1),
    CLOUDFLARE_TEXT_MODEL: z.string().trim().min(1),
    CLOUDFLARE_IMAGE_MODEL: z.string().trim().min(1),
    CLOUDFLARE_EMBEDDING_MODEL: z.string().trim().min(1),
    TAVILY_API_KEY: z.string().min(1),
    BREVO_API_KEY: z.string().min(1),
    BLOG_PUBLISH_URL: z.string().url().refine((value) => new URL(value).protocol === "https:"),
    BLOG_PUBLISH_HMAC_SECRET: z.string().min(32),
    PUBLISHED_IMAGE_ORIGIN: publishedImageOriginSchema,
    PUBLICATION_INTERNAL_SECRET: z.string().min(32),
    PUBLICATION_CRON_SECRET: z.string().min(32),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    AUTH_ALLOWED_ORIGINS: z.string().trim().min(1).optional(),
    AUTH_RATE_LIMIT_SALT: z.string().min(32).optional()
  });

type Environment = Record<string, string | undefined>;

export type ContributorPublicEnv = z.infer<typeof publicEnvSchema>;
export type ContributorServerEnv = z.infer<typeof contributorServerEnvSchema>;

export function parseContributorPublicEnv(environment: Environment): ContributorPublicEnv {
  return publicEnvSchema.parse(environment);
}

export function parseContributorServerEnv(environment: Environment): ContributorServerEnv {
  const parsed = contributorServerEnvSchema.parse(environment);
  parseServerEnv(environment);
  return parsed;
}
