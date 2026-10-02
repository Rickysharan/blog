# SDD ledger — plan: docs/superpowers/plans/2026-10-02-omnilede-studio-growth.md

Branch start: `f4d221670859ffd2f1e5e990b01e9fd7c5986c60`
Workspace: `/Users/ricky/Documents/ChatGPT/time pass/omnilede/.worktrees/omnilede-studio`
Baseline: `npm test` — 126 files, 721 tests passed after a clean `npm ci`.

## Preflight consistency scan

| Tasks | Shared file/interface | Finding |
|---|---|---|
| 1 | Own files, tests, and produced auth/PWA interfaces | Internally consistent; migration test path is listed and routes match the shell contract. |
| 2 | Own files, tests, and `DraftRepository` package interface | Internally consistent; root re-exports preserve the blog until Task 10. |
| 3 | Own routes/UI/tests and Task 2 `DraftRepository` | Internally consistent; API payload and confirmation fields cover Save/Publish conflicts. |
| 4 | Own dashboard/task/health files and Task 1 contracts | Internally consistent; hosted Today tasks remain separate from local daily-plan v1 compatibility. |
| 5 | Own Swift/web bridge files and Task 4 category/task data | Internally consistent; bridge input and browser event output are explicit. |
| 6 | Own OAuth/vault/cache files and Task 1 database/contracts | Internally consistent; report state vocabulary matches Task 1. |
| 7 | Own provider/report files and Tasks 4/6 report/task interfaces | Internally consistent; adapters consume the cache and suggestions consume idempotent Today upserts. |
| 8 | Own AdSense/revenue/blog gate files and Task 6 cache | Internally consistent; activation predicate adds to existing commercial/consent gates. |
| 9 | Own topic/SEO files and Task 4 Today upsert | Internally consistent; topic threshold and stable article identities match the spec. |
| 10 | Own deployment/E2E/retirement files and Tasks 1-9 | Internally consistent; retirement is ordered after a signed preview verdict. |
| 1, 6 | `apps/ops/lib/env.ts`, `apps/ops/.env.example` | Task 1 establishes core Studio/auth variables; Task 6 extends the same schema with Google secrets. No contradiction. |
| 1, 10 | PWA routes/cache and PWA E2E | Task 10 verifies the exact network-only behavior Task 1 produces. |
| 2, 3 | `DraftRepository` and Studio content API | Task 3 consumes the exact shared package interface Task 2 produces. |
| 3, 10 | Content API/editor and controlled rollout publish | Task 10 verifies Task 3 against a safe branch before retirement. |
| 4, 5 | category/task data and native writer controls | Task 5 consumes the exact six slugs and exposes capability without changing hosted task persistence. |
| 4, 7 | `apps/ops/app/(studio)/overview/page.tsx` | Task 4 creates source-aware placeholders; Task 7 replaces provider sections with real report envelopes. No contradictory ownership. |
| 5, 10 | `Start OmniLede.command` | Task 5 preserves the local process protocol; Task 10 changes only the review destination after Studio is validated. |
| 6, 7, 8 | provider token/cache interfaces | GA4, Search Console, and AdSense use the same encrypted token and truthful report-envelope rules. |
| 8, 10 | AdSense readiness and production rollout | Task 10 submits for review while Task 8's three-part gate keeps ads disabled until Ready. |
| 9, 10 | sitemap/SEO evidence and real Search Console setup | Task 9 prepares crawlable output; Task 10 verifies ownership and submits the existing sitemap. |

Preflight result: no plan/spec contradictions found. External account consent, provider application submission, deployment, and production publication remain gated by the user's existing authorization and any interactive provider prompts; no agent may expose secrets in reports or commits.

Ruling: Keep the complete OmniLede Studio stack at £0 — use only free tiers and local Ollama, never enter a card, enable billing, accept a paid upgrade, or add a billable API; if a planned provider requires payment, preserve the feature as disconnected/unavailable and use a free alternative where one exists — if wrong, some provider functionality may remain unavailable rather than incur cost.

Task 1: fix round 1/5 (2 addressed, 0 open — service-role TRUNCATE privilege removed; task state/timestamp contracts aligned; commits 5a974c7..ec646bc)
Task 1: verification note — executable pgTAP coverage was added and independently reviewed, but `npm run db:test` cannot connect because Docker Desktop reports "unable to start"; rerun before production migration.
Task 1: complete (commits f4d2216..ec646bc, review clean)

Ruling: Continue from a standalone local clone at `/Users/ricky/.codex/worktrees/omnilede-studio` based on current `origin/main`, overlaying the already reviewed local code while preserving current remote `content/**` — the Documents file provider repeatedly offloaded Git objects and dependencies, making reliable builds impossible — if wrong, the relocation snapshot may need to be rebuilt from the original reviewed commits before merge.
Relocation verification: `npm test` found one inherited remote-main failure: `lib/content/articles.test.ts` expects exactly 18 articles while preserved current content contains 22; production code was not implicated.
