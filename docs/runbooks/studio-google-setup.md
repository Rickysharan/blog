# OmniLede Studio Google setup

This runbook connects the existing operator-owned Google services to Studio. The complete setup must remain on free tiers. Do not add a payment card, start a Google Cloud free trial, enable billing, accept a paid upgrade, or enable any service that requires billing. If a step asks for payment, stop and leave that provider unavailable in Studio.

## Before changing Google

1. Confirm the separate Google Cloud project is **OmniLede Studio** and record its project ID without copying credentials into chat, Git, terminal history, or logs.
2. Confirm the stable Studio URL is `https://omnilede-studio.netlify.app` and its exact callback URL is `https://omnilede-studio.netlify.app/api/connections/google/callback`.
3. Confirm the only Studio operator email. Set the same normalized address in Supabase access data, `STUDIO_OPERATOR_EMAIL`, and the OAuth test-user list.
4. Keep `ADSENSE_ENABLED=false`, `COMMERCIAL_FEATURES_ENABLED=false`, and `ADSENSE_SITE_STATUS` at a non-ready value.

## OAuth and APIs

1. Configure the OAuth consent screen for the existing project. Use External/Test mode until the operator-only flow has been verified. Add only the operator as a test user.
2. Enable Google Analytics Data API and Google Search Console API only if the console confirms that billing is not required.
3. Create one Web application OAuth client. Add `https://omnilede-studio.netlify.app` as the authorized JavaScript origin and `https://omnilede-studio.netlify.app/api/connections/google/callback` as the authorized redirect URI. Do not add wildcards, localhost, the public blog, or a deploy-preview URL that changes between builds.
4. Store the client ID and secret directly in the Studio Netlify environment. Generate `GOOGLE_TOKEN_ENCRYPTION_KEY` locally with `openssl rand -base64 32` and store it directly in Netlify. Never place these values in `.env.example`, a deployment log, a screenshot, or Git.
5. Set `GOOGLE_OAUTH_REDIRECT_URI` to the exact callback. Studio rejects any mismatch with `NEXT_PUBLIC_STUDIO_URL`.

## Analytics and Search Console

1. Select or create the free GA4 property and web stream for `https://omnilede-news.netlify.app`. Record the numeric property ID in `GOOGLE_ANALYTICS_PROPERTY_ID`.
2. Add or select the exact URL-prefix Search Console property `https://omnilede-news.netlify.app/`. Complete Google's operator-owned verification flow.
3. Submit `https://omnilede-news.netlify.app/sitemap.xml`. Record the exact property identifier in `GOOGLE_SEARCH_CONSOLE_SITE_URL`.
4. Sign in through Studio as the configured operator, connect each provider, and confirm that disconnected, unavailable, delayed, and stale states remain visible rather than becoming zeroes.

## AdSense remains disabled

Add the public site in the existing operator-owned AdSense account only when the account offers a free application flow. Complete ownership and `ads.txt` checks and record Google's real pending/review state. Do not enable ads during this rollout. Google must report the site as exactly Ready before a later, single-purpose change can set `ADSENSE_ENABLED=true`.

If Google requires billing or a purchase at any point, leave the connection or application incomplete and record the provider as unavailable. OmniLede must never invent approval, readiness, traffic, or earnings.
