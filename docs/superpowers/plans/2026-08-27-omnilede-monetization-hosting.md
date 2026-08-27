# OmniLede Commercial Hosting and Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare OmniLede for commercial operation on Netlify Free, deepen every desk with one original article, and leave AdSense activation gated on the operator's approval and credentials.

**Architecture:** Keep the existing Next.js App Router application and GitHub-backed editorial pipeline unchanged. Add a minimal Netlify build configuration, six validated MDX articles, and operator-facing monetization documentation; retain Vercel as rollback until the Netlify deployment is verified. AdSense remains consent-gated and disabled until Google approval values and the exact `ads.txt` seller record are supplied.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, MDX/gray-matter, Netlify OpenNext integration, GitHub Actions, Google AdSense (operator-configured after approval).

**Spec:** `docs/superpowers/specs/2026-08-27-omnilede-monetization-hosting-design.md`

## Global Constraints

- Netlify Free is the recommended commercial host; it must remain free, use no stored payment method, and pause at its hard monthly limit rather than incur surprise charges.
- Keep the current Vercel deployment live as rollback until Netlify route and operational checks pass.
- Published MDX lives in `content/articles/{category}/{slug}.mdx`; drafts remain in `content/drafts/{category}/` until an explicit Publish action.
- Every article requires the strict frontmatter schema, a visible `## Why it matters` section, original wording, and a final visible HTTPS source link.
- Do not create or submit AdSense identity, tax, bank, or payment information; do not invent publisher IDs, slot IDs, or `ads.txt` records.
- Keep `DRAFT_GENERATION_ENABLED=false` and `ADSENSE_ENABLED=false` unless the operator deliberately enables them after approval and host checks.
- Do not add paid services, payment methods, third-party databases, or unreviewed AI copy.
- Do not expose secrets through `NEXT_PUBLIC_*` variables or commit `.env.local`.

---

### Task 1: Add Netlify build configuration and migration checklist

**Files:**
- Create: `netlify.toml`
- Modify: `README.md:10-65, 130-158`
- Modify: `.env.example:28-32`
- Test: `tests/config/netlify-config.test.ts`

**Interfaces:**
- Consumes: the existing `npm run build` script and environment variable names documented in `.env.example`.
- Produces: a root Netlify configuration that runs the unchanged Next.js build; a regression test that checks the required build command and no automatic secret exposure.

- [ ] **Step 1: Write the failing configuration test**

Create `tests/config/netlify-config.test.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Netlify deployment configuration", () => {
  it("uses the existing production build and does not define public secrets", async () => {
    const config = await fs.readFile(path.join(root, "netlify.toml"), "utf8");

    expect(config).toContain('command = "npm run build"');
    expect(config).toContain('publish = ".next"');
    expect(config).not.toMatch(/NEXT_PUBLIC_(PASSWORD|TOKEN|SECRET|API_KEY)/i);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/config/netlify-config.test.ts`

Expected: FAIL because `netlify.toml` does not exist.

