# OmniLede Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-oriented global news website and installable PWA with an MDX editorial workflow, manual Git-backed moderation, free RSS discovery, optional Claude drafting, cached market data, consent-gated monetization, and zero-cost deployment documentation.

**Architecture:** Published content is statically generated from validated MDX while drafts remain in a separate, inaccessible tree. Server Components render public content; small Client Components own browser-only interactions. A `DraftRepository` boundary selects local filesystem or atomic GitHub commits, and shared pipeline modules serve both command-line automation and the optional Vercel cron route.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.0, TypeScript 5.9.x, Tailwind CSS 3.4.19, Serwist 9.5.12, next-mdx-remote 6, Zod 4, Vitest 4, React Testing Library 16, and Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-26-omnilede-design.md`

## Global Constraints

- Use Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 3, and npm with a committed `package-lock.json`. The user explicitly approved this security upgrade from the originally requested Next.js 14/`next-pwa` stack after its production dependency audit reported seven high-severity advisories.
- Keep published MDX in `content/articles/{category}` and drafts in `content/drafts/{category}`; public readers never traverse drafts.
- Support exactly `anime`, `movies`, `politics`, `sports`, `finance`, and `share-market` as category slugs.
- AI generation is disabled unless `DRAFT_GENERATION_ENABLED=true`; manual drafts require no paid API.
- Never inspect, copy, hardcode, or cache existing Vercel account, organization, project, or token state.
- Keep live AdSense disabled on Vercel Hobby and document its non-commercial restriction.
- Apply TDD to executable behavior. Framework scaffolding, static artwork, configuration, and fixture MDX are mechanically verified by lint, type-check, content validation, tests, and production build.
- Every external request has a timeout, bounded response handling, and a truthful unavailable/error state.
- Do not expose secrets through `NEXT_PUBLIC_` variables, browser bundles, logs, or error messages.

## File Map

### Application and styling

- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`: root metadata, shell, newsroom homepage, and design tokens.
- `app/category/[slug]/page.tsx`, `app/article/[slug]/page.tsx`, `app/search/page.tsx`: public content experiences.
- `app/about/page.tsx`, `app/contact/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/disclaimer/page.tsx`: supporting and legal pages.
- `app/offline/page.tsx`, `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`: recovery surfaces.
- `components/layout/*`, `components/articles/*`, `components/market/*`, `components/search/*`, `components/privacy/*`, `components/pwa/*`: focused presentation and interaction units.

### Domain modules

- `lib/config/categories.ts`, `lib/config/site.ts`: category registry and brand/site configuration.
- `lib/content/schema.ts`, `lib/content/articles.ts`, `lib/content/mdx.ts`, `lib/content/search.ts`: validation and public content access.
- `lib/pipeline/feeds.ts`, `lib/pipeline/dedupe.ts`, `lib/pipeline/fetch.ts`, `lib/pipeline/generate.ts`: reusable content automation.
- `lib/auth/password.ts`, `lib/auth/session.ts`, `lib/auth/request.ts`: admin security.
- `lib/drafts/types.ts`, `lib/drafts/local-repository.ts`, `lib/drafts/github-repository.ts`, `lib/drafts/repository.ts`: moderation storage.
- `lib/market/provider.ts`, `lib/market/types.ts`: market response normalization.

### Routes and automation

- `app/admin/login/page.tsx`, `app/admin/review/page.tsx`, `components/admin/*`: moderation UI.
- `app/api/admin/*`, `app/api/market/route.ts`, `app/api/cron/content/route.ts`: authenticated mutations and server integrations.
- `scripts/fetch-trending.ts`, `scripts/generate-draft.ts`, `scripts/validate-content.ts`: executable entry points.
- `.github/workflows/content-pipeline.yml`, `vercel.cron.example.json`: mutually exclusive scheduler options.

### Content and public assets

- `content/articles/*/*.mdx`: six original example articles.
- `content/drafts/*/.gitkeep`, `content/queue/trending.json`: moderation and discovery state.
- `public/images/articles/*.svg`: six original editorial cover illustrations.
- `public/icons/*`, `public/splash/*`, `public/manifest.json`, `public/ads.txt`: PWA and advertising assets.

### Tests

- Colocated `*.test.ts` and `*.test.tsx`: unit/component behavior.
- `tests/fixtures/*`: isolated content and RSS fixtures.
- `tests/e2e/*.spec.ts`: public, consent/PWA, and admin journeys.

---

### Task 1: Toolchain, strict project shell, and category registry

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`
- Create: `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `lib/config/categories.ts`, `lib/config/site.ts`, `lib/config/categories.test.ts`

**Interfaces:**
- Produces: `CategorySlug`, `CategoryDefinition`, `CATEGORIES`, `CATEGORY_SLUGS`, `isCategorySlug(value)`, and `SITE_CONFIG`.
- Consumers: every content, route, market, navigation, and admin task.

- [x] **Step 1: Create the locked package manifest and framework configuration**

Use `npm install --save-exact` for runtime packages and `npm install --save-dev --save-exact` for development packages. Pin `next@16.3.3`, `react@19.2.0`, `react-dom@19.2.0`, `tailwindcss@3.4.19`, `@serwist/next@9.5.12`, and `serwist@9.5.12`. Include these scripts:

```json
{
  "scripts": {
    "dev": "next dev --webpack",
    "build": "npm run validate:content && next build --webpack",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "validate:content": "tsx scripts/validate-content.ts",
    "content:fetch": "tsx scripts/fetch-trending.ts",
    "content:generate": "tsx scripts/generate-draft.ts"
  }
}
```

Configure the `@/*` path alias, strict type-checking, jsdom tests, and Playwright’s web server on port 3100. Configure Serwist to write `public/sw.js`, disable service workers in development/test, ignore generated service-worker output in Git, and defer the service worker source and runtime-caching details to Task 13.

- [x] **Step 2: Write the failing category-registry test**

