# OmniLede Ops and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the protected Ops application, add truthful provider/health/pipeline monitoring and encrypted backups, harden CI, create two new Netlify projects alongside the existing blog, configure environments safely, and verify the complete ecosystem live.

**Architecture:** Ops is a separately deployed, dynamic Next.js application. Supabase stores operational events and non-secret credential metadata. Server-only adapters read GitHub and Netlify APIs with least-privilege tokens; provider gaps are rendered as unavailable rather than invented. Scheduled public-repository GitHub Actions perform bounded health checks and encrypted database exports. The existing `omnilede-news` project remains the blog; `omnilede-contributors` and `omnilede-ops` are separately linked monorepo sites.

**Tech Stack:** Foundation stack, GitHub REST API, Netlify REST API/browser dashboard, Supabase integration, GitHub Actions, YAML 2.9.0, Playwright/browser automation, encrypted `pg_dump` artifacts with age.

**Spec:** [`docs/superpowers/specs/2026-08-27-omnilede-contributor-ecosystem-design.md`](../specs/2026-08-27-omnilede-contributor-ecosystem-design.md)

## Global Constraints

- Complete and verify all three preceding plans before live deployment.
- Ops requires a verified Supabase `admin` role and `aal2` MFA on every page and mutation. Proxy/session presence is an optimization, not authorization.
- Ops is dynamic and private: `Cache-Control: private, no-store`, no offline PWA, no shared caching of user-specific data.
- Store only credential metadata. No credential value, last characters, hash of the secret, or recoverable encrypted secret belongs in Supabase.
- GitHub Ops token is read-only; GitHub publishing token remains separate and contents-write scoped. Netlify Ops token is read-only.
- Display only sourced values. Each metric is tagged `live`, `calculated`, `unavailable`, or `placeholder` with source and observation time.
- Detect whether Netlify reports credit-based or legacy build-minute usage; if no reliable API field exists, show `Unavailable` plus the dashboard link.
- Public-repository GitHub Actions are labelled non-billable only when the repository visibility/API evidence confirms public. Never invent a remaining-minutes balance.
- Scheduled jobs have bounded timeouts, item counts, artifact retention, and no paid fallback.
- Never put secrets in workflow YAML, command output, build logs, browser chat, committed env files, or screenshots. Any previously exposed token is revoked rather than reused.
- Every external mutation—project creation, environment secret entry, production deploy, migration, or workflow-secret configuration—requires action-time confirmation and an exact target check.
- Make the listed commit after each task; keep the unrelated root `next-env.d.ts` edit unstaged.

## Task 1: Build an MFA-protected Ops shell with distinct operating desks

**Files:**

- Modify: `apps/ops/app/layout.tsx`
- Modify: `apps/ops/app/globals.css`
- Delete: `apps/ops/app/page.tsx`
- Create: `apps/ops/app/login/page.tsx`
- Create: `apps/ops/app/auth/callback/route.ts`
- Create: `apps/ops/app/(protected)/layout.tsx`
- Create: `apps/ops/app/(protected)/page.tsx`
- Create: `apps/ops/app/(protected)/blog/page.tsx`
- Create: `apps/ops/app/(protected)/contributor/page.tsx`
- Create: `apps/ops/app/(protected)/credentials/page.tsx`
- Create: `apps/ops/components/ops-nav.tsx`
- Create: `apps/ops/components/metric-card.tsx`
- Create: `apps/ops/components/metric-card.test.tsx`
- Create: `apps/ops/lib/auth/require-ops.ts`
- Create: `apps/ops/lib/auth/require-ops.test.ts`
- Create: `apps/ops/tests/e2e/access.spec.ts`
- Create: `apps/ops/app/api/auth/login/route.ts`
- Create: `apps/ops/app/api/auth/logout/route.ts`
- Create: `apps/ops/app/api/auth/mfa/challenge/route.ts`
- Create: `scripts/bootstrap-admin.ts`
- Create: `scripts/bootstrap-admin.test.ts`
- Create: `docs/runbooks/admin-bootstrap.md`

**Metric envelope:**

