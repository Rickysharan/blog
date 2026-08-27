# OmniLede Ecosystem Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing blog repository into a pinned npm workspace, add independently buildable Contributor and Ops application shells, define shared contracts, and establish a secure Supabase schema without disrupting the live blog.

**Architecture:** Keep the production blog at the repository root. Add two Next.js applications under `apps/`, four dependency-light shared packages under `packages/`, and versioned SQL under `supabase/`. Supabase Auth, Postgres, and Storage become the private system of record; Git remains the public article system of record.

**Tech Stack:** Node.js 20.19+, npm workspaces, Next.js 16.3.3 App Router, React 19.2, TypeScript 5.9.3, Tailwind CSS 3.4.19, Zod 4.4.3, Supabase JS 2.112.4, Supabase SSR 0.12.5, Supabase CLI 2.116.0, Vitest 4.1.11, Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-27-omnilede-contributor-ecosystem-design.md`](../specs/2026-08-27-omnilede-contributor-ecosystem-design.md)

## Global Constraints

- Preserve the existing root blog, MDX library, admin desk, and Netlify configuration.
- Keep the existing uncommitted `next-env.d.ts` change out of every plan commit unless the operator separately asks to include it.
- Pin every runtime and development dependency; commit `package-lock.json` after each dependency change.
- Before editing each Next.js area, re-read the corresponding installed guide in `node_modules/next/dist/docs/` because this repository uses Next.js 16 conventions such as `proxy.ts` and async request APIs.
- Use Supabase publishable keys in browser-safe configuration and a Supabase secret key only in server-only modules. Never expose the secret key through `NEXT_PUBLIC_*`.
- Do not apply migrations, seed cloud data, or fetch cloud secrets until the operator confirms the dedicated Supabase project. Existing projects `vita` and `panthrex` are out of scope until explicitly selected.
- Apply RLS to every table in an exposed schema. Authorization derives from `auth.uid()` plus server-managed `roles`, never from user-editable metadata.
- Authenticated routes are dynamic and return `Cache-Control: private, no-store`; create a Supabase client per request.
- Launch with `REDEMPTIONS_ENABLED=false`; do not add a paid provider or request a payment card.
- Use `apply_patch` for source edits. Stage only files named by the current task and make the listed commit before proceeding.

## Task 1: Establish the npm workspace without moving the blog

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `apps/contributor/package.json`
- Create: `apps/contributor/tsconfig.json`
- Create: `apps/contributor/next-env.d.ts`
- Create: `apps/contributor/next.config.mjs`
- Create: `apps/contributor/postcss.config.mjs`
- Create: `apps/contributor/tailwind.config.ts`
- Create: `apps/contributor/app/layout.tsx`
- Create: `apps/contributor/app/page.tsx`
- Create: `apps/contributor/app/globals.css`
- Create: `apps/contributor/app/page.test.tsx`
- Create: `apps/ops/package.json`
- Create: `apps/ops/tsconfig.json`
- Create: `apps/ops/next-env.d.ts`
- Create: `apps/ops/next.config.mjs`
- Create: `apps/ops/postcss.config.mjs`
- Create: `apps/ops/tailwind.config.ts`
- Create: `apps/ops/app/layout.tsx`
- Create: `apps/ops/app/page.tsx`
- Create: `apps/ops/app/globals.css`
- Create: `apps/ops/app/page.test.tsx`

**Workspace contract:**

```json
{
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build:blog": "npm run validate:content && next build --webpack",
    "build:contributor": "npm run build --workspace @omnilede/contributor",
    "build:ops": "npm run build --workspace @omnilede/ops",
    "build:all": "npm run build:blog && npm run build:contributor && npm run build:ops",
    "test:all": "npm test && npm test --workspaces --if-present",
    "typecheck:all": "npm run typecheck && npm run typecheck --workspaces --if-present"
  }
}
```

The `build:blog` script must be implemented as a separate existing-command alias such as `npm run validate:content && next build --webpack`; it must not recursively invoke `npm run build` after `build` is changed.

- [ ] Add failing page tests asserting `Contributor Studio` and `OmniLede Operations` headings and a visible `$0 launch mode` label.
- [ ] Run `npm test --workspace @omnilede/contributor -- app/page.test.tsx` and `npm test --workspace @omnilede/ops -- app/page.test.tsx`; record the expected missing-workspace failures.
- [ ] Add the workspace list and non-recursive scripts to the root package, then create both pinned application packages with `private: true` and the same Next/React/Tailwind/test versions as root.
- [ ] Create minimal App Router layouts and pages. Use Server Components by default, semantic `header`, `main`, and `footer` landmarks, skip links, visible focus styles, and no external data calls.
- [ ] Run `npm install`, both focused tests, `npm run typecheck:all`, `npm run build:contributor`, and `npm run build:ops`.
- [ ] Run `npm run build:blog` to prove that workspace conversion did not move or break the production blog.
- [ ] Commit: `chore: establish omnilede app workspace`

## Task 2: Create shared visual, config, contract, and testing packages

**Files:**

- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/content.ts`
- Create: `packages/contracts/src/content.test.ts`
- Create: `packages/contracts/src/operations.ts`
- Create: `packages/contracts/src/operations.test.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/env.test.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/status-badge.tsx`
- Create: `packages/ui/src/status-badge.test.tsx`
- Create: `packages/testing/package.json`
- Create: `packages/testing/tsconfig.json`
- Create: `packages/testing/src/index.ts`
- Create: `packages/testing/src/fixtures.ts`

