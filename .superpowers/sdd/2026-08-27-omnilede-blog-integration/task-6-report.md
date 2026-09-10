# Task 6 report: exactly-once contributor publication

## Status

DONE. Implemented and reviewed the Contributor publication outbox, private-image
derivative, signed blog client, bounded authenticated worker routes, atomic receipt
acknowledgement, and exactly-once points credit. The required unique migration is
`supabase/migrations/20260828221318_publication_outbox.sql`; the pgTAP file remains
`supabase/tests/010_publication_outbox.sql`.

The post-review hardening is implemented in the separately generated migration
`supabase/migrations/20260902145111_publication_outbox_hardening.sql` and pgTAP suite
`supabase/tests/011_publication_outbox_hardening.sql`. The original migration remains
unchanged.

## Implementation

- Approval creates one private outbox row per submission/version and one publication
  identity. Claims use `FOR UPDATE SKIP LOCKED`; completion and failure are guarded
  by worker ID, lease token, and unexpired lease.
- The only public outbox RPC wrappers are claim, complete, fail, and audited admin
  retry. All four revoke default/anon/authenticated access and grant only
  `EXECUTE` to `service_role`; the private table is RLS-forced and directly revoked.
- A successful, context-bound receipt atomically records the publication and invokes
  the wallet ledger with `publication:{publicationId}` as its idempotency key. A
  replay returns the prior receipt and cannot issue another credit.
- Publication network I/O occurs in the Node worker after the short claim RPC and
  before the short completion/failure RPC. Route calls are fixed at one item/15 s
  internally and five items/20 s for cron; the worker also clamps those limits.
- The client signs canonical JSON with timestamp, UUID nonce, fixed audience, and
  HMAC-SHA256. It rejects redirects, caps the receiver body at 64 KiB while
  streaming, keeps the timeout active through body parsing, and binds the returned
  publication ID, commit SHA/URL, article path, and article URL to the request.
- Private JPEG, PNG, and WebP originals must use canonical owner/submission/object
  paths. Decoded format must match the suffix; inputs are capped at 8 MiB, 8000 px
  per side, and 40 MP. Sharp re-encodes metadata-free WebP at most 1600 px and
  4 MiB, then writes only `published-images/{publicationId}.webp` with no upsert.
  Retry accepts only an existing byte-identical derivative.
- Contributors may update private originals only while their linked submission is
  `draft` or `changes_requested`; review-started originals are immutable.
- Retry exhaustion persists `publishing_failed`, a controlled error reason, and a
  pipeline warning without points. Audited admin retry resets the bounded attempt
  count and clears the global pause only when retrying the row that caused a pause.

## Review fixes and TDD evidence

Review-driven tests were made red before each correction. They exposed and fixed:

- JPEG/PNG rejection, suffix/content mismatches, and over-restrictive non-v4 owner
  or object UUID handling in the derivative path.
- Redirect following, a timeout that ended before receipt parsing, unbounded
  chunked receipt buffering, and acceptance of unbound commit/article receipt URLs.
- Starting a publication after image preparation consumed the wall-time budget and
  hanging image preparation that could outlive the invocation cap.
- Clearing an unrelated global integration pause during admin retry, mutable
  review-started originals, weak malformed receipt coverage, and a rejection test
  that did not exercise the approval-reversal trigger directly.

Final focused verification passes 6 files and 54 tests.

The follow-up review fix round was also driven from observed red tests. It now:

- enforces the same 120-character source-name limit in the contributor contract,
  editor and publication snapshot boundary;
- records the complete canonical publication claim at the exact approved submission
  version and decision timestamp, then prevents that snapshot from being rewritten;
- rejects status-only approvals that have no matching immutable approve decision;
- generates valid slugs no longer than 120 characters, including the `-<8hex>`
  suffix, and removes a separator exposed by truncation;
- claims and completes from the immutable snapshot, so later profile/submission
  mutations and lost acknowledgements cannot change the article bytes or recipient;
- terminalizes malformed and retry-exhausted claims without blocking later rows;
- passes an `AbortSignal` to every Supabase RPC query using `.abortSignal(signal)`,
  applies per-RPC deadlines, and reserves invocation time for success/failure
  acknowledgement.

The focused contract/outbox verification now passes 2 files and 27 tests. The new
pgTAP hardening suite contains 23 assertions covering the snapshot, evidence, slug,
malformed-row and exhausted-lease paths.

## SQL and pgTAP scrutiny

The migration has balanced function bodies (10 functions, 10 `as $$` openings, and
10 closing delimiters) and contains no network extension or HTTP call. The static
contract check confirms 57 pgTAP assertions, four matching revoke/grant pairs for
service-only public RPCs, `FOR UPDATE SKIP LOCKED` claims, lease-token/expiry CAS,
and the idempotent wallet-credit key. The tests cover approval replay, concurrent
claims, lease expiry/reclaim, stale completion rejection, malformed receipts before
credit, completion replay, retry-budget exhaustion, sanitized failure state,
pipeline warning, audited admin retry, global-pause isolation, and the exact
approval-reversal guard error.

## Verification

    npx vitest run --config vitest.config.ts \
      apps/contributor/lib/env.test.ts \
      apps/contributor/lib/publication/prepare-image.test.ts \
      apps/contributor/lib/publication/client.test.ts \
      apps/contributor/lib/publication/outbox.test.ts \
      apps/contributor/app/api/internal/publish/route.test.ts \
      apps/contributor/app/api/cron/publish/route.test.ts
    Passed: 6 files, 54 tests.

    npm test
    Passed: 99 files, 517 tests.

    npm run test:all
    Passed: root 99 files/517 tests plus all Contributor, Ops, config,
    contracts, and UI workspace suites.

    npm run lint
    Passed with zero warnings.

    npm run typecheck:all
    Passed for root and every workspace with a typecheck script.

    npm run validate:content
    Passed: 18 published, 0 drafts, 0 errors.

    npm run build:all
    Passed: blog, Contributor, and Ops Next.js 16.3.3 production builds.

    npm ls sharp --workspace @omnilede/contributor --depth=0
    Passed: exact direct dependency `sharp@0.35.4`.

    git diff --cached --check
    Passed with no output for the complete staged Task 6 patch.

    staged credential scan and Contributor client-bundle secret-name scan
    Passed with no credential material or server secret names in static bundles.

A focused Codex Security diff scan reviewed the authoritative 14 changed source
items plus the lockfile and pgTAP file. It completed with no reportable findings.

## Environment limitation

    npm run db:test
    Not runnable: `supabase test db` could not connect to local PostgreSQL.

Docker is unavailable on this host (`docker: command not found`), so pgTAP could
not be executed. The current CLI reports a local PostgreSQL connection failure.
No Supabase cloud project, GitHub receiver, deployment, token,
network mutation, push, or other cloud state was touched. Static SQL and pgTAP
review is complete, but a Docker-enabled environment must run `npm run db:test`
before deployment.

## Concerns

- Runtime PostgreSQL syntax/behavior and all 57 pgTAP assertions remain unexecuted
  solely because the required local database runtime is unavailable.
- An image transform that times out cannot be forcibly canceled by Sharp/Storage;
  a late write is limited to the immutable publication UUID, uses no upsert, and
  must be byte-identical on replay. It cannot acknowledge a commit or credit points.
- The production blog/Supabase origins and all three 32+ character publication
  secrets must be configured server-side before enabling either worker route.
