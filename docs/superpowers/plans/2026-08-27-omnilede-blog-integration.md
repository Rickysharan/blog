# OmniLede Blog Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect approved contributor submissions to the existing blog through a secure, exactly-once GitHub publication contract, then add contributor attribution, regional/language discovery, governance pages, and live end-to-end verification without weakening the current newsroom.

**Architecture:** Contributor is the publication producer and outbox owner; the root blog is the only consumer allowed to render canonical MDX. A signed request carries constrained structured content, the blog verifies/replay-protects it, renders deterministic frontmatter/body, and commits one file through a repository-scoped GitHub credential. Regional discovery enhances the stable global server-rendered feed through a Netlify Edge geolocation endpoint and explicit browser preference.

**Tech Stack:** Existing root Next.js/MDX/GitHub/Netlify stack, shared Zod contracts, Supabase JS 2.112.4, Sharp 0.35.4, Web Crypto/Node crypto HMAC-SHA256, Netlify Edge Functions 4.0.0 geolocation, Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-27-omnilede-contributor-ecosystem-design.md`](../specs/2026-08-27-omnilede-contributor-ecosystem-design.md)

## Global Constraints

- Complete and verify the Foundation and Contributor Platform plans first.
- Preserve all existing article frontmatter and URLs. New optional fields must parse old articles unchanged.
- The blog receives structured, allowlisted content and creates MDX itself. It never accepts arbitrary frontmatter, raw HTML, executable JSX, `import`, or `export` from Contributor.
- Publication requires a verified HMAC, allowed origin/audience, five-minute timestamp window, unused nonce, strict request limit, server-side authorization, and idempotency. A valid signature does not replace schema/content validation.
- GitHub contents-write credential is restricted to `Rickysharan/blog` and stored server-side. Ops uses a separate read-only token.
- Never write durable content to Netlify's runtime filesystem. Git is the only public article persistence layer.
- Credit points after the Git commit succeeds, exactly once. A later Netlify deploy failure remains an Ops issue and does not reverse earned points.
- Global content is always visible and server-rendered. Geolocation may reorder/supplement; it may not hide the global lead or persist raw IP.
- Explicit region/language selection overrides detection. Do not auto-translate articles.
- Cite current official Netlify/Next.js documentation again at implementation time because Edge/monorepo APIs may change.
- Make each listed commit separately and keep the unrelated root `next-env.d.ts` edit unstaged.

## Task 1: Extend article contracts without breaking the current library

**Files:**

- Modify: `lib/content/schema.ts`
- Modify: `lib/content/articles.ts`
- Modify: `lib/content/schema.test.ts`
- Modify: `lib/content/articles.test.ts`
- Create: `packages/contracts/src/publication.ts`
- Create: `packages/contracts/src/publication.test.ts`

**Optional frontmatter fields:**

```ts
region: RegionSchema.optional(),
language: Bcp47LanguageSchema.default("en"),
contributorId: z.string().uuid().optional(),
contributorName: z.string().trim().min(1).max(100).optional(),
submissionId: z.string().uuid().optional(),
publicationId: z.string().uuid().optional(),
```

If any of `contributorId`, `contributorName`, `submissionId`, or `publicationId` is present, all four plus explicit `region` and `language` are required as a coherent contributor group. Existing editorial articles may omit the contributor group, receive the parsed language default, and retain current `sourceName`/`sourceUrl` behaviour.

**Publish payload:** `publicationId`, `submissionId`, `submissionVersion`, `title`, `slug`, `date`, `category`, `tags`, `contributorId`, `contributorName`, `excerpt`, `coverImage`, `readTime`, `sourceName`, `sourceUrl`, `region`, `language`, `contentDocument`, and `guidelinesVersion`. The schema is strict, bounded, and shared by producer/consumer.

- [ ] Extend schema tests with one valid legacy article, one valid contributor article, every partial contributor-field combination rejected, invalid BCP-47/region rejected, duplicate publication ID rejected in a fixture library, and current articles parsed unchanged.
- [ ] Add publication-contract tests for exact keys, slug/category rules, HTTPS source/image URLs, constrained editor document, bounded tags/body, and `guidelinesVersion`.
- [ ] Run focused tests and capture expected schema failures.
- [ ] Implement schemas using shared contract primitives; make `language` resolve to `en` in parsed output for legacy content without rewriting files.
- [ ] Extend summaries and related-article logic with optional region/language/contributor data while leaving current sort order stable.
- [ ] Run `npm run validate:content`, focused tests, and root typecheck.
- [ ] Record the baseline and resulting article counts; they must match.
- [ ] Commit: `feat(blog): extend articles for contributor attribution`

## Task 2: Implement canonical signing and replay protection

**Files:**

- Create: `packages/contracts/src/canonical-json.ts`
- Create: `packages/contracts/src/canonical-json.test.ts`
- Create: `lib/publishing/signature.ts`
- Create: `lib/publishing/signature.test.ts`
- Create: `lib/publishing/nonce-store.ts`
- Create: `lib/publishing/nonce-store.test.ts`
- Create: `supabase/migrations/202608270005_publication_nonces.sql`
- Create: `supabase/tests/005_publication_nonces.sql`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/supabase/admin.ts`
- Create: `lib/supabase/admin.test.ts`

