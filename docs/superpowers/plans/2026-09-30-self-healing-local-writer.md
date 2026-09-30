# Self-Healing Local Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one OmniLede desktop launch recover predictable failures and either deliver one fully validated draft or preserve the work with one clear recovery action.

**Architecture:** A typed recovery controller in the Node worker owns stages, bounded retries, resumable state, and safety policy. The Swift app consumes structured events and presents progress, repairs, cancellation, and resume controls without implementing recovery rules itself.

**Tech Stack:** TypeScript, Node.js 22, Zod, Vitest, Swift/AppKit, Ollama HTTP API, GitHub Git Data API, Wikimedia Commons API.

**Spec:** `docs/superpowers/specs/2026-09-30-self-healing-local-writer-design.md`

## Global Constraints

- Retry a recoverable stage at most two times after its initial attempt.
- Use only the installed local Ollama model; never switch to a cloud model or paid provider.
- Never publish, discard, delete, or overwrite a remote draft automatically.
- Never install or download a model automatically.
- Preserve local drafts and resumable state whenever a run does not finish.
- Deliver only articles with two or three relevant, reusable pictures and complete credits.
- Store no password, token, cookie, or complete environment value in run state or logs.
- Keep existing queue and draft formats compatible.

## Review Focus

- The app is killed during an atomic state update: the previous valid state remains readable and resumes from its last verified stage (Task 1 test).
- A lock records a dead process or a reused process ID: only a lock whose recorded process identity is not alive is removed (Task 2 test).
- GitHub creates a draft but the response is lost: reconciliation reads identical remote bytes and reports delivered without a duplicate commit (Task 5 test).
- Every feed fails and the saved queue is empty or corrupt: the app stops with preserved state instead of inventing a source or silently replacing the queue (Task 6 test).
- Image search returns two valid photos, one valid photo, duplicates, or unrelated results: two are accepted; fewer than two prevents delivery and preserves the local text draft (Task 4 tests).

---

### Task 1: Recovery Protocol and Durable Run State

**Files:**
- Create: `lib/pipeline/local-run-types.ts`
- Create: `lib/pipeline/run-state.ts`
- Test: `lib/pipeline/run-state.test.ts`

**Interfaces:**
- Produces: `LocalRunStage`, `RecoveryCategory`, `LocalWriterEvent`, `LocalRunState`, `LocalRunResult`, `loadRunState(path)`, `saveRunState(path, state)`, `archiveInvalidRunState(path, now)`.
- Consumes: Node filesystem promises and Zod.

- [ ] **Step 1: Write failing run-state tests**

Add tests named `round-trips non-secret resumable state atomically`, `keeps the prior valid file when replacement fails`, `rejects secrets and malformed stage data`, and `archives malformed state without deleting drafts`. Use a temporary directory and literal state fixtures.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- lib/pipeline/run-state.test.ts`

Expected: FAIL because the modules and interfaces do not exist.

- [ ] **Step 3: Implement the recovery types and state store**

Define the eight stage names from the spec. Define discriminated event/result types carrying run ID, stage, attempt, percent, status, message, draft reference, image count, repairs, and sanitized error category. Implement Zod validation and write-to-temporary-then-rename persistence; reject keys or values representing credentials.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- lib/pipeline/run-state.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the recovery protocol**

Run `git add lib/pipeline/local-run-types.ts lib/pipeline/run-state.ts lib/pipeline/run-state.test.ts`, then run `git commit -m "Add durable local writer recovery state"`.

### Task 2: Owned Lock and Local Ollama Repair

**Files:**
- Create: `lib/pipeline/local-runtime.ts`
- Test: `lib/pipeline/local-runtime.test.ts`
- Modify: `Start OmniLede.command`

**Interfaces:**
- Consumes: `RecoveryCategory` and repair descriptions from Task 1.
- Produces: `acquireWriterLock(options): Promise<WriterLock>`, `ensureLocalModel(options): Promise<RuntimeCheckResult>`, and `WriterLock.release(): Promise<void>`.

- [ ] **Step 1: Write failing runtime tests**

Cover a live matching process, a dead process, a reused PID with a different start identity, malformed lock metadata, healthy Ollama, Ollama repaired by one restart, restart exhaustion after two attempts, and a missing model that never triggers a download.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- lib/pipeline/local-runtime.test.ts`

