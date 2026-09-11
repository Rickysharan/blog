-- Server-side application RPCs live in app_private. Expose the schema to
-- PostgREST while retaining the function/table grants established by earlier
-- migrations; anon and authenticated still have no schema usage.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, app_private';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
