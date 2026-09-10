# OmniLede Contributor Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Contributor PWA: account flows, onboarding, constrained article submission, conservative automated review, human review, reputation, points, topic claims, notifications, and contributor governance.

**Architecture:** The Contributor application is an independent Next.js App Router workspace backed by Supabase Auth/Postgres/Storage. Route Handlers and a server-only data-access layer own mutations. A retryable, version-keyed pipeline composes deterministic checks with Cloudflare Workers AI and Tavily adapters; every provider failure fails closed into manual review. Brevo email is a best-effort side effect after an in-app notification is committed.

**Tech Stack:** Foundation plan stack plus Tiptap React 3.30.5, Starter Kit 3.30.5, Link 3.30.5, sanitize-html 2.17.7, Serwist 9.5.12, Cloudflare Workers AI REST, Tavily Search REST, Brevo transactional REST.

**Spec:** [`docs/superpowers/specs/2026-08-27-omnilede-contributor-ecosystem-design.md`](../specs/2026-08-27-omnilede-contributor-ecosystem-design.md)

## Global Constraints

- Complete the Ecosystem Foundation plan and its verification gate first.
- Use Server Components unless interaction requires a Client Component. Treat every Route Handler and Server Action as a public endpoint: authenticate, authorize, validate, rate-limit where appropriate, and shape returned data.
- Never place the Supabase secret key or provider tokens in a Client Component, rendered HTML, logs, test snapshots, or a public environment variable.
- Content is stored as allowlisted editor JSON. Never accept arbitrary HTML or execute contributor-provided markup.
- Automated review is evidence, not a guarantee. Only exact deterministic prohibited duplicates and configured high-confidence safety violations may auto-reject. Uncertainty, unsupported input, timeout, malformed response, or exhausted quota means `manual_review`.
- A contributor's first configured number of articles always require human review. Reputation never bypasses safety or originality checks.
- `REDEMPTIONS_ENABLED=false` remains a server/database invariant. Points have no promised cash value.
- External calls use 15-second maximum timeouts, bounded responses, one controlled retry only for retryable transport failures, and recorded sanitised errors.
- No real provider call runs in unit/component tests. Use HTTP fakes and deterministic fixtures.
- Make one listed commit after each task; do not include the unrelated root `next-env.d.ts` edit.

## Task 1: Build the contributor information architecture and access boundaries

**Files:**

- Modify: `apps/contributor/app/layout.tsx`
- Modify: `apps/contributor/app/globals.css`
- Delete: `apps/contributor/app/page.tsx`
- Create: `apps/contributor/components/site-header.tsx`
- Create: `apps/contributor/components/account-nav.tsx`
- Create: `apps/contributor/app/(public)/page.tsx`
- Create: `apps/contributor/app/(public)/guidelines/page.tsx`
- Create: `apps/contributor/app/(account)/layout.tsx`
- Create: `apps/contributor/app/(account)/dashboard/page.tsx`
- Create: `apps/contributor/app/(account)/loading.tsx`
- Create: `apps/contributor/app/(account)/error.tsx`
- Create: `apps/contributor/app/(admin)/admin/layout.tsx`
- Create: `apps/contributor/components/site-header.test.tsx`
- Create: `apps/contributor/tests/e2e/navigation.spec.ts`

**Route groups do not change URLs.** Public pages remain `/` and `/guidelines`; account pages are `/dashboard`, `/submit`, `/articles`, `/topics`, `/wallet`, `/redemptions`, and `/settings`; admin pages stay under `/admin/*`.

