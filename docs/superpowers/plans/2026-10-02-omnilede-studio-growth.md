# OmniLede Studio and Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private OmniLede Studio for Mac and phone that controls local article writing, review and publishing, genuine audience/search/revenue reporting, daily editorial work, and site maintenance while leaving the public blog reader-only.

**Architecture:** `apps/ops` becomes the hosted Studio PWA and the single private control plane. A new `@omnilede/editorial` workspace package owns category, draft validation, and versioned GitHub publication rules; Supabase owns operator authorization, tasks, provider connection metadata, encrypted credential storage, cached reports, and audit records. The native Swift app embeds the exact Studio origin and exposes a narrow, origin-checked bridge to the existing local Ollama writer.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.9, Supabase Auth/Postgres, GitHub Git Data API, Netlify, Serwist PWA, Swift/AppKit/WebKit, Vitest/Testing Library, Playwright, Google OAuth 2.0, GA4 Data API, Search Console API, AdSense Management API.

**Spec:** `docs/superpowers/specs/2026-10-02-omnilede-studio-growth-design.md`

## Global Constraints

- Keep the public blog at `https://omnilede-news.netlify.app` available throughout the rollout.
- Preserve every existing draft, article, queue entry, daily-plan file, and local writer checkpoint; never rewrite or delete them during migration.
- Categories are exactly Anime, Movies, Politics, Sports, Finance, and Share Market.
- Today and Categories are separate views; refresh never starts writing or publishes content.
- Article generation is Mac-only and begins only after a direct Start writing click.
- Save stays private; Publish requires a confirmation containing the exact title, category, and loaded version.
- GitHub is the content source of truth, and mutations use expected-version conflict checks.
- Private pages, API responses, credentials, and report data are network-only and never enter a PWA cache.
- Access requires the configured Google email, an active Supabase profile, and a server-managed `admin` role; user metadata never grants access.
- Provider credentials remain encrypted server-side and are excluded from logs, browser storage, Git, and article content.
- Every displayed metric includes its source and last successful refresh; disconnected, delayed, stale, and unavailable are never rendered as zero.
- AI output stays a draft until human review. Provider suggestions can create Today tasks but cannot edit or publish content.
- AdSense code remains disabled until Google reports that the site is approved and Ready.
- Retire the public `/admin` pages and mutation APIs only after the same Studio build passes preview read, save, and exact-byte publish checks.
- Keep canonical article identities stable so a later custom-domain migration can change the site origin without changing slugs.

## Review Focus

- A signed-in user with a different Google email or a forged metadata role must receive no Studio data and no mutation capability.
- Expired OAuth tokens, provider outages, malformed reports, and quota failures must retain the last successful timestamped report as stale or show unavailable, never zero.
- Concurrent Mac/phone edits or a changed GitHub head must block Save/Publish and preserve the browser's unsaved text.
- A script, iframe, redirect, or page from any origin other than the configured Studio HTTPS origin must be unable to invoke the native writer bridge.
- A failed preview deployment or publication verification must leave the current public blog admin available and must not alter production content.

---

### Task 1: Studio database, operator authorization, and responsive PWA shell

**Files:**
- Create: `supabase/migrations/202610020001_studio_control_plane.sql`
- Create: `packages/contracts/src/studio.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/ops/lib/env.ts`
- Modify: `apps/ops/.env.example`
- Create: `apps/ops/lib/auth/operator.ts`
- Create: `apps/ops/app/auth/callback/route.ts`
- Create: `apps/ops/app/(auth)/login/page.tsx`
- Create: `apps/ops/app/(studio)/layout.tsx`
- Create: `apps/ops/components/studio-shell.tsx`
- Create: `apps/ops/app/manifest.ts`
- Create: `apps/ops/app/sw.ts`
- Create: `apps/ops/lib/pwa/runtime-caching.ts`
- Modify: `apps/ops/next.config.mjs`
- Modify: `apps/ops/app/layout.tsx`
- Modify: `apps/ops/app/page.tsx`
- Modify: `apps/ops/app/globals.css`
- Test: `packages/contracts/src/studio.test.ts`
- Test: `tests/database/studio-control-plane.test.ts`
- Test: `apps/ops/lib/auth/operator.test.ts`
- Test: `apps/ops/lib/pwa/runtime-caching.test.ts`
- Test: `apps/ops/app/page.test.tsx`

**Interfaces:**
- Consumes: `requireIdentity(): Promise<VerifiedIdentity>` from `apps/ops/lib/auth/authorization.ts` and the existing server/service Supabase clients.
- Produces: `requireStudioOperator(): Promise<VerifiedIdentity>`; `studioTaskSchema`, `providerStateSchema`, `reportEnvelopeSchema`, and `ReportEnvelope<T>`; responsive routes `/overview`, `/today`, `/categories`, `/content`, `/growth`, `/search`, `/revenue`, `/health`; network-only PWA rules for all authenticated routes and `/api/**`.

