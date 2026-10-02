# OmniLede Studio and Growth Dashboard Design

## Goal

Create one private OmniLede Studio that works inside the native Mac app and as an installable phone PWA. Studio separates daily editorial work from category management, moves review and publishing out of the public blog, shows genuine audience and Google Search data, and manages the path to AdSense revenue.

The public OmniLede blog becomes reader-only. Article generation remains local to the Mac through Ollama. Review, editing, publishing, analytics, SEO monitoring, site health, and revenue data remain available on both Mac and phone.

## Current State

- The public blog is deployed at `https://omnilede-news.netlify.app` and uses GitHub-backed MDX drafts and articles.
- The blog exposes a password-protected `/admin` review desk and matching draft APIs.
- The native Mac app controls the local Ollama writer and opens the hosted review desk after delivery.
- The repository already contains a protected `apps/ops` Next.js application, shared contracts, Supabase authorization foundations, and a separate contributor PWA.
- The blog already emits canonical metadata, a root sitemap, crawlable `robots.txt`, and `NewsArticle` JSON-LD.
- GA4, Search Console, and AdSense are not connected. Current search checks did not surface OmniLede for its brand or `site:` queries, though a `site:` query is not a complete indexing report.
- A custom domain is deferred. All canonical and provider configuration must support a later domain migration without changing content identities.

## Product Structure

### Public blog

The public blog remains the reader-facing publication. It contains articles, category pages, topic pages, search, legal pages, advertising placements, consent controls, and public contact surfaces. It does not contain an administrator login, draft list, editor, publishing mutation, analytics dashboard, or private provider data.

The existing blog `/admin` pages and mutation APIs are removed only after Studio has passed publishing verification. Requests to retired admin paths return a normal not-found response and never redirect to or expose Studio.

### OmniLede Studio

The existing `apps/ops` application becomes OmniLede Studio and is deployed as a separate private Netlify application. It is the single hosted control plane for Mac and phone. It uses the shared contracts and design packages already in the monorepo and imports the existing draft editor and publication behavior through shared server-side modules rather than duplicating business rules.

Studio has responsive navigation: a sidebar on desktop and bottom navigation on phone. Its manifest, icons, service worker, and safe caching rules make it installable as a phone PWA. Private pages and APIs are network-only and are never stored in an offline cache.

### Native Mac app

`OmniLede.app` embeds the approved Studio origin in a `WKWebView` and retains a native local-process controller. A narrow native bridge exposes only explicit local-writer actions. The bridge accepts messages from the exact configured Studio origin, validates the category and action, and starts work only after a direct user click.

The Mac can generate articles because Ollama and the repository are local. The phone can review, edit, publish, inspect analytics, and maintain the site, but it cannot invoke Ollama or remotely expose the Mac. On phone, local-writing controls explain that generation is available from the Mac.

## Authentication and Secrets

Studio uses Google sign-in through Supabase Auth. Server-side authorization grants access only to the configured operator identity and an `admin` role read from trusted server data. Email or role claims supplied only in editable user metadata are not sufficient. Every private page and API fails closed for anonymous, disallowed, or suspended identities.

Search Console, GA4, and AdSense connections use explicit Google OAuth consent. Search and analytics requests use read-only scopes. Refresh tokens are encrypted and stored server-side; access tokens, refresh tokens, Google client secrets, Supabase service credentials, and GitHub credentials never enter browser storage, article content, logs, or repository files.

GitHub remains the content source of truth. Studio holds the repository-scoped server credential required for draft and publication actions. Draft mutation requires same-origin requests, bounded input, a valid authenticated session, and the expected content version. Publish requires a confirmation and commits the exact reviewed bytes. Conflicts preserve the editor's current work.

## Studio Information Architecture

### Overview

Overview contains verified summary cards and trend charts:

- active users, sessions, page views, and engagement from GA4;
- Google impressions, clicks, click-through rate, and average position from Search Console;
- published articles and waiting drafts from GitHub content;
- AdSense status and genuine earnings when available;
- provider, deployment, indexing, publication, and site-health alerts.

Every card identifies its source and last successful refresh. Missing, delayed, stale, or disconnected sources display that state instead of zero. Date-range controls cover seven days, 28 days, three months, and twelve months.

