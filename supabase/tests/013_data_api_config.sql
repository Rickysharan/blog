begin;

select plan(2);

select ok(
  exists (
    select 1
    from pg_roles
    where rolname = 'authenticator'
      and coalesce(array_to_string(rolconfig, ','), '') like '%pgrst.db_schemas=public, graphql_public, app_private%'
  ),
  'PostgREST exposes app_private for server-only RPCs'
);

select ok(
  not has_schema_privilege('anon', 'app_private', 'USAGE')
  and not has_schema_privilege('authenticated', 'app_private', 'USAGE')
  and has_schema_privilege('service_role', 'app_private', 'USAGE'),
  'app_private remains inaccessible to browser roles'
);

select * from finish();
rollback;