```ts
export type ObservedMetric<T> = {
  value: T | null;
  status: "live" | "calculated" | "unavailable" | "placeholder";
  source: string;
  observedAt: string | null;
  detailsUrl: string | null;
};
```

- [ ] Write access tests for anonymous redirect, contributor/reviewer denial, admin at `aal1` redirected to MFA, admin at `aal2` success, and fresh server role lookup on every request.
- [ ] Write component tests proving status/source/time appear as text, unavailable never renders numeric zero, warnings are not colour-only, and Blog/Contributor tabs are distinct.
- [ ] Run tests and confirm failure.
- [ ] Implement login using the existing Supabase Auth session and TOTP challenge. Do not create a second password database or reuse the blog's legacy admin password.
- [ ] Implement the one-time admin bootstrap script so it requires exact `CONFIRMED_SUPABASE_PROJECT_REF` and `CONFIRMED_ADMIN_EMAIL`, resolves the already-confirmed Auth user server-side, inserts a server-managed role plus audit row, refuses ambiguous/existing conflicting grants, and never accepts a password or auth token argument.
- [ ] Implement protected layouts and summary cards: articles published this month, submissions this month, pending reviews, active warnings.
- [ ] Add Blog Ops, Contributor Ops, Credentials, and Audit navigation with semantic tabs/links, keyboard focus, dense tables, and responsive overflow.
- [ ] Run tests, typecheck, and Ops build.
- [ ] Commit: `feat(ops): add mfa protected operations shell`

## Task 2: Implement read-only GitHub and Netlify provider adapters

**Files:**

- Create: `apps/ops/lib/providers/types.ts`
- Create: `apps/ops/lib/providers/http.ts`
- Create: `apps/ops/lib/providers/github.ts`
- Create: `apps/ops/lib/providers/github.test.ts`
- Create: `apps/ops/lib/providers/netlify.ts`
- Create: `apps/ops/lib/providers/netlify.test.ts`
- Create: `apps/ops/lib/providers/provider-error.ts`

**Adapter outputs:**

- GitHub: repository visibility, default branch, latest workflow runs, status/conclusion, created/updated times, duration, actor-safe label, run/log URL, and rate-limit status.
- Netlify: selected account/site identity, current deploys, state, created/published times, duration when derivable, deploy URL, failure/log URL, and usage model/value only if authoritative fields exist.
- Every adapter: health `available|degraded|exhausted|disabled`, retryability, observation time, and sanitised error code.

- [ ] Write HTTP-fake tests for success, pagination cap, timeout, 401/403 disabled, 404 wrong target, 429 exhausted, 5xx degraded, malformed/oversized response, site/repository mismatch, token redaction, and stale observation.
- [ ] Add Netlify fixtures for credit-based response, legacy-minute response, and no usage field; the third must return `unavailable`, never an estimate presented as live.
- [ ] Add GitHub tests proving non-billable text appears only when API visibility is `public`; private/unknown visibility must not make a billing claim.
- [ ] Run tests and confirm failure.
- [ ] Implement fixed official HTTPS API bases, 15-second timeout, bounded pagination, response size cap, read-only methods, and parsed Zod response subsets.
- [ ] Keep raw provider payloads out of Client Components and database rows. Return only shaped dashboard fields.
- [ ] Run focused tests and credential scan.
- [ ] Commit: `feat(ops): add truthful infrastructure adapters`

## Task 3: Build Blog Ops and Contributor Ops data services

**Files:**

- Create: `apps/ops/lib/dashboard/blog-ops.ts`
- Create: `apps/ops/lib/dashboard/blog-ops.test.ts`
- Create: `apps/ops/lib/dashboard/contributor-ops.ts`
- Create: `apps/ops/lib/dashboard/contributor-ops.test.ts`
- Create: `apps/ops/components/deploy-table.tsx`
- Create: `apps/ops/components/workflow-table.tsx`
- Create: `apps/ops/components/pipeline-status.tsx`
- Modify: `apps/ops/app/(protected)/blog/page.tsx`
- Modify: `apps/ops/app/(protected)/contributor/page.tsx`

**Blog Ops displays:** blog uptime/latency/last check; recent deploys; detected Netlify usage model; GitHub workflow state/duration/log link; root content publication count.