### Today

Today is separate from Categories. It is a daily operational list containing writing, review, publication, SEO, provider setup, and maintenance tasks. It derives tasks from:

- unfinished or failed writer state;
- drafts waiting for review;
- all six categories' coverage age;
- Search Console opportunities and index errors;
- metadata, structured-data, link, deployment, and provider warnings;
- AdSense setup or review actions.

Tasks can be completed, postponed, or refreshed. Refresh never starts writing or publishes content.

### Categories

Categories always shows Anime, Movies, Politics, Sports, Finance, and Share Market. Each row shows valid published and draft counts, latest publication, coverage age, current task state, GA4 views, Search Console clicks, and useful warnings. The Mac exposes Start writing and Try again. The phone exposes review and publication actions but does not present a nonfunctional generation control.

### Content

Content moves the existing blog draft review desk into Studio and expands it with category, state, date, and text filters; a full editor; preview; Save; Publish; conflict messages; and publication history. Save remains private. Publish always requires deliberate confirmation and never happens as part of generation, refresh, analytics, or SEO automation.

### Growth

Growth uses the GA4 Data API for real users, sessions, views, engagement, acquisition channels, devices, countries, landing pages, and article performance. Consent choices can make GA4 lower than total server traffic, and Studio explains that limitation.

### Google Search

Google Search uses the Search Console API for queries, pages, countries, devices, clicks, impressions, click-through rate, average position, submitted sitemaps, and URL inspection. Search Console is the source of truth for Google visibility; ordinary `site:` searches are only a diagnostic hint.

The view highlights meaningful opportunities such as pages with impressions but weak click-through rate, declining pages, queries near the first result page, sitemap failures, and unindexed canonical pages. It can create a Today task but cannot rewrite or publish content automatically.

### Revenue

Revenue shows AdSense connection, site ownership, review state, policy or configuration messages, ads.txt state, ad activation, earnings, impressions, clicks, and page RPM when Google returns real data. Unavailable figures are labelled unavailable. Ads stay disabled until the site is approved and has a Ready status.

### Site health

Site health combines deployment state, provider connectivity, publication failures, broken internal links, missing metadata, malformed structured data, sitemap errors, indexing warnings, page performance, and mobile usability. Each warning includes the evidence, affected page, last check time, and a concrete recovery action.

## Content and Publication Flow

1. On Mac, the editor selects any of the six categories and explicitly starts the local writer.
2. The native bridge starts the existing category-constrained Ollama workflow and streams sanitized progress to Studio.
3. A completed local draft is validated and delivered to GitHub draft storage. No content is published.
4. Studio refreshes the draft list on both devices.
5. The editor reviews, edits, previews, and saves the draft.
6. Publish shows a confirmation containing the exact title, category, and version.
7. Studio performs a version-checked GitHub publication and reports the resulting article URL and deployment state.
8. Search and analytics reports update when their providers process the new page; Studio does not manufacture immediate metrics.

## Google Setup and Search Growth

The setup flow creates or connects the required Google Cloud project, GA4 property, Search Console property, OAuth clients, Analytics Data API, Search Console API, and AdSense account/site. Google may require the operator to complete sign-in, consent, ownership verification, account creation, or application submission interactively.

Studio submits the existing root sitemap after Search Console ownership is verified and records processing results. The blog retains crawlable canonical URLs, robots rules, and sitemap entries. A future custom-domain migration updates canonical configuration, provider properties, sitemap submission, OAuth origins, redirects, and Search Console change-of-address steps as one controlled migration.

Search improvements include:

- accurate unique titles and descriptions;
- consistent canonical URLs and visible dates;
- `NewsArticle`, publisher, author, image, and breadcrumb structured data;
- relevant crawlable images with accurate alt text;
- useful internal links between articles, categories, and topics;
- topic pages only when several articles support a meaningful, original hub;
- Core Web Vitals, accessibility, and mobile checks;
- Search Console-driven editorial opportunities rather than keyword stuffing.

AI output remains a private draft until human review. The workflow rejects mass publication and thin programmatic tag pages. Published articles must add original context or analysis, clear sourcing, accurate claims, useful structure, and an identifiable editorial review. Trending status alone is not a reason to publish.

