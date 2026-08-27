# OmniLede commercial hosting and monetization design

**Status:** Proposed
**Date:** 2026-08-27
**Scope:** Move the public deployment to a commercial-use-compatible free host, deepen the editorial library, and prepare consent-gated AdSense integration without handling the operator's identity, tax, or bank credentials.

## Context

The current OmniLede production deployment is on Vercel Hobby. Vercel's current plan documentation limits Hobby to personal, non-commercial use, so it is not an appropriate foundation for ads, sponsorships, affiliate revenue, or other financial gain. The repository already has an explicit AdSense integration boundary, an `ads.txt` placeholder, consent gating, human draft review, and a GitHub-backed content pipeline, but advertising is disabled.

Netlify Free is the recommended replacement for the commercial launch path. Netlify states that its Free plan can host commercial projects without a credit card, uses a hard monthly usage limit, and supports Next.js App Router, SSR, route handlers, ISR, image optimization, and middleware through its OpenNext adapter. The free plan can pause projects at its usage limit, so this is a launch-tier choice with a clear scaling boundary rather than a service-level guarantee.

## Goals

1. Keep the current Vercel deployment live as a rollback while a Netlify deployment is verified.
2. Add a Netlify configuration that preserves the existing Next.js build, MDX content, PWA output, admin route, API routes, and GitHub Actions scheduler.
3. Add one original, globally relevant, manually reviewed article to each of the six desks so archives and related-story rails have meaningful depth.
4. Keep all generated or queued material out of the public article tree until the existing Publish action is used.
5. Make the site ready for Google AdSense approval without enabling ads before approval, consent, `ads.txt`, and a commercially permitted host are all in place.
6. Document the operator-owned steps for Netlify account setup, AdSense approval, Indian bank payout setup, and tax advice.

## Non-goals and boundaries

- Do not create or submit an AdSense account, identity verification, tax form, or Indian bank details on the operator's behalf.
- Do not enable `ADSENSE_ENABLED` or invent a publisher ID, ad slot ID, or `ads.txt` seller record.
- Do not move or expose existing secrets automatically. Netlify environment variables will be entered by the operator through the dashboard after the account is created.
- Do not add a paid plan, payment method, third-party database, or paid AI provider.
- Do not replace the existing editorial voice with scraped, syndicated, or unreviewed AI copy.
- Do not remove the Vercel deployment until the Netlify route and operational checks pass.

## Hosting architecture

### Netlify project

Add a small `netlify.toml` at the repository root with the existing production build command (`npm run build`) and the Node version required by the repository. Do not add a pinned adapter unless Netlify's current integration requires it; Netlify's documented Next.js integration should detect the App Router project automatically.

The operator will create or use a Netlify account, connect `Rickysharan/blog`, choose the `main` branch, and add production environment variables. The existing GitHub Actions workflow remains the only content scheduler. Netlify handles Git-based deploys; it does not replace the daily RSS workflow.

The following runtime behavior must remain unchanged:

- Published MDX is read from `content/articles`.
- Draft moderation writes through the GitHub adapter and requires the existing admin and repository secrets.
- `/api`, `/admin`, and private mutations remain server-side and are not cached as public article content.
- The PWA service worker, manifest, offline page, RSS, sitemap, and robots routes remain available.
- The current Vercel URL remains a rollback until the operator confirms the Netlify URL and optional domain.

### Environment migration

The operator will copy only the required values into Netlify's Production environment:

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `GITHUB_TOKEN`, and any intentionally enabled market or analytics values.

`DRAFT_GENERATION_ENABLED` stays `false` unless the operator deliberately accepts Anthropic API charges. AdSense variables stay disabled until approval.

## Editorial expansion

Add six MDX articles, one per desk, using the existing frontmatter schema and local category cover assets. The proposed topics are evergreen explainers rather than time-sensitive claims:

| Desk | Proposed topic | Editorial angle |
| --- | --- | --- |
| Anime | Why anime releases travel in windows, not one global date | Explain licensing, localization, and platform scheduling without promising universal availability. |
| Movies | What international box-office headlines miss | Explain territory mix, release windows, currency, and audience context. |
| Politics | Coalition math: how electoral rules reshape power | Compare proportional, majoritarian, and mixed systems without endorsing a party. |
| Sports | Why global sports leagues need local infrastructure | Connect calendars, venues, broadcast rights, and athlete welfare across regions. |
| Finance | How central-bank signals move markets before rate changes | Explain expectations, guidance, and uncertainty without giving personal advice. |
| Share Market | How index rebalances change what investors own | Explain inclusion rules, passive flows, and tracking effects without stock recommendations. |