**Wire headers:**

```text
x-omnilede-timestamp: Unix seconds
x-omnilede-nonce: UUID
x-omnilede-audience: omnilede-blog-publish-v1
x-omnilede-signature: v1=<lowercase hex HMAC-SHA256>
```

The signed bytes are UTF-8 for `timestamp + "." + nonce + "." + audience + "." + canonicalJson(body)`. Canonical JSON recursively sorts object keys, preserves array order, rejects non-finite numbers/undefined, and emits no whitespace.

- [ ] Write canonicalization tests with nested objects, Unicode, arrays, reordered keys, and rejected unsupported values.
- [ ] Write signature tests for known vectors, changed body/header, wrong secret, wrong audience, expired/future timestamp, uppercase/malformed hex, constant-time length mismatch, and redacted error serialization.
- [ ] Write SQL tests proving nonce/audience uniqueness, expiry cleanup, anonymous/authenticated denial, and service-only insert/read.
- [ ] Run tests and confirm failure before implementation.
- [ ] Install pinned `@supabase/supabase-js@2.112.4` at the root and implement a server-only, per-request admin client from validated `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; prove the module cannot be imported through a Client Component entry.
- [ ] Implement shared canonical JSON and server-only sign/verify functions using `timingSafeEqual`; never log the secret, full signature, or signed body on verification failure.
- [ ] Store nonce digest, audience, publication ID, received timestamp, and expiry in a private table. Claim the nonce transactionally before external GitHub work; a replay returns the original idempotent result only when publication ID/body digest match.
- [ ] Run unit and SQL tests.
- [ ] Commit: `feat(blog): add replay safe publication signatures`

## Task 3: Render safe contributor content into canonical MDX

**Files:**

- Create: `lib/publishing/render-mdx.ts`
- Create: `lib/publishing/render-mdx.test.ts`
- Create: `lib/publishing/escape.ts`
- Create: `lib/publishing/escape.test.ts`
- Create: `lib/publishing/validate-image.ts`
- Create: `lib/publishing/validate-image.test.ts`

**Rendering map:** paragraph to blank-line-separated text; headings to `##`/`###`; bold to `**`; italic to `_`; safe link to `[text](https-url)`; ordered/unordered lists to canonical Markdown; blockquote lines to `>`; hard break to two trailing spaces plus newline. Escape Markdown control characters in text and link labels. Reject MDX expression braces, HTML, JSX, imports, exports, unsafe URL schemes, and unrecognized nodes/marks.

Canonical frontmatter follows this exact order: `title`, `slug`, `date`, `category`, `tags`, `author`, `excerpt`, `coverImage`, `readTime`, `sourceName`, `sourceUrl`, `region`, `language`, `contributorId`, `contributorName`, `submissionId`, `publicationId`.