- [ ] Write component tests for keyboard-reachable navigation, skip link, active route text, points-beta disclosure, and no cash-earnings promise.
- [ ] Write an E2E test proving anonymous users can view public pages, `/dashboard` redirects to `/login?next=%2Fdashboard`, and `/admin/review` redirects without a reviewer role.
- [ ] Run the tests and capture the expected failures.
- [ ] Implement the ink/paper/blue/red editorial shell, responsive account navigation, 44px touch targets, visible focus, reduced-motion support, and semantic landmarks.
- [ ] In account and admin layouts call the authorization DAL server-side; export `dynamic = "force-dynamic"` and prevent private response caching.
- [ ] Render an explicit `$0 launch mode · points only · no cash redemption` notice on relevant public/account screens.
- [ ] Run focused tests, axe checks in Playwright, typecheck, and the contributor build.
- [ ] Commit: `feat(contributor): add protected editorial shell`

## Task 2: Implement signup, login, confirmation, reset, and MFA enrolment

**Files:**

- Create: `apps/contributor/app/(auth)/signup/page.tsx`
- Create: `apps/contributor/app/(auth)/login/page.tsx`
- Create: `apps/contributor/app/(auth)/forgot-password/page.tsx`
- Create: `apps/contributor/app/(auth)/reset-password/page.tsx`
- Create: `apps/contributor/app/auth/callback/route.ts`
- Create: `apps/contributor/app/api/auth/signup/route.ts`
- Create: `apps/contributor/app/api/auth/login/route.ts`
- Create: `apps/contributor/app/api/auth/logout/route.ts`
- Create: `apps/contributor/app/api/auth/forgot-password/route.ts`
- Create: `apps/contributor/app/api/auth/reset-password/route.ts`
- Create: `apps/contributor/lib/auth/input.ts`
- Create: `apps/contributor/lib/auth/safe-next.ts`
- Create: `apps/contributor/lib/auth/routes.test.ts`
- Create: `apps/contributor/tests/e2e/auth.spec.ts`

**Auth rules:** email is trimmed/lowercased; password is 12–128 characters; `next` accepts only an internal absolute path; responses do not reveal whether an email exists; callback accepts an auth code only and exchanges it through the SSR client.

- [ ] Write route tests for success, invalid origin, oversized body, invalid email, short password, open-redirect attempts, invalid callback code, generic reset response, and rate-limit response.
- [ ] Run the focused suite and confirm route-module failures.
- [ ] Implement forms with labelled errors and pending states. Read the request origin, enforce the configured allowed origins, parse JSON/FormData through strict Zod schemas, and use database-backed rate-limit buckets keyed by a salted email digest plus route—not raw IP.
- [ ] Implement email/password signup with confirmation redirect, login, logout, reset request, PKCE callback, and password update. Set `Cache-Control: private, no-store` on auth responses.
- [ ] Add account-security UI under `/settings` to enrol and verify a TOTP factor; reviewer/admin promotion documentation must require this before Ops access.
- [ ] Run route tests. Run E2E against a local Supabase instance using a deterministic confirmed test account; verify signup, confirmation, login, logout, reset, and malicious `next` rejection.
- [ ] Commit: `feat(contributor): implement secure account flows`

## Task 3: Implement onboarding and profile settings

**Files:**

- Create: `apps/contributor/app/(account)/onboarding/page.tsx`
- Create: `apps/contributor/app/(account)/settings/page.tsx`
- Create: `apps/contributor/app/api/profile/route.ts`
- Create: `apps/contributor/lib/profiles/repository.ts`
- Create: `apps/contributor/lib/profiles/repository.test.ts`
- Create: `apps/contributor/components/profile-form.tsx`
- Create: `apps/contributor/components/profile-form.test.tsx`

**Editable fields:** `displayName`, `countryCode` (ISO 3166-1 alpha-2), `preferredLanguage` (supported BCP-47 tag), and optional future payout-method label limited to `not_configured`, `bank_transfer_interest`, or `gift_card_interest`. The field is preference research only and cannot collect bank details.

