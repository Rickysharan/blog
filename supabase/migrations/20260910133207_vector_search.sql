create extension if not exists vector with schema extensions;

create table if not exists app_private.submission_embeddings (
  submission_id uuid not null references public.submissions(id) on delete cascade,
  submission_version bigint not null check (submission_version > 0),
  category text not null,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now(),
  primary key (submission_id, submission_version)
);

revoke all on table app_private.submission_embeddings from public, anon, authenticated;
grant select, insert on table app_private.submission_embeddings to service_role;
create index if not exists submission_embeddings_category_created_idx on app_private.submission_embeddings(category, created_at desc);

create or replace function app_private.match_recent_topics(
  p_category text,
  p_embedding extensions.vector(384),
  p_now timestamptz default now(),
  p_limit integer default 10
)
returns table (submission_id uuid, submission_version bigint, similarity numeric, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select e.submission_id, e.submission_version,
    round((1 - (e.embedding operator(extensions.<=>) p_embedding))::numeric, 6) as similarity,
    e.created_at
  from app_private.submission_embeddings e
  where e.category = p_category
    and e.created_at >= p_now - interval '48 hours'
  order by e.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(p_limit, 1), 10);
$$;

revoke all on function app_private.match_recent_topics(text, extensions.vector(384), timestamptz, integer) from public, anon, authenticated;
grant execute on function app_private.match_recent_topics(text, extensions.vector(384), timestamptz, integer) to service_role;
