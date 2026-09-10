# Supabase provisioning runbook

This runbook keeps the OmniLede ecosystem on Supabase's free tier and prevents an existing project from being modified accidentally. The migrations are local artifacts until the target gate below is satisfied.

The Supabase JavaScript client is pinned to a release that requires Node.js 22 or newer. Configure Node 22+ in each free hosting build environment before deploying.

## Local verification

1. Install and start Docker Desktop (**Manual — required for local Supabase**).
2. From the repository root run `npm run db:reset`.
3. Run `npm run db:test` and inspect every pgTAP result.
4. Run `npm run db:types` only against the reviewed local schema or the confirmed cloud project; never commit types generated from an unknown target.

Without Docker, these commands must be reported as **Manual — blocked by local runtime**. A failed local command does not authorize a cloud fallback.

## Choose a cloud path

### A. Dedicated existing project

**Manual — operator action required:** log in to Supabase, select the dedicated OmniLede project, and copy its project ref and URL. Do not select a project by a similar name. Confirm the organization, region, and current billing screen shows `$0` before proceeding.

Set the following locally (never commit the values):

```text
SUPABASE_PROJECT_REF=<exact-project-ref>
SUPABASE_TARGET_JSON={"projectRef":"<exact-project-ref>","projectUrl":"https://<exact-project-ref>.supabase.co"}
CONFIRMED_SUPABASE_PROJECT_REF=<repeat-the-exact-project-ref>
KNOWN_SUPABASE_PROJECT_REFS=<comma-separated refs discovered during review>
```

Run `npm run db:verify-target`. The guard rejects a missing target, a URL/ref mismatch, and any known existing project without exact confirmation.

### B. New Free project

**Manual — operator action required:** create a new Supabase project, choose the organization and region, and verify the dashboard reports `$0` before confirming. Complete any CAPTCHA or email verification yourself. Reveal publishable/secret keys only in the dashboard and store them in the deployment platform's encrypted environment-variable UI.

After the project is created, set the same verifier variables, run `npm run db:verify-target`, and review the migration diff. Only after the operator confirms the exact ref may an authorized operator apply migrations and generate `packages/contracts/src/database.generated.ts`.

## Cloud application gate

Applying migrations, generating cloud types, or running advisors is intentionally **Manual — requires exact project confirmation**. No script in this repository logs in, creates a project, selects an organization/region, solves CAPTCHA, reveals keys, or mutates a cloud database.

Before application, record:

- exact project ref and URL;
- organization and region;
- free-tier/$0 confirmation;
- operator confirmation of the exact project ref;
- migration/test output and any advisor findings.

Do not use an existing project merely because it is available in a connected account. If a critical RLS finding appears, stop and resolve it before continuing.