- [ ] Write repository tests proving identity is derived from the verified session, safe fields update, role/status/points inputs are rejected, and another profile ID cannot be selected.
- [ ] Write component tests for required fields, accessible errors, points terms, and the explicit instruction not to enter bank details.
- [ ] Run focused tests and confirm failure.
- [ ] Implement `GET` and `PATCH` profile routes with strict schemas, optimistic version check, same-origin enforcement, and shaped responses.
- [ ] Redirect an authenticated user with an incomplete profile to `/onboarding`; redirect a completed user away from onboarding to `/dashboard`.
- [ ] Run tests, typecheck, and build.
- [ ] Commit: `feat(contributor): add safe profile onboarding`

## Task 4: Build the constrained article editor and private image upload

**Files:**

- Modify: `apps/contributor/package.json`
- Modify: `package-lock.json`
- Create: `apps/contributor/app/(account)/submit/page.tsx`
- Create: `apps/contributor/app/(account)/articles/page.tsx`
- Create: `apps/contributor/app/(account)/articles/[id]/page.tsx`
- Create: `apps/contributor/components/editor/article-editor.tsx`
- Create: `apps/contributor/components/editor/article-editor.test.tsx`
- Create: `apps/contributor/components/editor/local-draft.ts`
- Create: `apps/contributor/components/editor/local-draft.test.ts`
- Create: `apps/contributor/app/api/submissions/route.ts`
- Create: `apps/contributor/app/api/submissions/[id]/route.ts`
- Create: `apps/contributor/app/api/submission-images/route.ts`
- Create: `apps/contributor/lib/submissions/repository.ts`
- Create: `apps/contributor/lib/submissions/repository.test.ts`

**Allowed editor nodes:** document, paragraph, text, heading levels 2–3, bullet list, ordered list, list item, blockquote, hard break. Allowed marks: bold, italic, and HTTPS link with `rel="nofollow noopener noreferrer"`. No raw HTML, iframe, script, style, embedded media, or inline image nodes. The form also requires a primary source name and HTTPS source URL so the published article can satisfy the blog's visible source contract.

- [ ] Write editor tests for headings, lists, links, primary source name/HTTPS URL, autosave restore, stale local-draft warning, navigation warning, and rejection of pasted unsupported markup.
- [ ] Write API tests for owner-only create/read/update, immutable revision creation, required guideline version, 409 stale version, forbidden status mutation, valid MIME signatures, false file extensions, oversize image, unsafe path, and cross-user image access.
- [ ] Run focused suites and confirm failure.
- [ ] Install pinned Tiptap and sanitize-html packages. Implement an accessible toolbar with text labels/ARIA, character and word counts, local autosave keyed by user plus submission, and online-required submit.
- [ ] Implement image validation using magic bytes plus decoded dimensions; issue an owner-scoped signed upload path and persist only the private object path. Never make the original image public.
- [ ] Implement repository mutations so every submit creates an immutable revision and atomically changes `draft` or `changes_requested` to `under_review`; enforce version comparison in SQL.
- [ ] Render personal article history/timeline using shaped fields only. Provider raw evidence remains reviewer-only.
- [ ] Run tests, typecheck, and build.
- [ ] Commit: `feat(contributor): add versioned article submissions`

## Task 5: Implement deterministic quality and image gates

**Files:**

- Create: `apps/contributor/lib/review/types.ts`
- Create: `apps/contributor/lib/review/deterministic.ts`
- Create: `apps/contributor/lib/review/deterministic.test.ts`
- Create: `apps/contributor/lib/review/image.ts`
- Create: `apps/contributor/lib/review/image.test.ts`
- Create: `apps/contributor/lib/review/scoring.ts`
- Create: `apps/contributor/lib/review/scoring.test.ts`

**Result contract:**

```ts
export type StageResult = {
  stage: "quality" | "text_safety" | "image_safety" | "originality" | "duplicate_topic";
  outcome: "pass" | "reject" | "manual_review";
  score: number | null;
  reasons: readonly string[];
  provider: string | null;
  providerVersion: string;
  retryable: boolean;
};
```

