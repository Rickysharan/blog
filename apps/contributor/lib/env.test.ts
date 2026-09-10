import { describe, expect, test } from "vitest";

import { parseContributorPublicEnv, parseContributorServerEnv } from "./env";

const publicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_BLOG_URL: "https://omnilede.example",
  NEXT_PUBLIC_CONTRIBUTOR_URL: "https://contributors.omnilede.example"
};

const serverEnvironment = {
  ...publicEnvironment,
  SUPABASE_SECRET_KEY: "sb_secret_fixture",
  CLOUDFLARE_ACCOUNT_ID: "account",
  CLOUDFLARE_AI_TOKEN: "cf_token",
  CLOUDFLARE_TEXT_MODEL: "@cf/test/text",
  CLOUDFLARE_IMAGE_MODEL: "@cf/test/image",
  CLOUDFLARE_EMBEDDING_MODEL: "@cf/test/embed",
  TAVILY_API_KEY: "tvly_test",
  BREVO_API_KEY: "brevo_api_fixture",
  BLOG_PUBLISH_URL: "https://omnilede.example/api/internal/publications",
  BLOG_PUBLISH_HMAC_SECRET: "publish_hmac_fixture_value_32_chars_long",
  PUBLISHED_IMAGE_ORIGIN: "https://project.supabase.co/storage/v1/object/public/published-images",
  PUBLICATION_INTERNAL_SECRET: "publication_internal_fixture_secret_32_chars",
  PUBLICATION_CRON_SECRET: "publication_cron_fixture_secret_32_characters",
  TURNSTILE_SECRET_KEY: "turnstile_test",
  REDEMPTIONS_ENABLED: "false",
  ALLOW_FUNDED_REDEMPTIONS: "false"
};

describe("contributor environment", () => {
  test("public parsing returns only browser-safe keys", () => {
    const parsed = parseContributorPublicEnv({
      ...serverEnvironment,
      EXTRA_SERVER_VALUE: "must not leak"
    });

    expect(parsed).toEqual(publicEnvironment);
    expect(parsed).not.toHaveProperty("SUPABASE_SECRET_KEY");
    expect(parsed).not.toHaveProperty("CLOUDFLARE_AI_TOKEN");
  });

  test.each([
    "SUPABASE_SECRET_KEY",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_AI_TOKEN",
    "CLOUDFLARE_TEXT_MODEL",
    "CLOUDFLARE_IMAGE_MODEL",
    "CLOUDFLARE_EMBEDDING_MODEL",
    "TAVILY_API_KEY",
    "BREVO_API_KEY",
    "BLOG_PUBLISH_URL",
    "BLOG_PUBLISH_HMAC_SECRET",
    "PUBLISHED_IMAGE_ORIGIN",
    "PUBLICATION_INTERNAL_SECRET",
    "PUBLICATION_CRON_SECRET",
    "TURNSTILE_SECRET_KEY"
  ])("names a missing server variable without exposing its value: %s", (name) => {
    const environment = { ...serverEnvironment };
    delete environment[name as keyof typeof environment];

    expect(() => parseContributorServerEnv(environment)).toThrow(name);
    expect(() => parseContributorServerEnv(environment)).not.toThrow("publish_hmac_fixture_value_32_chars_long");
  });

  test("rejects redemption enablement without the independent funded gate", () => {
    expect(() =>
      parseContributorServerEnv({
        ...serverEnvironment,
        REDEMPTIONS_ENABLED: "true",
        ALLOW_FUNDED_REDEMPTIONS: "false"
      })
    ).toThrow("ALLOW_FUNDED_REDEMPTIONS");
  });

  test("accepts normal process environment extras and strips them from parsed output", () => {
    const parsed = parseContributorServerEnv({ ...serverEnvironment, PATH: "/usr/bin", NODE_ENV: "production" });
    expect(parsed).not.toHaveProperty("PATH");
    expect(parsed).not.toHaveProperty("NODE_ENV");
  });

  test("rejects a browser key in the server secret slot", () => {
    expect(() => parseContributorServerEnv({ ...serverEnvironment, SUPABASE_SECRET_KEY: "sb_publishable_test" })).toThrow(
      "SUPABASE_SECRET_KEY"
    );
  });

  test("accepts optional auth hardening settings", () => {
    expect(
      parseContributorServerEnv({
        ...serverEnvironment,
        AUTH_ALLOWED_ORIGINS: "https://contributors.omnilede.example",
        AUTH_RATE_LIMIT_SALT: "0123456789abcdef0123456789abcdef"
      }).AUTH_ALLOWED_ORIGINS
    ).toBe("https://contributors.omnilede.example");
  });

  test("retains only the canonical publication worker configuration", () => {
    const parsed = parseContributorServerEnv(serverEnvironment);
    expect(parsed.PUBLISHED_IMAGE_ORIGIN).toBe(
      "https://project.supabase.co/storage/v1/object/public/published-images",
    );
    expect(parsed.PUBLICATION_INTERNAL_SECRET).toBe("publication_internal_fixture_secret_32_chars");
    expect(() =>
      parseContributorServerEnv({
        ...serverEnvironment,
        PUBLISHED_IMAGE_ORIGIN: "https://project.supabase.co/storage/v1/object/public/submission-images",
      }),
    ).toThrow("PUBLISHED_IMAGE_ORIGIN");
  });
});
