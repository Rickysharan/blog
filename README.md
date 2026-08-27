# OmniLede

OmniLede is a global, MDX-first newsroom for Anime, Movies, Politics, Sports, Finance, and Share Market reporting. It ships as an installable PWA with a human approval gate: automated discovery may prepare a draft, but only an authenticated editor can publish it.

The secure baseline uses Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS, and Serwist. The original Next.js 14 + `next-pwa` combination was replaced after the project’s security review; the locked versions in `package-lock.json` are the source of truth.

## Zero-cost baseline

Reading, local MDX authoring, the PWA, GitHub Actions scheduling on a public repository, and a non-commercial Vercel Hobby deployment do not require a paid service or credit card. Market quotes, analytics, advertising, and optional Claude drafting are integrations you can leave off. Claude uses Anthropic’s API and may incur provider charges; it is disabled by default. AdSense is disabled until the operator has approved identifiers and a commercially permitted host.

Vercel Hobby is intended for personal, non-commercial use. If the publication is commercial, monetized, or operated for a business, choose hosting whose terms permit that use and obtain the required legal, tax, and advertising advice.

## Run locally

Requirements: Node.js 20 LTS (20.19 or newer), npm, and a modern browser.

```bash
npm ci
cp .env.example .env.local
# edit .env.local; keep secrets server-only
npm run dev
```

Open <http://localhost:3000>. The development server runs with webpack because the production service worker uses Serwist’s webpack integration. Service workers are disabled outside production to avoid stale local caches.

Useful checks:

```bash
npm test
npm run lint
npm run typecheck
npm run validate:content
npm run build
npm run start
```

## Environment variables

Copy `.env.example` to `.env.local` and replace only values you own. Never expose a secret through a `NEXT_PUBLIC_` variable, commit `.env.local`, or copy credentials from another account.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | production | Canonical HTTPS site URL; localhost is the development fallback. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | recommended | Address shown on contact and policy pages. |
| `ADMIN_PASSWORD` | admin | Long password for the review area (12+ characters). |
| `ADMIN_SESSION_SECRET` | admin | Random HMAC secret (32+ characters). |
| `GITHUB_REPOSITORY` | production moderation | `owner/repository` for Git-backed draft writes. |
| `GITHUB_BRANCH` | production moderation | Protected branch used by the GitHub adapter, normally `main`. |
| `GITHUB_TOKEN` | production moderation | Fine-grained token with Contents read/write on this repository only. |
| `DRAFT_GENERATION_ENABLED` | optional | Exactly `true` enables Claude drafting; the default is `false`. |
| `ANTHROPIC_API_KEY` | optional | Claude credential; Anthropic API usage may cost money. |
| `ANTHROPIC_MODEL` | optional | Explicit Claude model name used by the drafting script. |
| `STOCK_API_KEY` | optional | Financial Modeling Prep key for delayed market quotes. |
| `GA4_ID` | optional | Consent-gated Google Analytics measurement ID. |
| `ADSENSE_CLIENT_ID` | optional | Consent-gated AdSense client ID; keep ads disabled until approved. |
| `ADSENSE_ENABLED` | optional | Set `true` only after replacing ad placeholders and `public/ads.txt`. |
| `CRON_SECRET` | optional | 16+ character bearer secret for the opt-in Vercel Cron endpoint. |

The market strip remains truthful when `STOCK_API_KEY` is absent. GA4 and AdSense scripts do not load until the reader grants consent. Manual drafts never need an API key.

## Editorial content

Published articles live at `content/articles/{category}/{slug}.mdx`. New work belongs in `content/drafts/{category}/` and is never public until the Publish action moves it into the articles tree. Public discovery, search, feed, sitemap, and related stories read only the published tree.

Every MDX file must have this complete frontmatter:

```yaml
title: A clear headline
slug: lowercase-kebab-case
date: 2026-08-26T12:00:00.000Z
category: anime # movies | politics | sports | finance | share-market
tags: [global, analysis]
author: Editorial desk
excerpt: One concise sentence for cards and metadata.
coverImage: /images/articles/anime.svg
readTime: 5
sourceName: Outlet name
sourceUrl: https://example.com/original-report
```

The filename must match `slug`, dates are UTC, `sourceUrl` must be HTTPS, and the body must include a clear `## Why it matters` section. Published and generated stories end with a visible `Source: [Outlet](URL)` link. Use your own words, verify facts, and confirm that the source and any images may legally be linked or reproduced; attribution does not transfer copyright.

To create a manual draft, copy a valid article into the matching `content/drafts/{category}/` directory, change its slug and frontmatter, then run:

```bash
npm run validate:content
```

In development, sign in at `/admin/login` with `ADMIN_PASSWORD`, open `/admin/review`, edit and Save to preserve a draft, then explicitly confirm Publish or Discard. In production, the admin uses the GitHub adapter and each mutation is a conditional Git commit. A stale editor receives a conflict instead of overwriting newer work.