**Shared domain contract:**

```ts
export const CATEGORIES = [
  "anime", "movies", "politics", "sports", "finance", "share-market",
] as const;
export const SUBMISSION_STATUSES = [
  "draft", "under_review", "manual_review", "changes_requested", "rejected",
  "approved", "publishing", "published", "publishing_failed",
] as const;
export const PROVIDER_HEALTH = [
  "available", "degraded", "exhausted", "disabled",
] as const;
export const ROLES = ["contributor", "reviewer", "admin"] as const;
export const REGIONS = [
  "global", "africa", "asia", "europe", "middle-east", "north-america",
  "latin-america", "oceania",
] as const;
```

`submissionInputSchema` must accept `title`, the constrained editor JSON document, category, region, BCP-47 language, primary source name, primary HTTPS source URL, private image path, `guidelinesVersion`, and literal `guidelinesAccepted: true`. It must reject unknown keys, non-HTTPS links, scripts, embedded HTML, unsupported editor nodes, and more than 40,000 text characters.

- [ ] Write contract tests for every accepted enum, rejection of unknown enum values, an accepted editor document, rejected raw HTML/script nodes, and a rejected `guidelinesAccepted: false` value.
- [ ] Write environment tests proving browser parsing returns only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and public site URLs while server parsing retains secrets.
- [ ] Write a component test proving each `StatusBadge` value has text in addition to colour and meets the status-to-label mapping.
- [ ] Run the three focused suites and verify they fail because the packages do not exist.
- [ ] Implement Zod schemas and inferred types in `@omnilede/contracts`; keep database row types out of this package.
- [ ] Implement `parsePublicEnv` and `parseServerEnv` in `@omnilede/config`. `parseServerEnv` must reject `REDEMPTIONS_ENABLED=true` unless `ALLOW_FUNDED_REDEMPTIONS=true` is also present, so launch cannot be enabled by a typo.
- [ ] Implement shared CSS custom properties for ink, paper, divider, electric blue, signal red, focus ring, spacing, and typography; implement an accessible `StatusBadge` with no app-specific data dependency.
- [ ] Add typed fixture builders with deterministic IDs and timestamps; never use random values in unit tests.
- [ ] Run `npm install`, `npm run test:all`, and `npm run typecheck:all`.
- [ ] Commit: `feat: add shared ecosystem packages`

## Task 3: Add explicit environment contracts and examples

**Files:**

- Create: `.env.ecosystem.example`
- Create: `apps/contributor/.env.example`
- Create: `apps/ops/.env.example`
- Create: `apps/contributor/lib/env.ts`
- Create: `apps/contributor/lib/env.test.ts`
- Create: `apps/ops/lib/env.ts`
- Create: `apps/ops/lib/env.test.ts`
- Modify: `.gitignore`

**Variable ownership:**

