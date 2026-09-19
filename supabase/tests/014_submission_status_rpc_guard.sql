begin;

select plan(4);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-4000-8000-000000000091',
  'authenticated',
  'authenticated',
  'status-guard@example.invalid',
  '',
  now(),
  '{}',
  '{}'
);

insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path,
  guidelines_version, guidelines_accepted
)
values (
  '00000000-0000-4000-8000-000000000092',
  '00000000-0000-4000-8000-000000000091',
  'Status guard fixture',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Original reporting fixture with enough text for the workflow check."}]}]}',
  'finance',
  'global',
  'en',
  'Primary source',
  'https://example.invalid/status-guard',
  '00000000-0000-4000-8000-000000000091/00000000-0000-4000-8000-000000000092/00000000-0000-4000-8000-000000000093.webp',
  'v1',
  true
);

-- The auth-user provisioning trigger sets an audited system context for this
-- pgTAP transaction. Clear that fixture context before testing an unguarded
-- service request; real PostgREST requests use a fresh transaction each time.
delete from app_private.audit_contexts where transaction_id = txid_current();

select ok(
  not has_function_privilege(
    'service_role',
    'app_private.set_audit_context(public.actor_type, uuid, text)',
    'EXECUTE'
  ),
  'service role cannot open a status-mutation guard directly'
);

set local role service_role;
select set_config('request.jwt.claim.role', '', true);

select throws_ok(
  $$update public.submissions
    set status = 'approved'
    where id = '00000000-0000-4000-8000-000000000092'$$,
  'status_is_server_managed',
  'direct service-role status updates remain blocked without an RPC guard'
);

select is(
  (
    select status
    from app_private.save_submission(
      '00000000-0000-4000-8000-000000000092',
      '00000000-0000-4000-8000-000000000091',
      1,
      'Status guard fixture',
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Original reporting fixture with enough text for the workflow check."}]}]}',
      'finance',
      'global',
      'en',
      'Primary source',
      'https://example.invalid/status-guard',
      '00000000-0000-4000-8000-000000000091/00000000-0000-4000-8000-000000000092/00000000-0000-4000-8000-000000000093.webp',
      'v1',
      true,
      true
    )
  ),
  'under_review'::public.submission_status,
  'private submission RPC can change status without a legacy JWT role claim'
);

select is(
  (
    select count(*)::integer
    from public.submission_revisions
    where submission_id = '00000000-0000-4000-8000-000000000092'
      and submission_version = 2
  ),
  1,
  'successful submission records the immutable revision'
);

select * from finish();
rollback;
