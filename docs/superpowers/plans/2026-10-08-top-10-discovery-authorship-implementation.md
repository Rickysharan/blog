# OmniLede Top 10, Discovery, and Authorship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Top 10 editorial support, truthful Ricky Sharan authorship, stronger article discovery, and space-saving public and Studio navigation while preserving OmniLede's current visual design and human publishing gate.

**Architecture:** Extend the shared editorial category registry first so the blog, contracts, Studio, daily planning, and native bridge consume one seventh category. Keep publish-readiness rules in the shared editorial package, generation-specific rules in the local writer, and UI reveal state inside focused client components. Use shared author metadata for visible bylines, author pages, metadata, and JSON-LD. Preserve server-rendered content and prefetching so the new reveal controls do not slow route changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Vitest and Testing Library, Playwright, shared `@omnilede/editorial` and `@omnilede/contracts` workspaces, Swift native bridge, local Ollama writer, GitHub-backed drafts, Vercel deployments.

**Spec:** [`docs/superpowers/specs/2026-10-07-top-10-discovery-authorship-design.md`](../specs/2026-10-07-top-10-discovery-authorship-design.md)

## Global Constraints

- Preserve current colours, typography, cards, masthead content, article layout, and Studio visual language.
- Keep content, status, progress, errors, Today tasks, review, Save, Retry, Cancel, and Publish visible without hover.
- Never start writing when the app opens, and never auto-publish.
- Keep contributor attribution intact; migrate only exact `author: OmniLede Editorial` values on OmniLede-owned content.
- Do not add membership, shop, paid APIs, paid services, or dead controls.
- Use the current shared category registry instead of adding separate category lists in each app.
- Keep public and Studio route prefetching enabled and avoid route-level blocking fetches in navigation controls.

## Review Focus

The implementer and reviewer must explicitly test these five failure modes:

1. A Top 10 draft with missing, repeated, or out-of-order entries reaches Publish.
2. A reveal menu disappears while a pointer or keyboard user is still interacting with it, or remains inaccessible on touch.
3. The Studio rail expansion changes the main workspace width and recreates the slow tab-switch experience.
4. A contributor byline is replaced, or the visible author and NewsArticle JSON-LD disagree.
5. Related recommendations repeat the current article, contain duplicates, or return an empty section despite available fallback articles.

---

### Task 1: Add Top 10 to the shared category model and native allowlist

**Files:**
- Modify: `packages/editorial/src/categories.ts`
- Modify: `lib/config/categories.test.ts`
- Modify: `packages/contracts/src/operations.test.ts`
- Modify: `apps/ops/app/(studio)/categories/page.tsx`
- Modify: `apps/ops/components/categories/category-table.tsx` only if it contains a hard-coded count or grid width
- Modify: `apps/ops/components/native/writer-controls.test.tsx`
- Modify: `desktop/StudioBridge.swift`
- Modify: `desktop/tests/StudioBridgeTests.swift`
- Create: `content/articles/top-10/.gitkeep`
- Create: `content/drafts/top-10/.gitkeep`

**Interfaces:**
- `CategorySlug` gains `"top-10"` through `CATEGORIES` inference.
- `StudioWriterCategory` gains `case top10 = "top-10"`.
- Existing category routes, filters, sitemap, RSS, search, inventory, Today planning, and writer controls continue consuming `CATEGORIES`/`CATEGORY_SLUGS`; do not add parallel lists.

- [x] **Step 1: Write failing registry and bridge tests**

  Assert that the ordered slugs are `anime`, `movies`, `politics`, `sports`, `finance`, `share-market`, `top-10`; the new label is `Top 10`; `categorySchema` accepts `top-10`; all seven native categories are admitted; and an unknown category is denied.

- [x] **Step 2: Run the focused tests and confirm the expected failures**

  Run: `npx vitest run lib/config/categories.test.ts packages/contracts/src/operations.test.ts apps/ops/components/native/writer-controls.test.tsx`

  Run: `npm run test:studio-native`

  Expected: TypeScript tests fail because `top-10` is absent and Swift fails because only six cases exist.