Expected: FAIL because `local-runtime.ts` does not exist.

- [ ] **Step 3: Implement owned locking and Ollama health repair**

Use dependency-injected process inspection, health fetch, and process spawning so tests stay local. Store PID plus process start identity in the lock. Start Ollama with `OLLAMA_NO_CLOUD=1` and the loopback host, wait by condition, and return sanitized repair records. Keep `Start OmniLede.command` as a thin launcher that no longer owns recovery policy.

- [ ] **Step 4: Run runtime and shell checks**

Run `npm test -- lib/pipeline/local-runtime.test.ts`, then run `bash -n 'Start OmniLede.command'`.

Expected: tests PASS and shell syntax exits 0.

- [ ] **Step 5: Commit local runtime recovery**

Run `git add lib/pipeline/local-runtime.ts lib/pipeline/local-runtime.test.ts 'Start OmniLede.command'`, then run `git commit -m "Repair local writer runtime safely"`.

### Task 3: Deterministic Article Correction

**Files:**
- Create: `lib/pipeline/normalize-draft.ts`
- Test: `lib/pipeline/normalize-draft.test.ts`
- Modify: `lib/pipeline/generate.ts`
- Modify: `lib/pipeline/generate.test.ts`
- Modify: `app/article/[slug]/page.tsx`
- Create: `app/article/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: generated title/body and the existing article schema.
- Produces: `normalizeGeneratedBody(title, body): NormalizedBody` with `body` and `repairs`, plus `requestOllamaDraft` validation errors classified for retry.

- [ ] **Step 1: Write failing normalization and rendering tests**

Cover an exact leading H1, case/spacing variations, a different legitimate subheading, repeated model source lines, unsafe MDX remaining invalid, and an article page rendering the headline and source exactly once.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/pipeline/normalize-draft.test.ts lib/pipeline/generate.test.ts 'app/article/[slug]/page.test.tsx'`

Expected: FAIL on duplicate headline/source behavior or missing normalization module.

- [ ] **Step 3: Implement minimal deterministic correction**

Remove only a leading H1 whose normalized text equals the generated title, remove generated source attribution lines before adding the canonical final source line, retain the required analysis section, and report each repair. Ensure the article page does not add a second source block when the canonical body attribution is present.

- [ ] **Step 4: Expose retryable generation validation**

Return a stable error category for truncated output, invalid JSON, unsafe MDX, missing analysis, and length violations so the controller can regenerate from the original source with the exact validation reason.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- lib/pipeline/normalize-draft.test.ts lib/pipeline/generate.test.ts 'app/article/[slug]/page.test.tsx'`

Expected: PASS; headline and source each render once.

- [ ] **Step 6: Commit article correction**

Run `git add lib/pipeline/normalize-draft.ts lib/pipeline/normalize-draft.test.ts lib/pipeline/generate.ts lib/pipeline/generate.test.ts 'app/article/[slug]/page.tsx' 'app/article/[slug]/page.test.tsx'`, then run `git commit -m "Correct generated article formatting before delivery"`.

### Task 4: Picture Requirement and Verification

**Files:**
- Modify: `lib/pipeline/images.ts`
- Modify: `lib/pipeline/images.test.ts`
- Create: `lib/pipeline/deliverable.ts`
- Test: `lib/pipeline/deliverable.test.ts`

**Interfaces:**
- Consumes: `QueueStory`, `ArticlePhoto`, generated MDX, and injected `FetchLike`.
- Produces: `findRequiredArticlePhotos(story, tags, options): Promise<PhotoSearchResult>` and `validateDeliverable(ref, mdx, options): Promise<DeliverableValidation>`.

- [ ] **Step 1: Write failing picture-policy tests**

Cover three relevant unique photos, two valid photos, one photo, duplicate Commons pages, generic category matches, unsupported MIME types, missing credits, unreachable image responses, and images with unusable dimensions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/pipeline/images.test.ts lib/pipeline/deliverable.test.ts`

Expected: FAIL because the required-photo and deliverable interfaces do not exist.

- [ ] **Step 3: Implement bounded alternative-query search**

Search only named entities present in the source. Try at most two alternative query rounds, deduplicate by Commons page, require allowed commercial reuse licences and complete credits, and verify the remote image response. Return two or three photos or an explicit insufficient-images result.