- [ ] **Step 1: Write failing schema and migration tests**

  Assert the new contracts accept the six exact category slugs and the report states `connected | delayed | stale | unavailable | disconnected`. Assert the migration defines `studio_tasks`, `provider_connections`, `app_private.provider_credentials`, `provider_report_cache`, and `publication_events`, enables RLS, revokes credential-table access from browser roles, and makes audit/publication records append-only.

- [ ] **Step 2: Run the focused tests and verify failure**

  Run: `npm test -- packages/contracts/src/studio.test.ts tests/database/studio-control-plane.test.ts`

  Expected: FAIL because the Studio contracts and migration do not exist.

- [ ] **Step 3: Add the Studio contracts and database migration**

  Define exact row/input types in `packages/contracts/src/studio.ts`. Store only OAuth status and safe account/property labels in `public.provider_connections`; store AES-GCM ciphertext, IV, authentication tag, scopes, and token expiry in `app_private.provider_credentials`; keep provider reports in bounded JSON with `source`, `range`, `fetchedAt`, `state`, and `data`.

- [ ] **Step 4: Write failing operator authorization tests**

  Test anonymous, suspended, non-admin, wrong-email, forged `user_metadata.role = admin`, and configured active admin cases. The first five must throw `AuthorizationError`; only the exact case-insensitive `STUDIO_OPERATOR_EMAIL` plus server role may pass.

- [ ] **Step 5: Implement `requireStudioOperator()` and Google sign-in callback**

  Add `STUDIO_OPERATOR_EMAIL`, `NEXT_PUBLIC_STUDIO_URL`, and `AUTH_ALLOWED_ORIGINS` to the environment schema. Exchange the Supabase OAuth code only for a same-origin safe redirect and fail closed before rendering any `(studio)` route.

- [ ] **Step 6: Write failing shell and PWA tests**

  Assert desktop sidebar and phone bottom navigation contain all eight Studio destinations. Assert the manifest is standalone and names OmniLede Studio. Assert every private document/API URL resolves to `NetworkOnly`, while only versioned icons and shell assets can use cache-first behavior.

- [ ] **Step 7: Implement the responsive shell, manifest, and service worker**

  Redirect `/` to `/overview` for an allowed session and `/login` otherwise. Reuse the contributor app's Serwist registration pattern but use the stricter Ops cache policy.

- [ ] **Step 8: Verify and commit**

  Run: `npm run test --workspace @omnilede/ops && npm run test --workspace @omnilede/contracts && npm run typecheck --workspace @omnilede/ops && npm run db:test`

  Expected: PASS.

  Commit: `git commit -m "Build protected OmniLede Studio shell"`

### Task 2: Shared editorial package and versioned GitHub content service

**Files:**
- Create: `packages/editorial/package.json`
- Create: `packages/editorial/tsconfig.json`
- Create: `packages/editorial/src/index.ts`
- Create: `packages/editorial/src/categories.ts`
- Create: `packages/editorial/src/drafts/types.ts`
- Create: `packages/editorial/src/drafts/validation.ts`
- Create: `packages/editorial/src/drafts/github-repository.ts`
- Create: `packages/editorial/src/github/git-data-client.ts`
- Create: `packages/editorial/src/inventory.ts`
- Modify: `lib/config/categories.ts`
- Modify: `lib/drafts/types.ts`
- Modify: `lib/drafts/validation.ts`
- Modify: `lib/drafts/github-repository.ts`
- Modify: `lib/github/git-data-client.ts`
- Modify: `apps/ops/package.json`
- Modify: `apps/ops/lib/env.ts`
- Test: `packages/editorial/src/drafts/github-repository.test.ts`
- Test: `packages/editorial/src/drafts/validation.test.ts`
- Test: `packages/editorial/src/inventory.test.ts`

**Interfaces:**
- Consumes: the existing `DraftRepository`, validation behavior, and Git Data API semantics from `lib/drafts/**` and `lib/github/git-data-client.ts`.
- Produces: `CategorySlug`; `DraftRef`; `DraftSummary`; `DraftDocument`; `PublishResult`; `EditorialInventory`; `createGitHubDraftRepository({ repository, branch, token, fetchImpl }): DraftRepository`; stable re-exports for the blog during migration.