```ts
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_SLUGS, isCategorySlug } from "@/lib/config/categories";

describe("category registry", () => {
  it("defines the six publication desks in stable navigation order", () => {
    expect(CATEGORY_SLUGS).toEqual([
      "anime", "movies", "politics", "sports", "finance", "share-market",
    ]);
    expect(CATEGORIES.map(({ accent }) => accent)).toEqual([
      "violet", "rose", "blue", "green", "amber", "cyan",
    ]);
  });

  it("recognizes only supported category slugs", () => {
    expect(isCategorySlug("share-market")).toBe(true);
    expect(isCategorySlug("technology")).toBe(false);
  });
});
```

- [x] **Step 3: Run the test and verify RED**

Run: `npm test -- lib/config/categories.test.ts`  
Expected: FAIL because `@/lib/config/categories` does not exist.

- [x] **Step 4: Implement the category registry and brand configuration**

```ts
export const CATEGORIES = [
  { slug: "anime", label: "Anime", accent: "violet", description: "Global anime releases and industry news" },
  { slug: "movies", label: "Movies", accent: "rose", description: "Worldwide cinema, releases, reviews and box office" },
  { slug: "politics", label: "Politics", accent: "blue", description: "Global politics, policy and analysis" },
  { slug: "sports", label: "Sports", accent: "green", description: "Major competitions and athletes worldwide" },
  { slug: "finance", label: "Finance", accent: "amber", description: "Global business, economies and corporate news" },
  { slug: "share-market", label: "Share Market", accent: "cyan", description: "Indices, equities and major market moves" },
] as const;

export type CategoryDefinition = (typeof CATEGORIES)[number];
export type CategorySlug = CategoryDefinition["slug"];
export const CATEGORY_SLUGS = CATEGORIES.map(({ slug }) => slug) as CategorySlug[];
export const isCategorySlug = (value: string): value is CategorySlug =>
  CATEGORY_SLUGS.includes(value as CategorySlug);
```

Set `SITE_CONFIG.name` and `shortName` to `OmniLede`, default description to a global-news statement, and site URL to validated `NEXT_PUBLIC_SITE_URL` with `http://localhost:3000` fallback.

- [x] **Step 5: Build the accessible root shell and baseline design tokens**

Create the skip link, root landmarks, serif/sans font variables via `next/font`, warm/dark color tokens, focus styles, reduced-motion rule, and a minimal homepage heading. Do not add final content sections yet.

- [x] **Step 6: Verify GREEN and mechanical configuration**

