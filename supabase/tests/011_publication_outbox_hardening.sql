begin;

select plan(23);

select has_column('app_private', 'publication_outbox', 'publication_claim', 'outbox stores an immutable publication claim');
select has_function('app_private', 'publication_claim_is_valid', array['jsonb'], 'private claim validator exists');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('31000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'hardening-author@example.invalid', '', now(), '{}', '{"display_name":"Snapshot Contributor"}'),
  ('31000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'hardening-reviewer@example.invalid', '', now(), '{}', '{}');

select app_private.set_audit_context('system', null, 'Publication hardening test fixtures');
insert into public.roles(user_id, role)
values ('31000000-0000-4000-8000-000000000002', 'reviewer');

select throws_ok(
  $$insert into public.submissions (
      id, author_id, title, content_document, category, region, language,
      primary_source_name, primary_source_url, private_image_path,
      guidelines_version, guidelines_accepted, status, submitted_at
    ) values (
      '31000000-0000-4000-8000-000000000009',
      '31000000-0000-4000-8000-000000000001',
      'Source limit fixture',
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Fixture body"}]}]}',
      'finance', 'global', 'en', repeat('s', 121), 'https://example.test/source',
      '31000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000009/31000000-0000-4000-8000-000000000019.webp',
      '2026-08-27', true, 'under_review', now()
    )$$,
  null,
  'submission source names obey the publication 120-character limit'
);

insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path,
  guidelines_version, guidelines_accepted, status, submitted_at
) values (
  '31000000-0000-4000-8000-000000000010',
  '31000000-0000-4000-8000-000000000001',
  'Approval evidence fixture',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Evidence body"}]}]}',
  'finance', 'global', 'en', 'Evidence Source', 'https://example.test/evidence',
  '31000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000010/31000000-0000-4000-8000-000000000020.webp',
  '2026-08-27', true, 'under_review', now()
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$update public.submissions
    set status = 'approved'
    where id = '31000000-0000-4000-8000-000000000010'$$,
  'publication_approval_evidence_missing',
  'direct approval without an exact immutable decision is rejected'
);
reset role;
select is(
  (select count(*)::integer from app_private.publication_outbox where submission_id = '31000000-0000-4000-8000-000000000010'),
  0,
  'approval without evidence enqueues nothing'
);

insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path,
  guidelines_version, guidelines_accepted, status, submitted_at
) values (
  '31000000-0000-4000-8000-000000000011',
  '31000000-0000-4000-8000-000000000001',
  repeat('aa ', 59) || 'aaa',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Original immutable body"}]}]}',
  'finance', 'global', 'en', 'Original Source', 'https://example.test/original',
  '31000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000011/31000000-0000-4000-8000-000000000021.webp',
  '2026-08-27', true, 'under_review', now()
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select app_private.apply_review_decision(
  '31000000-0000-4000-8000-000000000011', 1, 'reviewer',
  '31000000-0000-4000-8000-000000000002', 'approve', 'Snapshot fixture is ready to publish'
);
reset role;

select is(
  ((select publication_claim->>'submissionVersion' from app_private.publication_outbox where submission_id = '31000000-0000-4000-8000-000000000011'))::bigint,
  1::bigint,
  'snapshot binds the exact reviewed pre-update version'
);
select is(
  ((select publication_claim->>'approvedAt' from app_private.publication_outbox where submission_id = '31000000-0000-4000-8000-000000000011'))::timestamptz,
  (select created_at from public.review_decisions where submission_id = '31000000-0000-4000-8000-000000000011' and submission_version = 1 and decision = 'approve'),
  'snapshot uses the immutable approval decision timestamp'
);
select ok(
  char_length((select article_slug from public.publications where submission_id = '31000000-0000-4000-8000-000000000011')) <= 120,
  'a 180-character title produces a slug within the publication limit'
);
select matches(
  (select article_slug from public.publications where submission_id = '31000000-0000-4000-8000-000000000011'),
  '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  'the truncated slug has no dangling or repeated separator'
);
select matches(
  (select article_slug from public.publications where submission_id = '31000000-0000-4000-8000-000000000011'),
  '-[0-9a-f]{8}$',
  'the bounded slug retains its publication suffix'
);
select is(
  (select publication_claim->>'sourceName' from app_private.publication_outbox where submission_id = '31000000-0000-4000-8000-000000000011'),
  'Original Source',
  'approval snapshots the bounded source name'
);

select app_private.set_audit_context('system', null, 'Mutate live rows after immutable snapshot');
update public.profiles set display_name = 'Mutated Contributor' where id = '31000000-0000-4000-8000-000000000001';
update public.submissions
set title = 'Mutated live title',
    content_document = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mutated live body"}]}]}',
    category = 'sports',
    primary_source_name = 'Mutated Source',
    primary_source_url = 'https://example.test/mutated'
where id = '31000000-0000-4000-8000-000000000011';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
create temporary table hardening_claims(sequence integer generated always as identity, payload jsonb);
insert into hardening_claims(payload)
select public.claim_publication_outbox('31000000-0000-4000-8000-000000000030', 60);
reset role;

select is((select payload->>'contributorName' from hardening_claims where sequence = 1), 'Snapshot Contributor', 'claim ignores a later profile mutation');
select is((select payload->>'title' from hardening_claims where sequence = 1), repeat('aa ', 59) || 'aaa', 'claim ignores a later title mutation');
select is((select payload->>'category' from hardening_claims where sequence = 1), 'finance', 'claim ignores a later category mutation');
select is((select payload->>'sourceName' from hardening_claims where sequence = 1), 'Original Source', 'claim ignores a later source mutation');
select is(
  (select payload->'contentDocument'->'content'->0->'content'->0->>'text' from hardening_claims where sequence = 1),
  'Original immutable body',
  'claim ignores a later editor-document mutation'
);

select app_private.set_audit_context('system', null, 'Expire lease for lost acknowledgement replay');
update app_private.publication_outbox
set lease_expires_at = now() - interval '1 second'
where submission_id = '31000000-0000-4000-8000-000000000011';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into hardening_claims(payload)
select public.claim_publication_outbox('31000000-0000-4000-8000-000000000031', 60);
reset role;
select is(
  (select payload - array['attemptCount', 'leaseToken'] from hardening_claims where sequence = 2),
  (select payload - array['attemptCount', 'leaseToken'] from hardening_claims where sequence = 1),
  'a lost acknowledgement retry returns the byte-identical publication pre-image'
);

insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path,
  guidelines_version, guidelines_accepted, status, submitted_at
) values
(
  '31000000-0000-4000-8000-000000000012', '31000000-0000-4000-8000-000000000001', 'Malformed claim fixture',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Malformed fixture"}]}]}',
  'finance', 'global', 'en', 'Malformed Source', 'https://example.test/malformed',
  '31000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000012/31000000-0000-4000-8000-000000000022.webp',
  '2026-08-27', true, 'under_review', now()
),
(
  '31000000-0000-4000-8000-000000000013', '31000000-0000-4000-8000-000000000001', 'Following valid claim fixture',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Following fixture"}]}]}',
  'finance', 'global', 'en', 'Following Source', 'https://example.test/following',
  '31000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000013/31000000-0000-4000-8000-000000000023.webp',
  '2026-08-27', true, 'under_review', now()
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select app_private.apply_review_decision('31000000-0000-4000-8000-000000000012', 1, 'reviewer', '31000000-0000-4000-8000-000000000002', 'approve', 'Malformed fixture approval evidence');
select app_private.apply_review_decision('31000000-0000-4000-8000-000000000013', 1, 'reviewer', '31000000-0000-4000-8000-000000000002', 'approve', 'Following fixture approval evidence');
reset role;

alter table app_private.publication_outbox disable trigger publication_outbox_claim_immutable;
select app_private.set_audit_context('system', null, 'Simulate a malformed legacy publication claim');
update app_private.publication_outbox
set publication_claim = jsonb_set(publication_claim, '{sourceName}', to_jsonb(repeat('x', 121))),
    next_attempt_at = now() - interval '2 minutes'
where submission_id = '31000000-0000-4000-8000-000000000012';
alter table app_private.publication_outbox enable trigger publication_outbox_claim_immutable;
update app_private.publication_outbox
set next_attempt_at = now() - interval '1 minute'
where submission_id = '31000000-0000-4000-8000-000000000013';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into hardening_claims(payload)
select public.claim_publication_outbox('31000000-0000-4000-8000-000000000032', 60);
reset role;
select is((select payload->>'submissionId' from hardening_claims where sequence = 3), '31000000-0000-4000-8000-000000000013', 'a malformed first row cannot starve the next valid claim');
select is((select state from app_private.publication_outbox where submission_id = '31000000-0000-4000-8000-000000000012'), 'manual_review', 'a malformed claim is terminalized safely');

select app_private.set_audit_context('system', null, 'Expire a claim at its retry limit');
update app_private.publication_outbox
set max_attempts = 1,
    lease_expires_at = now() - interval '1 second'
where submission_id = '31000000-0000-4000-8000-000000000013';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.claim_publication_outbox('31000000-0000-4000-8000-000000000033', 60), null::jsonb, 'an expired lease at max attempts is never reclaimed');
reset role;
select is((select state from app_private.publication_outbox where submission_id = '31000000-0000-4000-8000-000000000013'), 'failed', 'an expired max-attempt lease is terminalized');

select app_private.set_audit_context('system', null, 'Attempt immutable claim mutation');
select throws_ok(
  $$update app_private.publication_outbox
    set publication_claim = jsonb_set(publication_claim, '{title}', '"Rewritten"'::jsonb)
    where submission_id = '31000000-0000-4000-8000-000000000011'$$,
  'publication_claim_is_immutable',
  'the snapshotted publication claim cannot be rewritten'
);

select ok(
  exists(select 1 from public.pipeline_events where submission_id = '31000000-0000-4000-8000-000000000012' and event_type = 'publishing_failed'),
  'malformed claim terminalization leaves an operator-visible event'
);

select * from finish();
rollback;