**Contributor Ops displays:** app uptime/deploys; queues by status/age; daily automated/manual/reject/publish counts; Cloudflare/Tavily/Brevo/embedding health; quota/rate-limit/retry warnings.

- [ ] Write service tests with mixed live/unavailable inputs, empty history, stale health, mismatched site ID, failed deploy, public/private GitHub visibility, provider exhaustion, and current-month UTC boundaries.
- [ ] Write component tests for accessible table captions, sortable text labels, safe external links, no secret/error detail, and `No observations yet` rather than zero where data is absent.
- [ ] Run tests and confirm failure.
- [ ] Implement server-only aggregation using parallel independent reads and `Promise.allSettled`; one provider failure must not blank unrelated panels.
- [ ] Read counts from Supabase with exact UTC boundaries and server-side role checks. Label database calculations `calculated` and include the query observation time.
- [ ] Render warnings by severity, affected system, first/last observation, retryability, and a safe runbook link.
- [ ] Run tests, typecheck, and Ops build.
- [ ] Commit: `feat(ops): add blog and contributor operations desks`

## Task 4: Implement bounded health ingestion and on-demand refresh

**Files:**

- Create: `packages/contracts/src/health.ts`
- Create: `packages/contracts/src/health.test.ts`
- Create: `apps/ops/app/api/internal/health/route.ts`
- Create: `apps/ops/app/api/internal/health/route.test.ts`
- Create: `apps/ops/app/api/health/refresh/route.ts`
- Create: `apps/ops/lib/health/service.ts`
- Create: `apps/ops/lib/health/service.test.ts`
- Create: `scripts/check-health.ts`
- Create: `scripts/check-health.test.ts`
- Create: `app/api/health/route.ts`
- Create: `app/api/health/route.test.ts`
- Create: `apps/contributor/app/api/health/route.ts`
- Create: `apps/contributor/app/api/health/route.test.ts`

**Health payload:** check ID, target key (`blog|contributor|blog_publish|contributor_review`), URL identifier (not arbitrary URL), `healthy|degraded|down`, HTTP status or null, response milliseconds, checked-at timestamp, and sanitised failure code. Target URLs resolve from server configuration to prevent SSRF.

- [ ] Write contract/tests for allowed targets, URL allowlist, redirect cap, timeout, DNS/transport error, response size, timestamp window, HMAC tamper, nonce replay, and no raw response body/IP persisted.
- [ ] Run tests and confirm failure.
- [ ] Implement minimal public readiness routes for the blog publish dependency and Contributor review dependency. Return only component state, release identifier, and observation time; never return provider errors, database details, or secrets.
- [ ] Implement health checks with HEAD then bounded GET fallback, 10-second timeout, maximum two redirects restricted to the same configured origin, and no arbitrary target input.
- [ ] Implement signed ingest with the shared canonical/HMAC pattern and a separate health secret/audience.
- [ ] Implement admin-triggered refresh with database cooldown and one bounded batch; repeated clicks return the recent observation instead of launching loops.
- [ ] Run unit/integration tests.
- [ ] Commit: `feat(ops): add signed bounded health checks`

## Task 5: Build credential metadata and rotation reminders

**Files:**

- Create: `apps/ops/app/api/credentials/route.ts`
- Create: `apps/ops/app/api/credentials/[id]/route.ts`
- Create: `apps/ops/lib/credentials/repository.ts`
- Create: `apps/ops/lib/credentials/repository.test.ts`
- Create: `apps/ops/lib/credentials/warnings.ts`
- Create: `apps/ops/lib/credentials/warnings.test.ts`
- Create: `apps/ops/components/credential-form.tsx`
- Create: `apps/ops/components/credential-form.test.tsx`
- Modify: `apps/ops/app/(protected)/credentials/page.tsx`
- Create: `docs/runbooks/credential-rotation.md`

**Accepted metadata fields:** `label`, `provider`, `environment`, `addedAt`, optional `expiresAt`, `ownerNote`, `verificationState`, `lastVerifiedAt`, and approved HTTPS rotation checklist URL. Field names containing `secret`, `token`, `keyValue`, `credentialValue`, `password`, or `privateKey` are rejected.

