import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { createSupabaseAdminClient } from "./admin";

const environment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test_key",
};

describe("createSupabaseAdminClient", () => {
  test("creates a fresh service-only client from validated server environment", () => {
    const first = createSupabaseAdminClient(environment);
    const second = createSupabaseAdminClient(environment);

    expect(first).not.toBe(second);
    expect(first.auth).toBeDefined();
  });

  test("rejects an invalid URL or non-secret key", () => {
    expect(() => createSupabaseAdminClient({ ...environment, SUPABASE_URL: "http://not-https.invalid" })).toThrow();
    expect(() => createSupabaseAdminClient({ ...environment, SUPABASE_SECRET_KEY: "sb_publishable_test_key" })).toThrow();
  });

  test("marks the DAL module server-only so a Client Component import is blocked by Next", async () => {
    const source = await readFile(path.join(process.cwd(), "lib/supabase/admin.ts"), "utf8");

    expect(source).toMatch(/^import "server-only";/);
  });
});