| Scope | Variables |
| --- | --- |
| Contributor public | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BLOG_URL`, `NEXT_PUBLIC_CONTRIBUTOR_URL` |
| Contributor server | `SUPABASE_SECRET_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `CLOUDFLARE_TEXT_MODEL`, `CLOUDFLARE_IMAGE_MODEL`, `CLOUDFLARE_EMBEDDING_MODEL`, `TAVILY_API_KEY`, `BREVO_API_KEY`, `BLOG_PUBLISH_URL`, `BLOG_PUBLISH_HMAC_SECRET`, `TURNSTILE_SECRET_KEY`, `REDEMPTIONS_ENABLED` |
| Ops public | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BLOG_URL`, `NEXT_PUBLIC_CONTRIBUTOR_URL` |
| Ops server | `SUPABASE_SECRET_KEY`, `GITHUB_REPOSITORY`, `GITHUB_READ_TOKEN`, `NETLIFY_ACCOUNT_SLUG`, `NETLIFY_READ_TOKEN`, `BLOG_NETLIFY_SITE_ID`, `CONTRIBUTOR_NETLIFY_SITE_ID`, `HEALTH_INGEST_HMAC_SECRET` |
| Blog server, added later | `CONTRIBUTOR_PUBLISH_HMAC_SECRET`, `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `GITHUB_PUBLISH_TOKEN` |

- [ ] Write tests that delete each required production variable in turn and assert the error names only the missing variable, never a secret value.
- [ ] Run both environment suites and verify they fail before the app adapters exist.
- [ ] Implement app-specific public/server schemas by composing `@omnilede/config`; use lazy getter functions so tests can supply isolated objects without mutating module state.
- [ ] Document purpose, provider dashboard, public/server classification, and free-tier behaviour beside every name in the example files. Values must be empty or safe booleans/URLs; include no real tokens.
- [ ] Add `.env`, `.env.local`, `.env.*.local`, Supabase dump plaintext, and provider export patterns to `.gitignore`, while explicitly allowing tracked `.env.example` files.
- [ ] Run `git grep -nE '(sb_secret_|github_pat_|sk-ant-|tvly-|xkeysib-)' -- ':!package-lock.json'`; the command must return no credential.
- [ ] Run `npm run test:all` and `npm run typecheck:all`.
- [ ] Commit: `chore: define ecosystem environment boundaries`

