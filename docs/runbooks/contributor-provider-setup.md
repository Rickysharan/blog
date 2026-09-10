# Contributor provider setup on free tiers

This runbook covers the optional provider adapters used by the Contributor app. The core workflow remains usable with every provider disabled: deterministic checks still run, uncertain work goes to manual review, and points/redemptions remain in launch mode.

## Free-tier guardrails

- **Cloudflare Workers AI:** create a free Cloudflare account and use the included Workers AI allocation for bounded text, image-safety, and embedding requests. Do not enable Workers Paid. Confirm the current allocation and terms in the Cloudflare dashboard before enabling calls.
- **Tavily:** create a free account and use the free monthly research quota. Keep the adapter's per-run cap and one-retry policy; do not add a paid search plan.
- **Brevo:** create a free account for transactional email. The free plan has a daily sending limit; exhaustion marks email retryable/failed while the in-app notice or contact enquiry stays stored for follow-up.

Provider quotas and eligibility can change. The operator must complete any email verification or CAPTCHA and must confirm that the dashboard shows a $0 plan before revealing a key. No credit card is required by this launch procedure; stop if a provider requests one.

## Exact environment destinations

Add these values only in the Contributor deployment project's encrypted **Production** environment. Never use a `NEXT_PUBLIC_` name for a secret, commit `.env.local`, or paste values into a browser bundle.

| Variable | Destination | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Contributor Production | Cloudflare account identifier (not a secret). |
| `CLOUDFLARE_AI_TOKEN` | Contributor Production | Workers AI token; server-only. |
| `CLOUDFLARE_TEXT_MODEL` | Contributor Production | Explicit text model name. |
| `CLOUDFLARE_IMAGE_MODEL` | Contributor Production | Explicit image-safety model name. |
| `CLOUDFLARE_EMBEDDING_MODEL` | Contributor Production | Explicit embedding model name. |
| `TAVILY_API_KEY` | Contributor Production | Research evidence adapter; server-only. |
| `BREVO_API_KEY` | Contributor Production | Transactional email adapter; server-only. |
| `BREVO_SENDER_EMAIL` | Contributor Production | Verified Brevo sender address. |
| `CONTACT_INBOX_EMAIL` | Contributor Production | Operator inbox for stored contact enquiries. |

Leave all provider variables unset while building the site. The server parser intentionally requires them only when the provider-enabled Contributor runtime is used; tests use synthetic values and never make live provider calls.

## Safe rollout

1. Complete one provider account at a time and save the key in the deployment platform, not GitHub Actions logs.
2. Keep provider requests bounded to 15 seconds, one retry maximum, and the existing daily/run caps.
3. Verify one successful fake response and one timeout/quota response in CI or local HTTP-fake tests. Do not use a live token as a test fixture.
4. Confirm a provider failure routes a submission to `manual_review`; it must never auto-approve, publish, or discard work.
5. Confirm contact enquiries are inserted before Brevo delivery. A missing or exhausted email configuration leaves `delivery_state=failed` for admin follow-up.
6. Rotate a key from the provider dashboard if it appears in logs or a browser bundle. The application does not expose raw provider errors or secrets to contributors.

## $0 launch defaults

Keep `REDEMPTIONS_ENABLED=false` and `ALLOW_FUNDED_REDEMPTIONS=false`. Points are internal beta recognition only and have no guaranteed cash value. Do not enable cash or gift-card redemption until revenue, reserve funding, regional/tax terms, and a reviewed payout processor are in place.