- [ ] **Step 1: Copy the existing behavior into failing package-level characterization tests**

  Pin list/read/create/save/discard and exact-byte publish behavior, six-category validation, unsafe filename rejection, MDX validation, GitHub head conflicts, and GitHub failure mapping. Assert Publish creates the article blob from the submitted bytes and deletes only the matching draft tree entry.

- [ ] **Step 2: Run the package tests and verify failure**

  Run: `npm test -- packages/editorial/src`

  Expected: FAIL because `@omnilede/editorial` does not exist.

- [ ] **Step 3: Extract the editorial package and add root compatibility re-exports**

  Remove Next.js aliases and server-only app imports from the extracted modules. Keep the public blog compiling through re-exports until Task 10 removes its admin surface.

- [ ] **Step 4: Add a Studio-only content repository factory**

  Parse `GITHUB_REPOSITORY`, `GITHUB_CONTENT_BRANCH`, and `GITHUB_CONTENT_TOKEN`; never fall back to ephemeral or local storage in deployed Studio. The token must support only the selected repository and content branch.

- [ ] **Step 5: Exercise the review-focus conflict**

  In the repository test, load version A, advance the mock head to B, attempt Save and Publish with A, and assert `DraftRepositoryError("conflict")` without a mutation request.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- packages/editorial/src lib/drafts lib/github && npm run typecheck:all && npm run build:blog && npm run build:ops`

  Expected: PASS with byte-for-byte equivalent public-blog behavior.

  Commit: `git commit -m "Extract shared editorial content service"`

### Task 3: Studio Content editor, publication confirmation, and history

**Files:**
- Create: `apps/ops/lib/content/repository.ts`
- Create: `apps/ops/lib/http/same-origin.ts`
- Create: `apps/ops/app/api/content/drafts/route.ts`
- Create: `apps/ops/app/api/content/drafts/[category]/[filename]/route.ts`
- Create: `apps/ops/app/(studio)/content/page.tsx`
- Create: `apps/ops/components/content/content-workspace.tsx`
- Create: `apps/ops/components/content/draft-editor.tsx`
- Create: `apps/ops/components/content/publish-confirmation.tsx`
- Create: `apps/ops/components/content/article-preview.tsx`
- Create: `apps/ops/lib/publication/history.ts`
- Test: `apps/ops/app/api/content/drafts/route.test.ts`
- Test: `apps/ops/app/api/content/drafts/[category]/[filename]/route.test.ts`
- Test: `apps/ops/components/content/content-workspace.test.tsx`
- Test: `apps/ops/lib/http/same-origin.test.ts`

**Interfaces:**
- Consumes: `requireStudioOperator()` and `DraftRepository` from Tasks 1-2.
- Produces: `GET /api/content/drafts`; `POST /api/content/drafts/:category/:filename` with `{ action: "save" | "publish" | "discard", mdx?, expectedVersion, confirmedTitle?, confirmedCategory? }`; append-only publication history rows.

- [ ] **Step 1: Write failing API security and mutation tests**

  Assert anonymous/wrong-origin/oversized/invalid requests fail before touching GitHub. Assert save returns the new version, publish requires matching title/category/version confirmation, and conflict responses use HTTP 409 with code `conflict`.

- [ ] **Step 2: Implement same-origin validation and content routes**

  Bound MDX payloads to 200 KiB, validate route params through the shared package, require `application/json`, and record actor, ref, prior version, resulting version/commit URL, action, and timestamp without recording article bytes or credentials.

- [ ] **Step 3: Write failing editor tests**

  Assert category/state/date/text filters, preview, private Save copy, exact Publish confirmation copy, and retained editor contents after 409 or network failure. Assert loading/refetching does not publish.

- [ ] **Step 4: Implement Content UI by adapting the current public review desk**

  Move the useful editor and validation interactions into Ops-owned components. Show publication history and the resulting public article/deployment link after success.

- [ ] **Step 5: Verify exact-byte publication against a temporary local Git fixture**

  Run the repository integration test with a draft containing Unicode, two image URLs, and trailing newlines; assert the published blob equals the editor payload exactly and the draft is absent only after the commit succeeds.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- apps/ops/app/api/content apps/ops/components/content packages/editorial && npm run typecheck --workspace @omnilede/ops`

  Expected: PASS.

  Commit: `git commit -m "Move review and publishing into Studio"`

### Task 4: Overview, separate Today list, all-six Categories, and site health