## Task 4: Create the identity, content, and audit database migration

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/202608270001_identity_content.sql`
- Create: `supabase/tests/001_identity_content.sql`

**Required SQL objects:**

- Schemas: exposed `public`; server-only `app_private` with no `anon` or `authenticated` usage grant.
- Enums: `app_role`, `account_status`, `submission_status`, `actor_type`, `decision_kind`, and `publication_state`, matching shared contract spellings.
- Tables: `profiles`, `roles`, `submissions`, `submission_revisions`, `review_decisions`, `publications`, `notifications`, and `audit_log`.
- Every mutable table has `created_at timestamptz not null default now()`; versioned rows also have `updated_at` and `version bigint not null default 1`.
- `submissions.author_id` references `auth.users(id)`; `submission_revisions` stores an immutable editor-document snapshot and SHA-256 content hash; `publications.submission_id` and `publications.article_slug` are unique.
- `audit_log` and `submission_revisions` reject UPDATE and DELETE through grants, policies, and triggers.

**RLS policy matrix:**

| Table | Contributor | Reviewer/Admin | Service server |
| --- | --- | --- | --- |
| profiles | SELECT/UPDATE own safe fields | SELECT all; status changes through private RPC | full via secret key |
| roles | no direct access | role query through private server DAL | full |
| submissions | SELECT/INSERT own; UPDATE own only in `draft`/`changes_requested` | SELECT all; decisions through private RPC | full |
| submission_revisions | SELECT own | SELECT all | INSERT/SELECT |
| review_decisions | SELECT for own submission | SELECT all | INSERT only through RPC |
| publications | SELECT own publication projection | SELECT all | INSERT/UPDATE |
| notifications | SELECT own; UPDATE own `read_at` only | no contributor-wide mutation | full |
| audit_log | none | SELECT through server DAL | INSERT/SELECT |

- [ ] Write pgTAP tests that create two contributor identities plus reviewer/admin identities and prove cross-user SELECT/UPDATE fails, contributor status escalation fails, user metadata cannot grant a role, and audit/revision rows cannot be altered.
- [ ] Run `npx supabase db reset`; record the expected failure before the migration exists. If Docker is unavailable, install/start Docker Desktop manually and mark this step **Manual — blocked by local runtime**, not passed.
- [ ] Write the migration with explicit table grants, RLS enabled and forced, separate SELECT/INSERT/UPDATE policies, both `USING` and `WITH CHECK` on UPDATE, indexed foreign keys, and `set search_path = ''` on every function.
- [ ] Put privileged mutations in `app_private` SECURITY DEFINER functions, revoke execution from `PUBLIC`, and grant only the intended server/database role. Do not expose them through `public`.
- [ ] Add an auth-user trigger that creates a minimal profile without trusting role or status values from metadata.
- [ ] Run `npx supabase db reset` and `npx supabase test db`; all SQL tests must pass.
- [ ] Commit: `feat: add secure contributor content schema`

## Task 5: Create review, rewards, topic, contact, and operations migrations

**Files:**

- Create: `supabase/migrations/202608270002_review_rewards_ops.sql`
- Create: `supabase/migrations/202608270003_storage.sql`
- Create: `supabase/tests/002_review_rewards_ops.sql`
- Create: `supabase/tests/003_storage.sql`

**Required tables and invariants:**

- Review: `review_runs`, `duplicate_matches`, `pipeline_events`; unique `(submission_id, submission_version, stage, attempt)` and sanitised provider result JSON capped by a database check.
- Reputation: `reputation_rules`, `reputation_snapshots`; effective-date ranges cannot overlap for the same rule scope.
- Rewards: `reward_rules`, `wallet_accounts`, append-only `wallet_transactions`, `redemption_requests`, `display_rates`; unique earn idempotency key and balance changed only by an `app_private.post_wallet_transaction` function inside one transaction.
- Topics: `trending_topics`, `topic_claims`; partial unique index enforces active-claim limits and one active claimant per topic, with expiry checked transactionally.
- Operations: `health_checks`, `daily_metrics`, `credential_metadata`; credential metadata columns are limited to provider, label, environment, dates, owner note, verification state, and rotation URL. No value/token/secret column is permitted.
- Contact: `contact_inquiries`; sender email and message are private, delivery/moderation state is server-managed.
- Global: `rate_limit_buckets` in `app_private`; `audit_log` entries for every privileged change.
- Storage: private `submission-images` and public-read `published-images`. Submission objects must live at `{auth.uid()}/{submission_uuid}/{uuid}.{ext}` and allow JPEG, PNG, or WebP up to 8 MiB.

- [ ] Write SQL tests for append-only wallet history, exactly-once earn credit, disabled redemption, active topic claim expiry, credential column allowlist, contact privacy, private images, owner-folder upload, reviewer signed reads, and published derivative reads.
- [ ] Run the SQL suites and capture the expected missing-object failures.
- [ ] Implement tables, indexes, exclusion/unique constraints, RPCs, grants, policies, and update/delete prevention triggers.
- [ ] Make `REDEMPTIONS_ENABLED` a database setting row defaulting to false as well as an application flag. The request RPC must reject unless both are true.
- [ ] For Storage UPDATE policies include SELECT, UPDATE `USING`, and UPDATE `WITH CHECK`; do not grant contributor access to another user's prefix.
- [ ] Run `npx supabase db reset`, `npx supabase test db`, and inspect the generated schema diff for unplanned objects.
- [ ] Commit: `feat: add review rewards and operations schema`

## Task 6: Add Supabase SSR clients and a server-side authorization DAL

**Files:**

- Modify: `apps/contributor/package.json`
- Modify: `apps/ops/package.json`
- Modify: `package-lock.json`
- Create: `apps/contributor/lib/supabase/client.ts`
- Create: `apps/contributor/lib/supabase/server.ts`
- Create: `apps/contributor/lib/supabase/proxy.ts`
- Create: `apps/contributor/proxy.ts`
- Create: `apps/contributor/lib/auth/authorization.ts`
- Create: `apps/contributor/lib/auth/authorization.test.ts`
- Create: `apps/ops/lib/supabase/server.ts`
- Create: `apps/ops/lib/supabase/proxy.ts`
- Create: `apps/ops/proxy.ts`
- Create: `apps/ops/lib/auth/authorization.ts`
- Create: `apps/ops/lib/auth/authorization.test.ts`

**Authorization interface:**

```ts
export type VerifiedIdentity = {
  userId: string;
  email: string;
  aal: "aal1" | "aal2";
  roles: readonly ("contributor" | "reviewer" | "admin")[];
};

