# Contributor publication recovery

This runbook is for an authorised OmniLede operator responding to a failed or ambiguous contributor publication. Git is the public article record; Supabase is the contributor workflow, publication and points record. Never repair one side by silently deleting or rewriting evidence on the other.

## First response

1. Pause the publication worker if failures are repeating or authentication is uncertain.
2. Record the submission ID, submission version, publication ID, outbox ID, article slug, current state, attempt count and last error code. Do not copy article bodies, tokens or signatures into tickets or chat.
3. Check the exact canonical path `content/articles/<category>/<slug>.mdx` and search published frontmatter for the publication ID.
4. Check the Supabase `publications` row, outbox lease/error state and wallet transaction idempotency key. Do not update balances, outbox rows or decisions directly.
5. Choose the matching case below. A retry must use the audited RPC/worker path and the immutable approved payload.

## `publishing_failed`

- Confirm whether the failure is validation, image preparation, receiver authentication, GitHub conflict, GitHub availability or database acknowledgement.
- Validation and conflict failures go to manual review. Correct the underlying draft through a new submission version; never weaken the renderer or overwrite an existing article.
- For a transient provider failure, use the audited admin retry operation with an operator ID and reason. Confirm the old lease has expired before retrying.
- After retry, verify one canonical MDX path, one `publications` row and one wallet earn idempotency key for the publication ID.

## Git commit exists but database acknowledgement is missing

1. Verify that the committed file parses, matches the category/slug, and contains the same publication ID and approved payload.
2. Do not create another commit. Re-run the leased worker item. The blog repository adapter must return the immutable existing commit as a replay.
3. Let `complete_publication_outbox` reconcile the commit receipt, publication row and points transaction atomically.
4. Confirm the Git history still has one publication commit and that the ledger has exactly one earn transaction. If content differs, stop and send the item to manual review.

## Duplicate slug or publication identity

- If the path contains different content, do not overwrite it. Check whether its publication ID belongs to the same approved submission.
- If the same publication ID exists at another canonical path, preserve that path and investigate the producer state.
- A new slug is allowed only through a new reviewed submission version when no public commit already represents that publication. Record the reason in review evidence.

## Netlify deploy fails after the Git commit

- Treat the Git commit as durable and the public deployment as incomplete. The worker must leave the publication retryable and uncredited until the final article returns its matching publication ID. Do not create another commit, reverse points or edit the MDX merely to trigger another build.
- Inspect the failed Netlify deploy log without exposing environment values. Fix the build/configuration issue and retry that deploy from the existing commit.
- Let the publication worker replay the existing Git receipt and probe the canonical article again. Verify contributor attribution, source footer, image and disclaimers after the deploy succeeds. Only then may the completion RPC record the publication and its one points credit.

## Published image derivative mismatch

- Stop the item if the derivative path, publication ID, media type, dimensions or content do not match the approved private image.
- Verify ownership using the bound `<author>/<submission>/<object>` private path. Never substitute another contributor’s object.
- Regenerate the WebP derivative at the deterministic publication path, then retry the unchanged publication payload. If an incompatible public object already exists, keep the item in manual review rather than overwriting it.

## Secret rotation

### Publication HMAC secret

1. Pause the contributor publication worker.
2. Generate a new high-entropy secret in an approved password/secret tool; never paste it into source control or this runbook.
3. Replace the blog receiver secret and the contributor sender secret in their provider dashboards during the same maintenance window.
4. Deploy both configurations, run one signed disposable fixture, and verify rejection with the retired secret.
5. Resume the worker and remove the old value from every environment.

### GitHub publication credential

1. Pause publishing and create a fine-grained credential limited to the selected repository and required Contents write access.
2. Replace only the blog-side `GITHUB_PUBLISH_TOKEN`, deploy, and verify an isolated commit/replay fixture.
3. Revoke the old credential and record the rotation date/owner in credential metadata—never the credential value.

## Completion evidence

A recovered publication is complete only when all are true:

- the canonical MDX is present at one path and parses successfully;
- the immutable Git commit SHA/URL is stored in one publication row;
- the live Netlify URL renders the article, attribution, licence context and source;
- the wallet has exactly one earn transaction for the publication ID;
- the outbox is complete, with no stale lease or scheduled retry;
- the incident/retry has an actor, reason and timestamp in audit evidence.