## Advertising

The project prepares AdSense ownership verification, ads.txt, consent, approved placements, and a disabled-by-default ad configuration. AdSense application submission is a deliberate account action. Google controls approval and may report content, policy, ownership, or readiness issues. Studio exposes those actual results.

Ad code is not activated until the site has passed review and Google marks it Ready. Existing commercial feature gates remain in force. Revenue dashboards use provider data only and never estimate or fabricate earnings.

## Failure and Recovery

- Provider adapters retain the last successful report with its timestamp and show a stale or unavailable state during an outage.
- A missing connection shows a setup action, not zero traffic.
- OAuth expiry or revocation returns to a reconnect flow without losing editorial state.
- GitHub conflicts block save or publish and preserve unsaved editor content.
- Network loss cannot delete Today tasks, drafts, or local writer checkpoints.
- A local writer failure remains attached to its category and exposes Try again on Mac.
- A Studio outage never makes public articles unavailable because the reader site remains a separate deployment.
- Removing the blog admin is reversible during rollout until Studio publishing has passed its preview and production checks.

## Testing and Verification

Automated tests cover:

- Google identity allowlisting and server-side role enforcement;
- OAuth scope, callback, token-storage, revocation, and provider-failure behavior;
- GA4, Search Console, and AdSense response validation and metric transformation;
- truthful unavailable, stale, delayed, and disconnected states;
- all six category summaries and separate Today task derivation;
- versioned draft Save and confirmed Publish conflicts;
- exact-byte GitHub publication and no implicit publication;
- PWA manifest, private-route network-only caching, phone navigation, and responsive layouts;
- native Studio-origin validation and explicit-click local writer bridging;
- public blog admin removal and private API isolation;
- canonical metadata, sitemap, robots, topic-page thresholds, internal links, and structured data.

Deployment verification uses a preview Studio site and a non-production content branch first. It checks Google sign-in, draft editing, a controlled publication, native Mac launch, phone PWA installation, provider error states, and the absence of admin surfaces on the public preview. Production admin removal happens only after the same Studio build can read, save, and publish safely.

## Rollout

1. Expand `apps/ops` into the authenticated Studio shell and responsive PWA.
2. Move shared draft review, editing, and publication behavior into Studio-compatible modules.
3. Verify exact-byte publication against a safe preview branch.
4. Add Overview, Today, all-six Categories, Content, and Site health.
5. Embed Studio in the native app and add the restricted local-writer bridge.
6. Connect and verify GA4 and Search Console, then enable real Growth and Google Search views.
7. Add provider-derived SEO tasks and qualified topic pages.
8. Prepare AdSense ownership, ads.txt, consent, and application submission.
9. Remove the public blog admin and update the local writer's review destination.
10. Enable ads only after Google approval and a Ready status.

## Acceptance Criteria

- The public blog has no admin login, draft editor, or publishing API.
- The native Mac app and phone PWA display the same private Studio data.
- Only the configured Google identity can enter Studio.
- The Mac can explicitly start local writing for any of the six categories without a Terminal window.
- The phone can review, edit, save, publish, and inspect reports without access to Mac-local execution.
- Today and Categories are distinct views, and Categories always lists all six categories.
- Content remains a draft until a confirmed Publish action.
- GA4, Search Console, and AdSense figures are genuine, sourced, timestamped, and never invented.
- Search Console setup verifies the current site and submits its sitemap.
- SEO tasks use provider evidence and never auto-publish or mass-generate thin pages.
- Ad code remains disabled until Google approves the site.
- Existing drafts, published articles, queue data, and local recovery state remain compatible and preserved.
- A later custom-domain migration is supported without changing article identities or losing analytics and search history unnecessarily.

## References

- Google Search Console setup: https://developers.google.com/search/docs/monitor-debug/search-console-start
- Search Console OAuth: https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- Google Analytics Data API: https://developers.google.com/analytics/devguides/reporting/data/v1
- Google guidance for AI-assisted content: https://developers.google.com/search/docs/fundamentals/using-gen-ai-content
- Helpful, reliable content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Article structured data: https://developers.google.com/search/docs/appearance/structured-data/article
- AdSense site review: https://support.google.com/adsense/answer/12131223