**Files:**
- Create: `apps/ops/lib/editorial/category-summary.ts`
- Create: `apps/ops/lib/tasks/derive.ts`
- Create: `apps/ops/lib/tasks/repository.ts`
- Create: `apps/ops/lib/health/site-health.ts`
- Create: `apps/ops/app/api/tasks/route.ts`
- Create: `apps/ops/app/api/tasks/[id]/route.ts`
- Create: `apps/ops/app/api/health/route.ts`
- Create: `apps/ops/app/(studio)/overview/page.tsx`
- Create: `apps/ops/app/(studio)/today/page.tsx`
- Create: `apps/ops/app/(studio)/categories/page.tsx`
- Create: `apps/ops/app/(studio)/health/page.tsx`
- Create: `apps/ops/components/overview/source-card.tsx`
- Create: `apps/ops/components/today/task-list.tsx`
- Create: `apps/ops/components/categories/category-table.tsx`
- Create: `apps/ops/components/health/health-list.tsx`
- Modify: `lib/desktop/daily-plan.ts`
- Test: `apps/ops/lib/editorial/category-summary.test.ts`
- Test: `apps/ops/lib/tasks/derive.test.ts`
- Test: `apps/ops/lib/health/site-health.test.ts`
- Test: `apps/ops/components/today/task-list.test.tsx`
- Test: `lib/desktop/daily-plan.test.ts`

**Interfaces:**
- Consumes: `EditorialInventory`, Studio task contracts, publication history, current local daily-plan v1 files, and later `ReportEnvelope` values.
- Produces: `buildCategorySummaries(inventory, reports): CategorySummary[6]`; `deriveTodayTasks(input): DerivedTask[]`; idempotent complete/postpone/refresh endpoints; evidence-backed health findings.

- [ ] **Step 1: Write failing six-category and v1 compatibility tests**

  With content in only Sports, assert six ordered category rows still exist and the other five show valid zero content counts as repository facts. Load a current three-task daily-plan v1 file and assert it is read unchanged; do not rewrite it just to create Studio tasks.

- [ ] **Step 2: Implement category summaries and safe daily-plan import**

  Keep local writer plan compatibility while separating hosted Today tasks from category inventory. Use stable evidence keys so Refresh upserts matching open tasks and does not duplicate completed or postponed tasks.

- [ ] **Step 3: Write failing Today derivation tests**

  Cover waiting drafts, failed/resumable writer runs, stale category coverage, provider setup, SEO/index warnings, AdSense readiness, and deployment failures. Assert Refresh returns tasks only; writer and publication mocks receive zero calls.

- [ ] **Step 4: Implement Today actions and pages**

  Add complete, postpone-until, and refresh behavior. Desktop Categories can expose native Start writing capability when detected later; phone shows review links and explanatory Mac-only copy.

- [ ] **Step 5: Write and implement site-health checks**

  Validate public origin reachability, latest Netlify deploy state, sitemap and robots responses, draft/publication failures, provider connection freshness, structured-data validation results, and internal-link scan results. Each finding contains evidence, affected URL, checkedAt, severity, and recovery action.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- apps/ops/lib/editorial apps/ops/lib/tasks apps/ops/lib/health apps/ops/components lib/desktop/daily-plan.test.ts && npm run typecheck --workspace @omnilede/ops`

  Expected: PASS.

  Commit: `git commit -m "Add Studio editorial dashboard and daily work"`

### Task 5: Native Mac Studio container and restricted local-writer bridge

**Files:**
- Create: `desktop/StudioBridge.swift`
- Create: `desktop/StudioConfiguration.swift`
- Create: `desktop/StudioWindowController.swift`
- Modify: `desktop/OmniLede.swift`
- Modify: `desktop/DailyPlanModels.swift`
- Modify: `desktop/install-app.py`
- Modify: `Start OmniLede.command`
- Create: `apps/ops/lib/native/bridge.ts`
- Create: `apps/ops/components/native/writer-controls.tsx`
- Create: `apps/ops/app/api/native/config/route.ts`
- Test: `desktop/tests/StudioBridgeTests.swift`
- Test: `apps/ops/lib/native/bridge.test.ts`
- Test: `apps/ops/components/native/writer-controls.test.tsx`

**Interfaces:**
- Consumes: the existing `Start OmniLede.command`, planner snapshot protocol, writer `@omnilede` JSON events, and six category slugs.
- Produces: `window.webkit.messageHandlers.omnilede.postMessage({ action: "write" | "cancel" | "refresh", category?, requestId })`; sanitized `omnilede:native-status` browser events; `window.__OMNILEDE_NATIVE__ = { available: true }` only inside the app.

- [ ] **Step 1: Write failing Swift bridge tests**

  Assert only `https` plus the exact configured host and effective port may call the bridge; reject subdomains, credentials in URLs, non-main frames, redirects to a new origin, unknown actions, missing request IDs, and unsupported categories. Assert accepted `write` still requires a message generated by the visible Start writing button.

- [ ] **Step 2: Implement the `WKWebView` Studio window and bridge**

  Read `OmniLedeStudioURL` from `Info.plist`, allow navigation only to that origin, open external links in the default browser, keep one writer process at a time, and stream only phase/progress/ETA/delivery/error fields into the page. Keep raw terminal output in `.audit/desktop-writer.log`.

- [ ] **Step 3: Write failing web capability tests**

  On ordinary Safari/phone, assert no Start writing action is rendered and review/publish remains available. Under the injected native capability, assert all six categories have Start writing/Try again and no action fires on mount or Refresh.

- [ ] **Step 4: Implement native-aware controls and installer changes**

  Replace the old native task-list window with the Studio container, keep background process cleanup/cancellation, bump the app version, link WebKit during compilation, and keep the Desktop shortcut pointing to `~/Applications/OmniLede.app`.

- [ ] **Step 5: Exercise the hostile-origin review case**

  Run Swift tests with `https://evil.example`, `https://studio.example.evil.test`, an iframe from the correct origin, and a redirect after initial load; assert no process is created and an audit-safe rejection is recorded.

