# Atlas Wire — Product and Technical Design

**Status:** Approved in chat on 2026-08-26  
**Project type:** Production-oriented global news website and installable PWA  
**Primary constraint:** Every required path must work without a paid service or stored payment method. Optional Claude generation is disabled unless the operator deliberately supplies API access.

## 1. Purpose

Atlas Wire is a global, multi-category news publication with an MDX-first editorial workflow. It publishes manually approved stories in six desks: Anime, Movies, Politics, Sports, Finance, and Share Market. Automated jobs discover source stories and may prepare original drafts, but no job may publish an article.

The shipped repository must work immediately with six original example articles, one for each desk. It must also include the production workflows, documentation, tests, PWA assets, legal templates, and deployment configuration needed to run the project on free tiers.

## 2. Product Principles

1. **Human approval is absolute.** Drafts and published articles live in separate trees, and public content readers never traverse the drafts tree.
2. **Facts may be sourced; prose must be original.** Generated drafts use source stories only as factual inputs, contain a distinct “Why it matters” section, and end with a visible source link.
3. **Global editorial scope.** The information architecture and sample content must not imply that one country is the default audience.
4. **No fake freshness.** Market failures show an unavailable or delayed state rather than invented values. Feed failures are reported without replacing sources with fabricated stories.
5. **Progressive enhancement.** Reading, navigation, consent, and administrative editing remain usable without optional analytics, advertising, market data, or AI generation.
6. **Zero-cost baseline.** Manual drafting, public reading, PWA installation, local administration, GitHub scheduling, and non-commercial Vercel hosting must not require paid services.

## 3. Constraints and Explicit Caveats

- Next.js 14 App Router, React 18, strict TypeScript, and Tailwind CSS 3 will be used. Exact patch versions will be locked in `package-lock.json`.
- Vercel Hobby is suitable for the free, non-commercial deployment described in the brief. Its terms restrict Hobby to personal, non-commercial use. AdSense integration will therefore ship ready but disabled; enabling revenue requires hosting whose terms allow commercial use.
- Anthropic API usage is not represented as free. `DRAFT_GENERATION_ENABLED=false` is the safe default, and the generation script exits successfully without making a network call when disabled.
- GitHub Actions is the recommended scheduler. Vercel Cron is an opt-in alternative, not enabled simultaneously, because duplicate schedules could prepare duplicate drafts.
- RSS publishers sometimes change or retire endpoints. Feed definitions are centralized, every fetch has a timeout, and a failed source cannot fail the entire queue run.
- Market data is informational, may be delayed, and is accompanied by a visible market-data disclaimer.

## 4. Visual and Interaction Direction

The working brand is **Atlas Wire**. The interface resembles a modern global newsroom rather than a generic dashboard.

- Base palette: warm paper white, ink charcoal, cool neutral dividers, and a deep slate dark mode.
- Typography: an editorial serif for display headlines and a highly legible sans serif for navigation, metadata, and body UI. Fonts are loaded through `next/font` so there is no client-side font request.
- Layout: a strong masthead, compact market strip, lead-story hierarchy, grouped editorial lists, restrained card use, and generous reading width.
- Category accents:
  - Anime: violet
  - Movies: rose
  - Politics: blue
  - Sports: green
  - Finance: amber
  - Share Market: cyan
- Motion: brief opacity and transform transitions only, disabled by `prefers-reduced-motion`.
- Mobile: horizontally scrollable category navigation, single-column story flow, large touch targets, and an install action that never obscures article content.
- Accessibility: semantic landmarks, visible focus styles, skip link, WCAG AA color contrast, labelled controls, keyboard-operable menus/dialogs, and non-color category labels.

## 5. Information Architecture

### Public routes