- [x] **Step 3: Add the category once at the shared source**

  Add `{ slug: "top-10", label: "Top 10", accent: <existing palette accent>, description: <plain editorial description> }` to `CATEGORIES`. Update hard-coded “six desks” copy to count-neutral wording. Add the Swift enum case and empty tracked directories. Do not publish a demonstration article.

- [x] **Step 4: Re-run focused tests and inventory checks**

  Run: `npx vitest run lib/config/categories.test.ts packages/contracts/src/operations.test.ts apps/ops/components/native/writer-controls.test.tsx lib/desktop/daily-plan.test.ts`

  Run: `npm run test:studio-native`

  Expected: PASS, including seven writer choices and unknown-category rejection.

- [x] **Step 5: Commit the category foundation**

  Commit: `feat: add top 10 editorial category`

### Task 2: Enforce Top 10 publish readiness and safe local drafting

**Files:**
- Create: `packages/editorial/src/content/publish-readiness.ts`
- Create: `packages/editorial/src/content/publish-readiness.test.ts`
- Modify: `packages/editorial/src/index.ts`
- Modify: `packages/editorial/src/drafts/github-repository.ts`
- Modify: `packages/editorial/src/drafts/github-repository.test.ts`
- Modify: `lib/pipeline/generate.ts`
- Modify: `lib/pipeline/generate.test.ts`
- Modify: `lib/pipeline/local-run.ts`
- Modify: `lib/pipeline/local-run-types.ts`
- Modify: `lib/pipeline/local-run.test.ts`
- Modify: `apps/ops/components/today/task-list.tsx`
- Modify: `apps/ops/components/today/task-list.test.tsx`

**Interfaces:**
- Export `validatePublishReadyArticle(article: ArticleDocument): void` from `@omnilede/editorial`.
- Add a generation validation category such as `needs-research` that maps to a human-required Studio state with the visible message `Needs research`.
- Keep `validateDraftMdx` permissive enough to save an incomplete private Top 10 draft; call publish-readiness validation only inside `GitHubDraftRepository.publish` and generation's ready-draft path.
- For `top-10`, generation must require an introduction, exactly ten sequential second-level headings matching `## 1. …` through `## 10. …`, a final `## Why it matters` section, visible source attribution, and two or three credited related images before reporting a ready draft.

- [x] **Step 1: Write failing shared publish-readiness tests**

  Cover a valid Top 10 article and failures for nine entries, eleven entries, duplicated numbers, skipped numbers, reordered numbers, missing introduction, missing `Why it matters`, and missing visible source attribution. Prove that a non-Top-10 article is unaffected.

- [x] **Step 2: Write failing repository and writer tests**

  Prove that Save accepts an incomplete private Top 10 draft, Publish rejects it without mutating GitHub, a supported ten-entry result becomes a draft, and insufficient source/image material produces `Needs research` while preserving the queue and any safe work.

- [x] **Step 3: Run the focused tests and confirm they fail for missing behavior**

  Run: `npx vitest run packages/editorial/src/content/publish-readiness.test.ts packages/editorial/src/drafts/github-repository.test.ts lib/pipeline/generate.test.ts lib/pipeline/local-run.test.ts apps/ops/components/today/task-list.test.tsx`

- [x] **Step 4: Implement shared publication validation**

  Parse numbered `##` headings deterministically, ignore `## Why it matters`, reject duplicates and gaps, and return a safe editorial validation error. Invoke it immediately before the GitHub publish mutation, after the expected-version and draft checks but before blob creation.

- [x] **Step 5: Implement the Top 10 writer contract**

  Add a category-specific prompt that forbids inventing list entries, requires exactly ten supported entries, and tells the model to return insufficient-research failure rather than padding. Validate the model response before MDX creation. Keep the final human Publish step unchanged.

