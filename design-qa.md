# OmniLede Signal Ledger design QA

## Comparison target

- Source visual truth: `.audit/04-billboard-reference-top2.png` (Billboard reference capture supplied by the product brief), with the original OmniLede baseline in `.audit/01-home-top.png`.
- Rendered implementation: `.audit/07-signal-ledger-home-refined.png` and focused route captures `.audit/08-signal-ledger-home-hero.png`, `.audit/09-signal-ledger-anime.png`, `.audit/10-signal-ledger-article.png`, and `.audit/12-signal-ledger-article-reading.png`.
- Composite comparison: `.audit/13-design-qa-comparison.png` places the original, reference, and refined implementation side by side at the same viewport.
- Viewport: 1265 × 712 CSS px, desktop browser capture, device scale factor 1. Source and implementation captures are each 1265 × 712 px; no density normalization was needed. The composite is 3795 × 712 px.
- State: light theme, consent banner settled, published six-article content set, house-ad fallback visible, homepage/category/article routes rendered.

## Evidence

The composite comparison shows the intended Billboard-like editorial rhythm—strong masthead, compact utility navigation, prominent lead story, clear section dividers, and dense story scanning—while keeping OmniLede's own deep-navy/lime identity, global desks, sourcing language, and market status treatment. The refined first fold replaces the baseline's muted template feel and oversized unavailable market cards with a sharper news hierarchy and a compact market pulse.

Focused comparisons confirm that:

- The homepage hero and “Latest signals” rail preserve a clear primary/secondary reading order (`.audit/08-signal-ledger-home-hero.png`).
- The Anime desk explains its editorial purpose, keeps global navigation available, and uses the same featured/latest structure (`.audit/09-signal-ledger-anime.png`).
- Article reading separates headline context, body copy, source attribution, editorial standards, and the advertising CTA without crowding (`.audit/10-signal-ledger-article.png`, `.audit/12-signal-ledger-article-reading.png`).

## Required fidelity surfaces

- Fonts and typography: Newsreader supplies the display/editorial voice and Inter supplies utility text. Display scale, tight tracking, readable body line-height, and small uppercase labels establish a consistent hierarchy across homepage, desk, and article routes.
- Spacing and layout rhythm: the max-width frame, two-column lead, ruled section headers, lime signal rails, article body measure, and responsive single-column fallback are consistent with the editorial reference. The mobile Pixel 7 journey passes without overlap or collapsed image containers.
- Colors and visual tokens: the implementation uses explicit canvas/panel/ink/brand/signal tokens. Deep navy masthead and lime desk bar create strong contrast and a distinct identity; no gradients or decorative CSS art are used.
- Image quality and asset fidelity: article artwork uses the existing local category assets with stable aspect-ratio containers and `next/image` optimization. A mobile regression test verifies all rendered Anime image containers have non-zero height before entering the viewport.
- Copy and content: interface copy is self-explanatory (“The stories shaping culture, power and capital”, desk descriptions, visible source links, editorial standard, and “Advertise with OmniLede”). Market empties are truthful (“Market update pending”) rather than fabricated figures.
- Icons and controls: existing icon components remain consistent for theme, install, search, and share actions. Header links, ad CTA, navigation, search, theme, consent, moderation, PWA metadata, and source attribution were exercised.
- Accessibility and responsiveness: semantic headings/landmarks, skip link, labelled search and controls, visible focus treatment, image alt text, reduced-motion handling, consent controls, desktop Chromium and Pixel 7 end-to-end coverage all pass.

## Findings

No actionable P0, P1, or P2 design findings remain.

## Comparison history

1. Initial refined comparison identified the baseline's muted palette, oversized unavailable market cards, generic ad placeholder, and weak lead-story hierarchy as P1/P2 design drift. The implementation introduced the Signal Ledger masthead, navy/lime tokens, compact market pulse, editorial lead rail, labelled house ads, and self-explanatory desk sections.
2. Post-fix comparison at the same 1265 × 712 viewport is recorded in `.audit/13-design-qa-comparison.png` and the focused captures above. No P0/P1/P2 differences remain.
3. Mobile verification then exposed a zero-height off-screen image container caused by `content-visibility:auto` on `CategorySection`. The class was removed and `tests/e2e/image-layout.spec.ts` was added. The focused Pixel 7 regression passed with no image warning; all 12 browser tests now pass.

## Follow-up polish (P3)

- Add more reviewed stories per desk as the RSS/MDX editorial queue grows so the latest rails have greater depth.
- Replace house-ad fallback creative with approved partner campaigns only after the site is hosted under a plan that permits commercial activity and consent-gated ad IDs are configured.

## Implementation checklist

- [x] Signal Ledger homepage, desk archive, and article layouts implemented.
- [x] House-ad and consent-gated ad slots are explicit and labelled.
- [x] Market empty state is honest and visually compact.
- [x] Desktop reference and focused route captures compared at the same viewport.
- [x] Desktop Chromium and Pixel 7 E2E journeys pass.
- [x] No app console errors or persistent browser warnings remain after the mobile image fix.

final result: passed
