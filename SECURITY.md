# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the operator privately using the address in `NEXT_PUBLIC_CONTACT_EMAIL` or the deployment’s published security contact. Include the affected route or file, reproduction steps, impact, and a safe proof of concept. Never send passwords, API keys, session cookies, GitHub tokens, or private article text in a report.

This repository is a production-oriented template. Before launch, the operator must replace the placeholder contact and policy text, configure monitoring, and define an incident-response contact.

## Secret handling and rotation

- Keep `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `STOCK_API_KEY`, and `CRON_SECRET` server-side only. They must never use a `NEXT_PUBLIC_` prefix or appear in logs.
- Use a long unique admin password and a random 32+ character session secret. Rotate both after suspected exposure; rotating the session secret invalidates existing admin cookies.
- Scope the fine-grained GitHub token to the selected repository with Contents read/write only. Revoke and replace it if the repository, account, or deployment is compromised.
- Rotate `CRON_SECRET` after sharing it, changing schedulers, or observing unexpected cron requests. Keep only one scheduler active to avoid duplicate work.
- Anthropic credentials are optional and may incur charges. Disable generation while investigating unexpected usage.

## Application boundaries

Admin mutations require an HMAC session cookie, same-origin requests, bounded JSON, validated paths, and server-side MDX validation. GitHub writes use a conditional ref update and return a conflict instead of overwriting another editor. Drafts are not traversed by public content discovery, search, RSS, sitemap, or service-worker caches. `/admin` and `/api` are Network Only.

The local login throttle is intentionally best effort and process-local. It reduces accidental brute-force load but does not provide distributed rate limiting across multiple instances. Add a reviewed, terms-compliant edge or identity control if the publication needs stronger protection; do not treat the free baseline as a security guarantee.

## Editorial and supply-chain review

Automated RSS discovery supplies facts and snippets, not publishable copy. Optional Claude output is untrusted until a human checks factual support, originality, source attribution, copyright, defamation/privacy risk, and any financial or political claims. No scheduled job publishes an article. Keep dependencies locked, review updates, run the full test/lint/type/content/build suite before deployment, and do not enable advertising until `ads.txt`, consent, policy, and host terms are ready.