- [x] **Step 6: Preserve the requested image behavior without a fake category asset**

  Count the first verified reusable photo as the cover and place the remaining verified photos through the body, preserving Wikimedia credit text. Require at least two verified photos for a ready local Top 10 draft; allow a private Needs research state when this cannot be met. Do not add a handcrafted placeholder image.

- [x] **Step 7: Surface `Needs research` in Today and native status**

  Map the new validation outcome to a terminal human-required status. Show the message, keep Retry/Cancel and existing work visible, and never label the item delivered.

- [x] **Step 8: Re-run focused tests**

  Run: `npx vitest run packages/editorial/src/content/publish-readiness.test.ts packages/editorial/src/drafts/github-repository.test.ts lib/pipeline/generate.test.ts lib/pipeline/local-run.test.ts apps/ops/components/today/task-list.test.tsx`

  Expected: PASS.

- [x] **Step 9: Commit publishing safeguards**

  Commit: `feat: validate top 10 drafts before publishing`

### Task 3: Make Ricky Sharan the truthful OmniLede author

**Files:**
- Create: `lib/config/authors.ts`
- Create: `lib/config/authors.test.ts`
- Create: `app/author/[slug]/page.tsx`
- Create: `app/author/[slug]/page.test.tsx`
- Modify: `components/articles/article-meta.tsx`
- Modify: `components/articles/article-meta.test.tsx`
- Modify: `app/article/[slug]/page.tsx`
- Modify: `app/article/[slug]/page.test.tsx`
- Modify: `lib/seo/json-ld.ts`
- Modify: `lib/seo/json-ld.test.ts`
- Modify: `lib/pipeline/generate.ts`
- Modify: `lib/pipeline/generate.test.ts`
- Modify: `lib/content/articles.test.ts`
- Modify: `content/articles/**/*.mdx` where the exact author is `OmniLede Editorial`
- Modify: `content/drafts/**/*.mdx` where the exact author is `OmniLede Editorial`

**Interfaces:**
- Add an immutable `RICKY_SHARAN_PROFILE` with `name`, `slug`, `path`, and the approved editor/publisher disclosure.
- Add `getAuthorProfile(name: string)` so contributor names can remain unlinked unless a real profile exists.
- `ArticleMeta` accepts an optional `authorHref` and renders a normal byline when absent.

- [x] **Step 1: Write failing author registry, byline, page, JSON-LD, and generation tests**

  Assert that Ricky's byline links to `/author/ricky-sharan`; the page identifies him as editor and publisher, explains local AI draft assistance and human review, and contains no invented credentials; generated drafts use `Ricky Sharan`; JSON-LD emits `Person` with the absolute author URL; contributor fixtures keep their original authors.

- [x] **Step 2: Run the focused tests and confirm failure**

  Run: `npx vitest run lib/config/authors.test.ts components/articles/article-meta.test.tsx app/author/'[slug]'/page.test.tsx app/article/'[slug]'/page.test.tsx lib/seo/json-ld.test.ts lib/pipeline/generate.test.ts lib/content/articles.test.ts`

- [x] **Step 3: Implement the shared author profile and author route**

  Generate metadata and static params from the registry. Keep the page text factual: Ricky Sharan is OmniLede's editor and publisher; local AI may assist with private drafts; Ricky reviews and decides whether to publish each article.

- [x] **Step 4: Connect visible byline, metadata, and structured data**

  Resolve the profile once on the article page, pass the byline link to `ArticleMeta`, include the author URL in Next metadata, and generate matching NewsArticle JSON-LD. Preserve contributor attribution and organization publisher JSON-LD.

- [x] **Step 5: Migrate owned content narrowly**

  Replace only exact YAML lines `author: OmniLede Editorial` in OmniLede-owned article and draft files. Add a test that owned content now uses Ricky while any content with contributor fields retains its supplied author.