- [ ] **Step 6: Verify and commit**

  Run: `swiftc -parse-as-library desktop/StudioConfiguration.swift desktop/StudioBridge.swift desktop/tests/StudioBridgeTests.swift -o /tmp/omnilede-bridge-tests -framework AppKit -framework WebKit && /tmp/omnilede-bridge-tests && npm test -- apps/ops/lib/native apps/ops/components/native && python3 desktop/install-app.py && codesign --verify --deep --strict "$HOME/Applications/OmniLede.app"`

  Expected: all tests pass, signed app launches without Terminal, and it does not start writing on launch.

  Commit: `git commit -m "Embed Studio in the native OmniLede app"`

### Task 6: Encrypted Google OAuth connections and provider cache

**Files:**
- Create: `apps/ops/lib/crypto/token-vault.ts`
- Create: `apps/ops/lib/google/oauth.ts`
- Create: `apps/ops/lib/providers/cache.ts`
- Create: `apps/ops/app/api/connections/google/start/route.ts`
- Create: `apps/ops/app/api/connections/google/callback/route.ts`
- Create: `apps/ops/app/api/connections/google/revoke/route.ts`
- Create: `apps/ops/app/(studio)/settings/connections/page.tsx`
- Create: `apps/ops/components/connections/google-connection.tsx`
- Modify: `apps/ops/lib/env.ts`
- Modify: `apps/ops/.env.example`
- Test: `apps/ops/lib/crypto/token-vault.test.ts`
- Test: `apps/ops/lib/google/oauth.test.ts`
- Test: `apps/ops/lib/providers/cache.test.ts`
- Test: `apps/ops/app/api/connections/google/callback/route.test.ts`

**Interfaces:**
- Consumes: `app_private.provider_credentials`, `provider_connections`, and `provider_report_cache` from Task 1.
- Produces: `sealToken(plaintext, key): SealedToken`; `openToken(sealed, key): string`; OAuth start/callback/revoke routes; `readReport<T>(provider, key): ReportEnvelope<T>`; `writeSuccessfulReport<T>(...)`; `markReportFailure(...)`.

- [ ] **Step 1: Write failing vault and OAuth tests**

  Assert AES-256-GCM round-trip, random IVs, tamper rejection, key-length rejection, PKCE/state/nonce verification, exact redirect URI, least-privilege read scopes, and no tokens in responses or logs. Callback tests must reject a different signed-in Google email even if the OAuth state is otherwise valid.

- [ ] **Step 2: Implement encrypted credential storage and OAuth lifecycle**

  Add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `GOOGLE_OAUTH_REDIRECT_URI` as server-only variables. Revoke at Google before deleting local ciphertext; on revocation failure, mark reconnect-required without losing editorial data.

- [ ] **Step 3: Write failing report-cache truthfulness tests**

  Assert a successful fresh result is `connected`; a provider failure with prior data returns identical data as `stale` and preserves `fetchedAt`; a first failure returns `unavailable` with no numeric values; no connection returns `disconnected`.

- [ ] **Step 4: Implement cache and connections UI**

  Display scopes, safe property/site labels, last connection check, and reconnect/revoke actions. Never display client secrets, access tokens, refresh tokens, ciphertext, or Supabase service credentials.

- [ ] **Step 5: Verify and commit**

  Run: `npm test -- apps/ops/lib/crypto apps/ops/lib/google apps/ops/lib/providers apps/ops/app/api/connections && npm run typecheck --workspace @omnilede/ops`

  Expected: PASS, including log-capture assertions with no token fragments.

  Commit: `git commit -m "Add secure Google provider connections"`

### Task 7: Genuine GA4 and Search Console dashboards