Deterministic checks cover title normalization/all-caps, configured minimum and word band, link count/domain diversity, spam phrases, guideline version, exact normalized-content SHA-256, exact image SHA-256, perceptual image hash, MIME/size/dimensions, and allowed category/region/language.

- [ ] Write table-driven tests for every pass/reject/manual boundary, Unicode title normalization, finance disclaimer presence, image hash distance, and stable scoring independent of object key order.
- [ ] Run the focused suites and capture expected failures.
- [ ] Implement pure functions with no network/database reads. Return stable reason codes such as `quality.word_count_low`; keep user-facing copy in a separate mapping.
- [ ] Treat corrupted images, unsupported image formats, configuration gaps, and scoring exceptions as `manual_review`, not pass.
- [ ] Run tests with coverage focused on every branch and commit.
- [ ] Commit: `feat(contributor): add deterministic review gates`

## Task 6: Add zero-cost provider adapters with fail-closed health

**Files:**

- Create: `apps/contributor/lib/providers/types.ts`
- Create: `apps/contributor/lib/providers/http.ts`
- Create: `apps/contributor/lib/providers/cloudflare-ai.ts`
- Create: `apps/contributor/lib/providers/cloudflare-ai.test.ts`
- Create: `apps/contributor/lib/providers/tavily.ts`
- Create: `apps/contributor/lib/providers/tavily.test.ts`
- Create: `apps/contributor/lib/providers/brevo.ts`
- Create: `apps/contributor/lib/providers/brevo.test.ts`

**Provider interface:**

```ts
export interface ReviewProviders {
  classifyText(input: { text: string; language: string; idempotencyKey: string }): Promise<StageResult>;
  classifyImage(input: { signedUrl: string; idempotencyKey: string }): Promise<StageResult>;
  embed(input: { text: string; idempotencyKey: string }): Promise<readonly number[]>;
  search(input: { query: string; maxResults: number }): Promise<readonly SearchEvidence[]>;
}

export type ProviderStatus = "available" | "degraded" | "exhausted" | "disabled";
```

- [ ] Write HTTP-fake tests for success, 401/403 disabled, 402/429 exhausted, 5xx degraded/retryable, timeout, malformed JSON, oversized response, missing model, sanitised error, and no token in serialized diagnostics.
- [ ] Verify test failures before adapters exist.
- [ ] Implement Cloudflare endpoints using configurable model IDs and bearer auth, Tavily `POST /search` with bounded Basic results, and Brevo `POST /v3/smtp/email`. Pin endpoint hosts and require HTTPS.
- [ ] Map provider-specific content into the shared result contract. Store model identifier/version, scores, reason codes, latency, and sanitised error code; never store request prose in `pipeline_events`.
- [ ] Add a circuit state that stops calls for the current quota window after exhaustion. It must not enable a paid plan, request billing, or retry in a loop.
- [ ] Run provider tests and credential-pattern scan.
- [ ] Commit: `feat(contributor): add free tier provider adapters`

## Task 7: Implement originality and recent-topic comparison

**Files:**

- Create: `apps/contributor/lib/review/originality.ts`
- Create: `apps/contributor/lib/review/originality.test.ts`
- Create: `apps/contributor/lib/review/duplicates.ts`
- Create: `apps/contributor/lib/review/duplicates.test.ts`
- Create: `supabase/migrations/202608270004_vector_search.sql`
- Create: `supabase/tests/004_vector_search.sql`

**Rules:** select at most four distinctive sentences and two title phrases; search at most five results per query; normalize Unicode and compare bounded word n-grams; never quote more than a short evidentiary snippet in reviewer UI. Compare embeddings only within the same broad category and previous 48 hours. Ranking inputs are originality, sourced factual density, structure, and word-band fit; a candidate proceeds only when its normalized score exceeds the runner-up by the configured margin.