| Route | Responsibility |
| --- | --- |
| `/` | Lead story, market strip, one top-story section per category, and latest-across-all feed |
| `/category/[slug]` | Category archive with query-string pagination using `?page=N` |
| `/article/[slug]` | Article content, source attribution, related stories, share actions, and NewsArticle JSON-LD |
| `/search` | Client-side search over a build-generated metadata index |
| `/about` | Publication purpose and editorial workflow |
| `/contact` | Editable contact details and accessible mail link; no paid form backend |
| `/privacy` | Structured placeholder policy covering cookies, analytics, advertising, data collection, retention, and contact |
| `/terms` | Structured placeholder terms |
| `/disclaimer` | Editorial, external-link, market-data, and financial-information disclaimers |
| `/feed.xml` | RSS 2.0 feed of published articles |
| `/sitemap.xml` | Generated sitemap for public pages and published articles |
| `/robots.txt` | Search crawler policy that excludes admin and API routes |
| `/offline` | Service-worker fallback page |

### Administrative routes

| Route | Responsibility |
| --- | --- |
| `/admin/login` | Password login form |
| `/admin/review` | Authenticated draft list, category filters, MDX editor, validation feedback, Publish, Save, and Discard |
| `/api/admin/login` | Validate password and issue a signed session cookie |
| `/api/admin/logout` | Revoke the browser session cookie |
| `/api/admin/drafts` | Authenticated list and read operations |
| `/api/admin/drafts/[category]/[filename]` | Authenticated save, publish, and discard mutations |
| `/api/market` | Cached normalized index quotes |
| `/api/cron/content` | Authenticated, opt-in Vercel Cron entry point |

Admin pages and handlers use the Node.js runtime and are excluded from service-worker caching.

## 6. Content Model

Published files are stored at `content/articles/{category}/{slug}.mdx`. Drafts are stored at `content/drafts/{category}/{slug}.mdx`.

Frontmatter is validated with a shared schema:

```yaml
title: string
slug: lowercase-kebab-case string
date: ISO-8601 timestamp
category: anime | movies | politics | sports | finance | share-market
tags: non-empty string array
author: string
excerpt: string
coverImage: absolute public path or https URL
readTime: positive integer minutes
sourceName: string
sourceUrl: absolute https URL
```

Additional invariants:

- The filename and `slug` must agree.
- A published slug must be globally unique across categories.
- Dates are stored in UTC and formatted for the reader at render time.
- Draft validation errors are shown in the admin editor; invalid published content fails `npm run validate:content` and the production build.
- MDX uses a small allowlist of presentation components. Raw HTML and arbitrary imports are not supported.
- Article pages always render the source attribution from frontmatter even if an editor removes an attribution line from the body.

## 7. Content Access Layer

`lib/content` owns file discovery, parsing, validation, sorting, pagination, related-article selection, and search-index construction. Public callers receive typed article metadata or compiled MDX content and do not receive filesystem paths.

Published metadata is cached at module/request level during static generation. Independent reads are parallelized. Related articles are selected from the same category first, ranked by shared tags and recency, and exclude the current slug.

Remote cover images require an explicit hostname allowlist in Next.js configuration. The six bundled examples use local, optimized editorial artwork in `public/images/articles`.

## 8. Editorial Storage Adapters

The admin layer consumes a `DraftRepository` interface with operations to list, read, save, publish, and discard drafts.

### Local adapter

- Reads and writes the workspace filesystem.
- Uses validated category and filename segments; caller-controlled paths never reach `path.join` unchecked.
- Publishes with an atomic rename after validating that the destination does not already exist.
- Discard permanently deletes the selected draft only after an explicit confirmation in the UI.

### GitHub adapter