- [ ] Write snapshot tests for every allowed node/mark, nested list, special-character title/author/source, YAML delimiters, attempted JSX/import/export, unsafe link, unknown node, and a body ending in visible `Source: [Outlet](URL)`.
- [ ] Write image validation tests for the exact configured `published-images` HTTPS hostname/path, private bucket path rejection, query-token rejection, foreign hostname rejection, and local editorial image compatibility.
- [ ] Run tests and confirm failure.
- [ ] Implement deterministic rendering from validated structured content; never concatenate unparsed YAML scalars. Parse the rendered file through `parseArticleFile` before publication.
- [ ] Add contributor byline plus the required source link once; reject a document that attempts to forge the generated attribution/source footer.
- [ ] Validate `coverImage` as the approved public derivative URL. If image validation fails, return a publication validation error and leave the outbox retryable for human correction.
- [ ] Run focused tests and `npm run validate:content`.
- [ ] Commit: `feat(blog): render constrained contributor mdx`

## Task 4: Generalize the GitHub repository adapter for exactly-once article commits

**Files:**

- Modify: `lib/drafts/github-repository.ts`
- Modify: `lib/drafts/github-repository.test.ts`
- Create: `lib/github/git-data-client.ts`
- Create: `lib/github/git-data-client.test.ts`
- Create: `lib/publishing/article-repository.ts`
- Create: `lib/publishing/article-repository.test.ts`

**Repository interface:**

```ts
export interface ArticleRepository {
  publish(input: {
    category: CategorySlug;
    slug: string;
    publicationId: string;
    mdx: string;
  }): Promise<{ commitSha: string; commitUrl: string; articlePath: string; replayed: boolean }>;
}
```

- [ ] Preserve all existing draft-adapter tests and add tests for a new article, same publication replay, same path/same body replay, same path/different body conflict, branch movement retry, truncated tree, malformed GitHub response, non-HTTPS API base, response-size bound, and token-redacted errors.
- [ ] Run old/new tests and confirm only new behaviour fails.
- [ ] Extract shared Git Data API operations without changing the draft repository's observable behaviour.
- [ ] Implement article publication as one Git tree/commit/ref update with commit message `publish contributor article: {slug}`. Before writing, inspect an existing path and publication ID to return a replay or 409 conflict.
- [ ] Limit configured repository to the exact `owner/repository` pattern and branch to a validated ref. Keep the GitHub API version header and bounded timeout/response protections.
- [ ] Run draft, GitHub, and article tests.
- [ ] Commit: `refactor(blog): share safe github publication client`

## Task 5: Build the authenticated blog publication receiver

**Files:**

- Create: `app/api/internal/publications/route.ts`
- Create: `app/api/internal/publications/route.test.ts`
- Create: `lib/publishing/service.ts`
- Create: `lib/publishing/service.test.ts`
- Modify: `next.config.mjs`
- Modify: `.env.example`

**Response contract:** `201` for first commit, `200` for identical replay, `400` invalid schema/content, `401` bad signature, `409` nonce/path/body conflict, `413` body too large, `429` bounded rate limit, `503` repository unavailable. Success returns only `publicationId`, `commitSha`, `commitUrl`, `articlePath`, `articleUrl`, and `replayed`.

