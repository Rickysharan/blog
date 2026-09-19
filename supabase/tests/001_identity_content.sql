begin;

select plan(45);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'roles', 'roles table exists');
select has_table('public', 'submissions', 'submissions table exists');
select has_table('public', 'submission_revisions', 'submission revisions table exists');
select has_table('public', 'review_decisions', 'review decisions table exists');
select has_table('public', 'publications', 'publications table exists');
select has_table('public', 'notifications', 'notifications table exists');
select has_table('public', 'audit_log', 'audit log table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.submissions'::regclass),
  'submissions has RLS enabled'
);
select has_index('public', 'submissions', 'submissions_author_id_idx', 'submission author index exists');
select has_index('public', 'publications', 'publications_article_slug_key', 'publication slug uniqueness exists');
select ok(
  not has_table_privilege('authenticated', 'public.submissions', 'INSERT'),
  'submission inserts are server-mediated'
);
select ok(
  not has_table_privilege('authenticated', 'public.submissions', 'UPDATE'),
  'submission updates are server-mediated'
);

select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select'),
  'profiles select policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'),
  'profiles owner update policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'submissions_select'),
  'submissions select policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'submissions_insert_own'),
  'submissions owner insert policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'submissions_update_own'),
  'submissions owner update policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submission_revisions' and policyname = 'revisions_select'),
  'revision select policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'review_decisions' and policyname = 'decisions_select'),
  'decision select policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'publications' and policyname = 'publications_select'),
  'publication select policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_select'),
  'notification select policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_update_read'),
  'notification read policy exists'
);
select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'roles'),
  'roles has no client policies'
);
select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log'),
  'audit log has no client policies'
);

-- Exercise the tenant boundary with two contributors and server-managed roles.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'one@example.invalid', '', now(), '{}', '{"role":"admin"}'),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'two@example.invalid', '', now(), '{}', '{}'),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'reviewer@example.invalid', '', now(), '{}', '{}'),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin@example.invalid', '', now(), '{}', '{}');
insert into public.roles (user_id, role)
values
  ('00000000-0000-4000-8000-000000000003', 'reviewer'),
  ('00000000-0000-4000-8000-000000000004', 'admin');

select is(
  (select count(*)::integer from public.roles where user_id = '00000000-0000-4000-8000-000000000001'),
  0,
  'user metadata cannot grant a role'
);

select app_private.set_audit_context('system', null, 'Identity content pgTAP fixture');
set local role service_role;
do $$ begin perform set_config('request.jwt.claim.role', 'service_role', true); end $$;
insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path, guidelines_version, guidelines_accepted
)
values (
  '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'A private draft', '{"type":"doc"}', 'anime', 'global', 'en',
  'Example Source', 'https://example.invalid/source', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000010/00000000-0000-4000-8000-000000000011.webp', 'v1', true
);
select ok(
  app_private.record_review_decision(
    '00000000-0000-4000-8000-000000000010', 1, 'reviewer',
    '00000000-0000-4000-8000-000000000003', 'approve', 'Reviewer verified the submission.'
  ) is not null,
  'review decisions are inserted through the private RPC'
);
select is(
  (select reason from public.audit_log where target_type = 'review_decisions' order by created_at desc limit 1),
  'Reviewer verified the submission.',
  'review decision audit records preserve the reason'
);
select throws_ok(
  $$select app_private.record_review_decision('00000000-0000-4000-8000-000000000010', 1, 'admin', '00000000-0000-4000-8000-000000000001', 'reject', 'Invalid actor role')$$,
  NULL,
  'review decisions cannot spoof an actor role'
);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true); end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true); end $$;
select is(
  (select count(*)::integer from public.submissions where title = 'A private draft'),
  0,
  'second contributor cannot select first contributor draft'
);
select throws_ok(
  $$update public.submissions set title = 'Tampered draft' where title = 'A private draft'$$,
  NULL,
  'second contributor cannot update first contributor draft'
);

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true); end $$;
select is(
  (select count(*)::integer from public.submissions where id = '00000000-0000-4000-8000-000000000010'),
  1,
  'reviewer can select another contributor submission'
);
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true); end $$;
select is(
  (select count(*)::integer from public.submissions where id = '00000000-0000-4000-8000-000000000010'),
  1,
  'admin can select another contributor submission'
);

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true); end $$;
select throws_ok(
  $$update public.submissions set status = 'approved' where author_id = '00000000-0000-4000-8000-000000000001'$$,
  NULL,
  'contributor cannot escalate submission status'
);
select throws_ok(
  $$update public.profiles set account_status = 'suspended' where id = '00000000-0000-4000-8000-000000000001'$$,
  NULL,
  'contributor cannot change account status'
);

reset role;
select app_private.set_audit_context('system', null, 'Revision fixture insert');
insert into public.submission_revisions (
  submission_id, author_id, submission_version, content_document, content_sha256
)
select id, author_id, version, content_document, repeat('a', 64)
from public.submissions where author_id = '00000000-0000-4000-8000-000000000001';
insert into public.audit_log (actor_type, action, target_type, target_id)
select 'system', 'test', 'submission', id from public.submissions limit 1;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true); end $$;
select throws_ok(
  $$update public.submission_revisions set content_sha256 = repeat('b', 64)$$,
  NULL,
  'revision rows cannot be altered'
);
select throws_ok(
  $$delete from public.submission_revisions$$,
  NULL,
  'revision rows cannot be deleted'
);
select throws_ok(
  $$update public.review_decisions set reason = 'tampered'$$,
  NULL,
  'review decision rows cannot be altered'
);
select throws_ok(
  $$delete from public.review_decisions$$,
  NULL,
  'review decision rows cannot be deleted'
);
select throws_ok(
  $$update public.audit_log set action = 'tampered'$$,
  NULL,
  'audit rows cannot be altered'
);
select throws_ok(
  $$delete from public.audit_log$$,
  NULL,
  'audit rows cannot be deleted'
);

set local role service_role;
do $$ begin perform set_config('request.jwt.claim.role', 'service_role', true); end $$;
select throws_ok(
  $$update public.profiles set account_status = 'suspended' where id = '00000000-0000-4000-8000-000000000001'$$,
  NULL,
  'service role cannot bypass the account status RPC'
);
select is(
  app_private.set_account_status(
    '00000000-0000-4000-8000-000000000001', 1, 'suspended', 'admin',
    '00000000-0000-4000-8000-000000000004', 'Administrative suspension review.'
  ),
  'suspended'::public.account_status,
  'account status changes require the private RPC'
);
select is(
  (select reason from public.audit_log where target_type = 'profiles' and target_id = '00000000-0000-4000-8000-000000000001' and action = 'update'),
  'Administrative suspension review.',
  'account status audit records preserve the reason'
);

select * from finish();
rollback;
