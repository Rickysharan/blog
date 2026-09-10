begin;

select plan(22);

select has_table('app_private', 'publication_nonces', 'publication nonces use a private table');
select col_is_pk(
  'app_private',
  'publication_nonces',
  array['nonce_digest', 'audience']::name[],
  'nonce digest and audience form the composite primary key'
);
select col_type_is('app_private', 'publication_nonces', 'nonce_digest', 'text', 'nonce digest is stored as text');
select col_type_is('app_private', 'publication_nonces', 'publication_id', 'uuid', 'publication ID is stored');
select col_type_is('app_private', 'publication_nonces', 'body_digest', 'text', 'body digest is stored');
select col_type_is('app_private', 'publication_nonces', 'received_at', 'timestamp with time zone', 'received timestamp is stored');
select col_type_is('app_private', 'publication_nonces', 'expires_at', 'timestamp with time zone', 'expiry is stored');
select ok((select relrowsecurity from pg_class where oid = 'app_private.publication_nonces'::regclass), 'nonce table has RLS enabled');
select ok(not has_table_privilege('anon', 'app_private.publication_nonces', 'SELECT'), 'anonymous cannot read nonces');
select ok(not has_table_privilege('anon', 'app_private.publication_nonces', 'INSERT'), 'anonymous cannot insert nonces');
select ok(not has_table_privilege('authenticated', 'app_private.publication_nonces', 'SELECT'), 'authenticated cannot read nonces');
select ok(not has_table_privilege('authenticated', 'app_private.publication_nonces', 'INSERT'), 'authenticated cannot insert nonces');
select ok(has_table_privilege('service_role', 'app_private.publication_nonces', 'SELECT'), 'service role can read nonces');
select ok(has_table_privilege('service_role', 'app_private.publication_nonces', 'INSERT'), 'service role can insert nonces');
select ok(
  has_function_privilege(
    'service_role',
    'app_private.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz)',
    'EXECUTE'
  ),
  'service role can claim a publication nonce'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz)',
    'EXECUTE'
  ),
  'anonymous cannot claim a publication nonce through the exposed RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz)',
    'EXECUTE'
  ),
  'authenticated users cannot claim a publication nonce through the exposed RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz)',
    'EXECUTE'
  ),
  'service role can claim a publication nonce through the exposed RPC'
);

set local role service_role;
select is(
  public.claim_publication_nonce(repeat('a', 64), 'omnilede-blog-publish-v1', '10000000-0000-4000-0000-000000000001', repeat('b', 64), now(), now() + interval '5 minutes'),
  'claimed',
  'a new nonce is claimed'
);
select is(
  public.claim_publication_nonce(repeat('a', 64), 'omnilede-blog-publish-v1', '10000000-0000-4000-0000-000000000001', repeat('b', 64), now(), now() + interval '5 minutes'),
  'replayed',
  'an identical replay is idempotent'
);
select is(
  public.claim_publication_nonce(repeat('a', 64), 'omnilede-blog-publish-v1', '10000000-0000-4000-0000-000000000001', repeat('c', 64), now(), now() + interval '5 minutes'),
  'conflict',
  'a mismatched replay fails'
);
insert into app_private.publication_nonces(nonce_digest, audience, publication_id, body_digest, received_at, expires_at)
values (repeat('d', 64), 'expired', '10000000-0000-4000-0000-000000000001', repeat('e', 64), now() - interval '10 minutes', now() - interval '30 seconds');
select public.claim_publication_nonce(repeat('f', 64), 'cleanup', '10000000-0000-4000-0000-000000000001', repeat('0', 64), now() - interval '1 minute', now() + interval '5 minutes');
select is((select count(*)::integer from app_private.publication_nonces where audience = 'expired'), 0, 'database-clock cleanup removes an expired nonce even with a stale received timestamp');

select * from finish();
rollback;