- [ ] Write tests for phrase selection, n-gram evidence, same-source exclusions, exact copy flag, paraphrase flag, no-results manual fallback, 48-hour/category filters, vector dimension mismatch, tie routing, and clear-leader routing.
- [ ] Write pgTAP tests proving vector search returns only the permitted 48-hour/category corpus and contributor clients cannot query private embeddings/evidence directly.
- [ ] Run tests and record expected failures.
- [ ] Implement pure originality comparison and a private `match_recent_topics` RPC using `pgvector`, fixed embedding dimensions from configuration, indexed cosine distance, and `security_invoker` behaviour where exposed.
- [ ] Store evidence URLs/domains and bounded snippets in `duplicate_matches`; never claim the result proves copyright infringement.
- [ ] Run unit and SQL tests.
- [ ] Commit: `feat(contributor): add originality and topic comparison`

## Task 8: Orchestrate the idempotent review state machine

**Files:**

- Create: `apps/contributor/lib/review/state-machine.ts`
- Create: `apps/contributor/lib/review/state-machine.test.ts`
- Create: `apps/contributor/lib/review/run.ts`
- Create: `apps/contributor/lib/review/run.test.ts`
- Create: `apps/contributor/app/api/internal/review/route.ts`
- Create: `apps/contributor/app/api/cron/review/route.ts`
- Create: `apps/contributor/lib/security/hmac.ts`
- Create: `apps/contributor/lib/security/hmac.test.ts`

**Transition contract:** only the transitions in design section 11 are valid. Each execution key is `{submissionId}:{version}:{stage}`. A repeated key returns the committed result without a second provider call.

- [ ] Write state-machine tests for every allowed and forbidden transition, first-author manual rule, safety precedence, provider exhaustion, duplicate leader/tie, retry after transport failure, and idempotent replay.
- [ ] Write route tests for invalid signature, stale timestamp, replayed nonce, wrong audience, oversized body, and successful scheduled batch with a hard item/time cap.
- [ ] Run tests and confirm failure.
- [ ] Implement the pipeline as short database transactions around external calls, never holding a transaction during network I/O. Lock a submission/version before claiming a stage and finalize with compare-and-set.
- [ ] Implement HMAC SHA-256 verification over `timestamp + "." + nonce + "." + canonicalBody`, constant-time comparison, five-minute clock skew, and persisted nonce uniqueness.
- [ ] Record every stage in `review_runs`/`pipeline_events`; route uncertain or unavailable results to manual review and create a notification atomically with the final state.
- [ ] Run unit/integration tests and a concurrency test with two simultaneous workers.
- [ ] Commit: `feat(contributor): orchestrate conservative review pipeline`

## Task 9: Build the human review and contributor administration desks

**Files:**

- Create: `apps/contributor/app/(admin)/admin/review/page.tsx`
- Create: `apps/contributor/app/(admin)/admin/review/[id]/page.tsx`
- Create: `apps/contributor/app/(admin)/admin/contributors/page.tsx`
- Create: `apps/contributor/app/(admin)/admin/audit/page.tsx`
- Create: `apps/contributor/app/api/admin/review/[id]/route.ts`
- Create: `apps/contributor/app/api/admin/contributors/[id]/route.ts`
- Create: `apps/contributor/components/admin/review-decision-form.tsx`
- Create: `apps/contributor/components/admin/review-decision-form.test.tsx`
- Create: `apps/contributor/lib/admin/decisions.ts`
- Create: `apps/contributor/lib/admin/decisions.test.ts`

**Decision input:** `submissionId`, `expectedVersion`, one of `approve|reject|request_changes`, mandatory reason between 10 and 2,000 characters, and evidence acknowledgment when a safety/originality flag exists.

