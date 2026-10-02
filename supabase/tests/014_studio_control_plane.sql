begin;

select plan(9);

select has_table('public', 'publication_events', 'Studio publication history table exists');
select ok(has_table_privilege('service_role', 'public.publication_events', 'SELECT'), 'service role can read publication history');
select ok(has_table_privilege('service_role', 'public.publication_events', 'INSERT'), 'service role can append publication history');
select ok(not has_table_privilege('service_role', 'public.publication_events', 'UPDATE'), 'service role cannot update publication history');
select ok(not has_table_privilege('service_role', 'public.publication_events', 'DELETE'), 'service role cannot delete publication history');
select ok(not has_table_privilege('service_role', 'public.publication_events', 'TRUNCATE'), 'service role cannot truncate publication history');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000901', 'authenticated', 'authenticated', 'studio-publication@example.invalid', '', now(), '{}', '{}');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.publication_events (id, actor_id, action, category, content_ref, prior_version)
values (
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000901',
  'save',
  'anime',
  'content/anime/studio-fixture.mdx',
  'fixture-v1'
);

select throws_ok(
  $$update public.publication_events set action = 'discard' where id = '00000000-0000-4000-8000-000000000902'$$,
  null,
  'service role cannot update publication history'
);
select throws_ok(
  $$delete from public.publication_events where id = '00000000-0000-4000-8000-000000000902'$$,
  null,
  'service role cannot delete publication history'
);
select throws_ok(
  $$truncate table public.publication_events$$,
  null,
  'service role cannot truncate publication history'
);

select * from finish();
rollback;
