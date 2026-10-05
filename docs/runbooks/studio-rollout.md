# OmniLede Studio rollout

The Studio rollout is reversible and costs £0. Netlify, Supabase, GitHub, and Google must stay within their free tiers. Do not add a card, enable billing, start a free trial, accept a paid upgrade, or allow usage overages. A provider may remain unavailable instead.

## 1. Prepare the isolated preview

1. Create or reset the dedicated `studio-preview-content` branch from the intended production commit. Protect `main`; the Studio preview token must write only to the preview repository and the configured preview branch.
2. Use the separate Netlify site for `apps/ops` at `https://omnilede-studio.netlify.app` with `apps/ops/netlify.toml`. In Netlify, select repository `Rickysharan/blog`, set the production branch to the reviewed Studio code branch, leave Base directory unset, set Package directory to `apps/ops`, use build command `npm run build:ops`, and publish `apps/ops/.next`. Keep the public blog site unchanged.
3. Set public values: `NEXT_PUBLIC_STUDIO_URL`, `NEXT_PUBLIC_BLOG_URL`, `NEXT_PUBLIC_CONTRIBUTOR_URL`, and Supabase public URL/key.
4. Set server-only values directly in Netlify: Supabase secret key, exact operator email, exact allowed Studio origin, repository and preview branch, least-privilege GitHub content token, Google OAuth values, encryption key, and read-only health/provider values. Never paste a secret into a build log or commit it.
5. Keep `ADSENSE_ENABLED=false` and `COMMERCIAL_FEATURES_ENABLED=false`. Confirm the Netlify account blocks builds at its included allowance and cannot accumulate overages.

The stable Studio origin is `https://omnilede-studio.netlify.app`, and the OAuth redirect must be exactly `https://omnilede-studio.netlify.app/api/connections/google/callback`. Changing deploy-preview URLs are unsuitable for the OAuth client. During the gate, the production, deploy-preview, and branch-deploy contexts must all set `GITHUB_CONTENT_BRANCH=studio-preview-content`; do not point controlled verification at `main`. Change the production context to `main` only after a signed production-candidate verdict authorizes the reader-only production deployment.

## 2. Create the disposable controlled draft

On `studio-preview-content`, add one valid private draft with a unique filename and title. It must be safe to publish and delete. Record its title and category as `STUDIO_E2E_CONTROLLED_DRAFT_TITLE` and `STUDIO_E2E_CONTROLLED_DRAFT_CATEGORY`. Set `STUDIO_E2E_ALLOW_MUTATION=true` only for the one controlled browser run.

Create an authenticated Playwright storage state by signing in as the exact operator. Store the file outside Git with mode `0600`; set `STUDIO_E2E_STORAGE_STATE` to its path. Do not share or commit the session.

## 3. Run the preview checks

```bash
npm run test:all
npm run typecheck:all
npm run lint
npm run build:all
npm run test:e2e:studio
npm run verify:studio-rollout -- --environment preview
```

The browser suite must read the draft at an immutable version, save and read back exact bytes, require the deliberate Publish confirmation, and fetch the published bytes from the returned Git commit. It must also check operator identity, source-backed dashboard states, phone navigation, the manifest, service worker, and offline failure for private navigation.

Build `.audit/studio-rollout-preview.evidence.json` from those observed receipts. It contains no token or session. Set `STUDIO_ROLLOUT_EXPECTED_OPERATOR_EMAIL` to the exact operator, set `STUDIO_ROLLOUT_BLOG_PREVIEW_ORIGIN` to the exact public-blog preview being checked, and set a fresh local `STUDIO_ROLLOUT_SIGNING_SECRET` of at least 32 bytes. The verifier binds evidence to the fixed Studio origin, repository, preview branch, production branch, and OAuth callback. It independently probes the manifest, service worker, each current admin route, the published Git blob, and the exact preview-branch head. Its signed verdict is written mode `0600` under `.audit/` and remains untracked.

Any failed check exits nonzero. A preview verdict may set only `authorizeRetirementPreview`; it never authorizes a production change. Never delete the public blog admin, change `Start OmniLede.command`, or deploy reader-only production from an unsigned, failed, stale, or environment-mismatched verdict.

## 4. Gated retirement and production candidate

Only after the signed preview verdict verifies against the same evidence, trusted configuration, and secret:

1. Create the separate retirement commit that removes the public blog admin pages, APIs, authentication code, and components.
2. Point the native launcher at the exact stable Studio origin and rebuild/sign the app.
3. Deploy the retirement commit to another blog preview and rerun every admin route check, including a representative dynamic draft route.
4. Set `STUDIO_ROLLOUT_BLOG_PREVIEW_ORIGIN` to that retirement preview. Record 404 for every listed admin route, then run the full production-candidate suite and create a separate signed production-candidate verdict. Only that verdict may set `authorizeProductionRetirement`.
5. Deploy Studio first. Verify the real operator session and a fresh controlled draft cycle. Verify the Mac app opens Studio without Terminal or automatic writing, and verify phone installation.
6. Verify the production-candidate verdict against the same evidence, trusted configuration, and secret. Then deploy the reader-only blog and switch Studio publishing to `main`. Monitor the deployment, provider states, sitemap processing, and site health.

Keep the prior blog deployment and native app bundle available for rollback. Roll back Studio or the reader-only blog independently if a gate regresses. Advertising remains disabled throughout; activation requires a later reviewed change after Google reports Ready.