- [ ] Write tests for reviewer access, contributor denial, stale-version 409, mandatory reason, immutable decision/audit rows, duplicate decision idempotency, suspend/restore/ban reasons, and ban requiring admin rather than reviewer.
- [ ] Write component tests for keyboard review flow, visible evidence source/limitations, destructive confirmation, and screen-reader status announcements.
- [ ] Run tests and confirm failure.
- [ ] Implement priority queue ordering by severity then age, article/image signed preview, provider health/evidence, duplicate candidates, decision controls, and explicit automated-check limitations.
- [ ] Use private transactional RPCs for decisions and contributor status. Re-read current submission state/ownership server-side; never accept full database rows from the client.
- [ ] Make every action auditable with actor, reason, target, prior safe state, new safe state, and timestamp.
- [ ] Run focused tests, E2E reviewer decision tests, and build.
- [ ] Commit: `feat(contributor): add accountable review administration`

## Task 10: Implement points, reputation, topics, and disabled redemptions

**Files:**

- Create: `apps/contributor/lib/rewards/calculate.ts`
- Create: `apps/contributor/lib/rewards/calculate.test.ts`
- Create: `apps/contributor/lib/reputation/calculate.ts`
- Create: `apps/contributor/lib/reputation/calculate.test.ts`
- Create: `apps/contributor/app/(account)/wallet/page.tsx`
- Create: `apps/contributor/app/(account)/redemptions/page.tsx`
- Create: `apps/contributor/app/(account)/topics/page.tsx`
- Create: `apps/contributor/app/api/topics/[id]/claim/route.ts`
- Create: `apps/contributor/app/(admin)/admin/topics/page.tsx`
- Create: `apps/contributor/app/(admin)/admin/settings/page.tsx`
- Create: `apps/contributor/app/(admin)/admin/redemptions/page.tsx`
- Create: `apps/contributor/lib/topics/claims.test.ts`

**Reward contract:** select the effective category/word-band rule at approval time; preserve rule ID and inputs; credit once per publication idempotency key. Reputation tiers are `New`, `Trusted`, `Verified`; missing analytics engagement is `unavailable`, never numeric zero.

- [ ] Write table-driven reward and reputation tests for effective dates, boundary word counts, duplicate publication, compensating adjustment, missing engagement, and tier downgrade/upgrade.
- [ ] Write claim tests for 24-hour expiry, one active claimant, per-user active limit, link-to-submission consumption, and concurrent claim race.
- [ ] Write redemption tests proving UI and server reject requests while either application or database flag is false and explain no guaranteed cash value.
- [ ] Run tests and confirm failure.
- [ ] Implement pure calculations and private transaction functions. Never edit or delete ledger entries; use a compensating transaction with a mandatory admin reason.
- [ ] Build wallet history, indicative manually configured local display, topic board/countdown, admin topic/rule settings, and a disabled redemption explanation page.
- [ ] Import RSS topic ideas as titles/metadata only; do not copy story prose into submissions.
- [ ] Run tests, E2E claim/wallet flows, typecheck, and build.
- [ ] Commit: `feat(contributor): add points reputation and topic claims`

## Task 11: Add notifications, legal/contact pages, and contributor PWA behaviour

**Files:**

- Create: `apps/contributor/lib/notifications/deliver.ts`
- Create: `apps/contributor/lib/notifications/deliver.test.ts`
- Create: `apps/contributor/app/api/contact/route.ts`
- Create: `apps/contributor/app/(public)/contact/page.tsx`
- Create: `apps/contributor/app/(public)/privacy/page.tsx`
- Create: `apps/contributor/app/(public)/terms/page.tsx`
- Create: `apps/contributor/app/(public)/advertise/page.tsx`
- Create: `apps/contributor/app/(public)/disclaimer/page.tsx`
- Create: `apps/contributor/app/manifest.ts`
- Create: `apps/contributor/app/sw.ts`
- Create: `apps/contributor/app/offline/page.tsx`
- Create: `apps/contributor/public/icons/icon-192.png`
- Create: `apps/contributor/public/icons/icon-512.png`
- Create: `apps/contributor/tests/e2e/legal-contact-pwa.spec.ts`