- [x] **Step 6: Re-run focused tests and content validation**

  Run: `npx vitest run lib/config/authors.test.ts components/articles/article-meta.test.tsx app/author/'[slug]'/page.test.tsx app/article/'[slug]'/page.test.tsx lib/seo/json-ld.test.ts lib/pipeline/generate.test.ts lib/content/articles.test.ts`

  Run: `npm run validate:content`

  Expected: PASS.

- [x] **Step 7: Commit truthful authorship**

  Commit: `feat: add ricky sharan author profile`

### Task 4: Guarantee useful “You may also like” recommendations

**Files:**
- Modify: `lib/content/articles.ts`
- Modify: `lib/content/articles.test.ts`
- Modify: `components/articles/related-articles.tsx`
- Create: `components/articles/related-articles.test.tsx`
- Modify: `app/article/[slug]/page.tsx`
- Modify: `app/article/[slug]/page.test.tsx`

**Interfaces:**
- Change `getRelatedArticles(subject, candidates, limit = 4)` to rank by tier: shared tags, same category, then recent global articles.
- Deduplicate candidates by slug before ranking; exclude the subject; use recency and title as deterministic tie-breakers.

- [x] **Step 1: Write failing ranking and rendering tests**

  Cover tag priority, shared-tag count, same-desk fallback, global recent fallback, duplicate removal, subject exclusion, deterministic ties, a maximum of four, and fewer than four available. Assert the heading is `You may also like` and wide layout supports four cards.

- [x] **Step 2: Run focused tests and confirm failures**

  Run: `npx vitest run lib/content/articles.test.ts components/articles/related-articles.test.tsx app/article/'[slug]'/page.test.tsx`

- [x] **Step 3: Implement tiered ranking and four-card rendering**

  Compute all rank keys before sorting, preserve card content and styling, request four from the article page, and render nothing only when no other articles exist.

- [x] **Step 4: Re-run focused tests**

  Run: `npx vitest run lib/content/articles.test.ts components/articles/related-articles.test.tsx app/article/'[slug]'/page.test.tsx`

  Expected: PASS.

- [x] **Step 5: Commit discovery changes**

  Commit: `feat: add resilient article recommendations`

### Task 5: Make the existing desktop category strip reveal from the masthead

**Files:**
- Create: `components/layout/desktop-category-reveal.tsx`
- Create: `components/layout/desktop-category-reveal.test.tsx`
- Modify: `components/layout/site-header.tsx`
- Modify: `components/layout/site-header.test.tsx`
- Modify: `components/layout/mobile-menu.tsx`
- Modify: `components/layout/mobile-menu.test.tsx` if present, otherwise create it
- Modify: `components/layout/category-nav.tsx`
- Modify: `app/globals.css`
- Modify: `tests/e2e/public.spec.ts`

**Interfaces:**
- `DesktopCategoryReveal` owns `hovered`, `focusWithin`, and `pinned` state and renders the existing `CategoryNav` horizontally.
- The desktop menu button exposes `aria-expanded` and `aria-controls="desktop-news-desks"`.
- `CategoryNav` accepts `id`, an optional selection callback, and layout classes without changing its card/colour treatment.
- `MobileMenu` remains click-operated below the desktop breakpoint and contains all seven categories.

- [x] **Step 1: Write failing interaction tests**

  Assert collapsed-by-default state; pointer entry reveals; moving between masthead and strip keeps it open; leaving the combined region closes it when unpinned; focus entry reveals; tabbing through links does not close it; the existing menu control pins/unpins; Escape, outside click, link selection, and focus exit close it; desktop list remains a horizontal grid; mobile menu works by click and includes Top 10.

- [x] **Step 2: Run focused tests and confirm failure**

  Run: `npx vitest run components/layout/desktop-category-reveal.test.tsx components/layout/site-header.test.tsx components/layout/mobile-menu.test.tsx`

- [x] **Step 3: Implement accessible reveal state**

  Keep the masthead server-rendered where practical and place only the interaction wrapper in a client component. Use pointer and focus containment across one wrapper, a document outside-pointer listener only while pinned, and Escape handling. Do not delay navigation or wait on network requests.