Each article must:

- be written in original language and reviewed as if it were publishable copy;
- include a complete title, slug, UTC date, category, tags, author, excerpt, cover image, read time, source name, and HTTPS source URL;
- contain a visible `## Why it matters` section;
- end with a visible `Source: [Outlet](URL)` link;
- avoid copying source wording, unsupported live figures, investment recommendations, defamation, and claims that depend on unverified current events.

## AdSense readiness

The existing consent manager and ad-slot components are retained. The implementation will only improve documentation or configuration boundaries; it will not fabricate approval values.

After Google approves the site, the operator will:

1. Add the exact publisher record Google supplies to `public/ads.txt`.
2. Add `ADSENSE_CLIENT_ID` and the approved numeric placement IDs (`ADSENSE_SLOT_HEADER`, `ADSENSE_SLOT_IN_FEED`, `ADSENSE_SLOT_ARTICLE`, `ADSENSE_SLOT_SIDEBAR`, and `ADSENSE_SLOT_FOOTER`) in Netlify Production environment variables.
3. Set `ADSENSE_ENABLED=true` only after confirming the host terms, privacy/consent copy, `ads.txt`, and all IDs.
4. Redeploy and test that no AdSense script or unit loads before optional consent, and that each approved placement is labelled and does not exceed publisher content.

The operator should use an AdSense payments profile whose payee name matches the Indian bank account. Google currently documents India bank-transfer setup using the account-holder name, bank name, account number, IFSC, and SWIFT/BIC; bank fees and currency conversion are determined by the bank. An Indian chartered accountant should advise on PAN, income tax, GST, foreign remittance, and business structure.

## Verification plan

Before declaring the migration ready:

1. Run `npm run validate:content`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
2. Run the complete desktop and Pixel 7 Playwright suite.
3. Deploy a Netlify preview from `main` and check `/`, all six desks, a published article, `/search`, `/feed.xml`, `/sitemap.xml`, `/manifest.json`, `/offline`, and `/admin/login`.
4. Confirm the admin route can still authenticate and that no draft is public before an explicit Publish action.
5. Confirm the Netlify production response, PWA metadata, and image containers in the in-app browser.
6. Keep the Vercel deployment available until these checks pass and the operator chooses the primary domain.

## Risks and mitigations

- **Free-tier pause:** Netlify Free has a hard monthly limit and may pause projects at the limit. Keep usage alerts on, avoid automatic credit recharge, and retain Vercel as rollback during migration.
- **Runtime differences:** Netlify's Next.js adapter is documented as full-featured, but verify admin mutations, route handlers, service-worker output, and image optimization in a preview before switching DNS.
- **AdSense rejection:** build an original, useful article library, keep manual review, retain visible sourcing, and follow Google's publisher policies before applying.
- **Credential drift:** copy secrets manually into the new host and rotate any credential that was ever exposed. Do not place secrets in `NEXT_PUBLIC_*` variables.
- **Tax and payment errors:** use the exact payee/bank details in AdSense and obtain local professional advice before accepting meaningful revenue.

## Acceptance criteria

- A Netlify-ready configuration is committed without breaking the existing Next.js/Vercel build.
- Six additional articles validate and render in their respective desks.
- The site remains ad-disabled until the operator supplies approval values.
- Existing unit, lint, type, build, content, and E2E checks pass.
- The operator has a short, explicit checklist for creating accounts and entering bank/tax details privately.

## References

- Netlify Free commercial/no-card launch description: https://www.netlify.com/blog/introducing-netlify-free-plan/
- Netlify current pricing and hard-limit behavior: https://www.netlify.com/pricing/
- Netlify Next.js support: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- Vercel Hobby restrictions: https://vercel.com/docs/plans/hobby
- Google AdSense eligibility: https://support.google.com/adsense/answer/9724?hl=en
- Google AdSense bank transfer setup: https://support.google.com/adsense/answer/3372975?hl=en-GB
- Google AdSense publisher policies: https://support.google.com/publisherpolicies/answer/11190248?hl=en