- [ ] Write route tests for every status, wrong content type, more than 300 KiB, origin irrelevance for server-to-server HMAC, signature/replay checks, and no-store headers.
- [ ] Write service tests proving validation precedes GitHub, renderer output is parsed before commit, slug/category destination is fixed by schema, and a replay never commits twice.
- [ ] Run tests and confirm failure.
- [ ] Implement the Node.js Route Handler with a bounded body reader. Verify headers/body before parsing external URLs; do not use a browser cookie or public admin password for this integration.
- [ ] Construct dependencies per request from validated server environment. Add `CONTRIBUTOR_PUBLISH_HMAC_SECRET`, `GITHUB_PUBLISH_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `PUBLISHED_IMAGE_ORIGIN`, and `CONTRIBUTOR_APP_ORIGIN` to the server-only example.
- [ ] Add security headers and ensure no integration secret can enter the client bundle.
- [ ] Run focused tests, root test suite, content validation, typecheck, and build.
- [ ] Commit: `feat(blog): receive signed contributor publications`

## Task 6: Connect Contributor outbox, public image derivative, and points credit

**Files:**

- Create: `apps/contributor/lib/publication/prepare-image.ts`
- Create: `apps/contributor/lib/publication/prepare-image.test.ts`
- Create: `apps/contributor/lib/publication/client.ts`
- Create: `apps/contributor/lib/publication/client.test.ts`
- Create: `apps/contributor/lib/publication/outbox.ts`
- Create: `apps/contributor/lib/publication/outbox.test.ts`
- Create: `apps/contributor/app/api/internal/publish/route.ts`
- Create: `apps/contributor/app/api/cron/publish/route.ts`
- Create: `supabase/migrations/202608270006_publication_outbox.sql`
- Create: `supabase/tests/006_publication_outbox.sql`
- Modify: `apps/contributor/package.json`
- Modify: `package-lock.json`

**Transaction boundaries:** approval creates one outbox row; worker claims by publication ID/version; image preparation reads verified private original, decodes/re-encodes a size-bounded WebP derivative with metadata removed, stores at `published-images/{publicationId}.webp`, signs and sends payload, records commit, then posts one wallet earn transaction. A deploy failure does not reverse the wallet entry.

- [ ] Write image tests for EXIF removal, maximum dimensions, WebP output, corrupt input, path ownership, retry idempotency, and no public original.
- [ ] Write client tests against a fake blog receiver for canonical signature, timeout, 400 permanent failure, 401 paused integration, 409 conflict/manual review, 503 retry, and bounded exponential schedule.
- [ ] Write SQL/outbox tests for one outbox per approved version, worker lease expiry, concurrent workers, publication record once, wallet credit once, and rejection after approval forbidden.
- [ ] Run tests and confirm failure.
- [ ] Install pinned `sharp@0.35.4` in the Contributor workspace for server-only decode, dimension validation, metadata stripping, resizing, and WebP encoding; never import it from Client Components.
- [ ] Implement preparation and outbox processing with compare-and-set leases. Keep network calls outside transactions and cap each cron invocation by items and wall time.
- [ ] Persist `publishing_failed` with a sanitised reason after retry budget; leave admin retry controls and pipeline warning. Do not deduct points after a successful Git commit.
- [ ] Run unit, SQL, and integration tests with a fake GitHub receiver.
- [ ] Commit: `feat(contributor): publish approved articles exactly once`

## Task 7: Render contributor attribution and regional/language discovery

**Files:**

- Modify: `app/article/[slug]/page.tsx`
- Modify: `app/category/[slug]/page.tsx`
- Modify: `app/page.tsx`
- Create: `components/articles/contributor-attribution.tsx`
- Create: `components/articles/contributor-attribution.test.tsx`
- Create: `components/region/region-control.tsx`
- Create: `components/region/region-control.test.tsx`
- Create: `components/region/regional-feed.tsx`
- Create: `lib/region/preferences.ts`
- Create: `lib/region/preferences.test.ts`
- Create: `netlify/edge-functions/region-context.ts`
- Create: `netlify/edge-functions/region-context.test.ts`
- Modify: `netlify.toml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Region context response:** `{ countryCode: string | null, region: RegionSlug, source: "netlify" | "fallback" }`. The Edge Function reads only `context.geo.country.code`, maps ISO country to broad region, returns no IP/city/postcode/coordinates, sets `Cache-Control: private, no-store`, and is mounted only at `/api/region-context`.

- [ ] Write country mapping tests spanning each supported broad region, lowercase/invalid/missing code, and a response assertion that no raw IP or precise geography is serialized.
- [ ] Write preference/control tests for Global default, detected suggestion, explicit region/language override, localStorage corruption, keyboard interaction, and reset to Global.
- [ ] Write article tests for contributor byline/licence disclosure and finance/share-market contributor-view disclaimer.
- [ ] Run tests and confirm failure.
- [ ] Install pinned `@netlify/edge-functions@4.0.0` for Edge context types and local tests.
- [ ] Implement the Edge Function using current official Netlify `context.geo.country.code`; global fallback on missing/unknown code. Do not intercept all HTML.
- [ ] Keep global articles as server-rendered lead/SEO content. After hydration, fetch region context once, store only explicit preference, and reorder/supplement cards without removing the global lead.
- [ ] Display `Showing: Global`, `Showing: Suggested — Europe`, or `Showing: Your choice — Asia · en-IN` truthfully.
- [ ] Run tests and use Netlify local geo mocks for at least `US`, `GB`, `IN`, `BR`, `ZA`, `JP`, `AU`, and missing geo.
- [ ] Commit: `feat(blog): add transparent regional discovery`

## Task 8: Update feeds, metadata, legal, contact, and advertiser surfaces