- Activates when `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, and `GITHUB_TOKEN` are present in production.
- Uses GitHub’s Git Data API to create blobs, a tree, a commit, and a conditional reference update.
- Publishing adds the article path and removes the draft path in one commit tree, avoiding the partial state possible with two unrelated file-content requests.
- A non-fast-forward reference conflict is returned as a visible conflict; the UI refreshes rather than silently overwriting another editor’s work.
- The fine-grained token needs Contents write access only for the selected repository. It is never sent to the client.

No Vercel organization ID, project ID, token, or existing account state is read or stored.

## 9. Authentication and Mutation Security

- `ADMIN_PASSWORD` is compared with `crypto.timingSafeEqual` after normalizing both values to fixed-length hashes.
- `ADMIN_SESSION_SECRET` signs a compact session payload with HMAC-SHA-256. If it is absent outside production, the development server may derive a local-only secret; production login refuses to start without it.
- The session cookie is `HttpOnly`, `SameSite=Strict`, path-scoped to `/`, and `Secure` in production. Sessions expire after eight hours.
- Admin pages redirect unauthenticated visitors to `/admin/login`.
- Mutations verify `Origin` against the current host, accept JSON only, validate payload size, revalidate the session, and return structured errors.
- A best-effort in-memory login throttle reduces accidental brute-force load. The README states that distributed rate limiting is outside the zero-service baseline.
- Sensitive values never use `NEXT_PUBLIC_` prefixes.
- Admin, API, and draft paths are excluded from search indexing and PWA caches.

## 10. RSS Discovery Pipeline

`scripts/fetch-trending.ts` uses the shared pipeline modules rather than embedding logic in the executable.

Configured source groups:

- Anime: Anime News Network and Crunchyroll News
- Movies: Variety Film and IGN Movies
- Politics: Reuters World, Al Jazeera, and AP News
- Sports: BBC Sport and ESPN
- Finance: Reuters Business and Yahoo Finance
- Share Market: Moneycontrol and CNBC Markets

Each source definition includes its category, outlet name, URL, and optional item-normalization rules. Retrieval uses a descriptive user agent, redirect support, a bounded response size, and a ten-second timeout. `Promise.allSettled` isolates failures.

Items are normalized into:

```ts
type QueueStory = {
  title: string;
  source: string;
  sourceUrl: string;
  date: string;
  snippet: string;
  category: CategorySlug;
};
```

Deduplication proceeds in order:

1. Remove tracking parameters and compare canonical URLs.
2. Normalize case, punctuation, whitespace, outlet suffixes, and common stop words in titles.
3. Treat high token-overlap titles in the same category and 72-hour window as the same story.
4. Keep the item with the richer snippet; use source order and publication time as deterministic tie-breakers.
5. Exclude queue items whose source URL or strongly matching title already exists in articles or drafts.

The result is sorted newest-first and written deterministically to `content/queue/trending.json`.

## 11. Optional Draft Generation

`scripts/generate-draft.ts` reads the queue and processes a configurable maximum number of stories.

- When `DRAFT_GENERATION_ENABLED` is not exactly `true`, it logs that generation is disabled and exits with status 0.
- When enabled, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are required.
- Calls go directly to `https://api.anthropic.com/v1/messages` with an explicit API version, timeout, bounded output token count, and retry for transient rate-limit/server errors.
- The prompt supplies factual title, snippet, source, date, category, and URL. It instructs the model not to copy phrases, fabricate quotes, add unverified facts, or imply first-hand reporting.
- Output must contain an original headline, article body, a `## Why it matters` section, and no frontmatter.
- The script computes frontmatter, sanitizes the slug, estimates read time, validates the finished MDX, and appends a visible `Source: [Outlet](URL)` line.
- Existing draft or article slugs are skipped. A failed story is reported and does not erase the queue or other generated drafts.

Manual MDX drafts require no API key and follow the same admin workflow.

## 12. Scheduling

### Recommended: GitHub Actions

The repository includes a daily UTC cron and manual `workflow_dispatch`. It installs locked dependencies, validates configuration, runs discovery, conditionally runs generation, validates drafts, and commits changed queue/draft files using the workflow’s scoped `contents: write` token. Pull-request events never run the secret-bearing generation step.

### Optional: Vercel Cron

The route is secured with `CRON_SECRET`, runs at most once daily, limits the number of generated drafts per invocation, and writes results through the GitHub adapter because Vercel’s filesystem is ephemeral. An example cron configuration is included but not active alongside GitHub Actions. The README explains the Hobby plan’s daily cadence, imprecise scheduling, and 60-second function limit.

## 13. Market Data

The market strip shows Nifty 50, Sensex, S&P 500, and Nasdaq Composite.