**Required legal markers:** `[FILL IN: LEGAL OPERATOR NAME]`, `[FILL IN: REGISTERED ADDRESS]`, `[FILL IN: TAX/GST DETAILS]`, `[FILL IN: PRIVACY EMAIL]`, and `[FILL IN: FINAL PAYOUT PROCESSOR]`. These are intentional operator fields, not claims of legal completion.

- [ ] Write notification tests proving the database notification commits first, email success marks delivery, email failure stays retryable/visible, retries are idempotent, and Brevo exhaustion does not lose the in-app notice.
- [ ] Write contact tests for general/support versus advertising/partnership, strict validation, rate limiting, honeypot, stored-first delivery, and admin follow-up state.
- [ ] Write E2E tests for all legal routes, required markers, manifest fields, install icons, offline shell, and a clear message that submission requires connectivity.
- [ ] Run tests and confirm failure.
- [ ] Implement notification delivery and contact outbox. Never include private article content or sensitive moderation evidence in transactional email.
- [ ] Implement the contributor licence, privacy, terms, points/redemption terms, advertiser information, contact, and financial/general disclaimer from approved design language. Keep all business-specific markers visible until the operator supplies reviewed facts.
- [ ] Configure Serwist only for production, precache the offline shell/static assets, and exclude authenticated HTML/API responses and submission content from shared runtime caches.
- [ ] Generate distinct OmniLede contributor icons from owned geometric branding; do not copy Billboard or another publication's marks.
- [ ] Run tests, Lighthouse/PWA inspection, typecheck, and build.
- [ ] Commit: `feat(contributor): complete notifications governance and pwa`

## Task 12: Verify the Contributor Platform vertical slice

**Files:**

- Create: `apps/contributor/tests/e2e/contributor-lifecycle.spec.ts`
- Create: `apps/contributor/tests/e2e/review-fallbacks.spec.ts`
- Create: `apps/contributor/playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/runbooks/contributor-provider-setup.md`

- [ ] Build an E2E fixture harness for contributor, reviewer, and admin identities with isolated submission IDs and fake provider server responses.
- [ ] Test signup/onboarding, safe submission, first-author manual routing, changes requested, edit/version, approval, rejection, topic claim, wallet display, provider exhaustion, duplicate conflict, cross-user denial, and admin MFA denial.
- [ ] Run the new specs against the production build, not the development server.
- [ ] Add CI jobs for contributor lint/typecheck/unit/build/E2E with least-privilege test secrets and no live provider tokens.
- [ ] Document **Manual** free-account steps for Cloudflare, Tavily, and Brevo, including quota caps and the exact environment variable destination. The operator logs in and handles CAPTCHA/key reveal; browser automation may navigate and fill non-secret fields but must not claim completion without visible confirmation.
- [ ] With explicit action-time approval, enter secrets into the confirmed Contributor Netlify project; then test one safe and one provider-exhausted fixture. Do not enable Workers Paid or a paid search/email plan.
- [ ] Run `npm run lint`, `npm run typecheck:all`, `npm run test:all`, `npm run build:contributor`, and contributor Playwright tests.
- [ ] Commit: `test(contributor): verify complete contributor lifecycle`

## Plan Verification Gate

- [ ] All Contributor public, account, and admin routes meet their documented access rules.
- [ ] Cross-user/RLS tests, moderation boundaries, idempotency tests, and points ledger tests pass.
- [ ] Cloudflare/Tavily/Brevo disabled, exhausted, malformed, and timeout modes route safely without paid fallback.
- [ ] No submission becomes public in this plan; publication remains the next plan's signed integration.
- [ ] `REDEMPTIONS_ENABLED=false` is visible in UI and enforced in both server code and database.
- [ ] No server secret appears in browser bundles, HTML, logs, snapshots, or Git history.
- [ ] Contributor production build and offline-safe shell pass real browser verification.
- [ ] Request code review before beginning Blog Integration.
