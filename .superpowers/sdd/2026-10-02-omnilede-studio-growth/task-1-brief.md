### Task 1: Studio database, operator authorization, and responsive PWA shell

**Files:**
- Create: `supabase/migrations/202610020001_studio_control_plane.sql`
- Create: `packages/contracts/src/studio.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/ops/lib/env.ts`
- Modify: `apps/ops/.env.example`
- Create: `apps/ops/lib/auth/operator.ts`
- Create: `apps/ops/app/auth/callback/route.ts`
- Create: `apps/ops/app/(auth)/login/page.tsx`
- Create: `apps/ops/app/(studio)/layout.tsx`
- Create: `apps/ops/components/studio-shell.tsx`
- Create: `apps/ops/app/manifest.ts`
- Create: `apps/ops/app/sw.ts`
- Create: `apps/ops/lib/pwa/runtime-caching.ts`
- Modify: `apps/ops/next.config.mjs`
- Modify: `apps/ops/app/layout.tsx`
- Modify: `apps/ops/app/page.tsx`
- Modify: `apps/ops/app/globals.css`
- Test: `packages/contracts/src/studio.test.ts`
- Test: `tests/database/studio-control-plane.test.ts`
- Test: `apps/ops/lib/auth/operator.test.ts`
- Test: `apps/ops/lib/pwa/runtime-caching.test.ts`
- Test: `apps/ops/app/page.test.tsx`

**Interfaces:**
- Consumes: `requireIdentity(): Promise<VerifiedIdentity>` from `apps/ops/lib/auth/authorization.ts` and the existing server/service Supabase clients.
- Produces: `requireStudioOperator(): Promise<VerifiedIdentity>`; `studioTaskSchema`, `providerStateSchema`, `reportEnvelopeSchema`, and `ReportEnvelope<T>`; responsive routes `/overview`, `/today`, `/categories`, `/content`, `/growth`, `/search`, `/revenue`, `/health`; network-only PWA rules for all authenticated routes and `/api/**`.

- [ ] **Step 1: Write failing schema and migration tests**

  Assert the new contracts accept the six exact category slugs and the report states `connected | delayed | stale | unavailable | disconnected`. Assert the migration defines `studio_tasks`, `provider_connections`, `app_private.provider_credentials`, `provider_report_cache`, and `publication_events`, enables RLS, revokes credential-table access from browser roles, and makes audit/publication records append-only.

- [ ] **Step 2: Run the focused tests and verify failure**

  Run: `npm test -- packages/contracts/src/studio.test.ts tests/database/studio-control-plane.test.ts`

  Expected: FAIL because the Studio contracts and migration do not exist.

- [ ] **Step 3: Add the Studio contracts and database migration**

  Define exact row/input types in `packages/contracts/src/studio.ts`. Store only OAuth status and safe account/property labels in `public.provider_connections`; store AES-GCM ciphertext, IV, authentication tag, scopes, and token expiry in `app_private.provider_credentials`; keep provider reports in bounded JSON with `source`, `range`, `fetchedAt`, `state`, and `data`.

- [ ] **Step 4: Write failing operator authorization tests**

  Test anonymous, suspended, non-admin, wrong-email, forged `user_metadata.role = admin`, and configured active admin cases. The first five must throw `AuthorizationError`; only the exact case-insensitive `STUDIO_OPERATOR_EMAIL` plus server role may pass.

- [ ] **Step 5: Implement `requireStudioOperator()` and Google sign-in callback**

  Add `STUDIO_OPERATOR_EMAIL`, `NEXT_PUBLIC_STUDIO_URL`, and `AUTH_ALLOWED_ORIGINS` to the environment schema. Exchange the Supabase OAuth code only for a same-origin safe redirect and fail closed before rendering any `(studio)` route.

- [ ] **Step 6: Write failing shell and PWA tests**

  Assert desktop sidebar and phone bottom navigation contain all eight Studio destinations. Assert the manifest is standalone and names OmniLede Studio. Assert every private document/API URL resolves to `NetworkOnly`, while only versioned icons and shell assets can use cache-first behavior.

- [ ] **Step 7: Implement the responsive shell, manifest, and service worker**

  Redirect `/` to `/overview` for an allowed session and `/login` otherwise. Reuse the contributor app's Serwist registration pattern but use the stricter Ops cache policy.

- [ ] **Step 8: Verify and commit**

  Run: `npm run test --workspace @omnilede/ops && npm run test --workspace @omnilede/contracts && npm run typecheck --workspace @omnilede/ops && npm run db:test`

  Expected: PASS.

  Commit: `git commit -m "Build protected OmniLede Studio shell"`
