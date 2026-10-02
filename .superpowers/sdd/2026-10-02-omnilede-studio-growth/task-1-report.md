# Task 1 report — Studio database, operator authorization, and responsive PWA shell

## Implementation summary

Implemented the protected OmniLede Studio foundation at no cost and without any
external account action. The change adds the Studio control-plane migration and
contracts; a server-authorized, configured-email operator gate; Google OAuth
callback handling with origin and return-path validation; the eight-route
responsive Studio shell; and a Serwist PWA configured to cache only versioned
shell assets. All Studio documents and API requests resolve to `NetworkOnly`.

The root route now directs a verified Studio operator to `/overview` and every
Studio route is protected by the route-group layout. An unauthorised, suspended,
wrong-email, or forged-metadata session is redirected to `/login` before Studio
content renders. OAuth status and safe display labels remain in the public
provider connection table; encrypted credential material is stored only in
`app_private.provider_credentials`.

I removed the accidental, untracked `apps/ops/app/page.test 2.tsx`. It was an
obsolete pre-Studio test for the former Operations landing page, was not listed
in the brief, and would conflict with the new root redirect behavior.

## Files changed

- `supabase/migrations/202610020001_studio_control_plane.sql`
- `tests/database/studio-control-plane.test.ts`
- `packages/contracts/src/studio.ts`
- `packages/contracts/src/studio.test.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/package.json`
- `apps/ops/.env.example`
- `apps/ops/lib/env.ts`, `apps/ops/lib/env.test.ts`
- `apps/ops/lib/auth/operator.ts`, `apps/ops/lib/auth/operator.test.ts`
- `apps/ops/app/auth/callback/route.ts`, `apps/ops/app/auth/callback/route.test.ts`
- `apps/ops/app/(auth)/login/page.tsx`
- `apps/ops/app/(studio)/layout.tsx`, `apps/ops/app/(studio)/[section]/page.tsx`
- `apps/ops/components/studio-shell.tsx`
- `apps/ops/app/manifest.ts`, `apps/ops/app/sw.ts`
- `apps/ops/lib/pwa/runtime-caching.ts`, `apps/ops/lib/pwa/runtime-caching.test.ts`
- `apps/ops/public/icons/studio-icon-v1.svg`, `apps/ops/public/icons/studio-maskable-v1.svg`
- `apps/ops/app/layout.tsx`, `apps/ops/app/page.tsx`, `apps/ops/app/page.test.tsx`, and `apps/ops/app/globals.css`
- `apps/ops/next.config.mjs`, `apps/ops/package.json`, `apps/ops/tsconfig.json`, and `package-lock.json`

The build-generated `apps/ops/public/sw.js` remains ignored by the repository
rule for generated service workers and is not part of the commit.

## TDD evidence

### Inherited from the interrupted implementer

The prior implementer reported the following RED/GREEN cycles, but their raw
terminal output was unavailable after interruption:

- contracts and migration: 18 focused assertions first failed because the
  Studio contracts and migration did not exist, then passed;
- operator/callback/environment: 29 focused assertions, including the allowed
  preview-origin callback case, first failed then passed;
- shell/PWA: 25 focused assertions first failed then passed.

These are inherited reports only; they are not represented as fresh evidence.

### Freshly verified GREEN evidence

- `npm test -- packages/contracts/src/studio.test.ts tests/database/studio-control-plane.test.ts`
  → exit 0; 2 files and 18 tests passed.
- `npm run test --workspace @omnilede/ops`
  → exit 0; 6 files and 61 tests passed.
- `npm run test --workspace @omnilede/contracts`
  → exit 0; 6 files and 90 tests passed.
- `npm run typecheck --workspace @omnilede/ops`
  → exit 0.
- `npm run typecheck --workspace @omnilede/contracts`
  → exit 0.
- `npm test`
  → exit 0; 131 files and 780 tests passed.
- `npm run build --workspace @omnilede/ops`
  → exit 0; Next.js 16.3.3 production build and Serwist service-worker bundle
  completed successfully.
- `git diff --check`
  → exit 0; no whitespace errors.

No production behavior was modified during this handoff beyond removing the
obsolete duplicate test file, so no additional RED/GREEN cycle was required.

## Required database verification

`npm run db:test` was run fresh and did not pass because the local Supabase
database was unavailable:

```text
Connecting to local database...
{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect to postgres: effect/sql/SqlError: PgClient: Failed to connect"}}
```

`supabase status`, `docker ps`, and `supabase start` each produced no service
status before their 30-second command window elapsed. This indicates that local
Docker/Supabase infrastructure was unreachable; it does not identify a
migration failure. The static migration coverage above passed.

## Self-review

- Confirmed the migration creates all five required stores, enables RLS,
  revokes all browser-role access to the credential table, grants its access
  only to `service_role`, bounds report JSON to 500,000 bytes, and makes the
  new publication events immutable.