- Server-side provider: Financial Modeling Prep with `STOCK_API_KEY`.
- Symbols: `^NSEI`, `^BSESN`, `^GSPC`, and `^IXIC`.
- Requests are batched when supported and cached with a 30-minute Next.js revalidation window, keeping ordinary usage below the provider’s free daily request allowance.
- Provider responses are normalized to label, symbol, value, absolute change, percentage change, currency where applicable, market timestamp, and delayed status.
- Missing credentials or provider failure return a typed unavailable response. The UI preserves the four labels and shows an unavailable state.
- The component states that values may be delayed and are not investment advice.

## 14. Public Rendering and Components

Server Components are the default. Client Components are limited to stateful behavior: theme selection, mobile navigation, search filtering, share/copy feedback, consent, install prompts, and the admin editor.

Primary components:

- `SiteHeader`, `CategoryNav`, `MobileMenu`, and `SiteFooter`
- `MarketStrip`
- `LeadStory`, `ArticleCard`, `ArticleListItem`, `CategorySection`, and `LatestFeed`
- `ArticleBody`, `ArticleMeta`, `SourceAttribution`, `RelatedArticles`, and `ShareActions`
- `Pagination` and `SearchExperience`
- `AdSlot`, `ConsentBanner`, and consent-gated script loader
- `ThemeToggle`, `InstallAppButton`, and `IosInstallBanner`
- Admin login, draft list, editor, status notice, and confirmation dialog

Images use `next/image` with responsive `sizes`, explicit aspect ratios, and priority only for the page’s LCP image. Long lists use CSS `content-visibility` where beneficial.

## 15. SEO and Syndication

- Root metadata defines title templates, site description, metadata base, icons, manifest, Open Graph, and Twitter defaults.
- Category and article routes generate descriptive, canonical metadata.
- Article pages emit a `NewsArticle` JSON-LD object with headline, description, image, dates, author, publisher, article section, keywords, and canonical URL.
- Sitemap entries include static pages, categories, and every published article; admin/legal-excluded paths are omitted as appropriate.
- Robots allows public content and disallows `/admin`, `/api`, and Next.js internals.
- `/feed.xml` emits valid RSS 2.0 with absolute links, escaped text, publication dates, categories, and recent published items.
- The site URL comes from `NEXT_PUBLIC_SITE_URL` with a localhost development fallback.

## 16. Consent, Analytics, and Advertising

Consent is stored as a versioned local-storage record with `granted`, `denied`, or unset state. The banner provides equally clear Accept and Decline actions.

- GA4 loads only after granted consent and only when `GA4_ID` is configured. The server passes the configured identifier to the consent-aware client loader; it is not read directly from `process.env` in browser code.
- AdSense loads only after granted consent and only when `ADSENSE_CLIENT_ID` and an explicit enable flag are configured. The same server-to-client boundary keeps environment naming aligned with the deployment brief.
- Declining consent does not block content and does not load either third-party script.
- A settings control in the footer reopens the consent choice.
- `AdSlot` supports header, in-article, sidebar, and footer placements. Development shows labelled placeholders. The component contains the user-requested AdSense integration marker without embedding a real publisher ID.
- `public/ads.txt` contains an explanatory placeholder line that must be replaced before enabling ads.

## 17. PWA and Offline Behavior

- `next-pwa` generates and registers the production service worker; it is disabled during normal development to prevent stale-cache confusion.
- The web manifest uses `display: standalone`, Atlas Wire name/short name, `/` start URL, brand colors, orientation defaults, and 192px, 512px, and maskable PNG icons.
- Android-compatible splash presentation derives from the manifest icon, background color, and theme color. Apple touch icons and common portrait `apple-touch-startup-image` assets provide an intentional iOS launch screen rather than a blank frame.
- Navigation requests use Network First with an offline fallback.
- Viewed article HTML is runtime-cached with bounded entries and expiration.
- Images use Cache First with expiration; fonts and static assets use Stale While Revalidate.
- API, admin, preview, analytics, advertising, and cross-origin market requests are never cached as article pages.
- `beforeinstallprompt` powers supported-browser installation. The button appears only after the event is available and records successful installation.
- iOS Safari receives a dismissible “Share → Add to Home Screen” guide when the app is not already standalone.
- PWA controls respect prior dismissal and do not compete with the consent banner.