Run: `npm test -- lib/config/categories.test.ts && npm run typecheck && npm run lint`  
Expected: all commands exit 0.

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next-env.d.ts next.config.mjs tailwind.config.ts postcss.config.mjs eslint.config.mjs .gitignore .env.example vitest.config.ts vitest.setup.ts playwright.config.ts app lib/config docs/superpowers/specs/2026-08-26-omnilede-design.md docs/superpowers/plans/2026-08-26-omnilede-implementation.md
git commit -m "chore: scaffold OmniLede application"
```

### Task 2: Validated MDX content engine and six example stories

**Files:**
- Create: `lib/content/schema.ts`, `lib/content/articles.ts`, `lib/content/mdx.ts`, `lib/content/search.ts`, `lib/content/index.ts`
- Create: `lib/content/schema.test.ts`, `lib/content/articles.test.ts`, `lib/content/search.test.ts`
- Create: `tests/fixtures/content/articles/*`, `tests/fixtures/content/drafts/*`
- Create: `scripts/validate-content.ts`
- Create: `content/articles/{anime,movies,politics,sports,finance,share-market}/*.mdx`
- Create: `content/drafts/{anime,movies,politics,sports,finance,share-market}/.gitkeep`, `content/queue/trending.json`
- Create: `public/images/articles/{anime,movies,politics,sports,finance,share-market}.svg`

**Interfaces:**
- Produces: `ArticleFrontmatter`, `ArticleSummary`, `ArticleDocument`, `SearchEntry`, `parseArticleFile`, `getAllArticles`, `getArticleBySlug`, `getArticlesByCategory`, `paginateArticles`, `getRelatedArticles`, `buildSearchIndex`, and `renderArticleMdx`.
- `getAllArticles({ rootDir? })` reads only `content/articles`; tests inject an isolated root.

- [x] **Step 1: Write failing schema and discovery tests**

```ts
it("rejects mismatched filenames and slugs", () => {
  expect(() => parseArticleFile(validMdx, "/tmp/wrong-name.mdx"))
    .toThrow(/filename must match frontmatter slug/i);
});

it("never returns files from the drafts tree", async () => {
  const articles = await getAllArticles({ rootDir: fixtureRoot });
  expect(articles.map((article) => article.slug)).toEqual(["published-story"]);
});

it("ranks related stories by shared tags then recency", () => {
  expect(getRelatedArticles(subject, candidates, 2).map(({ slug }) => slug))
    .toEqual(["two-shared-tags", "one-shared-tag-newer"]);
});
```

- [x] **Step 2: Verify RED**

Run: `npm test -- lib/content`  
Expected: FAIL because the content modules do not exist.

- [x] **Step 3: Implement Zod validation and public-only discovery**

Use a strict schema with ISO dates, `https:` source URLs, positive integer read time, local `/` or `https:` cover image, non-empty tags, and `isCategorySlug`. Normalize parsed dates to strings but keep body source separate. Reject duplicate global slugs during discovery.

```ts
export type ContentOptions = { rootDir?: string };
export async function getAllArticles(options: ContentOptions = {}): Promise<ArticleSummary[]>;
export async function getArticleBySlug(slug: string, options?: ContentOptions): Promise<ArticleDocument | null>;
export async function getArticlesByCategory(category: CategorySlug, options?: ContentOptions): Promise<ArticleSummary[]>;
export function paginateArticles<T>(items: readonly T[], page: number, pageSize: number): {
  items: T[]; page: number; pageCount: number; total: number;
};
export function getRelatedArticles(subject: ArticleSummary, candidates: readonly ArticleSummary[], limit?: number): ArticleSummary[];
export function buildSearchIndex(articles: readonly ArticleSummary[]): SearchEntry[];
```

- [x] **Step 4: Add deterministic search metadata and MDX rendering**

Search normalization lowercases, Unicode-normalizes, removes punctuation, and matches title, excerpt, category label, author, and tags. `renderArticleMdx` uses `next-mdx-remote/rsc` with an allowlisted components map and no raw imports.

- [x] **Step 5: Write the six original fixture articles and cover illustrations**

Create 700–1,000 word evergreen example pieces dated in August 2026, each with all required frontmatter, a “Why it matters” section, and a visible source link. Use clearly labelled demonstration sources and non-breaking factual topics; do not present invented breaking events as real. The cover SVGs use abstract editorial compositions, no third-party logos or copyrighted characters.

- [x] **Step 6: Implement and run content validation**

`scripts/validate-content.ts` validates articles and drafts, treats invalid articles as fatal, reports draft errors without exposing secrets, checks global published slug uniqueness, and exits non-zero on any invalid file.

Run: `npm test -- lib/content && npm run validate:content`  
Expected: PASS with six valid articles and zero invalid drafts.

- [x] **Step 7: Commit**

```bash
git add lib/content scripts/validate-content.ts tests/fixtures content public/images/articles
git commit -m "feat: add validated MDX content engine"
```

### Task 3: Newsroom shell, homepage, category archives, and article reading

**Files:**
- Create: `components/layout/site-header.tsx`, `components/layout/category-nav.tsx`, `components/layout/mobile-menu.tsx`, `components/layout/site-footer.tsx`
- Create: `components/articles/lead-story.tsx`, `components/articles/article-card.tsx`, `components/articles/article-list-item.tsx`, `components/articles/category-section.tsx`, `components/articles/latest-feed.tsx`, `components/articles/article-body.tsx`, `components/articles/article-meta.tsx`, `components/articles/source-attribution.tsx`, `components/articles/related-articles.tsx`, `components/articles/pagination.tsx`
- Create: relevant colocated `*.test.tsx`
- Modify: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `app/category/[slug]/page.tsx`, `app/article/[slug]/page.tsx`, `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`

**Interfaces:**
- Consumes: `CATEGORIES`, `getAllArticles`, `getArticleBySlug`, `getArticlesByCategory`, `paginateArticles`, `getRelatedArticles`, `renderArticleMdx`.
- Produces: complete public browsing and reading routes; later tasks inject market, share, advertising, consent, theme, and install controls.

- [x] **Step 1: Write failing component behavior tests**

```tsx
it("renders a category label and responsive image metadata", () => {
  render(<ArticleCard article={article} />);
  expect(screen.getByText("Politics")).toBeVisible();
  expect(screen.getByRole("img", { name: article.title })).toHaveAttribute("sizes");
});

it("marks the current page and disables impossible pagination", () => {
  render(<Pagination page={1} pageCount={3} basePath="/category/anime" />);
  expect(screen.getByText("Page 1 of 3")).toBeVisible();
  expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute("href", "/category/anime?page=2");
  expect(screen.queryByRole("link", { name: /previous/i })).not.toBeInTheDocument();
});
```

- [x] **Step 2: Verify RED**

Run: `npm test -- components/articles components/layout`  
Expected: FAIL because components are absent.

- [x] **Step 3: Implement the mobile-first shell and cards**

Use semantic header/nav/main/footer, the approved category accents, `next/image` with explicit `sizes`, one priority LCP image, restrained separators, no nested card chrome, and `content-visibility` for long feeds. Keep navigation server-rendered; isolate only the menu disclosure as a Client Component.

- [x] **Step 4: Implement public routes and metadata hooks**

Homepage selects the newest story as lead, then newest per-category stories and a latest feed without duplicate lead IDs. Category pages validate slug and positive page number, return `notFound()` for unsupported categories or pages above `pageCount`, and expose canonical metadata without query pollution. Article pages compile MDX, render immutable source attribution after the body, and select three related stories.

- [x] **Step 5: Verify routes and production types**

Run: `npm test -- components/articles components/layout && npm run typecheck`  
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add app components/layout components/articles
git commit -m "feat: build public newsroom experience"
```

### Task 4: Search, sharing, theme, and client interaction boundaries

**Files:**
- Create: `components/search/search-experience.tsx`, `components/search/search-experience.test.tsx`
- Create: `components/articles/share-actions.tsx`, `components/articles/share-actions.test.tsx`
- Create: `components/theme/theme-script.ts`, `components/theme/theme-toggle.tsx`, `components/theme/theme-toggle.test.tsx`
- Create: `app/search/page.tsx`
- Modify: `app/layout.tsx`, `app/article/[slug]/page.tsx`, `components/layout/site-header.tsx`

**Interfaces:**
- Consumes: compact result of `buildSearchIndex`; canonical article URL.
- Produces: accessible client search, copy/WhatsApp/X links, and pre-hydration theme selection.

- [x] **Step 1: Write failing interaction tests**

```tsx
it("searches title, tags, author, and category without case sensitivity", async () => {
  render(<SearchExperience articles={searchIndex} />);
  await userEvent.type(screen.getByRole("searchbox"), "GLOBAL POLICY");
  expect(screen.getByRole("link", { name: /coalitions/i })).toBeVisible();
});

it("copies the canonical URL and announces success", async () => {
  render(<ShareActions title="Story" url="https://example.com/article/story" />);
  await userEvent.click(screen.getByRole("button", { name: /copy link/i }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://example.com/article/story");
  expect(screen.getByRole("status")).toHaveTextContent(/copied/i);
});
```

- [x] **Step 2: Verify RED**

Run: `npm test -- components/search components/articles/share-actions.test.tsx components/theme`  
Expected: FAIL because modules are absent.

- [x] **Step 3: Implement compact interaction components**

Debounce is unnecessary for six-to-hundreds of metadata records; derive results during render, cap initial display, and use `useDeferredValue` for input responsiveness. Build share URLs with `URLSearchParams`. Theme initialization uses a tiny `beforeInteractive`-equivalent inline script with a stable `id` to set `.dark` before paint, while the toggle persists `light`, `dark`, or system preference.

- [x] **Step 4: Verify GREEN and hydration safety**

Run: `npm test -- components/search components/articles/share-actions.test.tsx components/theme && npm run typecheck`  
Expected: PASS with no act or hydration warnings.

- [x] **Step 5: Commit**

```bash
git add app/search app/layout.tsx app/article components/search components/articles/share-actions* components/theme components/layout/site-header.tsx
git commit -m "feat: add search sharing and theme controls"
```

### Task 5: RSS discovery, normalization, and deduplication

**Files:**
- Create: `lib/pipeline/types.ts`, `lib/pipeline/feeds.ts`, `lib/pipeline/dedupe.ts`, `lib/pipeline/fetch.ts`
- Create: `lib/pipeline/dedupe.test.ts`, `lib/pipeline/fetch.test.ts`
- Create: `tests/fixtures/rss/*.xml`
- Create: `scripts/fetch-trending.ts`

**Interfaces:**
- Produces: `QueueStory`, `FeedDefinition`, `FEEDS`, `canonicalizeSourceUrl`, `normalizeTitle`, `dedupeStories`, `fetchTrendingStories`, and `writeTrendingQueue`.
- `fetchTrendingStories({ fetchImpl?, now?, contentRoot? })` supports deterministic tests.

- [x] **Step 1: Write failing deduplication tests**

```ts
it("collapses tracking variants and near-identical cross-source headlines", () => {
  const result = dedupeStories([
    story({ title: "Studio confirms a new season for Global Quest", sourceUrl: "https://a.test/x?utm_source=rss", snippet: "Short" }),
    story({ title: "Global Quest new season confirmed by studio", sourceUrl: "https://b.test/y", snippet: "A richer factual summary from another outlet." }),
  ]);
  expect(result).toHaveLength(1);
  expect(result[0].snippet).toMatch(/richer/);
});

it("does not merge similar titles from different categories", () => {
  expect(dedupeStories([story({ category: "sports" }), story({ category: "finance" })])).toHaveLength(2);
});
```

- [x] **Step 2: Verify RED**

Run: `npm test -- lib/pipeline/dedupe.test.ts lib/pipeline/fetch.test.ts`  
Expected: FAIL because pipeline modules are absent.

- [x] **Step 3: Implement feed definitions and bounded retrieval**

Centralize the requested outlets. Use the current official/public RSS endpoints verified during implementation, a ten-second `AbortSignal.timeout`, a descriptive OmniLede user agent, a two-megabyte response limit, `rss-parser`, and `Promise.allSettled`. Strip markup from snippets, require absolute HTTPS story URLs, and emit per-source summaries.

- [x] **Step 4: Implement deterministic dedupe and queue writes**

Canonicalize tracking parameters, title punctuation, outlet suffixes, and stop words. Use Jaccard token similarity of at least `0.72` within the same category and 72-hour window. Skip URLs/titles already found in article or draft frontmatter. Sort by descending date, then category and normalized title. Write pretty JSON with a final newline.

- [x] **Step 5: Verify script behavior without relying on live feeds**

Run: `npm test -- lib/pipeline/dedupe.test.ts lib/pipeline/fetch.test.ts`  
Expected: PASS using RSS fixtures and injected fetch.

Run: `npm run content:fetch`  
Expected: exits 0 when at least one source succeeds; reports any changed/retired source clearly.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline scripts/fetch-trending.ts tests/fixtures/rss content/queue/trending.json
git commit -m "feat: add resilient RSS discovery pipeline"
```

### Task 6: Optional Claude draft generation

**Files:**
- Create: `lib/pipeline/generate.ts`, `lib/pipeline/generate.test.ts`
- Create: `scripts/generate-draft.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `GenerationConfig`, `buildDraftPrompt`, `requestClaudeDraft`, `buildDraftMdx`, `generateDrafts`.
- `generateDrafts({ fetchImpl?, env?, contentRoot?, queuePath? })` supports no-network tests.

- [x] **Step 1: Write failing safety tests**

```ts
it("performs no API request when generation is disabled", async () => {
  const fetchImpl = vi.fn();
  const result = await generateDrafts({ env: {}, fetchImpl, contentRoot });
  expect(result.status).toBe("disabled");
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("adds validated frontmatter, why-it-matters, and final source attribution", () => {
  const mdx = buildDraftMdx(queueStory, generatedBody);
  expect(mdx).toContain("## Why it matters");
  expect(mdx.trimEnd()).toEndWith("Source: [Example Outlet](https://example.com/story)");
  expect(() => parseArticleFile(mdx, expectedDraftPath)).not.toThrow();
});
```

- [x] **Step 2: Verify RED**

Run: `npm test -- lib/pipeline/generate.test.ts`  
Expected: FAIL because generation module is absent.

- [x] **Step 3: Implement configuration, prompt, and Anthropic transport**

Require `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` only when enabled. POST to `/v1/messages` with the current required Anthropic version header, 25-second timeout, bounded tokens, and at most two retries for 429/5xx. The prompt prohibits copied phrasing, invented quotes, unsupported facts, and first-hand claims; it requires an original headline/body and “Why it matters.”

- [x] **Step 4: Implement validated draft persistence**

Sanitize slugs, estimate reading time, add the full required frontmatter, verify the source line is last, validate the output, and write only under `content/drafts/{category}`. Skip colliding slugs and retain failed queue items.

- [x] **Step 5: Verify disabled and mocked-enabled modes**

Run: `npm test -- lib/pipeline/generate.test.ts && DRAFT_GENERATION_ENABLED=false npm run content:generate`  
Expected: tests pass; script exits 0 and states generation is disabled without an API call.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/generate* scripts/generate-draft.ts .env.example
git commit -m "feat: add optional Claude draft generation"
```

### Task 7: Password authentication and signed admin sessions

**Files:**
- Create: `lib/auth/password.ts`, `lib/auth/session.ts`, `lib/auth/request.ts`, `lib/auth/throttle.ts`
- Create: `lib/auth/password.test.ts`, `lib/auth/session.test.ts`, `lib/auth/request.test.ts`
- Create: `app/admin/login/page.tsx`, `components/admin/login-form.tsx`, `components/admin/login-form.test.tsx`
- Create: `app/api/admin/login/route.ts`, `app/api/admin/logout/route.ts`

**Interfaces:**
- Produces: `verifyPassword`, `createSessionToken`, `verifySessionToken`, `readAdminSession`, `assertSameOrigin`, `checkLoginThrottle`.
- Session payload: `{ version: 1; issuedAt: number; expiresAt: number }` signed with HMAC-SHA-256.

- [x] **Step 1: Write failing authentication tests**

```ts
it("accepts the configured password without comparing variable-length secrets", () => {
  expect(verifyPassword("correct horse", "correct horse")).toBe(true);
  expect(verifyPassword("wrong", "correct horse")).toBe(false);
});

it("rejects expired and modified session tokens", async () => {
  const token = await createSessionToken(secret, { now: 1_000, ttlMs: 500 });
  expect(await verifySessionToken(token, secret, { now: 1_400 })).toBeTruthy();
  expect(await verifySessionToken(token, secret, { now: 1_501 })).toBeNull();
  expect(await verifySessionToken(`${token}x`, secret, { now: 1_200 })).toBeNull();
});
```

- [x] **Step 2: Verify RED**

Run: `npm test -- lib/auth components/admin/login-form.test.tsx`  
Expected: FAIL because auth modules/components are absent.

- [x] **Step 3: Implement password/session primitives and request guards**

Hash both password inputs to SHA-256 before `timingSafeEqual`. Sign base64url payloads with Web Crypto-compatible HMAC. Enforce eight-hour expiry, JSON content type, 32KB login body, same-origin mutations, and stable errors. Production login refuses to operate without `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`.

- [x] **Step 4: Implement login/logout routes and form**

Set `omnilede_admin` as `HttpOnly`, `SameSite=Strict`, `Secure` in production, eight-hour max age. Rate-limit repeated IP hashes in memory, return `429` with retry advice, never echo credentials, and redirect successful login to `/admin/review`.

- [x] **Step 5: Verify GREEN**

Run: `npm test -- lib/auth components/admin/login-form.test.tsx && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/auth app/admin/login app/api/admin/login app/api/admin/logout components/admin/login-form*
git commit -m "feat: secure admin authentication"
```

### Task 8: Local and atomic GitHub draft repositories

**Files:**
- Create: `lib/drafts/types.ts`, `lib/drafts/validation.ts`, `lib/drafts/local-repository.ts`, `lib/drafts/github-repository.ts`, `lib/drafts/repository.ts`
- Create: `lib/drafts/validation.test.ts`, `lib/drafts/local-repository.test.ts`, `lib/drafts/github-repository.test.ts`
- Create: `tests/helpers/temp-content.ts`

**Interfaces:**

```ts
export type DraftRef = { category: CategorySlug; filename: string };
export interface DraftRepository {
  list(): Promise<DraftSummary[]>;
  read(ref: DraftRef): Promise<DraftDocument>;
  save(ref: DraftRef, mdx: string, expectedVersion?: string): Promise<DraftDocument>;
  publish(ref: DraftRef, mdx: string, expectedVersion?: string): Promise<{ articlePath: string; commitUrl?: string }>;
  discard(ref: DraftRef, expectedVersion?: string): Promise<void>;
}
```

- [x] **Step 1: Write failing path, local behavior, and Git commit tests**

```ts
it("rejects traversal before constructing a filesystem or Git path", () => {
  expect(() => validateDraftRef({ category: "anime", filename: "../secret.mdx" })).toThrow(/filename/i);
});

it("publishes by moving a valid draft and removing the source", async () => {
  const result = await repository.publish(ref, validMdx);
  expect(await pathExists(result.articlePath)).toBe(true);
  expect(await pathExists(draftPath)).toBe(false);
});

it("constructs one Git tree containing the article addition and draft deletion", async () => {
  await repository.publish(ref, validMdx, "expected-head");
  expect(recordedTreeEntries).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: "content/articles/anime/story.mdx", type: "blob" }),
    expect.objectContaining({ path: "content/drafts/anime/story.mdx", sha: null }),
  ]));
});
```

- [x] **Step 2: Verify RED**

Run: `npm test -- lib/drafts`  
Expected: FAIL because repositories are absent.

- [x] **Step 3: Implement strict references and local repository**

Accept only supported categories and `/^[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/`. Validate MDX before saving/publishing, require matching slug/category, compare expected version hashes, prevent overwrite of an existing published slug, and use same-filesystem rename for publish.

- [x] **Step 4: Implement GitHub Git Data repository**

Use injectable fetch and API base. Read the configured branch ref/tree, create changed blobs, create a tree based on the current tree, create one commit, then PATCH the ref with `force:false`. Map 409/422 to a typed conflict and return the commit URL. Serialize mutations through the API handler; never log authorization headers.

- [x] **Step 5: Implement environment-based selection**

Development/test defaults to local. Production selects GitHub only when `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, and `GITHUB_TOKEN` are all present; otherwise it returns a configuration error instead of writing ephemeral storage.

- [x] **Step 6: Verify GREEN**

Run: `npm test -- lib/drafts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/drafts tests/helpers/temp-content.ts
git commit -m "feat: add Git-backed draft repositories"
```

### Task 9: Admin review UI and authenticated draft APIs

**Files:**
- Create: `app/admin/review/page.tsx`
- Create: `components/admin/draft-review.tsx`, `components/admin/draft-editor.tsx`, `components/admin/confirm-dialog.tsx`, `components/admin/status-notice.tsx`
- Create: corresponding `*.test.tsx`
- Create: `app/api/admin/drafts/route.ts`
- Create: `app/api/admin/drafts/[category]/[filename]/route.ts`

**Interfaces:**
- Consumes: session/request guards and `DraftRepository`.
- Mutation body: `{ action: "save" | "publish" | "discard"; mdx?: string; expectedVersion?: string }`.
- Response errors: `unauthorized`, `invalid_input`, `not_found`, `conflict`, `storage_unavailable`, `internal_error`.

- [ ] **Step 1: Write failing admin component tests**

```tsx
it("keeps invalid MDX in the editor and shows field errors", async () => {
  render(<DraftReview initialDrafts={[draft]} />);
  await userEvent.clear(screen.getByLabelText(/mdx content/i));
  await userEvent.type(screen.getByLabelText(/mdx content/i), "invalid");
  await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/frontmatter/i);
});

it("requires explicit confirmation before discard", async () => {
  render(<DraftReview initialDrafts={[draft]} />);
  await userEvent.click(screen.getByRole("button", { name: /discard/i }));
  expect(screen.getByRole("dialog", { name: /discard draft/i })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/admin`  
Expected: FAIL because review components are absent.

- [ ] **Step 3: Implement authenticated list/read/mutation handlers**

Use Node runtime, `dynamic = "force-dynamic"`, session and origin guards, `no-store`, strict body/action validation, stable JSON errors, and `revalidatePath` after successful publish. Discard requires no MDX body; save/publish require a bounded string.

- [ ] **Step 4: Implement the accessible editor workflow**

Group drafts by category, preserve unsaved text on failure, show version conflicts with refresh guidance, disable only the active mutation, focus status/error notices, and use a native textarea with monospace styling. Publish and discard confirmations state exact consequences.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- components/admin && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/review app/api/admin/drafts components/admin
git commit -m "feat: add manual draft review workflow"
```

### Task 10: Cached global market data and market strip

**Files:**
- Create: `lib/market/types.ts`, `lib/market/provider.ts`, `lib/market/provider.test.ts`
- Create: `app/api/market/route.ts`, `app/api/market/route.test.ts`
- Create: `components/market/market-strip.tsx`, `components/market/market-strip.test.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `MarketQuote`, `MarketSnapshot`, `fetchMarketSnapshot({ fetchImpl?, apiKey?, now? })`.
- Symbols: `^NSEI`, `^BSESN`, `^GSPC`, `^IXIC` mapped to Nifty 50, Sensex, S&P 500, and Nasdaq Composite.

- [ ] **Step 1: Write failing normalization/fallback tests**

```ts
it("normalizes all four requested indices in display order", async () => {
  const snapshot = await fetchMarketSnapshot({ fetchImpl: fixtureFetch, apiKey: "test" });
  expect(snapshot.quotes.map(({ label }) => label)).toEqual([
    "Nifty 50", "Sensex", "S&P 500", "Nasdaq Composite",
  ]);
});

it("returns a truthful unavailable snapshot without credentials", async () => {
  expect(await fetchMarketSnapshot({ apiKey: undefined })).toMatchObject({ status: "unavailable", quotes: [] });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/market components/market`  
Expected: FAIL because market modules are absent.

- [ ] **Step 3: Implement Financial Modeling Prep provider and caching**

Use the stable quote endpoint with batched encoded symbols when supported, `next: { revalidate: 1800 }`, ten-second timeout, response shape validation, and no fake fallback. Normalize value/change/percent/timestamp and delayed label. The route returns `Cache-Control: public, s-maxage=1800, stale-while-revalidate=3600` without exposing the key.

- [ ] **Step 4: Implement the server-rendered market strip**

Fetch directly in the homepage Server Component rather than client-fetching after hydration. Use tabular numerals, signed changes, accessible up/down text, unavailable labels, and the delayed/not-investment-advice disclosure.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- lib/market components/market app/api/market && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/market app/api/market components/market app/page.tsx
git commit -m "feat: add cached global market strip"
```

### Task 11: Consent-gated analytics and advertising

**Files:**
- Create: `components/privacy/consent-manager.tsx`, `components/privacy/consent-banner.tsx`, `components/privacy/third-party-scripts.tsx`, `components/privacy/consent.test.tsx`
- Create: `components/ads/ad-slot.tsx`, `components/ads/ad-slot.test.tsx`
- Create: `public/ads.txt`
- Modify: `app/layout.tsx`, `app/page.tsx`, `app/article/[slug]/page.tsx`, `components/layout/site-footer.tsx`

**Interfaces:**
- Consent storage key: `omnilede_consent_v1`; value `{ version: 1; choice: "granted" | "denied"; updatedAt: string }`.
- Server passes `GA4_ID`, `ADSENSE_CLIENT_ID`, and `ADSENSE_ENABLED` as serialized props; client code does not read environment variables.

- [ ] **Step 1: Write failing consent-gating tests**

```tsx
it("loads neither GA4 nor AdSense before consent", () => {
  render(<ConsentManager ga4Id="G-TEST" adsenseClientId="ca-pub-test" adsenseEnabled />);
  expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull();
});

it("loads configured scripts only after accepting", async () => {
  render(<ConsentManager ga4Id="G-TEST" adsenseClientId="ca-pub-test" adsenseEnabled />);
  await userEvent.click(screen.getByRole("button", { name: /accept optional cookies/i }));
  expect(document.querySelector('script[src*="googletagmanager"]')).not.toBeNull();
  expect(document.querySelector('script[src*="adsbygoogle"]')).not.toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/privacy components/ads`  
Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement versioned consent and script loading**

Provide equally prominent Accept and Decline controls, a footer settings button, safe localStorage parsing, and a custom event so settings update immediately. Inject GA4 setup only after consent and use stable script IDs to prevent duplicates.

- [ ] **Step 4: Implement monetization-ready ad slots**

Support `header`, `article`, `sidebar`, and `footer` variants. In development/disabled mode render a labelled non-tracking placeholder. Include the user-required code marker `// TODO(adsense): replace the placeholder data-ad-slot with the approved AdSense unit ID before enabling ads.` Keep `ADSENSE_ENABLED=false` in `.env.example` and document the Vercel Hobby restriction.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- components/privacy components/ads && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/privacy components/ads public/ads.txt app/layout.tsx app/page.tsx app/article components/layout/site-footer.tsx .env.example
git commit -m "feat: gate analytics and ads behind consent"
```

### Task 12: SEO, syndication, legal pages, and error surfaces

**Files:**
- Create: `lib/seo/json-ld.ts`, `lib/seo/json-ld.test.ts`, `lib/seo/rss.ts`, `lib/seo/rss.test.ts`
- Create: `app/sitemap.ts`, `app/robots.ts`, `app/feed.xml/route.ts`
- Create: `app/about/page.tsx`, `app/contact/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/disclaimer/page.tsx`
- Modify: `app/layout.tsx`, `app/category/[slug]/page.tsx`, `app/article/[slug]/page.tsx`, `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`

**Interfaces:**
- Produces: `buildNewsArticleJsonLd(article, siteConfig)`, `buildRssXml(articles, siteConfig)` and Next metadata/sitemap/robots handlers.

- [ ] **Step 1: Write failing structured-data and RSS tests**

```ts
it("emits a canonical NewsArticle object with publisher and source URL", () => {
  expect(buildNewsArticleJsonLd(article, site)).toMatchObject({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    mainEntityOfPage: `${site.url}/article/${article.slug}`,
  });
});

it("escapes XML while preserving absolute article links", () => {
  const xml = buildRssXml([articleWithAmpersand], site);
  expect(xml).toContain("&amp;");
  expect(xml).toContain(`${site.url}/article/${articleWithAmpersand.slug}`);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/seo`  
Expected: FAIL because SEO modules are absent.

- [ ] **Step 3: Implement metadata, JSON-LD, sitemap, robots, and RSS**

Use absolute canonical URLs, Open Graph and Twitter cards, one JSON-LD script serialized with `<` escaped, recent RSS items, public-only sitemap entries, and robots disallow rules for `/admin/`, `/api/`, and `/_next/`.

- [ ] **Step 4: Implement supporting/legal pages**

Use clearly editable but structurally complete copy for cookies/ads, data collection, retention, external links, market/financial disclaimer, editorial process, and contact. Do not claim the placeholders are legal advice or final policies.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- lib/seo && npm run typecheck && npm run validate:content`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/seo app/sitemap.ts app/robots.ts app/feed.xml app/about app/contact app/privacy app/terms app/disclaimer app/layout.tsx app/category app/article app/not-found.tsx app/error.tsx app/global-error.tsx
git commit -m "feat: add SEO syndication and policy pages"
```

### Task 13: Installable PWA, offline caching, and platform install UX

**Files:**
- Create: `public/manifest.json`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/apple-touch-icon.png`
- Create: `public/splash/apple-splash-1170-2532.png`, `public/splash/apple-splash-1290-2796.png`
- Create: `lib/pwa/runtime-caching.mjs`
- Create: `components/pwa/install-provider.tsx`, `components/pwa/install-app-button.tsx`, `components/pwa/ios-install-banner.tsx`, `components/pwa/install.test.tsx`
- Create: `app/offline/page.tsx`
- Modify: `next.config.mjs`, `app/layout.tsx`, `components/layout/site-header.tsx`

**Interfaces:**
- Produces: captured `BeforeInstallPromptEvent`, `promptInstall()`, standalone/iOS detection, versioned dismissal state, manifest/icons, and Serwist caching rules.

- [ ] **Step 1: Write failing install-state tests**

```tsx
it("shows the install button only after beforeinstallprompt is captured", () => {
  render(<InstallProvider><InstallAppButton /></InstallProvider>);
  expect(screen.queryByRole("button", { name: /install app/i })).toBeNull();
  fireEvent(window, new MockBeforeInstallPromptEvent());
  expect(screen.getByRole("button", { name: /install app/i })).toBeVisible();
});

it("shows iOS instructions only for non-standalone Safari after consent UI is settled", () => {
  setIosSafariUserAgent();
  render(<IosInstallBanner consentResolved />);
  expect(screen.getByText(/tap share/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/pwa`  
Expected: FAIL because PWA interaction modules are absent.

- [ ] **Step 3: Implement install state and iOS guidance**

Capture and clear the deferred event, call `prompt()`, read `userChoice`, hide after `appinstalled`, and persist dismissals with a versioned localStorage key. Detect iOS Safari conservatively and respect standalone display mode.

- [ ] **Step 4: Generate original icons/splash assets and manifest**

Use the OmniLede “O/L” editorial monogram, high-contrast safe zones, purpose `any maskable`, warm-paper background, deep-ink theme, and `display: standalone`. Generate PNGs with the workspace image tooling; verify exact dimensions and transparency where intended.

- [ ] **Step 5: Configure bounded runtime caching**

Order rules from specific to broad: never cache `/admin` or `/api`; Network First HTML/navigation with `/offline` fallback and 50-entry/7-day bound; Cache First article images with 100-entry/30-day bound; Stale While Revalidate Next static assets/fonts. Disable the service worker in development and tests.

- [ ] **Step 6: Verify GREEN and built assets**

Run: `npm test -- components/pwa && npm run build`  
Expected: PASS; build exits 0 and creates `public/sw.js` plus Serwist chunks. Check manifest JSON and all image dimensions.

- [ ] **Step 7: Commit**

```bash
git add public/manifest.json public/icons public/apple-touch-icon.png public/splash lib/pwa components/pwa app/offline next.config.mjs app/layout.tsx components/layout/site-header.tsx .gitignore
git commit -m "feat: make OmniLede an installable PWA"
```

### Task 14: Scheduled automation and optional Vercel cron

**Files:**
- Create: `.github/workflows/content-pipeline.yml`
- Create: `lib/pipeline/run.ts`, `lib/pipeline/run.test.ts`
- Create: `app/api/cron/content/route.ts`, `app/api/cron/content/route.test.ts`
- Create: `vercel.cron.example.json`
- Modify: `scripts/fetch-trending.ts`, `scripts/generate-draft.ts`, `.env.example`

**Interfaces:**
- Produces: `runContentPipeline({ mode, maxDrafts, ...dependencies })` shared by CLI/cron.
- Cron authorization: `Authorization: Bearer ${CRON_SECRET}`.

- [ ] **Step 1: Write failing orchestration tests**

```ts
it("fetches before optional generation and never publishes", async () => {
  const calls: string[] = [];
  await runContentPipeline({
    fetchStories: async () => { calls.push("fetch"); return queue; },
    generateDrafts: async () => { calls.push("generate"); return generated; },
    generationEnabled: true,
  });
  expect(calls).toEqual(["fetch", "generate"]);
  expect(publishSpy).not.toHaveBeenCalled();
});

it("rejects cron requests without the configured bearer secret", async () => {
  expect((await GET(unauthorizedRequest)).status).toBe(401);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- lib/pipeline/run.test.ts app/api/cron/content/route.test.ts`  
Expected: FAIL because orchestration/route are absent.

- [ ] **Step 3: Implement shared orchestration and protected cron route**

Cap Vercel generation at three drafts, set Node runtime and `maxDuration=60`, use GitHub storage in production, return summary counts, and never expose source snippets/prompts/secrets in the response. Keep GitHub Actions as the default schedule.

- [ ] **Step 4: Add GitHub Actions workflow**

Use `schedule` once daily plus `workflow_dispatch`, `ubuntu-latest`, Node 20, `npm ci`, `npm run content:fetch`, conditional `npm run content:generate`, `npm run validate:content`, and a commit step only when `content/queue` or `content/drafts` changed. Grant `contents: write`; do not run on pull requests.

- [ ] **Step 5: Add inactive Vercel cron example**

`vercel.cron.example.json` contains one daily UTC call to `/api/cron/content`. README instructions later require the operator to copy it to `vercel.json` only after disabling the GitHub schedule.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- lib/pipeline/run.test.ts app/api/cron/content/route.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/content-pipeline.yml lib/pipeline/run* app/api/cron vercel.cron.example.json scripts .env.example
git commit -m "feat: schedule moderated content drafting"
```

### Task 15: Deployment documentation and operational guardrails

**Files:**
- Create: `README.md`, `SECURITY.md`, `LICENSE`
- Modify: `.env.example`, `.gitignore`, `package.json`

**Interfaces:**
- Produces: complete setup/run/content/admin/pipeline/deployment documentation with no hidden account assumptions.

- [ ] **Step 1: Write a documentation verification checklist before prose**

Create `scripts/check-readme.ts` that reads README and fails unless it finds all required commands/variables and warnings: `vercel logout`, brand-new account, different email, new project, `ANTHROPIC_API_KEY`, `GA4_ID`, `ADSENSE_CLIENT_ID`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `STOCK_API_KEY`, `GITHUB_TOKEN`, `.vercel.app`, Hobby non-commercial, optional Claude cost, GitHub scheduler, and Vercel alternative.

- [ ] **Step 2: Run the check and verify RED**

Run: `npx tsx scripts/check-readme.ts`  
Expected: FAIL because README is absent.

- [ ] **Step 3: Write exact local and editorial instructions**

Document Node 20 LTS, `npm ci`, `.env.local`, `npm run dev`, six frontmatter fields plus all remaining required fields, manual draft creation, validation, admin local behavior, feed/generation commands, source attribution/originality responsibilities, and all test/build commands.

- [ ] **Step 4: Write exact GitHub and new-Vercel-account deployment instructions**

Include commands to initialize/push a brand-new GitHub repository, fine-grained token permissions, public/private Actions limits, schedule selection, `vercel logout`, private-window dashboard alternative, new email/account, new imported project, environment configuration, deployment verification, free SSL/subdomain, no copied IDs/tokens, and zero-cost/non-commercial caveats.

- [ ] **Step 5: Add security and license documentation**

`SECURITY.md` explains private reporting, secret rotation, admin token scope, generated-content review, and unsupported distributed brute-force protection. Use the MIT license for repository code while noting article content/source rights remain the operator’s responsibility.

- [ ] **Step 6: Verify GREEN**

Run: `npx tsx scripts/check-readme.ts && npm run lint && npm run typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md SECURITY.md LICENSE .env.example .gitignore package.json scripts/check-readme.ts
git commit -m "docs: add zero-cost deployment runbook"
```

### Task 16: End-to-end journeys, full verification, and release review

**Files:**
- Create: `tests/e2e/public.spec.ts`, `tests/e2e/search-theme-consent.spec.ts`, `tests/e2e/pwa.spec.ts`, `tests/e2e/admin.spec.ts`
- Create: `tests/e2e/fixtures.ts`
- Modify: `playwright.config.ts`, any implementation file only when a failing regression test demonstrates the defect.

**Interfaces:**
- Consumes: the complete application.
- Produces: browser evidence for critical public/admin/PWA journeys and a clean release candidate.

- [ ] **Step 1: Write failing Playwright journeys**

```ts
test("reader can browse every desk and open an attributed article", async ({ page }) => {
  await page.goto("/");
  for (const label of ["Anime", "Movies", "Politics", "Sports", "Finance", "Share Market"]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  await page.getByRole("link", { name: /read/i }).first().click();
  await expect(page.getByText(/^Source:/)).toBeVisible();
});

test("draft does not become public until Publish is confirmed", async ({ page, adminDraft }) => {
  await loginAsAdmin(page);
  await editDraft(page, adminDraft, validMdx);
  await expect(page.request.get(`/article/${adminDraft.slug}`)).resolves.toMatchObject({ status: expect.not.stringMatching(/^2/) });
  await publishDraft(page, adminDraft);
  await expect(page.getByRole("status")).toContainText(/published/i);
});
```

- [ ] **Step 2: Run Playwright and verify RED**

Run: `npm run test:e2e`  
Expected: at least one journey fails for a concrete missing integration or fixture hook; if all pass immediately, add the missing offline/admin mutation assertion rather than weakening the gate.

- [ ] **Step 3: Implement only the missing integration hooks or regression fixes**

Use temporary content roots and test-only injected environment values. Never point E2E at the real workspace drafts or a real GitHub token. Add a regression test before each defect fix.

- [ ] **Step 4: Run the complete fresh verification suite**

Run in this order and read every exit code:

```bash
npm run test
npm run lint
npm run typecheck
npm run validate:content
npm run build
npm run test:e2e
git diff --check
```

Expected: every command exits 0; unit/component tests report zero failures; content validation reports six valid published examples; build emits all public/admin routes and `public/sw.js`; Playwright reports zero failed journeys.

- [ ] **Step 5: Perform browser/PWA visual verification**

Open the production server at desktop and mobile widths. Check masthead hierarchy, category colors, dark mode, overflow, focus order, article reading width, search empty/result states, consent accept/decline/settings, admin form/editor, offline fallback, manifest/icons, and install UI eligibility. Record any issue as a failing automated test before fixing when the behavior is testable.

- [ ] **Step 6: Review the final diff against all 21 design-spec sections**

Confirm every acceptance criterion maps to code/tests/docs, no draft path is public, no secret is committed, no real AdSense/GA4 ID exists, no Vercel state is referenced, and all required source/category/frontmatter/scheduler details remain present.

- [ ] **Step 7: Commit the release verification**

```bash
git add tests playwright.config.ts
git commit -m "test: verify OmniLede end to end"
```