- Confirmed Studio authorization uses verified claims and server-side role rows
  through `requireIdentity()`; it ignores client-controlled metadata and
  compares the configured operator email case-insensitively.
- Confirmed callback code exchange occurs only for configured HTTPS origins,
  redirects stay on the callback origin, unsafe `next` values fall back to
  `/overview`, and responses are private/no-store.
- Confirmed both shell navigations contain each required route and the runtime
  cache puts icons and hashed shell assets before the same-origin `NetworkOnly`
  catch-all.
- Confirmed no paid dependency, card-required service, billing change, or
  billable API was added. Serwist was already a root dependency; this task
  wires it into the Ops workspace only.

## Concerns

The local database integration suite remains unverified because local
Supabase/Postgres could not be reached. A running local Supabase stack is
required to rerun `npm run db:test`; all other focused, workspace, full-suite,
typecheck, build, and whitespace checks pass with fresh output.

## Fix round 1 — publication privilege and task-state invariants

### Changes

- `supabase/migrations/202610020001_studio_control_plane.sql` now explicitly
  executes `revoke all on table public.publication_events from service_role`
  before granting only `SELECT, INSERT`. This removes inherited direct
  `TRUNCATE` (and other mutation) rights which an append-only trigger cannot
  intercept.
- `supabase/tests/014_studio_control_plane.sql` adds executable pgTAP coverage
  for the effective service-role privileges and rejected direct `UPDATE`,
  `DELETE`, and `TRUNCATE` attempts against publication history.
- `tests/database/studio-control-plane.test.ts` statically requires the new
  explicit revoke.
- `packages/contracts/src/studio.ts` applies the same state/timestamp rule to
  both input and persisted-row schemas: completed requires `completedAt` and
  no postponement, postponed requires `postponedUntil` and no completion, and
  open requires neither timestamp.
- `packages/contracts/src/studio.test.ts` covers all invalid combinations for
  both schemas and each valid state combination.

### Fresh RED/GREEN evidence

The first RED attempt, after adding the tests before production changes,
could not start because the local Vite dependency tree was corrupt:

```text
TypeError: parse.fastpaths is not a function
at .../node_modules/vite/node_modules/picomatch/lib/picomatch.js:313:27
```

Directly loading that local `picomatch/lib/parse` module showed
`typeof parse.fastpaths === "undefined"` and stalled on source reads. I
restored the lockfile-pinned tree with `npm ci` (exit 0; 735 packages added),
then executed the tests again.

To obtain a verified RED signal after the original runner fault, I
reversibly removed the new service-role revoke and both schema refinements and
ran:

```text
npm test -- packages/contracts/src/studio.test.ts tests/database/studio-control-plane.test.ts
→ exit 1; 7 failed and 20 passed.
```

The failures were the static missing-revoke assertion and all six invalid
state/timestamp cases, each because parsing no longer threw. After restoring
the production changes, the same command passed:

```text
npm test -- packages/contracts/src/studio.test.ts tests/database/studio-control-plane.test.ts
→ exit 0; 2 files and 27 tests passed.
```

Additional fresh verification:

- `npm run test --workspace @omnilede/contracts && npm run test --workspace @omnilede/ops`
  → exit 0; 99 contract tests and 61 Ops tests passed.
- `npm run typecheck --workspace @omnilede/contracts && npm run typecheck --workspace @omnilede/ops`
  → exit 0.
- `npm run build --workspace @omnilede/ops` → exit 0; the Next.js production
  build and Serwist service-worker bundle completed.
- Warm `npm test` → exit 0; 131 files and 789 tests passed.
- `git diff --check` → exit 0.

The first full run immediately after `npm ci` had four unrelated 5-second
timeouts in `lib/content/articles.test.ts` and `app/metadata-surfaces.test.ts`
while cold transforms took hundreds of seconds. The warmed rerun above passed
every test, so no unrelated source change was made.

`npm run db:test` was also rerun fresh. It remains unavailable because local
Postgres cannot be reached:

```text
Connecting to local database...
{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect to postgres: effect/sql/SqlError: PgClient: Failed to connect"}}
```

The new pgTAP file is present and follows the repository's executable
database-test conventions, but it cannot run until the local Supabase stack is
available.

### Fix-round self-review and concern

The explicit revoke precedes the narrow grant, so inherited grants cannot
retain `TRUNCATE`; the pgTAP assertions check every privilege that matters and
the three mutation paths. The contract check is applied independently to input
and row schemas, preserving strict object validation and database-equivalent
timestamp combinations.

The only remaining concern is the unavailable local Supabase/Postgres service;
database-level execution of `supabase/tests/014_studio_control_plane.sql`
awaits that infrastructure.