- [ ] **Step 4: Implement the delivery gate**

Validate frontmatter, filename, safe MDX, required section, exactly one source attribution, no duplicate leading headline, two or three distinct credited photos, and HTTPS destinations. Return stage-specific error categories without weakening the existing schema.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- lib/pipeline/images.test.ts lib/pipeline/deliverable.test.ts`

Expected: PASS; two photos accepted and one photo rejected without deleting the text draft.

- [ ] **Step 6: Commit picture enforcement**

Run `git add lib/pipeline/images.ts lib/pipeline/images.test.ts lib/pipeline/deliverable.ts lib/pipeline/deliverable.test.ts`, then run `git commit -m "Require verified article pictures before delivery"`.

### Task 5: Idempotent Delivery and Reconciliation

**Files:**
- Modify: `lib/pipeline/sync.ts`
- Modify: `lib/pipeline/sync.test.ts`
- Modify: `lib/github/git-data-client.ts`
- Modify: `lib/github/git-data-client.test.ts`

**Interfaces:**
- Consumes: validated local draft bytes, `DraftRef`, and recovery categories from Task 1.
- Produces: `deliverDraft(source, target, ref, options): Promise<DeliveryResult>` with `created`, `alreadyDelivered`, `conflict`, `retryableFailure`, or `humanRequired` outcomes.

- [ ] **Step 1: Write failing delivery reconciliation tests**

Cover network failure before creation, successful creation followed by lost response, 429/5xx bounded retries, identical existing bytes, different existing bytes, published slug conflict, authentication failure, and branch movement during a retry.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/pipeline/sync.test.ts lib/github/git-data-client.test.ts`

Expected: FAIL because current sync returns a generic failed array and does not reconcile uncertain creates.

- [ ] **Step 3: Classify GitHub errors without exposing response bodies or credentials**

Map network errors, 429, and 5xx to retryable outcomes; map authentication, permission, published slug, and byte conflicts to human-required outcomes. Preserve current request size, redirect, and host restrictions.

- [ ] **Step 4: Implement single-draft delivery and read-after-write verification**