## 18. Error Handling and Observability

- Public routes use `not-found.tsx`, route-level `error.tsx`, and a global error boundary with useful recovery links.
- Content schema errors include the responsible file and field without leaking source code or secrets to public users.
- Admin APIs return stable JSON error codes for unauthorized, invalid input, conflict, unavailable storage, and internal errors.
- Feed and generation scripts print a final source/story summary and set a failing exit code only when the requested run cannot produce a trustworthy result.
- External fetches use timeouts and bounded retry; validation errors are not retried.
- Logging excludes passwords, session material, API keys, authorization headers, and full generated prompts.

## 19. Testing Strategy

Vitest provides unit and integration coverage. React Testing Library covers interactive components. Playwright covers critical browser journeys.

Test-first behavior includes:

- Frontmatter parsing, filename invariants, published-only discovery, sorting, pagination, and related ranking
- URL/title normalization and cross-source deduplication
- Disabled generation, source attribution, output validation, and retry boundaries
- Password comparison, session signing/expiration, origin checks, and path validation
- Local repository behavior and GitHub commit-tree request construction
- Market response normalization and unavailable fallback
- Search matching, share-copy feedback, consent gating, theme persistence, and install-prompt state
- Admin login, save-validation, publish, and discard paths
- Manifest, RSS, sitemap, robots, JSON-LD, and public metadata

Mechanical scaffolding, framework configuration, static icons, and sample MDX fixtures are verified through content validation, linting, type-checking, automated tests, and the complete production build.

Final verification commands:

```bash
npm run test
npm run lint
npm run typecheck
npm run validate:content
npm run build
npm run test:e2e
```

Browser verification covers desktop and mobile homepages, category pagination, article reading/sharing, search, dark mode, consent choices, admin authentication/edit/publish behavior against a temporary local content tree, offline fallback, and install UI eligibility.

## 20. Repository and Deployment Documentation

The README provides exact local setup, environment variables, manual content authoring, pipeline commands, admin behavior, GitHub token permissions, scheduler choice, and zero-cost limitations.

Deployment instructions explicitly require the operator to:

1. Create and push to a new GitHub repository.
2. Run `vercel logout` if any CLI session is active, or use a private browser window.
3. Register a brand-new Vercel account with a different email from existing accounts.
4. Import the GitHub repository as a brand-new project rather than linking existing Vercel state.
5. Set environment variables in the new project without copying any previous organization, project, or token identifiers.
6. Deploy and confirm the generated `vercel.app` URL, HTTPS, public routes, PWA assets, and admin login.

Documented environment variables:

```text
NEXT_PUBLIC_SITE_URL
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
GITHUB_REPOSITORY
GITHUB_BRANCH
GITHUB_TOKEN
DRAFT_GENERATION_ENABLED
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
STOCK_API_KEY
GA4_ID
ADSENSE_CLIENT_ID
ADSENSE_ENABLED
CRON_SECRET
```

`.env.example` contains safe placeholders only. No existing Vercel CLI state, organization ID, project ID, access token, or machine credential is inspected or copied.

## 21. Acceptance Criteria

The implementation is accepted when:

1. All six categories have an original bundled MDX article and appear on the homepage, category routes, search, feed, and sitemap.
2. Draft files cannot appear on any public content path or index.
3. Local and GitHub-backed admin workflows can save, publish, and discard valid drafts while rejecting invalid paths/content.
4. RSS discovery produces the specified normalized queue and tolerates individual source failures.
5. AI generation is safely disabled by default and produces validated, attributed drafts when deliberately enabled.
6. Market data is cached and shows a truthful unavailable state when credentials or provider data are absent.
7. Consent blocks GA4 and AdSense until granted.
8. The production build emits the service worker, manifest, icons, offline page, feed, robots, sitemap, and article metadata.
9. The app passes the automated test, lint, type-check, content-validation, production-build, and critical browser-journey suites.
10. The README accurately explains the zero-cost path, optional paid AI usage, Vercel’s non-commercial Hobby limitation, scheduler alternatives, and new-account deployment procedure.