export async function requireIdentity(): Promise<VerifiedIdentity>;
export async function requireReviewer(): Promise<VerifiedIdentity>;
export async function requireAdmin(options?: { requireMfa?: boolean }): Promise<VerifiedIdentity>;
```

- [ ] Write unit tests with a fake Supabase gateway proving missing/invalid claims fail, fresh role rows are queried server-side, `user_metadata.role=admin` is ignored, reviewers cannot enter admin-only Ops, and Ops requires `aal2`.
- [ ] Run the focused tests and verify they fail before implementation.
- [ ] Install pinned `@supabase/supabase-js@2.112.4` and `@supabase/ssr@0.12.5` in both apps.
- [ ] Implement request-scoped browser/server clients. Use `cookies()` asynchronously, apply all headers returned by SSR `setAll`, call `getClaims()` immediately in Proxy, and never cache authenticated responses.
- [ ] Implement `proxy.ts`, not `middleware.ts`, with a static matcher excluding `_next` assets and images. Proxy refreshes sessions only; final authorization remains in the DAL and every mutation.
- [ ] Implement the DAL so identity comes from verified claims and roles come from the database. Shape returned fields; never return raw auth or role rows to Client Components.
- [ ] Run focused tests, `npm run typecheck:all`, and both app builds.
- [ ] Commit: `feat: add request scoped supabase authorization`

## Task 7: Add deterministic development fixtures and cloud-application gate

**Files:**

- Create: `supabase/seed.sql`
- Create: `scripts/verify-supabase-target.ts`
- Create: `scripts/verify-supabase-target.test.ts`
- Modify: `package.json`
- Create: `docs/runbooks/supabase-provisioning.md`

**Fixture states:** under review, published, rejected, duplicate conflict, provider exhausted, wallet credit, expired topic claim, active Ops warning, failed email delivery, and no production identities.

- [ ] Write tests proving the target verifier refuses an unknown project, a project whose URL does not match `SUPABASE_PROJECT_REF`, and either known existing project unless `CONFIRMED_SUPABASE_PROJECT_REF` matches exactly.
- [ ] Run `npm test -- scripts/verify-supabase-target.test.ts` and confirm failure.
- [ ] Implement the verifier with redacted diagnostics and add scripts `db:reset`, `db:test`, `db:verify-target`, and `db:types`.
- [ ] Add repeatable local-only seed data using fixed UUIDs in the reserved test range. Ensure `supabase db reset` produces the same row counts twice.
- [ ] Document two cloud paths: confirm a dedicated existing project, or create a new Free project only after Supabase reports `$0` cost and the operator approves the organization/region. Mark project selection, login, CAPTCHA, and any key reveal as **Manual**.
- [ ] After explicit confirmation only, use the connected Supabase integration to inspect the target, apply the reviewed migrations, generate TypeScript types, and run security plus performance advisors. Do not continue on unresolved critical RLS findings.
- [ ] Save generated types to `packages/contracts/src/database.generated.ts`, rerun `npm run typecheck:all`, and commit only if the generated project is the confirmed target.
- [ ] Commit: `test: add ecosystem database fixtures and target guard`

## Plan Verification Gate

- [ ] Run `npm run lint`, `npm run typecheck:all`, `npm run test:all`, `npm run build:blog`, `npm run build:contributor`, and `npm run build:ops`.
- [ ] Run `npx supabase db reset && npx supabase test db` when Docker is available.
- [ ] Run `git diff --check` and the credential-pattern scan.
- [ ] Confirm the root blog routes and current MDX article count are unchanged.
- [ ] Confirm no cloud mutation occurred without the recorded Supabase target approval.
- [ ] Request code review before beginning the Contributor Platform plan.