Retry with capped backoff twice. After every uncertain create, read the target path: matching bytes mean delivered, missing content means retry, and different bytes mean conflict. Never call save, discard, or publish.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- lib/pipeline/sync.test.ts lib/github/git-data-client.test.ts`

Expected: PASS with no duplicate create and no overwrite on conflict.

- [ ] **Step 6: Commit verified delivery**

Run `git add lib/pipeline/sync.ts lib/pipeline/sync.test.ts lib/github/git-data-client.ts lib/github/git-data-client.test.ts`, then run `git commit -m "Verify and reconcile local draft delivery"`.

### Task 6: Resumable Recovery Controller

**Files:**
- Create: `lib/pipeline/local-run.ts`
- Test: `lib/pipeline/local-run.test.ts`
- Modify: `scripts/local-writer.ts`
- Modify: `docs/runbooks/local-writer.md`

**Interfaces:**
- Consumes: Tasks 1–5 interfaces plus existing feed queue and local repositories.
- Produces: `runLocalWriter(options): Promise<LocalRunResult>` with an `onEvent(event)` callback; the CLI remains an adapter that prints `@omnilede` JSON lines.

- [ ] **Step 1: Write failing controller tests**

Cover the full successful stage order, generation correction on the second attempt, Ollama restart, all feeds failing with a usable saved queue, all feeds failing with an empty/corrupt queue, insufficient images preserving local text, verified upload, resumable interruption, retry exhaustion, cancellation, and sanitized diagnostics.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/pipeline/local-run.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the stage controller**

Persist state after each verified boundary, apply the two-retry policy only to recoverable categories, resume matching unfinished work, emit repair events, and return one terminal result. Reuse the saved queue when live discovery has no successes. Do not upload until deliverable validation passes.

- [ ] **Step 4: Reduce the CLI to a protocol adapter**

Parse existing flags, call `runLocalWriter`, print structured events and a sanitized final message, and set the exit code from the terminal result. Preserve `--sync-only`, `--queue-only`, and `--local-only` semantics.

- [ ] **Step 5: Run controller and existing pipeline tests**

Run: `npm test -- lib/pipeline/local-run.test.ts lib/pipeline/fetch.test.ts lib/pipeline/generate.test.ts lib/pipeline/sync.test.ts`

Expected: PASS; the empty/corrupt queue case ends in human-required state and leaves prior data intact.

- [ ] **Step 6: Update the runbook and commit**

Document repair messages, resume behavior, cancellation, bounded attempts, and `.audit/current-run.json` safety. Run `git add lib/pipeline/local-run.ts lib/pipeline/local-run.test.ts scripts/local-writer.ts docs/runbooks/local-writer.md`, then run `git commit -m "Orchestrate resumable local writer recovery"`.

### Task 7: Native Recovery Experience and End-to-End Verification

**Files:**
- Modify: `desktop/OmniLede.swift`
- Modify: `desktop/install-app.py`
- Create: `desktop/README.md`
- Modify: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `LocalWriterEvent` JSON lines and terminal `LocalRunResult` from Task 6.
- Produces: a desktop window with progress, repair history, Cancel, Resume/Try again, Start a new article, and dashboard controls.

- [ ] **Step 1: Extend native smoke tests before changing UI behavior**

Add smoke scenarios for a repair event, adjusted estimate, user cancellation, resumable failure, successful delivery summary, and separating Resume from Start a new article. Assert button labels, enabled state, status copy, and child-process termination.

- [ ] **Step 2: Run the native smoke tests and verify RED**

Run `swiftc -D DEBUG desktop/OmniLede.swift -o .audit/OmniLede-test -framework AppKit`, then run `.audit/OmniLede-test --smoke-test`.

Expected: FAIL on missing recovery and cancellation UI behavior.

- [ ] **Step 3: Implement the native recovery experience**

Render typed repair events, update estimates after retries, add Cancel while active, show Resume/Try again for unfinished state, keep Start a new article separate, and open the dashboard only after verified delivery. Terminate the child process cleanly on cancel or app exit.

- [ ] **Step 4: Add the authenticated dashboard E2E assertions**

Verify a delivered draft is listed, contains two or three picture blocks, exposes Save and Publish, and remains a draft until an explicit Publish action. Use test storage; never publish a live article from this test.

- [ ] **Step 5: Run full verification**

Run these commands separately: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `bash -n 'Start OmniLede.command'`, `swiftc -D DEBUG desktop/OmniLede.swift -o .audit/OmniLede-test -framework AppKit`, and `.audit/OmniLede-test --smoke-test`.

Expected: all tests and checks pass with no warnings.

- [ ] **Step 6: Reinstall and verify the real desktop flow**

Run `python3 desktop/install-app.py`, verify its ad-hoc signature, launch it, observe a full local run, confirm two or three pictures load, compare uploaded bytes with the local draft, and verify the dashboard lists the draft with Publish present. Do not click Publish.

- [ ] **Step 7: Commit the native experience**

Run `git add desktop/OmniLede.swift desktop/install-app.py desktop/README.md tests/e2e/admin.spec.ts`, then run `git commit -m "Show and control automatic writer recovery"`.

### Task 8: Final Branch Review and Delivery

**Files:**
- Review all files changed by Tasks 1–7.
- Update: `docs/runbooks/local-writer.md` only if verification reveals missing operator guidance.

**Interfaces:**
- Consumes: complete implementation and all verification evidence.
- Produces: review findings resolved, pushed branch, updated pull request, and installed desktop app.

- [ ] **Step 1: Review safety invariants**

Confirm no recovery path calls publish, discard, remote save, paid AI, model download, or editor overwrite; confirm secrets are absent from state, events, and logs.

- [ ] **Step 2: Run the complete verification command again**

Run the exact full command from Task 7 Step 5 after all review fixes.

Expected: every command exits 0 with no warnings.

- [ ] **Step 3: Inspect repository state**

Confirm only intended code and documentation are committed. Preserve queue and local draft files as user data; do not add them to implementation commits.

- [ ] **Step 4: Push and update the existing pull request**

Push `codex/local-article-drafting` and update PR #11 to describe recovery behavior, safety limits, desktop UX, and validation evidence.

- [ ] **Step 5: Hand off the installed app**

Report the exact desktop app location, what it repairs, what still requires the user, the final test counts, and any remaining limitations.
