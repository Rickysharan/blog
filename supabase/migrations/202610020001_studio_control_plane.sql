create table public.studio_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  evidence_key text not null unique check (char_length(evidence_key) between 1 and 240),
  kind text not null check (kind in ('writing', 'review', 'publication', 'seo', 'provider', 'maintenance')),
  title text not null check (char_length(title) between 1 and 180),
  detail text check (detail is null or char_length(detail) between 1 and 2000),
  category text check (category is null or category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market')),
  state text not null default 'open' check (state in ('open', 'completed', 'postponed')),
  priority integer not null default 50 check (priority between 0 and 100),
  source text not null check (char_length(source) between 1 and 80),
  postponed_until timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'completed') = (completed_at is not null)),
  check (state = 'postponed' or postponed_until is null)
);

create table public.provider_connections (
  provider text primary key check (provider in ('google-analytics', 'google-search-console', 'google-adsense')),
  state text not null default 'disconnected' check (state in ('connected', 'delayed', 'stale', 'unavailable', 'disconnected')),
  account_label text check (account_label is null or char_length(account_label) between 1 and 160),
  property_label text check (property_label is null or char_length(property_label) between 1 and 240),
  connected_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.provider_credentials (
  provider text primary key references public.provider_connections(provider) on delete cascade,
  ciphertext bytea not null check (octet_length(ciphertext) between 1 and 65536),
  iv bytea not null check (octet_length(iv) = 12),
  authentication_tag bytea not null check (octet_length(authentication_tag) = 16),
  scopes text[] not null check (cardinality(scopes) between 1 and 32),
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_report_cache (
  provider text not null references public.provider_connections(provider) on delete cascade,
  report_key text not null check (char_length(report_key) between 1 and 160),
  source text not null check (char_length(source) between 1 and 120),
  range_start date not null,
  range_end date not null check (range_end >= range_start),
  fetched_at timestamptz,
  state text not null check (state in ('connected', 'delayed', 'stale', 'unavailable', 'disconnected')),
  data jsonb check (data is null or octet_length(data::text) <= 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, report_key),
  check (
    (state in ('connected', 'delayed', 'stale') and data is not null and fetched_at is not null)
    or (state in ('unavailable', 'disconnected') and data is null)
  )
);

create table public.publication_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('save', 'publish', 'discard')),
  category text not null check (category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market')),
  content_ref text not null check (char_length(content_ref) between 1 and 500),
  prior_version text not null check (char_length(prior_version) between 1 and 160),
  resulting_version text check (resulting_version is null or char_length(resulting_version) between 1 and 160),
  commit_url text check (commit_url is null or (char_length(commit_url) <= 2048 and commit_url ~ '^https://')),
  created_at timestamptz not null default now()
);

create index studio_tasks_state_priority_idx on public.studio_tasks(state, priority desc, created_at);
create index provider_report_cache_fetched_idx on public.provider_report_cache(provider, fetched_at desc);
create index publication_events_created_idx on public.publication_events(created_at desc);

alter table public.studio_tasks enable row level security;
alter table public.provider_connections enable row level security;
alter table app_private.provider_credentials enable row level security;
alter table public.provider_report_cache enable row level security;
alter table public.publication_events enable row level security;

revoke all on table public.studio_tasks from public, anon, authenticated;
revoke all on table public.provider_connections from public, anon, authenticated;
revoke all on table app_private.provider_credentials from public, anon, authenticated;
revoke all on table public.provider_report_cache from public, anon, authenticated;
revoke all on table public.publication_events from public, anon, authenticated;
revoke all on table public.publication_events from service_role;

grant all on table public.studio_tasks to service_role;
grant all on table public.provider_connections to service_role;
grant all on table app_private.provider_credentials to service_role;
grant all on table public.provider_report_cache to service_role;
grant select, insert on table public.publication_events to service_role;

create trigger studio_tasks_touch_updated_at
before update on public.studio_tasks
for each row execute function app_private.touch_updated_at();

create trigger provider_connections_touch_updated_at
before update on public.provider_connections
for each row execute function app_private.touch_updated_at();

create trigger provider_credentials_touch_updated_at
before update on app_private.provider_credentials
for each row execute function app_private.touch_updated_at();

create trigger provider_report_cache_touch_updated_at
before update on public.provider_report_cache
for each row execute function app_private.touch_updated_at();

create or replace function app_private.reject_publication_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'publication_events_are_append_only';
end;
$$;
revoke all on function app_private.reject_publication_event_mutation() from public, anon, authenticated;
grant execute on function app_private.reject_publication_event_mutation() to service_role;

create trigger publication_events_append_only
before update or delete on public.publication_events
for each row execute function app_private.reject_publication_event_mutation();