**Files:**

- Modify: `app/feed.xml/route.ts`
- Modify: `app/sitemap.ts`
- Modify: `app/robots.ts`
- Modify: `app/privacy/page.tsx`
- Modify: `app/terms/page.tsx`
- Modify: `app/disclaimer/page.tsx`
- Modify: `app/contact/page.tsx`
- Create: `app/advertise/page.tsx`
- Create: `app/guidelines/page.tsx`
- Create: `app/api/contact/route.ts`
- Create: `lib/contact/service.ts`
- Create: `lib/contact/service.test.ts`
- Create: `app/legal-pages.test.tsx`

- [ ] Write feed/metadata tests proving contributor articles use canonical global URLs, optional language is emitted correctly, regional variants do not create duplicate canonical pages, and legacy articles remain present.
- [ ] Write legal tests for all required design sections and exact `[FILL IN: ...]` operator markers.
- [ ] Write contact tests for strict fields, general/support versus advertising/partnership routing, honeypot, database rate limit, stored-first delivery, failed-email visibility, and no invented audience metrics.
- [ ] Run tests and confirm failure.
- [ ] Implement one global sitemap/canonical URL per article; include language metadata without auto-generated translated routes.
- [ ] Expand privacy, terms, contributor guidelines/points terms, advertiser/partner information, contact, and disclaimer. Retain the licence and finance disclaimers; label audience/ad metrics `Not connected` until genuine GA4 data exists.
- [ ] Store contact inquiries in Supabase before Brevo notification. If Supabase is unavailable, return a clear retry response rather than pretending delivery.
- [ ] Run tests, content validation, root build, and route smoke tests.
- [ ] Commit: `feat(blog): complete governance and partner surfaces`

## Task 9: Verify publication and regional delivery end to end

**Files:**

- Create: `tests/e2e/contributor-publication.spec.ts`
- Create: `tests/e2e/regional-discovery.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/runbooks/publication-recovery.md`

- [ ] Create an isolated E2E publication fixture with a unique UUID/slug and a disposable fake GitHub endpoint; assert one request produces one MDX path, one publication row, and one wallet transaction.
- [ ] Test identical replay, tampered payload, replayed nonce with different body, GitHub conflict, deploy failure after commit, retry reconciliation, legacy article rendering, attribution, and source footer.
- [ ] Test region suggestions/overrides across mobile and desktop, Global reset, missing Edge context, no hidden global lead, and no console errors.
- [ ] Add CI stages in order: contracts/unit, root content validation/build, Contributor build, integration fixture, Playwright. Never use the production GitHub token in PR CI.
- [ ] Document recovery for `publishing_failed`, existing Git commit/missing DB acknowledgement, duplicate slug, failed Netlify deploy, image derivative mismatch, and secret rotation.
- [ ] After explicit approval, use the GitHub CLI integration to push the completed branch and configure least-privilege repository/Actions settings. Git commands are **Automatic**; GitHub login/re-auth is **Manual** if the current session expires.
- [ ] After explicit approval and a confirmed Netlify target, add the production integration secret to both sites, approve one test article, verify its GitHub commit, watch the Netlify deploy, open the final URL, and verify exactly one points credit. Secret entry/login is **Manual assisted by browser**; code push and browser verification are **Automatic**.
- [ ] Remove or clearly label the test article according to the operator's editorial choice; do not silently delete a public publication.
- [ ] Run all root/Contributor tests, all builds, `git diff --check`, and credential scans.
- [ ] Commit: `test: verify contributor to blog publication`

## Plan Verification Gate

- [ ] Every current blog article and route still validates and builds.
- [ ] A valid approved submission produces exactly one parsed MDX file, Git commit, publication record, and points credit.
- [ ] Signature, replay, path traversal, unsafe MDX, unsafe image, cross-user, and duplicate tests pass.
- [ ] Regional delivery never stores raw IP, never hides Global, and honours explicit user choice.
- [ ] Contributor articles show attribution, source, licence context, and category-specific disclaimer.
- [ ] Governance/contact/advertiser routes contain truthful status and required operator markers.
- [ ] Live publication is not marked complete until the final GitHub commit, Netlify deploy, blog URL, and ledger entry have all been observed.
- [ ] Request code review before beginning Ops and Deployment.
