import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202610020001_studio_control_plane.sql"
);

function migrationSql() {
  return readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();
}

describe("Studio control-plane migration", () => {
  test("creates the task, provider, report, credential, and publication stores", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table public.studio_tasks");
    expect(sql).toContain("create table public.provider_connections");
    expect(sql).toContain("create table app_private.provider_credentials");
    expect(sql).toContain("create table public.provider_report_cache");
    expect(sql).toContain("create table public.publication_events");
    expect(sql).toMatch(/category in \('anime', 'movies', 'politics', 'sports', 'finance', 'share-market'\)/);
    expect(sql).toMatch(/state in \('connected', 'delayed', 'stale', 'unavailable', 'disconnected'\)/);
  });

  test("keeps credentials server-only and all Studio tables behind row-level security", () => {
    const sql = migrationSql();

    for (const table of [
      "public.studio_tasks",
      "public.provider_connections",
      "app_private.provider_credentials",
      "public.provider_report_cache",
      "public.publication_events"
    ]) {
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
    expect(sql).toContain(
      "revoke all on table app_private.provider_credentials from public, anon, authenticated"
    );
    expect(sql).toContain("grant all on table app_private.provider_credentials to service_role");
  });

  test("bounds cached provider JSON and makes publication history append-only", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/octet_length\(data::text\) <= 500000/);
    expect(sql).toContain("create trigger publication_events_append_only");
    expect(sql).toContain("before update or delete on public.publication_events");
    expect(sql).toContain("raise exception 'publication_events_are_append_only'");
    expect(sql).toContain("revoke all on table public.publication_events from service_role");
    expect(sql).toContain("grant select, insert on table public.publication_events to service_role");
  });
});
