# OmniLede Top 10, discovery, and authorship design

## Goal

Add the requested editorial and discovery features without redesigning OmniLede. The existing colours, typography, masthead, article layout, cards, footer, and Studio layout remain the visual source of truth.

The finished experience must:

- add a `Top 10` category to the public blog, web Studio, native Mac bridge, daily plan, draft review, search, feeds, sitemap, and publishing pipeline;
- keep the full category list out of the permanent desktop header and reveal the existing category navigation from the existing menu control on pointer hover, keyboard focus, or click;
- use `Ricky Sharan` as the author of new locally generated OmniLede drafts and provide a real public author page;
- show three or four useful recommendations after every article under the heading `You may also like`;
- preserve the final human Publish action and all existing editorial safety checks.

Membership and shop workflows are outside this change. They must not appear until real services exist behind them.

## Public category model

`top-10` becomes the seventh shared category with label `Top 10`, its own description, and an accent selected from the existing OmniLede palette. It uses the same category route, article schema, inventory, sitemap, RSS, search, cards, and structured data as the other desks.

Top 10 articles are editorial lists rather than a separate page type. A publish-ready Top 10 draft must contain an introduction, exactly ten numbered `##` entries, a grounded `## Why it matters` section, visible sources, and image credits. The validator rejects missing, duplicated, or non-sequential entries. A thin source can remain a private saved draft but cannot be marked ready to publish.

The Top 10 writer does not invent ten factual recommendations from one headline. It may create a draft only when the local research material supports the ten entries. Otherwise the Studio reports `Needs research` and keeps the collected work safe.

## Navigation behaviour

The desktop masthead keeps its present logo, tagline, theme, install, search, and menu controls. The always-visible horizontal category strip is removed from normal flow.

The existing menu control reveals the existing `CategoryNav` in an overlay directly below the masthead. It opens when the pointer enters the menu/navigation region, when the control receives keyboard focus, or when the control is clicked. It stays open while focus or the pointer remains inside. Escape, outside click, or choosing a category closes it. The control exposes `aria-expanded` and `aria-controls`.

Touch and narrow screens keep the current click-to-open mobile menu. The menu includes all seven categories. The footer may continue listing desks because it is a discovery area at the end of the page, rather than persistent navigation competing with the article.

## Authorship

New local drafts use `Ricky Sharan` instead of `OmniLede Editorial`. Existing published articles and current private drafts are migrated to the same truthful byline because Ricky is the sole editor and final reviewer.

The byline links to `/author/ricky-sharan`. The author page states that Ricky Sharan is OmniLede's editor and publisher, explains that local AI may assist with private drafts, and makes clear that Ricky reviews each article before publication. It must not claim qualifications, employment, first-hand reporting, or expertise that has not been supplied.

Article metadata and NewsArticle JSON-LD use the same visible author name and author URL. Contributor articles continue using their real contributor attribution and are not overwritten by this migration.

## Related discovery

Every article asks for four recommendations. Ranking occurs in tiers:

1. shared tags, ordered by number of shared tags and recency;
2. same category, ordered by recency;
3. other recent articles, ordered by recency.

Candidates are deduplicated and never include the current article. Up to four are returned. A library with fewer than four other articles returns all available candidates. This guarantees useful discovery for new or sparsely tagged stories without fabricating relationships.

The existing related-card component keeps its visual style. Its heading changes to `You may also like`, and its grid supports four cards at wide widths while remaining responsive. Article cards continue showing image, category, headline, excerpt, author, date, and reading time.

## Studio and native app

Because categories come from the shared editorial package, the web Studio category table, Today planning, inventory counts, draft review, and native writer controls receive Top 10 through the same typed registry.

The Studio category introduction changes from a hard-coded count to wording that remains correct when desks are added. The Swift `StudioWriterCategory` allowlist adds `top-10`; native bridge tests prove that all seven shared writer categories are admitted and unknown categories are rejected.

Top 10 participates in daily planning like every other desk. It can be selected manually even when it is not one of that day's suggested tasks. Starting a Top 10 draft remains a deliberate user action; opening the app never starts writing.

## Content and migration

Create the `content/articles/top-10/` and `content/drafts/top-10/` paths as needed. No demonstration article is published merely to fill the category. The public category route may truthfully show its existing empty state until Ricky approves the first Top 10 draft.

The migration changes only the `author` field for OmniLede-owned articles and drafts whose current author is exactly `OmniLede Editorial`. Contributor names remain unchanged.

## Tests and acceptance

Implementation follows test-first development.

- Shared category tests fail before `top-10` is added and pass after it is available to all TypeScript consumers.
- Native bridge tests fail at six categories and pass at seven, including `top-10`.
- Related-article tests prove tag priority, same-desk fallback, recent global fallback, deduplication, exclusion of the current article, deterministic ordering, and a maximum of four.
- Header component tests prove the permanent desktop category strip is absent and the accessible menu trigger exposes the category overlay.
- Author tests prove generated drafts use `Ricky Sharan`, contributor authors remain unchanged, bylines link to the author page, and JSON-LD matches the visible author.
- Top 10 validation tests prove exactly ten sequential entries are required for publish-ready content.
- Studio tests prove all seven categories render without hard-coded counts.
- Existing content validation, unit tests, lint, type checking, blog build, Ops build, public Playwright tests, and native Swift bridge tests must pass.

## Deployment

After verification, commit the implementation, push it to the existing GitHub branch and `main`, allow Vercel to deploy the public blog and Studio, then check the live desktop and mobile navigation, Top 10 routes, author page, article structured data, and a four-card related section. No external membership, shop, social-posting, or payment account is created by this change.
