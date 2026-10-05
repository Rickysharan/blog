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

const studioContentEnvSchema = z.object({
  GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  GITHUB_CONTENT_BRANCH: z.string().trim().min(1),
  GITHUB_CONTENT_TOKEN: z.string().trim().min(1)
}).strip();

const encryptionKeySchema = z.string().superRefine((value, context) => {
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength !== 32 || decoded.toString("base64") !== value) {
    context.addIssue({ code: "custom", message: "GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key" });
  }
});

const googleOAuthEnvSchema = z.object({
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKeySchema,
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
  NEXT_PUBLIC_STUDIO_URL: studioOriginEnvSchema.shape.NEXT_PUBLIC_STUDIO_URL,
  STUDIO_OPERATOR_EMAIL: studioOperatorEnvSchema.shape.STUDIO_OPERATOR_EMAIL
}).superRefine((value, context) => {
  const expected = `${value.NEXT_PUBLIC_STUDIO_URL}/api/connections/google/callback`;
  if (value.GOOGLE_OAUTH_REDIRECT_URI !== expected) {
    context.addIssue({ code: "custom", path: ["GOOGLE_OAUTH_REDIRECT_URI"], message: "Google redirect URI must exactly match the Studio callback" });
  }
}).transform((value) => ({
  clientId: value.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: value.GOOGLE_OAUTH_CLIENT_SECRET,
  encryptionKey: value.GOOGLE_TOKEN_ENCRYPTION_KEY,
  redirectUri: value.GOOGLE_OAUTH_REDIRECT_URI,
  operatorEmail: value.STUDIO_OPERATOR_EMAIL,
  studioOrigin: value.NEXT_PUBLIC_STUDIO_URL
}));

const optionalAnalyticsId = z.string().trim().regex(/^\d+$/).optional().transform((value) => value ?? null);
const optionalSearchSite = z.string().trim().min(1).refine((value) => {
  if (/^sc-domain:[a-z0-9.-]+$/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === ""; } catch { return false; }
}, "Expected an HTTPS URL-prefix or sc-domain Search Console property").optional().transform((value) => value ?? null);
const optionalPublisherId = z.string().regex(/^pub-\d{16}$/).optional().transform((value) => value ?? null);

const googleProviderEnvSchema = z.object({
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKeySchema,
  GOOGLE_ANALYTICS_PROPERTY_ID: optionalAnalyticsId,
  GOOGLE_SEARCH_CONSOLE_SITE_URL: optionalSearchSite,
  ADSENSE_PUBLISHER_ID: optionalPublisherId,
  NEXT_PUBLIC_BLOG_URL: z.string().url().refine((value) => new URL(value).protocol === "https:")
}).transform((value) => ({
  clientId: value.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: value.GOOGLE_OAUTH_CLIENT_SECRET,
  encryptionKey: value.GOOGLE_TOKEN_ENCRYPTION_KEY,
  analyticsPropertyId: value.GOOGLE_ANALYTICS_PROPERTY_ID,
  searchSiteUrl: value.GOOGLE_SEARCH_CONSOLE_SITE_URL,
  publisherId: value.ADSENSE_PUBLISHER_ID,
  blogOrigin: new URL(value.NEXT_PUBLIC_BLOG_URL).origin
}));

const googleReportEnvSchema = z.object({
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKeySchema,
  GOOGLE_ANALYTICS_PROPERTY_ID: z.string().trim().regex(/^\d+$/),
  GOOGLE_SEARCH_CONSOLE_SITE_URL: z.string().trim().min(1).refine((value) => {
    if (/^sc-domain:[a-z0-9.-]+$/i.test(value)) return true;
    try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === ""; } catch { return false; }
  }, "Expected an HTTPS URL-prefix or sc-domain Search Console property"),
  NEXT_PUBLIC_BLOG_URL: z.string().url().refine((value) => new URL(value).protocol === "https:")
}).transform((value) => ({
  clientId: value.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: value.GOOGLE_OAUTH_CLIENT_SECRET,
  encryptionKey: value.GOOGLE_TOKEN_ENCRYPTION_KEY,
  analyticsPropertyId: value.GOOGLE_ANALYTICS_PROPERTY_ID,
  searchSiteUrl: value.GOOGLE_SEARCH_CONSOLE_SITE_URL,
  blogOrigin: new URL(value.NEXT_PUBLIC_BLOG_URL).origin
}));

const adsenseReportEnvSchema = z.object({
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKeySchema,
  ADSENSE_PUBLISHER_ID: z.string().regex(/^pub-\d{16}$/),
  NEXT_PUBLIC_BLOG_URL: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  })
}).transform((value) => ({
  clientId: value.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: value.GOOGLE_OAUTH_CLIENT_SECRET,
  encryptionKey: value.GOOGLE_TOKEN_ENCRYPTION_KEY,
  publisherId: value.ADSENSE_PUBLISHER_ID,
  blogOrigin: new URL(value.NEXT_PUBLIC_BLOG_URL).origin
}));

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

export function parseStudioContentEnv(environment: Environment) {
  return studioContentEnvSchema.parse(environment);
}

export function parseGoogleOAuthEnv(environment: Environment = process.env) {
  return googleOAuthEnvSchema.parse(environment);
}

export function parseGoogleProviderEnv(environment: Environment = process.env) {
  return googleProviderEnvSchema.parse(environment);
}

export function parseGoogleReportEnv(environment: Environment = process.env) {
  return googleReportEnvSchema.parse(environment);
}

export function parseAdsenseReportEnv(environment: Environment = process.env) {
  return adsenseReportEnvSchema.parse(environment);
}
