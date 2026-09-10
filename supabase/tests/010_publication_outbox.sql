begin;

select plan(57);

select has_table('app_private', 'publication_outbox', 'publication outbox is private');
select ok((select relrowsecurity from pg_class where oid = 'app_private.publication_outbox'::regclass), 'outbox has RLS enabled');
select ok(not has_table_privilege('anon', 'app_private.publication_outbox', 'SELECT'), 'anonymous cannot read the outbox');
select ok(not has_table_privilege('authenticated', 'app_private.publication_outbox', 'SELECT'), 'contributors cannot read the outbox');
select ok(not has_table_privilege('service_role', 'app_private.publication_outbox', 'UPDATE'), 'service role cannot mutate the outbox directly');
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'submission_images_update_own'
      and qual like '%draft%'
      and qual like '%changes_requested%'
  ),
  'private originals become immutable when review starts'
);
select has_function('public', 'claim_publication_outbox', array['uuid', 'integer'], 'claim RPC is exposed narrowly');
select has_function('public', 'complete_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text'], 'completion RPC is exposed narrowly');
select has_function('public', 'fail_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'], 'failure RPC is exposed narrowly');
select has_function('public', 'retry_publication_outbox', array['uuid', 'uuid', 'text'], 'admin retry RPC is exposed narrowly');
select function_privs_are('public', 'claim_publication_outbox', array['uuid', 'integer'], 'service_role', array['EXECUTE'], 'service role can claim work');
select function_privs_are('public', 'claim_publication_outbox', array['uuid', 'integer'], 'authenticated', array[]::text[], 'contributors cannot claim work');
select function_privs_are('public', 'claim_publication_outbox', array['uuid', 'integer'], 'anon', array[]::text[], 'anonymous callers cannot claim work');
select function_privs_are('public', 'complete_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text'], 'service_role', array['EXECUTE'], 'service role can acknowledge work');
select function_privs_are('public', 'complete_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text'], 'authenticated', array[]::text[], 'contributors cannot acknowledge work');
select function_privs_are('public', 'complete_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text'], 'anon', array[]::text[], 'anonymous callers cannot acknowledge work');
select function_privs_are('public', 'fail_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'], 'service_role', array['EXECUTE'], 'service role can record publication failure');
select function_privs_are('public', 'fail_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'], 'authenticated', array[]::text[], 'contributors cannot record publication failure');
select function_privs_are('public', 'fail_publication_outbox', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'], 'anon', array[]::text[], 'anonymous callers cannot record publication failure');
select function_privs_are('public', 'retry_publication_outbox', array['uuid', 'uuid', 'text'], 'service_role', array['EXECUTE'], 'service role can invoke an audited admin retry');
select function_privs_are('public', 'retry_publication_outbox', array['uuid', 'uuid', 'text'], 'authenticated', array[]::text[], 'contributors cannot retry publication work');
select function_privs_are('public', 'retry_publication_outbox', array['uuid', 'uuid', 'text'], 'anon', array[]::text[], 'anonymous callers cannot retry publication work');
select has_index('app_private', 'publication_outbox', 'publication_outbox_submission_version_key', 'one outbox row exists per approved version');
select has_trigger('public', 'submissions', 'submissions_enqueue_publication', 'approval enqueues publication work');
select has_trigger('public', 'submissions', 'submissions_reject_after_approval_guard', 'approved work cannot later be rejected');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'outbox-author@example.invalid', '', now(), '{}', '{"display_name":"Outbox Author"}'),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'outbox-reviewer@example.invalid', '', now(), '{}', '{}');

select app_private.set_audit_context('system', null, 'Publication outbox test fixtures');
insert into public.roles(user_id, role)
values
  ('30000000-0000-4000-8000-000000000002', 'reviewer'),
  ('30000000-0000-4000-8000-000000000002', 'admin');

insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path,
  guidelines_version, guidelines_accepted, status, submitted_at
) values (
  '30000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000001',
  'Publication outbox fixture',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Fixture body"}]}]}',
  'finance', 'global', 'en', 'Fixture Source', 'https://example.test/source',
  '30000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000010/30000000-0000-4000-8000-000000000011.webp',
  '2026-08-27', true, 'under_review', now()
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select app_private.apply_review_decision(
  '30000000-0000-4000-8000-000000000010', 1, 'reviewer',
  '30000000-0000-4000-8000-000000000002', 'approve', 'Fixture approval is ready to publish'
);

reset role;
select is((select count(*)::integer from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000010'), 1, 'approval creates one outbox row');
select is((select count(*)::integer from public.publications where submission_id = '30000000-0000-4000-8000-000000000010'), 1, 'approval creates one publication row');
select is((select status::text from public.submissions where id = '30000000-0000-4000-8000-000000000010'), 'approved', 'approval preserves the approved state until claimed');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select app_private.apply_review_decision(
  '30000000-0000-4000-8000-000000000010', 1, 'reviewer',
  '30000000-0000-4000-8000-000000000002', 'approve', 'Fixture approval is ready to publish'
);
reset role;
select is((select count(*)::integer from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000010'), 1, 'approval replay does not duplicate the outbox');

create temporary table claimed_publication(payload jsonb);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into claimed_publication
select public.claim_publication_outbox('30000000-0000-4000-8000-000000000020', 60);
reset role;
select ok((select payload is not null from claimed_publication), 'a worker claims approved work');
select is((select state from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000010'), 'processing', 'claim changes outbox state');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.claim_publication_outbox('30000000-0000-4000-8000-000000000021', 60), null::jsonb, 'a concurrent worker cannot claim an active lease');

reset role;
update app_private.publication_outbox
set lease_expires_at = now() - interval '1 second'
where submission_id = '30000000-0000-4000-8000-000000000010';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  format(
    'select public.complete_publication_outbox(%L::uuid, %L::uuid, %L::uuid, %L, %L, %L, %L)',
    (select payload->>'outboxId' from claimed_publication),
    '30000000-0000-4000-8000-000000000020',
    (select payload->>'leaseToken' from claimed_publication),
    repeat('a', 40),
    'https://github.com/owner/repository/commit/' || repeat('a', 40),
    'content/articles/finance/' || (select payload->>'slug' from claimed_publication) || '.mdx',
    'https://omnilede.example/article/' || (select payload->>'slug' from claimed_publication)
  ),
  null,
  'an expired lease cannot acknowledge a publication'
);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
truncate claimed_publication;
insert into claimed_publication
select public.claim_publication_outbox('30000000-0000-4000-8000-000000000021', 60);
reset role;
select ok((select payload is not null from claimed_publication), 'an expired lease is reclaimable');
select is((select payload->>'attemptCount' from claimed_publication), '2', 'reclaim increments the attempt count');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  format(
    'select public.complete_publication_outbox(%L::uuid, %L::uuid, %L::uuid, %L, %L, %L, %L)',
    (select payload->>'outboxId' from claimed_publication),
    '30000000-0000-4000-8000-000000000021',
    (select payload->>'leaseToken' from claimed_publication),
    repeat('a', 40),
    'https://github.com/owner/repository/commit/' || repeat('a', 40),
    'content/articles/finance/' || (select payload->>'slug' from claimed_publication) || '.mdx',
    'https://omnilede.example?leak=/article/' || (select payload->>'slug' from claimed_publication)
  ),
  null,
  'receipt acknowledgement rejects a malformed article URL before credit'
);
select public.complete_publication_outbox(
  ((select payload->>'outboxId' from claimed_publication))::uuid,
  '30000000-0000-4000-8000-000000000021',
  ((select payload->>'leaseToken' from claimed_publication))::uuid,
  repeat('a', 40),
  'https://github.com/owner/repository/commit/' || repeat('a', 40),
  'content/articles/finance/' || (select payload->>'slug' from claimed_publication) || '.mdx',
  'https://omnilede.example/article/' || (select payload->>'slug' from claimed_publication)
);
reset role;
select is((select count(*)::integer from public.publications where submission_id = '30000000-0000-4000-8000-000000000010' and state = 'published'), 1, 'publication is recorded once');
select is((select state from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000010'), 'published', 'outbox is completed once');
select is((select count(*)::integer from public.wallet_transactions where idempotency_key like 'publication:%'), 1, 'wallet credit is recorded once');
select is((select balance_points from public.wallet_accounts where user_id = '30000000-0000-4000-8000-000000000001'), 25::numeric, 'wallet balance receives the configured points once');
select is((select status::text from public.submissions where id = '30000000-0000-4000-8000-000000000010'), 'published', 'successful acknowledgement publishes the submission');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.complete_publication_outbox(
  ((select payload->>'outboxId' from claimed_publication))::uuid,
  '30000000-0000-4000-8000-000000000021',
  ((select payload->>'leaseToken' from claimed_publication))::uuid,
  repeat('a', 40),
  'https://github.com/owner/repository/commit/' || repeat('a', 40),
  'content/articles/finance/' || (select payload->>'slug' from claimed_publication) || '.mdx',
  'https://omnilede.example/article/' || (select payload->>'slug' from claimed_publication)
);
reset role;
select is((select count(*)::integer from public.wallet_transactions where idempotency_key like 'publication:%'), 1, 'completion replay never duplicates wallet credit');

select app_private.set_audit_context('system', null, 'Publication retry-budget test fixture');
insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path,
  guidelines_version, guidelines_accepted, status, submitted_at
) values (
  '30000000-0000-4000-8000-000000000030',
  '30000000-0000-4000-8000-000000000001',
  'Publication failure fixture',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Failure fixture body"}]}]}',
  'finance', 'global', 'en', 'Fixture Source', 'https://example.test/source',
  '30000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000030/30000000-0000-4000-8000-000000000031.png',
  '2026-08-27', true, 'under_review', now()
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select app_private.apply_review_decision(
  '30000000-0000-4000-8000-000000000030', 1, 'reviewer',
  '30000000-0000-4000-8000-000000000002', 'approve', 'Fixture approval exercises the retry budget'
);
reset role;
update app_private.publication_outbox
set max_attempts = 1
where submission_id = '30000000-0000-4000-8000-000000000030';

create temporary table failed_publication(payload jsonb);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into failed_publication
select public.claim_publication_outbox('30000000-0000-4000-8000-000000000040', 60);
reset role;
select ok((select payload is not null from failed_publication), 'retry-budget fixture is leased');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.fail_publication_outbox(
  ((select payload->>'outboxId' from failed_publication))::uuid,
  '30000000-0000-4000-8000-000000000040',
  ((select payload->>'leaseToken' from failed_publication))::uuid,
  'retry', 'service_unavailable', 'Publication receiver is temporarily unavailable', now() + interval '1 minute'
);
reset role;
select is((select state from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000030'), 'failed', 'retry budget exhaustion makes the outbox terminal');
select is((select status::text from public.submissions where id = '30000000-0000-4000-8000-000000000030'), 'publishing_failed', 'retry budget exhaustion persists publishing_failed');
select is((select state::text from public.publications where submission_id = '30000000-0000-4000-8000-000000000030'), 'failed', 'retry budget exhaustion marks the publication failed');
select is((select last_error_reason from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000030'), 'Publication receiver is temporarily unavailable', 'only the controlled failure reason is persisted');
select ok(exists(select 1 from public.pipeline_events where submission_id = '30000000-0000-4000-8000-000000000030' and event_type = 'publishing_failed'), 'retry budget exhaustion leaves a pipeline warning');
select is((select count(*)::integer from public.wallet_transactions where idempotency_key like 'publication:%'), 1, 'failed publication does not receive points');

update app_private.settings
set value = 'true'::jsonb, updated_at = now()
where key = 'BLOG_PUBLISHING_PAUSED';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.retry_publication_outbox(
  (select publication_id from public.publications where submission_id = '30000000-0000-4000-8000-000000000030'),
  '30000000-0000-4000-8000-000000000002',
  'Admin retries corrected publication work'
);
reset role;
select is((select state from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000030'), 'retryable', 'admin retry makes terminal work retryable');
select is((select attempt_count from app_private.publication_outbox where submission_id = '30000000-0000-4000-8000-000000000030'), 0, 'admin retry resets the bounded attempt count');
select is((select status::text from public.submissions where id = '30000000-0000-4000-8000-000000000030'), 'publishing', 'admin retry returns the submission to publishing');
select is((select value from app_private.settings where key = 'BLOG_PUBLISHING_PAUSED'), 'true'::jsonb, 'retrying non-paused work cannot clear a global integration pause');
update app_private.settings
set value = 'false'::jsonb, updated_at = now()
where key = 'BLOG_PUBLISHING_PAUSED';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$update public.submissions
    set status = 'rejected'
    where id = '30000000-0000-4000-8000-000000000010'$$,
  'approved_submission_decision_is_final',
  'rejection after approval is forbidden'
);

reset role;
select ok(exists(select 1 from public.audit_log where target_type = 'publication_outbox'), 'outbox changes are audited');
select ok(exists(select 1 from public.pipeline_events where submission_id = '30000000-0000-4000-8000-000000000010' and event_type = 'published'), 'publication success leaves a pipeline event');
select is((select value from app_private.settings where key = 'BLOG_PUBLISHING_PAUSED'), 'false'::jsonb, 'publishing integration starts enabled');

select * from finish();
rollback;