**Files:**
- Create: `apps/ops/lib/providers/ga4.ts`
- Create: `apps/ops/lib/providers/search-console.ts`
- Create: `apps/ops/lib/providers/google-http.ts`
- Create: `apps/ops/lib/growth/opportunities.ts`
- Create: `apps/ops/app/api/reports/ga4/route.ts`
- Create: `apps/ops/app/api/reports/search/route.ts`
- Create: `apps/ops/app/(studio)/growth/page.tsx`
- Create: `apps/ops/app/(studio)/search/page.tsx`
- Create: `apps/ops/components/reports/date-range-control.tsx`
- Create: `apps/ops/components/reports/metric-card.tsx`
- Create: `apps/ops/components/reports/trend-chart.tsx`
- Create: `apps/ops/components/reports/data-table.tsx`
- Modify: `apps/ops/app/(studio)/overview/page.tsx`
- Test: `apps/ops/lib/providers/ga4.test.ts`
- Test: `apps/ops/lib/providers/search-console.test.ts`
- Test: `apps/ops/lib/growth/opportunities.test.ts`
- Test: `apps/ops/components/reports/metric-card.test.tsx`

**Interfaces:**
- Consumes: decrypted Google access through Task 6 and report envelopes/task upsert through Tasks 4 and 6.
- Produces: `fetchGa4Report(range): ReportEnvelope<Ga4Report>`; `fetchSearchReport(range): ReportEnvelope<SearchReport>`; ranges `7d | 28d | 3m | 12m`; evidence-backed `SearchOpportunity[]` that can be copied into Today.

- [ ] **Step 1: Write failing provider transformation tests**

  Use official-shaped fixtures for GA4 users, sessions, views, engagement, channels, devices, countries, landing pages, and article paths; and Search Console queries, pages, countries, devices, clicks, impressions, CTR, position, sitemap, and URL inspection. Reject missing dimensions, non-finite numbers, unexpected origins, and malformed error bodies.

- [ ] **Step 2: Implement Google HTTP refresh and provider adapters**

  Refresh expired access tokens server-side, retry one authenticated 401, respect 429/5xx without tight loops, bound rows and date ranges, and write only validated successful reports to cache.

- [ ] **Step 3: Write failing opportunity tests**

  Pin rules for meaningful minimum impressions, weak CTR relative to position, positions near page one, declining pages, sitemap failures, and unindexed canonical pages. Assert a suggestion contains evidence and proposed action but no content mutation.

- [ ] **Step 4: Implement Growth, Search, and Overview reporting UI**

  Every card/chart/table shows source and `fetchedAt`. Render delayed/stale/unavailable/disconnected callouts and explain consent-related GA4 undercounting. Use an accessible SVG chart with a table fallback and no invented interpolation.

- [ ] **Step 5: Exercise outage review cases**

  For expired token, 429, 500, invalid JSON, and revoked refresh token, assert the last successful values remain labeled stale or the panel is unavailable/reconnect-required; assert no displayed `0` is synthesized.

- [ ] **Step 6: Verify and commit**

  Run: `npm test -- apps/ops/lib/providers apps/ops/lib/growth apps/ops/components/reports && npm run typecheck --workspace @omnilede/ops && npm run build:ops`

  Expected: PASS.

  Commit: `git commit -m "Add real analytics and search reporting"`

### Task 8: AdSense readiness, revenue reporting, and guarded activation

**Files:**
- Create: `apps/ops/lib/providers/adsense.ts`
- Create: `apps/ops/lib/revenue/readiness.ts`
- Create: `apps/ops/app/api/reports/adsense/route.ts`
- Create: `apps/ops/app/(studio)/revenue/page.tsx`
- Create: `apps/ops/components/revenue/readiness-checklist.tsx`
- Create: `apps/ops/components/revenue/revenue-report.tsx`
- Create: `app/ads.txt/route.ts`
- Modify: `lib/config/commercial.ts`
- Modify: `components/privacy/third-party-scripts.tsx`
- Modify: `components/ads/ad-slot.tsx`
- Test: `apps/ops/lib/providers/adsense.test.ts`
- Test: `apps/ops/lib/revenue/readiness.test.ts`
- Test: `components/ads/ad-slot.test.tsx`
- Test: `components/privacy/consent.test.tsx`

**Interfaces:**
- Consumes: Google token/cache service and current blog consent/commercial gates.
- Produces: `fetchAdsenseReport(range): ReportEnvelope<AdsenseReport>`; `evaluateAdsenseReadiness(input): ReadinessFinding[]`; ads.txt response derived from validated publisher ID; final enable predicate `commercialEnabled && ADSENSE_ENABLED === "true" && ADSENSE_SITE_STATUS === "READY"`.