## RSS discovery and optional drafting

The daily discovery script uses public RSS/Atom feeds only. It normalizes URLs, sanitizes snippets, removes recent near-duplicates, skips unavailable publishers with an explanation, and writes `content/queue/trending.json` atomically.

```bash
npm run content:fetch
npm run content:generate
```

`content:generate` exits successfully without a network call while `DRAFT_GENERATION_ENABLED` is not exactly `true`. When enabled, it sends only queue facts to `api.anthropic.com/v1/messages`, requires `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`, validates 700–1,000 original words plus `Why it matters`, and writes drafts only. The Vercel route caps a run at three drafts. No automation publishes an article.

## Scheduling (choose one)

GitHub Actions is the recommended scheduler. `.github/workflows/content-pipeline.yml` runs once daily at 07:15 UTC and supports `workflow_dispatch`. It installs with `npm ci`, fetches, conditionally generates only when the three drafting secrets are present, validates, and commits only `content/queue` and `content/drafts`. It has `contents: write` permission and no pull-request trigger, so secrets are not exposed to untrusted PRs.

For a public repository, GitHub Actions is the simplest free path. Private repositories have plan-specific included-minute limits that GitHub can change; check the current allowance before relying on a private schedule and do not add a payment method just to run this baseline.

Vercel Cron is an alternative, not a second scheduler. Copy `vercel.cron.example.json` to `vercel.json` only after disabling the GitHub schedule, set `CRON_SECRET`, and redeploy. The endpoint is `GET /api/cron/content` with `Authorization: Bearer <CRON_SECRET>`, runs on Node.js with a 60-second cap, limits generation to three drafts, and writes production drafts through GitHub because Vercel’s filesystem is ephemeral. It returns counts only; prompts, snippets, and secrets are never returned.

## Deploy to a new GitHub repository

Create a brand-new empty repository in GitHub, then from this checkout:

```bash
git init -b main
git add .
git commit -m "Initial OmniLede release"
git remote add origin https://github.com/OWNER/NEW-REPOSITORY.git
git push -u origin main
```

Create a fine-grained GitHub token scoped to that one repository with Contents: Read and write. Do not grant organization administration, workflows, issues, or all-repository access. Store it only as `GITHUB_TOKEN` in the deployment environment. Enable the included Actions workflow and use `workflow_dispatch` for the first controlled run.

## Deploy to a brand-new Vercel account

This procedure intentionally avoids reusing local or existing account state:

1. Run `vercel logout` in every terminal where the Vercel CLI might be authenticated. Alternatively, open a private browser window and do not import existing Vercel CLI state.
2. Register a **brand-new Vercel account** with a **different email** from any prior account used for this project.
3. In that account, create a **brand-new project** by importing the new GitHub repository. Do not link an existing project or copy an organization ID, project ID, token, team setting, or environment file.
4. Add the production variables from the table above. For Git-backed moderation, set `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `GITHUB_TOKEN`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET`. Keep `DRAFT_GENERATION_ENABLED=false` unless you intentionally accept Anthropic API charges. Keep `ADSENSE_ENABLED=false` on Hobby.
5. Deploy. Confirm the generated `https://<project>.vercel.app` URL, HTTPS/free SSL, `/`, each category, `/search`, `/feed.xml`, `/sitemap.xml`, `/manifest.json`, `/offline`, and `/admin/login`. Test a draft Save and verify that Publish is a deliberate action.

The Vercel-provided `.vercel.app` subdomain and TLS certificate are enough for a no-cost launch. Vercel’s Hobby non-commercial restriction still applies; a custom domain, revenue, or business use requires a plan and terms that permit it. Never paste a previous project’s environment variables or credentials into the new project.

## Legal and brand responsibility

The working name OmniLede was screened against publicly indexed company/trademark signals during design, with no exact match found in that preliminary check. This is not formal trademark clearance, a registration, or legal advice. Before incorporation, a paid campaign, or material brand spend, have counsel search the relevant trademark registers and domains. Review and replace the policy templates at `/privacy`, `/terms`, and `/disclaimer` with the operator’s real identity, jurisdiction, retention practices, and contact details. The operator remains responsible for source licenses, image rights, defamation/privacy review, financial-information disclosures, and advertising compliance.

## PWA and offline behavior

Production builds emit `public/sw.js`, `public/manifest.json`, maskable/standard icons, Apple touch/startup assets, and `/offline`. Navigation is Network First with a bounded seven-day cache; article images are Cache First; Next static assets and fonts are Stale While Revalidate. `/admin` and `/api` are Network Only. Supported browsers expose an install button after `beforeinstallprompt`; iOS Safari receives a dismissible Share → Add to Home Screen guide after consent is settled.

## Security and support

See [SECURITY.md](SECURITY.md) for private reporting, secret rotation, admin limitations, and generated-content review. The zero-service baseline includes a best-effort in-memory login throttle; it does not provide distributed brute-force protection. Do not report secrets or personal data in public issues.
