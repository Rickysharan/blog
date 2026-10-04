import { describe, expect, test } from "vitest";

import { parseGoogleOAuthEnv, parseOpsPublicEnv, parseOpsServerEnv } from "./env";

const publicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_BLOG_URL: "https://omnilede.example",
  NEXT_PUBLIC_CONTRIBUTOR_URL: "https://contributors.omnilede.example",
  NEXT_PUBLIC_STUDIO_URL: "https://studio.omnilede.example"
};

const serverEnvironment = {
  ...publicEnvironment,
  SUPABASE_SECRET_KEY: "sb_secret_fixture",
  GITHUB_REPOSITORY: "Rickysharan/blog",
  GITHUB_READ_TOKEN: "github_read_test",
  NETLIFY_ACCOUNT_SLUG: "rickysharan999",
  NETLIFY_READ_TOKEN: "netlify_read_test",
  BLOG_NETLIFY_SITE_ID: "blog-site-id",
  CONTRIBUTOR_NETLIFY_SITE_ID: "contributor-site-id",
  HEALTH_INGEST_HMAC_SECRET: "health_hmac_fixture_value_32_chars_long",
  STUDIO_OPERATOR_EMAIL: "operator@example.com",
  AUTH_ALLOWED_ORIGINS: "https://studio.omnilede.example"
};

describe("ops environment", () => {
  test("public parsing returns only browser-safe keys", () => {
    const parsed = parseOpsPublicEnv({ ...serverEnvironment, SECRET: "hidden" });

    expect(parsed).toEqual(publicEnvironment);
    expect(parsed).not.toHaveProperty("GITHUB_READ_TOKEN");
    expect(parsed).not.toHaveProperty("NETLIFY_READ_TOKEN");
    expect(parsed).not.toHaveProperty("STUDIO_OPERATOR_EMAIL");
    expect(parsed).not.toHaveProperty("AUTH_ALLOWED_ORIGINS");
  });

  test.each([
    "SUPABASE_SECRET_KEY",
    "GITHUB_REPOSITORY",
    "GITHUB_READ_TOKEN",
    "NETLIFY_ACCOUNT_SLUG",
    "NETLIFY_READ_TOKEN",
    "BLOG_NETLIFY_SITE_ID",
    "CONTRIBUTOR_NETLIFY_SITE_ID",
    "HEALTH_INGEST_HMAC_SECRET",
    "STUDIO_OPERATOR_EMAIL",
    "AUTH_ALLOWED_ORIGINS"
  ])("names a missing server variable without exposing its value: %s", (name) => {
    const environment = { ...serverEnvironment };
    delete environment[name as keyof typeof environment];

    expect(() => parseOpsServerEnv(environment)).toThrow(name);
    expect(() => parseOpsServerEnv(environment)).not.toThrow("health_hmac_test");
  });

  test("rejects non-HTTPS public URLs", () => {
    expect(() =>
      parseOpsPublicEnv({ ...publicEnvironment, NEXT_PUBLIC_BLOG_URL: "http://localhost" })
    ).toThrow("HTTPS");
  });

  test("accepts normal process environment extras and strips them from parsed output", () => {
    const parsed = parseOpsServerEnv({ ...serverEnvironment, PATH: "/usr/bin", NODE_ENV: "production" });
    expect(parsed).not.toHaveProperty("PATH");
    expect(parsed).not.toHaveProperty("NODE_ENV");
  });

  test("requires HTTPS same-origin entries for Studio authentication", () => {
    expect(() =>
      parseOpsServerEnv({ ...serverEnvironment, AUTH_ALLOWED_ORIGINS: "https://studio.example,https://preview.example" })
    ).not.toThrow();
    expect(() =>
      parseOpsServerEnv({ ...serverEnvironment, AUTH_ALLOWED_ORIGINS: "https://studio.example/path" })
    ).toThrow("AUTH_ALLOWED_ORIGINS");
    expect(() =>
      parseOpsServerEnv({ ...serverEnvironment, AUTH_ALLOWED_ORIGINS: "http://studio.example" })
    ).toThrow("AUTH_ALLOWED_ORIGINS");
  });

  test.each(["sb_publishable_test", "service_role"])("rejects an invalid server key: %s", (key) => {
    expect(() => parseOpsServerEnv({ ...serverEnvironment, SUPABASE_SECRET_KEY: key })).toThrow(
      "SUPABASE_SECRET_KEY"
    );
  });

  test("keeps Google OAuth secrets server-only and requires an exact callback and 256-bit key", () => {
    const google = {
      ...publicEnvironment,
      STUDIO_OPERATOR_EMAIL: "Operator@Example.com",
      GOOGLE_OAUTH_CLIENT_ID: "client.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "client-secret-fixture",
      GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
      GOOGLE_OAUTH_REDIRECT_URI: "https://studio.omnilede.example/api/connections/google/callback"
    };
    expect(parseGoogleOAuthEnv(google)).toMatchObject({ operatorEmail: "operator@example.com", redirectUri: google.GOOGLE_OAUTH_REDIRECT_URI });
    expect(parseOpsPublicEnv(google)).not.toHaveProperty("GOOGLE_OAUTH_CLIENT_SECRET");
    expect(() => parseGoogleOAuthEnv({ ...google, GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(31).toString("base64") })).toThrow("32-byte");
    expect(() => parseGoogleOAuthEnv({ ...google, GOOGLE_OAUTH_REDIRECT_URI: "https://studio.omnilede.example/other" })).toThrow("exactly match");
  });
});