- [ ] **Step 1: Write failing AdSense adapter and readiness tests**

  Validate account/site status, policy/configuration messages, earnings, impressions, clicks, and page RPM. Missing values remain `null/unavailable`. Readiness must fail for missing ownership, invalid ads.txt, missing consent behavior, review pending, policy issue, or any non-Ready status.

- [ ] **Step 2: Implement Revenue UI and ads.txt preparation**

  Show provider facts and application steps. Application submission remains an explicit operator action in Google's account flow; Studio records the resulting real state but never claims approval.

- [ ] **Step 3: Strengthen blog activation gates**

  Preserve the existing optional-cookie consent requirement. Block script and slot activation unless all three server gates pass and IDs match strict formats.

- [ ] **Step 4: Verify and commit**

  Run: `npm test -- apps/ops/lib/providers/adsense.test.ts apps/ops/lib/revenue components/ads components/privacy && npm run build:blog && npm run build:ops`

  Expected: PASS with ads disabled under pending, disconnected, rejected, and unavailable fixtures.

  Commit: `git commit -m "Prepare guarded AdSense revenue workflow"`

### Task 9: Public-blog SEO, qualified topic hubs, and search health evidence

**Files:**
- Create: `lib/content/topics.ts`
- Create: `app/topic/[slug]/page.tsx`
- Create: `components/articles/topic-links.tsx`
- Create: `lib/seo/site-json-ld.ts`
- Create: `lib/seo/audit.ts`
- Modify: `lib/content/schema.ts`
- Modify: `app/layout.tsx`
- Modify: `app/article/[slug]/page.tsx`
- Modify: `app/category/[slug]/page.tsx`
- Modify: `app/sitemap.ts`
- Modify: `lib/seo/json-ld.ts`
- Test: `lib/content/topics.test.ts`
- Test: `app/topic/[slug]/page.test.tsx`
- Test: `lib/seo/site-json-ld.test.ts`
- Test: `lib/seo/audit.test.ts`
- Test: `app/sitemap.test.ts`

**Interfaces:**
- Consumes: current article schema, tags, canonicals, Search Console evidence, and Today-task upsert.
- Produces: `getQualifiedTopics(articles, minimumArticles = 3)`; crawlable topic hubs only for at least three useful related articles; Organization/BreadcrumbList/NewsArticle JSON-LD; `auditPublicSite(origin): SiteFinding[]`.

- [ ] **Step 1: Write failing topic qualification and metadata tests**

  Assert one- and two-article tags create no route or sitemap entry; three related articles create one canonical hub with original summary copy and internal links. Reject tag stuffing, duplicate case variants, empty descriptions, and slugs outside the safe pattern.

- [ ] **Step 2: Implement qualified topic hubs and internal links**

  Keep category and article URLs unchanged. Link articles to useful qualified topics and related categories without creating thin tag indexes.

- [ ] **Step 3: Write failing structured-data and audit tests**

  Assert Organization, publisher, author, image, visible published/modified dates, breadcrumb, canonical, unique title/description, robots, sitemap membership, image alt, and internal links. Escape JSON-LD script-breaking input.

- [ ] **Step 4: Implement structured data and health audit**

  Return evidence-backed findings with URLs and recovery actions. Feed findings into Today through Task 4's idempotent task interface; never modify article content automatically.

- [ ] **Step 5: Verify and commit**

  Run: `npm test -- lib/content/topics.test.ts 'app/topic/[slug]/page.test.tsx' lib/seo app/sitemap.test.ts && npm run validate:content && npm run build:blog`

  Expected: PASS and no existing article identity changes.

  Commit: `git commit -m "Improve OmniLede search foundations"`

### Task 10: Preview deployment, real provider setup, admin retirement, and production rollout