- [x] **Step 4: Add non-shifting slide CSS**

  Position the existing full-width category strip under the masthead as an overlay so opening it does not move the page. Animate transform/opacity only; disable meaningful duration under `prefers-reduced-motion`. Update the category grid for seven columns at desktop without turning it into a sidebar or vertical desktop menu.

- [x] **Step 5: Re-run component tests and add desktop/mobile E2E coverage**

  Run: `npx vitest run components/layout/desktop-category-reveal.test.tsx components/layout/site-header.test.tsx components/layout/mobile-menu.test.tsx`

  Run: `npx playwright test tests/e2e/public.spec.ts --project=chromium`

  Expected: PASS, with the strip present but collapsed until explicitly revealed.

- [x] **Step 6: Commit public navigation**

  Commit: `feat: reveal category navigation from masthead`

### Task 6: Convert Studio navigation to a fast compact rail and phone More menu

**Files:**
- Modify: `apps/ops/components/studio-shell.tsx`
- Create: `apps/ops/components/studio-shell.test.tsx`
- Modify: `apps/ops/app/globals.css`
- Modify: `apps/ops/tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Keep `STUDIO_DESTINATIONS` as the single route list and add a `primaryOnPhone` flag or derive the four primary routes explicitly from it.
- Use `usePathname()` to expose `aria-current="page"` and keep the current destination mark visible in compact mode.
- The desktop grid reserves only rail width; the expanded rail overlays the workspace and never changes the main column width.
- Phone shows Today, Categories, Content, and Overview plus an accessible `More` dialog containing Growth, Search, Revenue, Health, and Connections.

- [x] **Step 1: Write failing Studio navigation tests**

  Test desktop compact default, visible marks/current destination, hover and focus expansion, pin/unpin, Escape and outside close, stable main-workspace grid width, prefetched links, the four phone destinations, every secondary destination in More, initial focus, tab containment, Escape, outside close, and destination-selection close.

- [x] **Step 2: Run the focused test and confirm failure**

  Run: `npm test --workspace @omnilede/ops -- --run apps/ops/components/studio-shell.test.tsx`

- [x] **Step 3: Implement the compact desktop rail**

  Make the shell a focused client boundary or split client navigation from the server shell. Keep icon marks, current destination, and an accessible pin button available when compact. Expand width over the main area with transform/width styling while the grid remains fixed to compact rail width.

- [x] **Step 4: Implement the phone More dialog**

  Use an accessible modal pattern with focus sent to the first secondary route, tab wrapping within the open menu, focus restoration to More, Escape/outside close, and route-selection close. Preserve one-tap access to the four primary destinations.

- [x] **Step 5: Verify route speed and interaction**

  Assert all links retain `prefetch={true}` and no navigation handler blocks on fetch. Use the E2E test to click Today → Categories → Content and verify the route shell responds immediately without a loading overlay created by the navigation component.

- [x] **Step 6: Run Studio tests and E2E**

  Run: `npm test --workspace @omnilede/ops -- --run apps/ops/components/studio-shell.test.tsx`

  Run: `npx playwright test --config apps/ops/playwright.config.ts apps/ops/tests/e2e/dashboard.spec.ts`

  Expected: PASS.

- [x] **Step 7: Commit Studio navigation**

  Commit: `feat: add compact studio navigation`

### Task 7: Collapse optional Studio filters and history without hiding active state

**Files:**
- Modify: `apps/ops/components/content/content-workspace.tsx`
- Modify: `apps/ops/components/content/content-workspace.test.tsx`
- Modify: `apps/ops/app/globals.css`

**Interfaces:**
- Add explicit buttons for `Filters` and `Publication history` with `aria-expanded` and controlled regions.
- The filter button label always exposes active filter count or a concise active-state summary.
- Keep notices, working status, draft queue, editor, preview, Save, Publish, Discard, confirmation, and reconciliation receipts outside collapsed regions.

- [x] **Step 1: Write failing disclosure tests**

  Assert filters and normal publication history may collapse; active filter count remains visible; opening and closing works with click and keyboard; current filter values persist; error/status/editor/review/Publish controls and unreconciled action receipts are never descendants of a collapsed region.

- [x] **Step 2: Run the focused test and confirm failure**

  Run: `npm test --workspace @omnilede/ops -- --run apps/ops/components/content/content-workspace.test.tsx`

- [x] **Step 3: Implement controlled disclosures**

  Use buttons rather than hover. Keep semantic labels, preserve all current editor state, and do not trigger refreshes when a disclosure opens. Show a compact summary such as `Filters · 2 active` while collapsed.

- [x] **Step 4: Re-run the focused test**

  Run: `npm test --workspace @omnilede/ops -- --run apps/ops/components/content/content-workspace.test.tsx`

  Expected: PASS.

- [x] **Step 5: Commit Studio disclosures**

  Commit: `feat: compact optional studio controls`

### Task 8: Run complete verification and review the implementation against the spec

**Files:**
- Modify only files required to fix failures discovered by verification
- Update: `docs/superpowers/plans/2026-10-08-top-10-discovery-authorship-implementation.md` checkbox state during execution

- [x] **Step 1: Self-review the final diff against every spec requirement**

  Run: `git diff --check`

  Run: `git diff --stat HEAD~7..HEAD`

  Inspect for duplicate category lists, hidden primary actions, contributor migrations, fake claims, dead membership/shop controls, and route handlers that wait on network operations.

- [x] **Step 2: Run complete unit and native suites**

  Run: `npm run test:all`

  Run: `npm run test:studio-native`

  Expected: PASS.

- [x] **Step 3: Run static checks and production builds**

  Run: `npm run lint`

  Run: `npm run typecheck:all`

  Run: `npm run validate:content`

  Run: `npm run build:all`

  Expected: PASS with no warnings promoted by the repository's zero-warning lint rule.

- [x] **Step 4: Run public and Studio browser suites**

  Run: `npm run test:e2e`

  Run: `npm run test:e2e:studio`

  Expected: PASS on desktop and configured phone projects.

- [x] **Step 5: Perform an explicit five-failure-mode review**

  Record evidence for the five items in Review Focus. Correct any failure with a focused regression test before changing implementation.

- [ ] **Step 6: Commit verification fixes, if any**

  Commit: `test: verify top 10 and compact discovery flows`

### Task 9: Push, deploy, and smoke-test live surfaces

**Files:**
- No planned source changes; only fix source if a deployment-only defect is reproduced and covered by a test

- [ ] **Step 1: Confirm repository state and target branches**

  Run: `git status --short && git branch --show-current && git log --oneline -10`

  Expected: clean `codex/omnilede-studio` branch with the implementation commits.

- [ ] **Step 2: Push the feature branch and update `main` through the repository's established flow**

  Push only verified commits. Avoid force-push. Confirm GitHub shows the same head SHA.

- [ ] **Step 3: Wait for Vercel blog and Studio deployments**

  Verify production deployment status rather than assuming a successful push equals a successful deployment.

- [ ] **Step 4: Smoke-test live public pages**

  Check desktop hover/focus/pin and phone menu; `/category/top-10`; `/author/ricky-sharan`; a published article's visible byline and JSON-LD; four `You may also like` cards where enough content exists; sitemap/RSS/search inclusion; and no membership or shop actions.

- [ ] **Step 5: Smoke-test live private Studio and native app**

  Check Google sign-in, compact rail, phone More menu, Top 10 writer choice, Today plan, Content filters/history, visible status/progress/errors, and the final manual Publish confirmation. Open the native Mac app and confirm it remains idle until Start is selected.

- [ ] **Step 6: Record the deployed URLs, deployment IDs, and final commit SHA**

  Keep this evidence with the completion report so any later regression can be tied to the exact release.
