import { describe, expect, test } from "vitest";

import { parsePublicEnv, parseServerEnv, parseSupabasePublicEnv, parseSupabaseServerEnv } from "./env";

const environment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  NEXT_PUBLIC_BLOG_URL: "https://omnilede.example",
  NEXT_PUBLIC_CONTRIBUTOR_URL: "https://contributor.omnilede.example",
  SUPABASE_SECRET_KEY: "sb_secret_test_key",
  REDEMPTIONS_ENABLED: "false",
  ALLOW_FUNDED_REDEMPTIONS: "false"
} as const;

describe("environment parsing", () => {
  test("returns only browser-safe values from public parsing", () => {
    expect(parsePublicEnv(environment)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      NEXT_PUBLIC_BLOG_URL: "https://omnilede.example",
      NEXT_PUBLIC_CONTRIBUTOR_URL: "https://contributor.omnilede.example"
    });
  });

  test("retains server secrets when parsing server configuration", () => {
    expect(parseServerEnv(environment)).toMatchObject({
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
      REDEMPTIONS_ENABLED: false,
      ALLOW_FUNDED_REDEMPTIONS: false
    });
  });

  test("requires an explicit funded-redemption gate", () => {
    expect(() => parseServerEnv({ ...environment, REDEMPTIONS_ENABLED: "true" })).toThrow(
      "REDEMPTIONS_ENABLED=true requires ALLOW_FUNDED_REDEMPTIONS=true"
    );
  });

  test("rejects a server or service key in the browser publishable slot", () => {
    expect(() => parseSupabasePublicEnv({ ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" })).toThrow();
    expect(() => parsePublicEnv({ ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "service_role" })).toThrow();
    expect(() => parseSupabasePublicEnv({ ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature" })).toThrow();
  });

  test("rejects a browser key in the server secret slot", () => {
    expect(() => parseSupabaseServerEnv({ ...environment, SUPABASE_SECRET_KEY: "sb_publishable_test" })).toThrow();
    expect(() => parseSupabaseServerEnv({ ...environment, SUPABASE_SECRET_KEY: "service_role" })).toThrow();
  });
});