**Files:**
- Create: `apps/ops/netlify.toml`
- Create: `apps/ops/tests/e2e/auth.spec.ts`
- Create: `apps/ops/tests/e2e/content.spec.ts`
- Create: `apps/ops/tests/e2e/dashboard.spec.ts`
- Create: `apps/ops/tests/e2e/pwa.spec.ts`
- Create: `scripts/verify-studio-rollout.ts`
- Create: `docs/runbooks/studio-google-setup.md`
- Create: `docs/runbooks/studio-rollout.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `Start OmniLede.command`
- Delete after rollout gate passes: `app/admin/login/page.tsx`
- Delete after rollout gate passes: `app/admin/review/page.tsx`
- Delete after rollout gate passes: `app/api/admin/login/route.ts`
- Delete after rollout gate passes: `app/api/admin/logout/route.ts`
- Delete after rollout gate passes: `app/api/admin/drafts/route.ts`
- Delete after rollout gate passes: `app/api/admin/drafts/[category]/[filename]/route.ts`
- Delete after rollout gate passes: `components/admin/**`
- Test: `tests/e2e/public-admin-retirement.spec.ts`
- Test: `scripts/verify-studio-rollout.test.ts`

**Interfaces:**
- Consumes: all prior tasks and a safe non-production GitHub content branch.
- Produces: separate Netlify Studio deployment; rollout verdict `{ auth, read, save, publish, pwa, native, providers, publicAdminPreview }`; configured GA4/Search Console; deferred AdSense activation; reader-only production blog.

- [ ] **Step 1: Write failing rollout-gate tests**

  Assert the verifier refuses approval if any of these fail: exact operator auth, draft read, versioned save, controlled exact-byte publish, PWA manifest/network-only rules, native origin bridge, truthful provider error state, or 404 public-admin preview. Assert failure never targets production branch and never deletes public admin files.

- [ ] **Step 2: Add Studio Netlify configuration and preview environments**

  Deploy `apps/ops` separately, set the exact Studio origin/OAuth redirect, configure server secrets through Netlify environment storage, and point preview publishing at a dedicated content branch. Add CI for root, contracts, editorial, Ops, Swift bridge, and E2E tests.

- [ ] **Step 3: Run automated preview verification**

  Run: `npm run test:all && npm run typecheck:all && npm run build:all && npm run test:e2e:studio && npm run verify:studio-rollout -- --environment preview`

  Expected: PASS with a recorded controlled publication URL and matching Git blob hash.

- [ ] **Step 4: Configure the real Google services with the operator**

  In the Google Cloud/Supabase/GA4/Search Console account flows, create or select the project, Google OAuth web client, GA4 property and web stream, enable Analytics Data and Search Console APIs, verify `https://omnilede-news.netlify.app`, submit `/sitemap.xml`, and connect the resulting safe IDs in Studio. The operator completes Google sign-in, consent, ownership, and any account/application acknowledgements that Google requires; secrets go directly into provider/Netlify settings and never into chat, logs, or Git.

- [ ] **Step 5: Start the AdSense application without enabling ads**

  Add the current site in AdSense, complete ownership/ads.txt checks, submit for review, and record the returned pending/review state. Keep `ADSENSE_ENABLED=false` and `ADSENSE_SITE_STATUS` non-Ready until Google's real approval arrives.

- [ ] **Step 6: Exercise the premature-removal review case**

  Force one preview check to fail and assert the retirement script exits nonzero with all blog admin files/routes still present. Restore the fixture and require the complete signed verdict before creating the retirement commit.

- [ ] **Step 7: Retire the public admin and point writers to Studio**

  Remove public admin pages, APIs, authentication code, and components; make `/admin/**` and `/api/admin/**` return normal 404 responses; update the local writer review destination to Studio Content; remove no draft, article, queue, or audit data.

- [ ] **Step 8: Run final production-candidate verification**

  Run: `npm run test:all && npm run typecheck:all && npm run lint && npm run build:all && npm run test:e2e && npm run verify:studio-rollout -- --environment production-candidate`

  Expected: PASS; ads remain disabled; public preview is reader-only; Studio can read/save/publish; Mac app opens Studio without Terminal; phone PWA installs and cannot invoke Ollama.

- [ ] **Step 9: Commit the gated retirement**

  Commit: `git commit -m "Launch Studio and retire public blog admin"`

- [ ] **Step 10: Enable production in reversible order**

  Deploy Studio first, verify the real operator session and one controlled draft cycle, install the rebuilt Mac app, verify phone PWA, deploy reader-only blog, then monitor deployment, GitHub publication, provider connection, sitemap processing, and site health. Enable ads in a later single-purpose change only after Studio reads Google's site status as Ready.

## Final verification checklist

- [ ] `git diff --check` reports no whitespace errors.
- [ ] `git status --short` contains no generated secrets, tokens, provider payloads, or unrelated user drafts/queue changes.
- [ ] `npm run test:all`, `npm run typecheck:all`, `npm run lint`, and `npm run build:all` pass.
- [ ] Playwright verifies desktop and phone layouts, private network-only caching, deliberate Publish, and reader-only public routes.
- [ ] Swift tests and codesign verification pass; launching OmniLede shows Studio and starts no writer process.
- [ ] Real dashboards name their source and timestamp, and disconnected/stale fixtures show no invented zeroes.
- [ ] The six Categories rows and separate Today list are visible on Mac and phone.
- [ ] Existing working-tree drafts and `content/queue/trending.json` remain untouched unless the user explicitly publishes one through Studio.