- [ ] Write route/repository tests for admin+MFA, unknown keys, suspected secret pasted into notes, unsafe URL, 14/7/1-day warning thresholds, no-expiry state, verify success/failure, immutable audit, and concurrent version conflict.
- [ ] Write component tests that instruct `Never paste the credential value here`, show due dates as text, and require confirmation for delete/archive.
- [ ] Run tests and confirm failure.
- [ ] Implement strict schemas, heuristic secret-pattern rejection/redaction, optimistic versions, and audit entries. Archive metadata instead of deleting audit history.
- [ ] Connection verification calls a provider's harmless identity/read endpoint using the environment-held secret and stores only outcome/time/sanitised code.
- [ ] Document rotations for GitHub publish/read, Netlify read, Supabase secret/publishable, Cloudflare, Tavily, Brevo, HMAC, and backup recipient. Rotation remains **Manual** because only the operator may create/reveal/replace secrets.
- [ ] Run tests and Ops build.
- [ ] Commit: `feat(ops): add non-secret credential reminders`

## Task 6: Add scheduled health, pipeline, and encrypted backup workflows

**Files:**

- Create: `.github/workflows/health-check.yml`
- Create: `.github/workflows/pipeline-run.yml`
- Create: `.github/workflows/encrypted-backup.yml`
- Create: `scripts/run-pipeline-cron.ts`
- Create: `scripts/run-pipeline-cron.test.ts`
- Create: `scripts/verify-encrypted-backup.sh`
- Create: `tests/config/operations-workflows.test.ts`
- Create: `docs/runbooks/backup-restore.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Schedules:** health every 30 minutes; review/publication pipeline daily plus manual dispatch; encrypted database backup weekly. Concurrency groups cancel an older scheduled run but not a manual recovery run. Permissions default to `contents: read`; no workflow gets `contents: write` unless its exact job needs it.

- [ ] Write workflow-structure tests parsing YAML and asserting public triggers, permissions, concurrency, timeout-minutes, secret references, no literal secrets, pinned action major versions, artifact retention at most seven days, and no paid runner label.
- [ ] Write pipeline script tests for signed endpoints, max batch/time, partial failure reporting, and no tight retries.
- [ ] Run tests and confirm failure.
- [ ] Install pinned `yaml@2.9.0` as a root development dependency and parse workflows structurally in tests rather than matching fragile text.
- [ ] Implement health workflow using signed ingest and bounded curl/Node checks. Treat an ingest failure as a failed run visible in GitHub.
- [ ] Implement pipeline workflow invoking Contributor's signed cron endpoints with per-stage result summaries; do not run article generation with a chargeable LLM.
- [ ] Implement weekly `pg_dump --format=custom` piped directly into `age` with `BACKUP_AGE_RECIPIENT`; upload only `.age` ciphertext. The private age identity never enters GitHub or the artifact.
- [ ] Pin the age installation/version and verify its checksum. Add a test that decrypts a local fixture with a disposable test identity and runs `pg_restore --list`; never use the production identity in tests.
- [ ] Document restoration into a disposable local/branch database, verification, and the separate explicit approval required before production restore.
- [ ] Run workflow tests, shellcheck if available, and credential scan.
- [ ] Commit: `ci: add free tier health pipeline and backups`

## Task 7: Harden the three-application CI matrix

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `scripts/changed-apps.ts`
- Create: `scripts/changed-apps.test.ts`
- Create: `tests/config/workspace-ci.test.ts`
- Modify: `README.md`

**Required jobs:** dependency/credential audit; shared contracts; Supabase SQL tests; blog lint/typecheck/test/content/build; Contributor lint/typecheck/test/build/E2E; Ops lint/typecheck/test/build/E2E. Production builds use safe test environment values and fake provider origins; no production secret is required for pull requests.

- [ ] Write tests for change detection across root blog, shared package, Supabase migration, Contributor-only, Ops-only, workflow-only, and full-run manual dispatch.
- [ ] Write workflow tests for Node 20.19+, `npm ci`, lockfile use, least permissions, job timeouts, artifact names, and required job dependencies.
- [ ] Run tests and confirm failure.
- [ ] Implement deterministic change detection but always run all consumers when a shared package/migration changes.
- [ ] Keep blog build first in the deployment safety chain. A Contributor/Ops failure cannot be hidden by a skipped job.
- [ ] Update README with app boundaries, local ports, scripts, free-tier fail-closed policy, integration status labels, and plan/runbook links.
- [ ] Run the full CI command set locally and inspect generated client bundles for server environment names/values.
- [ ] Commit: `ci: verify all omnilede applications`

## Task 8: Add site-specific Netlify configuration and target guards

**Files:**

- Modify: `netlify.toml`
- Create: `apps/contributor/netlify.toml`
- Create: `apps/ops/netlify.toml`
- Create: `scripts/verify-deploy-target.ts`
- Create: `scripts/verify-deploy-target.test.ts`
- Create: `tests/config/netlify-monorepo.test.ts`
- Create: `docs/runbooks/netlify-deployment.md`

**Expected projects:** existing `omnilede-news`; new `omnilede-contributors`; new `omnilede-ops`; expected team `rickysharan999`. Package directory is set per site (`/`, `apps/contributor`, `apps/ops`) while base remains repository root so npm workspaces install once. App configs call their exact workspace build and publish their own `.next` output.

- [ ] Write target-guard tests for wrong team, wrong site ID, production/preview mix-up, root site accidentally pointing at Contributor/Ops, duplicated site IDs, and absent confirmation phrase.
- [ ] Write TOML tests for Node 20.19, exact workspace build command, `.next` output, no embedded IDs/secrets, and distinct package-directory documentation.
- [ ] Run tests and confirm failure.
- [ ] Implement per-site configuration and `verify-deploy-target` requiring expected team, site name, site ID, app key, and explicit `CONFIRMED_DEPLOY_TARGET` match before any CLI/API mutation.
- [ ] Document current official Netlify monorepo setup: leave base unset/root, set package directory per project, review suggested Next.js build/publish, and confirm `@netlify` adapter behaviour in a preview before production.
- [ ] Record integration status plainly: GitHub CLI **Automatic and connected**; Supabase plugin **Automatic after target approval**; browser testing **Automatic**; Netlify native plugin/CLI **Not available**; authenticated in-app Netlify browser **Manual assisted**; Cloudflare/Tavily/Brevo **Manual account/key creation**; generic secret manager **Not available**; Vercel **Connected but not selected**.
- [ ] Run tests, all three builds, and target guard with safe fixture data only.
- [ ] Commit: `chore: configure guarded netlify monorepo deploys`

## Task 9: Run security, privacy, accessibility, and resilience verification

**Files:**

- Create: `tests/security/ecosystem-boundaries.test.ts`
- Create: `tests/e2e/live-smoke.spec.ts`
- Create: `docs/runbooks/security-verification.md`
- Create: `SECURITY.md`

- [ ] Add tests for secret names/values in client bundles, public source maps, cross-origin mutations, request-size limits, HMAC replay, cross-user Supabase access, role escalation, Ops MFA, private images, unsafe MDX, open redirect, SSRF, and contact abuse controls.
- [ ] Add browser checks for landmark/focus/contrast/keyboard/reduced motion, mobile/tablet/desktop layouts, console/page errors, PWA install/offline routes, and private response cache headers.
- [ ] Add resilience tests for Supabase unavailable, Cloudflare exhausted, Tavily exhausted, Brevo exhausted, GitHub unavailable, Netlify unavailable, health ingest unavailable, and stale credential metadata.
- [ ] Run the standard single-pass security audit skill over the entire workspace; validate findings before fixing. Re-run Supabase security/performance advisors after final migrations.
- [ ] Write `SECURITY.md` with supported deployment, private reporting contact marker, secret-revocation steps, and scope boundaries; do not publish an unmonitored email as final.
- [ ] Resolve all critical/high validated findings and rerun affected tests. Record lower-risk accepted items with owner and revisit condition.
- [ ] Run lint, strict typecheck, all unit/SQL/E2E suites, all production builds, content validation, and credential scans.
- [ ] Commit: `security: verify omnilede ecosystem boundaries`

## Task 10: Provision, configure, deploy, and verify live

**Files:**

- Create: `docs/runbooks/live-rollout-checklist.md`
- Modify: `docs/runbooks/netlify-deployment.md`
- Modify: `docs/runbooks/contributor-provider-setup.md`

**Action ledger:** every line in the rollout checklist has `Target`, `Automatic/Manual`, `Status`, `Evidence URL or command`, `Observed at`, and `Rollback`.

- [ ] **Manual approval:** operator confirms Supabase project, GitHub repository/branch, Netlify team, exact three site names, Cloudflare/Tavily/Brevo accounts, and permission to enter each secret at action time.
- [ ] **Automatic — GitHub CLI integration:** push the reviewed branch, open/merge through the operator-approved route, verify repository visibility/default branch, configure Actions variables/secrets with exact names, enable schedules, and observe CI. If login expires, stop and label re-auth **Manual**.
- [ ] **Automatic after approval — Supabase plugin:** inspect confirmed target, apply reviewed migrations, generate types, run seed only on local/development, run security/performance advisors, and inspect logs. Never apply to `vita` or `panthrex` without exact confirmation.
- [ ] **Manual assisted — Cloudflare/Tavily/Brevo browser:** operator logs in, resolves CAPTCHA/terms, creates restricted free credentials, confirms no card/paid upgrade, and pastes secrets directly into provider/Netlify secret fields. Do not paste secrets into chat or code.
- [ ] **Manual assisted — Netlify browser:** in team `rickysharan999`, keep `omnilede-news` linked to root; create `omnilede-contributors` for `apps/contributor`; create `omnilede-ops` for `apps/ops`; confirm base/package/build/publish before saving. A fixed browser handoff tab remains open while the operator logs in.
- [ ] **Manual assisted — environment entry:** enter only each site's scoped variables, mark production/preview scopes intentionally, leave `REDEMPTIONS_ENABLED=false`, and use distinct publish/read/health/backup secrets. The assistant may navigate and validate names/scopes but the operator owns secret reveal/paste.
- [ ] **Automatic verification:** trigger preview builds first, inspect logs, verify the deploy commit SHA, run live Playwright smoke tests, and inspect browser console/network/cache headers. Promote/redeploy production only after previews pass.
- [ ] **Automatic functional verification:** create a test contributor, confirm email, enrol admin MFA, submit safe/borderline/rejected fixtures, human-approve one test article, observe one Git commit/deploy/article/points credit, verify topic claim/wallet/Ops/credential warning/contact forms, and exercise provider-exhausted mode.
- [ ] **Manual editorial decision:** keep or remove the published test article through the normal audited workflow; do not silently rewrite Git history.
- [ ] **Automatic closeout:** confirm health/backup schedules, download one encrypted backup artifact, decrypt only locally with the operator-held test/production identity as appropriate, verify `pg_restore --list`, and record provider quota/reset links.
- [ ] **Manual post-revenue backlog:** AdSense/GA4/custom domain/legal review/tax/banking/rewards provider and cash redemption remain not done. They are not blockers for the $0 points-only launch.
- [ ] Commit: `docs: record verified omnilede live rollout`

## Final Verification Gate

- [ ] GitHub CI is green for shared contracts, SQL, Blog, Contributor, Ops, and browser tests.
- [ ] Supabase RLS cross-user tests and security advisors have no unresolved critical authorization issue.
- [ ] All three confirmed Netlify production URLs serve the expected app and exact reviewed commit.
- [ ] Blog publishing produces exactly one Git commit/article/ledger credit and recovers safely from partial failure.
- [ ] Ops shows distinct Blog/Contributor desks, sourced metric labels, health, pipeline state, and credential reminders without secret storage.
- [ ] Contributor/blog legal, contact, advertiser, and disclaimer pages are reachable and retain all unresolved `[FILL IN: ...]` facts.
- [ ] Blog and Contributor PWAs pass install/offline-shell checks; Ops remains online-only/private.
- [ ] Provider exhaustion never upgrades a plan or asks for a card; redemptions remain disabled.
- [ ] Every manual step is marked manual with its actual status; nothing is implied deployed, provisioned, logged in, or secret-configured without observed evidence.
- [ ] Request final code review, then use the finishing-development-branch workflow to present merge/cleanup options.