- [ ] **Step 3: Add the minimal Netlify configuration**

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20.19.0"
```

This leaves framework routing and the OpenNext adapter to Netlify's supported Next.js integration. Do not add an adapter plugin or copy secrets into the file.

- [ ] **Step 4: Update operator documentation**

In `README.md`, add a “Deploy to Netlify Free for commercial use” section after the existing Vercel deployment guidance. State exactly:

1. Create/sign in to Netlify and connect `Rickysharan/blog` on `main`.
2. Use `npm run build` as the build command and `.next` as the publish directory; `netlify.toml` supplies these defaults.
3. Copy only the production runtime values into Netlify's Production environment; keep `DRAFT_GENERATION_ENABLED=false` and `ADSENSE_ENABLED=false` initially.
4. Keep GitHub Actions as the daily content scheduler.
5. Verify all public, PWA, admin, and API routes before changing the primary domain; keep Vercel available as rollback.
6. Netlify Free has hard usage limits and can pause the project; do not enable auto-recharge or add a card.

Update the advertising table note to say AdSense is gated until approval, `ads.txt`, consent review, and the Netlify commercial host are ready. Preserve the existing Vercel Hobby warning for rollback/non-commercial use.

- [ ] **Step 5: Run the focused test and the existing checks**

Run: `npm test -- tests/config/netlify-config.test.ts`

Expected: PASS.

Run: `npm run lint && npm run typecheck && npm run build`

Expected: all commands PASS and the Next.js build still emits the PWA assets.

- [ ] **Step 6: Commit the hosting configuration**

```bash
git add netlify.toml README.md .env.example tests/config/netlify-config.test.ts
git commit -m "chore: prepare Netlify commercial deployment"
```

### Task 2: Expand the published editorial library

**Files:**
- Create: `content/articles/anime/why-anime-releases-travel-in-windows-not-one-global-date.mdx`
- Create: `content/articles/movies/what-international-box-office-headlines-miss.mdx`
- Create: `content/articles/politics/coalition-math-how-electoral-rules-reshape-power.mdx`
- Create: `content/articles/sports/why-global-sports-leagues-need-local-infrastructure.mdx`
- Create: `content/articles/finance/how-central-bank-signals-move-markets-before-rate-changes.mdx`
- Create: `content/articles/share-market/how-index-rebalances-change-what-investors-own.mdx`
- Modify: `lib/content/articles.test.ts`

**Interfaces:**
- Consumes: `articleFrontmatterSchema`, the six existing local category cover assets under `public/images/articles/`, and the existing published article reader.
- Produces: six additional published documents, bringing each desk to at least two articles; the content test proves that every category has a minimum archive depth.

- [ ] **Step 1: Add the archive-depth regression test**

Append this test to `lib/content/articles.test.ts`:

```ts
  it("keeps at least two published explainers in every global desk", async () => {
    const articles = await getAllArticles();
    const counts = new Map<string, number>();

    for (const article of articles) {
      counts.set(article.category, (counts.get(article.category) ?? 0) + 1);
    }

    expect(articles.length).toBeGreaterThanOrEqual(12);
    for (const category of ["anime", "movies", "politics", "sports", "finance", "share-market"]) {
      expect(counts.get(category)).toBeGreaterThanOrEqual(2);
    }
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- lib/content/articles.test.ts`

Expected: FAIL because the production tree currently contains one published article per desk.

- [ ] **Step 3: Write the six original MDX articles**

Use `author: OmniLede Editorial`, a UTC date of `2026-08-27`, a 5–7 minute read time, and the existing local cover image for each desk. Each body must be 700–1,000 original words with these exact section structures:

| File | Source | Required sections |
| --- | --- | --- |
| `why-anime-releases-travel-in-windows-not-one-global-date.mdx` | `https://www.crunchyroll.com/news` | `## The calendar is a rights map`, `## Why localization changes timing`, `## Why it matters` |
| `what-international-box-office-headlines-miss.mdx` | `https://www.boxofficemojo.com/` | `## Gross is a starting point`, `## Territory and timing change the story`, `## Why it matters` |
| `coalition-math-how-electoral-rules-reshape-power.mdx` | `https://www.idea.int/data-tools/data` | `## Three ways votes become seats`, `## Coalition bargaining is a second contest`, `## Why it matters` |
| `why-global-sports-leagues-need-local-infrastructure.mdx` | `https://www.wada-ama.org/en/what-we-do` | `## Global rules need local delivery`, `## Calendars, venues and welfare`, `## Why it matters` |
| `how-central-bank-signals-move-markets-before-rate-changes.mdx` | `https://www.bis.org/statistics/index.htm` | `## Markets trade expectations`, `## Guidance is information, not certainty`, `## Why it matters` |
| `how-index-rebalances-change-what-investors-own.mdx` | `https://www.spglobal.com/spdji/en/indices/` | `## What an index rule does`, `## Passive flows and active choices`, `## Why it matters` |

Use cautious explanatory language, no unsupported live figures, no personal investment advice, and finish each file with `Source: [Source name](HTTPS URL)` on its own line. Keep the filenames identical to their `slug` frontmatter.

- [ ] **Step 4: Run validation and the focused content tests**

Run: `npm run validate:content`

Expected: `12 published, 0 drafts, 0 errors`.

Run: `npm test -- lib/content/articles.test.ts lib/content/validation.test.ts`

Expected: PASS, including the new archive-depth assertion and the existing draft/public separation checks.

- [ ] **Step 5: Run a route smoke test**

Run: `npm run build`

Expected: all six desk routes and article static params generate without MDX or metadata errors.

- [ ] **Step 6: Commit the editorial expansion**

```bash
git add content/articles lib/content/articles.test.ts
git commit -m "content: deepen each global news desk"
```

### Task 3: Prepare AdSense/operator onboarding without enabling ads

**Files:**
- Modify: `README.md:50-65, 136-158`
- Review: `public/ads.txt:1-3` (retain the placeholder until Google supplies the exact seller record)
- Test: `components/ads/ad-slot.test.tsx`

**Interfaces:**
- Consumes: `ConsentManager`, `AdSlot`, `ADSENSE_*` environment variables, and the existing placeholder `public/ads.txt`.
- Produces: explicit operator instructions and a regression test proving that missing approval values keep the house-ad fallback active.

- [ ] **Step 1: Add the failing test for the unapproved state**

Extend `components/ads/ad-slot.test.tsx` with:

```tsx
  it("keeps the house ad when approval values are absent", () => {
    render(
      <ConsentManager adsenseEnabled adsenseClientId="">
        <AdSlot variant="header" adsenseEnabled slotId="" />
      </ConsentManager>,
    );

    expect(screen.getByText(/reach globally curious readers/i)).toBeInTheDocument();
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });
```

If the current test helpers use a different `AdSlot` prop shape, retain the same assertion and use the existing helper signature rather than changing production behavior.

- [ ] **Step 2: Run the focused test and verify it fails or documents the current gap**

Run: `npm test -- components/ads/ad-slot.test.tsx`

Expected: the test either passes immediately (the safe behavior already exists) or fails only because the test harness needs the existing provider setup adjusted. Do not loosen the production gate.

- [ ] **Step 3: Update operator onboarding documentation**

Document these exact post-approval steps in `README.md`:

1. Apply for AdSense using the real site owner and business/contact details.
2. After approval, add Google's exact publisher line to `public/ads.txt`; never substitute a guessed value.
3. Add `ADSENSE_CLIENT_ID`, each approved numeric `ADSENSE_SLOT_*`, and only then set `ADSENSE_ENABLED=true` in Netlify Production.
4. Test with optional consent denied and granted; verify no AdSense script loads before consent and each ad is labelled.
5. For India, use AdSense Payments → Payments info → Manage payment methods → Transfer to bank account. Enter the account-holder name, bank name, account number, IFSC, and SWIFT/BIC exactly as the bank records them. Keep PAN/tax/GST decisions with an Indian chartered accountant.
6. Keep `ADSENSE_ENABLED=false` until all preceding steps are complete.

Do not write a publisher ID into the repository. Keep the existing placeholder comment in `public/ads.txt` and make it explicit that the operator must replace it after approval.

- [ ] **Step 4: Run ads, unit, and full verification checks**

Run: `npm test -- components/ads/ad-slot.test.tsx components/privacy/consent.test.tsx`

Expected: PASS with no AdSense unit before consent or without approval values.

Run: `npm run validate:content && npm test && npm run lint && npm run typecheck && npm run build && npm run test:e2e`

Expected: all checks PASS; ads remain disabled in the current environment.

- [ ] **Step 5: Commit the onboarding documentation**

```bash
git add README.md public/ads.txt components/ads/ad-slot.test.tsx
git commit -m "docs: define safe AdSense onboarding"
```

### Task 4: Connect Netlify and verify the commercial deployment

**Files:**
- No repository changes expected after Tasks 1–3 unless a Netlify preview reveals a compatibility issue.

**Interfaces:**
- Consumes: Netlify account connected to `Rickysharan/blog`, `netlify.toml`, `main`, and operator-entered runtime environment variables.
- Produces: a verified Netlify production URL while the Vercel deployment remains available as rollback.

- [ ] **Step 1: Operator account setup**

The operator creates/signs into Netlify, connects the GitHub repository, selects `main`, leaves auto-recharge disabled, and adds the required server-side environment variables. Do not paste bank details or AdSense tax information into the repository or chat.

- [ ] **Step 2: Deploy a Netlify preview**

Use Netlify's Git deploy flow to build `main` with `npm run build`. Confirm the deploy uses Node 20.19 or newer and succeeds without a Vercel-specific adapter.

- [ ] **Step 3: Exercise the route matrix**

Check `/`, `/category/anime`, `/category/movies`, `/category/politics`, `/category/sports`, `/category/finance`, `/category/share-market`, one article from each desk, `/search`, `/feed.xml`, `/sitemap.xml`, `/manifest.json`, `/offline`, and `/admin/login`.

- [ ] **Step 4: Verify moderation and privacy boundaries**

Authenticate with the operator's admin credentials, confirm drafts are not public before Publish, confirm GitHub-backed Save/Publish behavior, decline optional consent and verify house ads remain, then grant consent and verify AdSense is still absent while `ADSENSE_ENABLED=false`.

- [ ] **Step 5: Verify production and retain rollback**

After the preview passes, promote the Netlify deployment, verify the Netlify URL returns HTTP 200 and has valid PWA metadata, and keep `https://omnilede-news.vercel.app` available until the operator confirms the primary domain.

- [ ] **Step 6: Record the handoff**

Record the Netlify URL, the date of verification, the free-tier usage guardrail, and the operator-owned AdSense/bank checklist in the final handoff. Do not claim monetization is active until Google approval and the exact seller/slot values are present.
