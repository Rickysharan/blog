# OmniLede Billboard-inspired design QA

## Comparison target

- Source visual truth: `.audit/04-billboard-reference-top2.png` (Billboard reference capture supplied by the product brief), with the original OmniLede baseline in `.audit/01-home-top.png`.
- Current rendered implementation: `.audit/20-billboard-style-home.png`, `.audit/21-billboard-style-anime.png`, and `.audit/22-billboard-style-article.png` (full viewport captures); unobstructed top-fold crops are `.audit/23-billboard-style-home-top.png`, `.audit/23-billboard-style-anime-top.png`, and `.audit/23-billboard-style-article-top.png`.
- The focused route captures cover the homepage, Anime desk, and a published article so the same treatment is checked across the primary reading journey.
- Viewport: 1265 × 712 CSS px, desktop in-app browser capture, device scale factor 1. The top-fold crops use the same viewport width and a 480 px height to isolate the masthead, navigation, ad treatment, and lead content.
- State: light theme, published six-article content set, house-ad fallback visible. Full captures retain the consent UI because consent is intentionally opt-in; the crops keep the fixed banner out of the visual comparison area without changing application behavior.

## Evidence

The current retune follows the supplied Billboard reference with a white editorial canvas, black typography and controls, and a high-energy mint navigation signal. It keeps OmniLede's own wordmark, global desks, sourcing language, market status treatment, and moderation/PWA workflows intact.

Focused comparisons confirm that:

- The homepage uses a white masthead, black wordmark, mint strapline, mint category rail, labelled house ad, black market pulse, and a clear lead-story hierarchy (`.audit/23-billboard-style-home-top.png`).
- The Anime desk carries the same masthead and category rail into a desk-specific archive with a featured/latest split (`.audit/23-billboard-style-anime-top.png`).
- Article reading keeps the same navigation system while separating headline context, summary, metadata, source attribution, and the reading canvas (`.audit/23-billboard-style-article-top.png`).

## Required fidelity surfaces

- Fonts and typography: Newsreader supplies the display/editorial voice and Inter supplies utility text. Display scale, tight tracking, readable body line-height, and small uppercase labels establish a consistent hierarchy across homepage, desk, and article routes.
- Spacing and layout rhythm: the max-width frame, two-column lead, ruled section headers, mint signal rails, article body measure, and responsive single-column fallback remain consistent with the editorial reference. The mobile Pixel 7 journey passes without overlap or collapsed image containers.
- Colors and visual tokens: the light implementation uses a white canvas (`#ffffff`), near-white paper/panels, black ink (`#000000`), and Billboard-inspired mint signal (`#00ff9a`). Black reverse surfaces remain deliberate for the market pulse, consent actions, and footer. Dark mode retains the same mint accent against a dark canvas.
- Image quality and asset fidelity: article artwork uses the existing local category assets with stable aspect-ratio containers and `next/image` optimization. A mobile regression test verifies all rendered Anime image containers have non-zero height before entering the viewport.
- Copy and content: interface copy is self-explanatory (“The stories shaping culture, power and capital”, desk descriptions, visible source links, editorial standard, and “Advertise with OmniLede”). Market empties are truthful (“Market update pending”) rather than fabricated figures.
- Icons and controls: existing icon components remain consistent for theme, install, search, and share actions. Header links, ad CTA, navigation, search, theme, consent, moderation, PWA metadata, and source attribution were exercised.
- Accessibility and responsiveness: semantic headings/landmarks, skip link, labelled search and controls, visible focus treatment, image alt text, reduced-motion handling, consent controls, desktop Chromium and Pixel 7 end-to-end coverage all pass.

## Findings

No actionable P0, P1, or P2 design findings remain for the Billboard-inspired retune. The visual target is a reference-led adaptation rather than a pixel clone: OmniLede keeps its own brand name, content model, and editorial voice.

## Comparison history

1. Initial Signal Ledger comparison identified the baseline's muted palette, oversized unavailable market cards, generic ad placeholder, and weak lead-story hierarchy as P1/P2 design drift. The implementation introduced a stronger editorial masthead, compact market pulse, lead rail, labelled house ads, and self-explanatory desk sections.
2. The current retune moved the light theme from deep navy/lime to the supplied reference's white/black/mint foundation while preserving the established layouts, content, consent gating, dark mode, and PWA surfaces.
3. Same-width desktop captures and focused route checks are recorded above. Mobile verification remains covered by the Pixel 7 E2E journey and the image-layout regression test.

## Follow-up polish (P3)

- Add more reviewed stories per desk as the RSS/MDX editorial queue grows so the latest rails have greater depth.
- Replace house-ad fallback creative with approved partner campaigns only after the site is hosted under a plan that permits commercial activity and consent-gated ad IDs are configured.

## Implementation checklist

- [x] Billboard-inspired white/black/mint editorial theme applied to light mode.
- [x] Masthead, utility links, search, theme, install, mobile menu, and category navigation retuned together.
- [x] House-ad and consent-gated ad slots remain explicit and labelled.
- [x] Market empty state remains honest and visually compact.
- [x] Homepage, desk archive, and article top folds captured at the same desktop viewport width.
- [x] Desktop Chromium and Pixel 7 E2E journeys pass.
- [x] No app console errors or persistent browser warnings remain after the mobile image fix.

final result: passed
