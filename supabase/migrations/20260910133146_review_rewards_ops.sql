create extension if not exists btree_gist with schema extensions;

create table if not exists app_private.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into app_private.settings (key, value)
values
  ('REDEMPTIONS_ENABLED', 'false'::jsonb),
  ('MAX_ACTIVE_TOPIC_CLAIMS', '3'::jsonb)
on conflict (key) do nothing;
revoke all on table app_private.settings from public, anon, authenticated;
grant select, update on table app_private.settings to service_role;

create table public.review_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  submission_version bigint not null check (submission_version > 0),
  stage text not null check (stage in ('language', 'originality', 'policy', 'quality', 'duplicate')),
  attempt integer not null check (attempt > 0),
  provider text not null check (char_length(provider) between 1 and 100),
  status text not null check (status in ('queued', 'running', 'passed', 'failed', 'manual_review')),
  provider_result jsonb check (provider_result is null or octet_length(provider_result::text) <= 100000),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint review_runs_submission_stage_attempt_key unique (submission_id, submission_version, stage, attempt)
);

create table public.duplicate_matches (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  candidate_submission_id uuid not null references public.submissions(id) on delete cascade,
  similarity numeric(5,4) not null check (similarity between 0 and 1),
  resolution text not null default 'unresolved' check (resolution in ('unresolved', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  check (submission_id <> candidate_submission_id),
  unique (submission_id, candidate_submission_id)
);

create table public.pipeline_events (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  stage text not null check (char_length(stage) between 1 and 80),
  event_type text not null check (char_length(event_type) between 1 and 80),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 50000),
  created_at timestamptz not null default now()
);

create table public.reputation_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  scope_category text not null default '*',
  scope_region text not null default '*',
  event_type text not null check (char_length(event_type) between 1 and 80),
  points integer not null check (points between -10000 and 10000),
  effective_during tstzrange not null check (not isempty(effective_during)),
  created_at timestamptz not null default now(),
  exclude using gist (
    scope_category with =,
    scope_region with =,
    event_type with =,
    effective_during with &&
  )
);

create table public.reputation_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  created_at timestamptz not null default now(),
  unique (user_id, period_start, period_end)
);

create table public.reward_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null unique,
  points integer not null check (points between -10000 and 10000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_points numeric(14,2) not null default 0 check (balance_points >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  wallet_user_id uuid not null references auth.users(id) on delete cascade,
  transaction_kind text not null check (transaction_kind in ('earn', 'adjustment', 'redemption')),
  amount_points numeric(14,2) not null check (amount_points <> 0),
  idempotency_key text not null,
  source_ref text,
  balance_after numeric(14,2) not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  constraint wallet_transactions_earn_idempotency_key_key unique (idempotency_key)
);

create table public.redemption_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points numeric(14,2) not null check (points > 0),
  state text not null default 'pending' check (state in ('pending', 'approved', 'rejected', 'paid', 'disabled')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.display_rates (
  currency_code text primary key check (currency_code ~ '^[A-Z]{3}$'),
  points_per_unit numeric(14,4) not null check (points_per_unit > 0),
  updated_at timestamptz not null default now()
);

create table public.trending_topics (
  id uuid primary key default extensions.gen_random_uuid(),
  topic_key text not null unique check (topic_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 180),
  category text not null check (category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market')),
  trend_score numeric(12,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.topic_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  topic_id uuid not null references public.trending_topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index topic_claims_one_active_topic_key
  on public.topic_claims (topic_id) where status = 'active';
create unique index topic_claims_one_active_user_topic_key
  on public.topic_claims (topic_id, user_id) where status = 'active';

create table public.health_checks (
  id uuid primary key default extensions.gen_random_uuid(),
  check_name text not null,
  status text not null check (status in ('healthy', 'degraded', 'down')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  details jsonb not null default '{}'::jsonb check (octet_length(details::text) <= 20000),
  checked_at timestamptz not null default now()
);

create table public.daily_metrics (
  metric_date date not null,
  category text not null,
  metric_name text not null,
  metric_value numeric(18,4) not null,
  created_at timestamptz not null default now(),
  primary key (metric_date, category, metric_name)
);

create table public.credential_metadata (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null check (char_length(provider) between 1 and 100),
  label text not null check (char_length(label) between 1 and 160),
  environment text not null check (environment in ('development', 'staging', 'production')),
  created_at timestamptz not null default now(),
  last_verified_at timestamptz,
  expires_at timestamptz,
  owner_note text check (owner_note is null or char_length(owner_note) <= 2000),
  verification_state text not null default 'unverified' check (verification_state in ('unverified', 'verified', 'expired', 'revoked')),
  rotation_url text check (rotation_url is null or rotation_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

create table public.contact_inquiries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  sender_email text not null check (sender_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  message text not null check (char_length(message) between 1 and 10000),
  delivery_state text not null default 'pending' check (delivery_state in ('pending', 'sent', 'failed')),
  moderation_state text not null default 'unreviewed' check (moderation_state in ('unreviewed', 'safe', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  max_requests integer not null check (max_requests > 0),
  updated_at timestamptz not null default now()
);
revoke all on table app_private.rate_limit_buckets from public, anon, authenticated;
grant all on table app_private.rate_limit_buckets to service_role;

create index review_runs_submission_id_idx on public.review_runs(submission_id, created_at desc);
create index duplicate_matches_submission_id_idx on public.duplicate_matches(submission_id, created_at desc);
create index pipeline_events_submission_id_idx on public.pipeline_events(submission_id, created_at desc);
create index reputation_snapshots_user_id_idx on public.reputation_snapshots(user_id, period_end desc);
create index topic_claims_user_status_idx on public.topic_claims(user_id, status, expires_at);
create index contact_inquiries_created_idx on public.contact_inquiries(created_at desc);

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;
grant execute on function app_private.touch_updated_at() to service_role;

create or replace function app_private.record_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid;
  kind public.actor_type;
  audit_reason text;
  context_actor uuid;
  context_kind public.actor_type;
begin
  select actor_type, actor_id, reason
  into context_kind, context_actor, audit_reason
  from app_private.audit_contexts
  where transaction_id = txid_current();
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     and context_kind is null then
    raise exception 'audit_context_required';
  end if;
  actor := coalesce(context_actor, auth.uid());
  kind := coalesce(
    context_kind,
    case
      when coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then 'system'::public.actor_type
      else 'contributor'::public.actor_type
    end
  );
  insert into public.audit_log (actor_type, actor_id, action, target_type, target_id, prior_state, new_state, reason)
  values (
    kind, actor, lower(tg_op), tg_table_name,
    coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid),
    case when old is null then null else to_jsonb(old) end,
    case when new is null then null else to_jsonb(new) end,
    audit_reason
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function app_private.record_audit() from public, anon, authenticated;
grant execute on function app_private.record_audit() to service_role;

create or replace function app_private.post_wallet_transaction(
  p_wallet_user uuid,
  p_amount numeric,
  p_transaction_kind text,
  p_idempotency_key text,
  p_source_ref text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  account_balance numeric;
  existing_id uuid;
  transaction_id uuid;
begin
  if p_transaction_kind not in ('earn', 'adjustment', 'redemption')
     or p_amount = 0
     or (p_transaction_kind = 'earn' and p_amount < 0)
     or (p_transaction_kind = 'redemption' and p_amount > 0) then
    raise exception 'invalid_wallet_transaction';
  end if;
  perform app_private.set_audit_context(
    'system', null,
    case
      when char_length(trim(coalesce(p_source_ref, ''))) between 10 and 2000 then trim(p_source_ref)
      else 'Wallet transaction posted'
    end
  );
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  insert into public.wallet_accounts (user_id)
  values (p_wallet_user)
  on conflict (user_id) do nothing;
  select balance_points into account_balance
  from public.wallet_accounts where user_id = p_wallet_user for update;
  select id into existing_id from public.wallet_transactions
  where wallet_transactions.idempotency_key = p_idempotency_key;
  if existing_id is not null then return existing_id; end if;
  if account_balance + p_amount < 0 then raise exception 'insufficient_wallet_balance'; end if;
  update public.wallet_accounts
  set balance_points = account_balance + p_amount, version = version + 1
  where user_id = p_wallet_user;
  insert into public.wallet_transactions (
    wallet_user_id, transaction_kind, amount_points, idempotency_key, source_ref, balance_after
  ) values (
    p_wallet_user, p_transaction_kind, p_amount, p_idempotency_key, p_source_ref, account_balance + p_amount
  ) on conflict (idempotency_key) do nothing returning id into transaction_id;
  if transaction_id is null then
    select id into transaction_id from public.wallet_transactions
    where wallet_transactions.idempotency_key = p_idempotency_key;
  end if;
  return transaction_id;
end;
$$;
revoke all on function app_private.post_wallet_transaction(uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function app_private.post_wallet_transaction(uuid, numeric, text, text, text) to service_role;

create or replace function app_private.request_redemption(wallet_user uuid, points numeric)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare redemption_id uuid;
begin
  perform app_private.set_audit_context('system', null, 'Redemption request created');
  if coalesce((select value from app_private.settings where key = 'REDEMPTIONS_ENABLED'), 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'redemptions_disabled';
  end if;
  if points <= 0 then raise exception 'invalid_redemption_points'; end if;
  insert into public.redemption_requests (user_id, points)
  values (wallet_user, points)
  returning id into redemption_id;
  return redemption_id;
end;
$$;
revoke all on function app_private.request_redemption(uuid, numeric) from public, anon, authenticated;
grant execute on function app_private.request_redemption(uuid, numeric) to service_role;

create or replace function app_private.claim_topic(topic_uuid uuid, claimant uuid, ttl interval default interval '7 days')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare claim_id uuid;
declare max_claims integer;
declare active_claims integer;
begin
  perform app_private.set_audit_context('system', null, 'Topic claim created');
  if ttl <= interval '0' or ttl > interval '30 days' then raise exception 'invalid_claim_ttl'; end if;
  perform pg_advisory_xact_lock(hashtextextended(claimant::text, 0));
  perform 1 from public.trending_topics where id = topic_uuid and active for update;
  if not found then raise exception 'topic_not_available'; end if;
  update public.topic_claims
  set status = 'expired', updated_at = clock_timestamp()
  where topic_id = topic_uuid and status = 'active' and expires_at <= clock_timestamp();
  update public.topic_claims
  set status = 'expired', updated_at = clock_timestamp()
  where user_id = claimant and status = 'active' and expires_at <= clock_timestamp();
  select coalesce((value #>> '{}')::integer, 3) into max_claims
  from app_private.settings where key = 'MAX_ACTIVE_TOPIC_CLAIMS';
  select count(*)::integer into active_claims
  from public.topic_claims where user_id = claimant and status = 'active';
  if active_claims >= coalesce(max_claims, 3) then raise exception 'active_claim_limit'; end if;
  insert into public.topic_claims (topic_id, user_id, expires_at)
  values (topic_uuid, claimant, clock_timestamp() + ttl)
  returning id into claim_id;
  return claim_id;
end;
$$;
revoke all on function app_private.claim_topic(uuid, uuid, interval) from public, anon, authenticated;
grant execute on function app_private.claim_topic(uuid, uuid, interval) to service_role;

create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function app_private.record_audit();
create trigger roles_audit after insert or update or delete on public.roles
for each row execute function app_private.record_audit();
create trigger submissions_audit after insert or update or delete on public.submissions
for each row execute function app_private.record_audit();
create trigger submission_revisions_audit after insert on public.submission_revisions
for each row execute function app_private.record_audit();
create trigger review_decisions_audit after insert or update or delete on public.review_decisions
for each row execute function app_private.record_audit();
create trigger publications_audit after insert or update or delete on public.publications
for each row execute function app_private.record_audit();
create trigger notifications_audit after insert or update or delete on public.notifications
for each row execute function app_private.record_audit();
create trigger settings_audit after insert or update or delete on app_private.settings
for each row execute function app_private.record_audit();
create trigger reputation_rules_audit after insert or update or delete on public.reputation_rules
for each row execute function app_private.record_audit();
create trigger reputation_snapshots_audit after insert or update or delete on public.reputation_snapshots
for each row execute function app_private.record_audit();
create trigger reward_rules_audit after insert or update or delete on public.reward_rules
for each row execute function app_private.record_audit();
create trigger display_rates_audit after insert or update or delete on public.display_rates
for each row execute function app_private.record_audit();

create trigger reward_rules_touch before update on public.reward_rules
for each row execute function app_private.touch_updated_at();
create trigger wallet_accounts_touch before update on public.wallet_accounts
for each row execute function app_private.touch_updated_at();
create trigger redemption_requests_touch before update on public.redemption_requests
for each row execute function app_private.touch_updated_at();
create trigger trending_topics_touch before update on public.trending_topics
for each row execute function app_private.touch_updated_at();
create trigger topic_claims_touch before update on public.topic_claims
for each row execute function app_private.touch_updated_at();
create trigger credential_metadata_touch before update on public.credential_metadata
for each row execute function app_private.touch_updated_at();
create trigger contact_inquiries_touch before update on public.contact_inquiries
for each row execute function app_private.touch_updated_at();

create trigger wallet_transactions_immutable
before update or delete on public.wallet_transactions
for each row execute function app_private.reject_immutable_mutation();

create trigger review_runs_audit after insert or update or delete on public.review_runs
for each row execute function app_private.record_audit();
create trigger duplicate_matches_audit after insert or update or delete on public.duplicate_matches
for each row execute function app_private.record_audit();
create trigger pipeline_events_audit after insert or update or delete on public.pipeline_events
for each row execute function app_private.record_audit();
create trigger wallet_accounts_audit after insert or update or delete on public.wallet_accounts
for each row execute function app_private.record_audit();
create trigger wallet_transactions_audit after insert on public.wallet_transactions
for each row execute function app_private.record_audit();
create trigger redemption_requests_audit after insert or update or delete on public.redemption_requests
for each row execute function app_private.record_audit();
create trigger trending_topics_audit after insert or update or delete on public.trending_topics
for each row execute function app_private.record_audit();
create trigger topic_claims_audit after insert or update or delete on public.topic_claims
for each row execute function app_private.record_audit();
create trigger health_checks_audit after insert or update or delete on public.health_checks
for each row execute function app_private.record_audit();
create trigger daily_metrics_audit after insert or update or delete on public.daily_metrics
for each row execute function app_private.record_audit();
create trigger credential_metadata_audit after insert or update or delete on public.credential_metadata
for each row execute function app_private.record_audit();
create trigger contact_inquiries_audit after insert or update or delete on public.contact_inquiries
for each row execute function app_private.record_audit();

alter table public.review_runs enable row level security;
alter table public.review_runs force row level security;
alter table public.duplicate_matches enable row level security;
alter table public.duplicate_matches force row level security;
alter table public.pipeline_events enable row level security;
alter table public.pipeline_events force row level security;
alter table public.reputation_rules enable row level security;
alter table public.reputation_rules force row level security;
alter table public.reputation_snapshots enable row level security;
alter table public.reputation_snapshots force row level security;
alter table public.reward_rules enable row level security;
alter table public.reward_rules force row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_accounts force row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_transactions force row level security;
alter table public.redemption_requests enable row level security;
alter table public.redemption_requests force row level security;
alter table public.display_rates enable row level security;
alter table public.display_rates force row level security;
alter table public.trending_topics enable row level security;
alter table public.trending_topics force row level security;
alter table public.topic_claims enable row level security;
alter table public.topic_claims force row level security;
alter table public.health_checks enable row level security;
alter table public.health_checks force row level security;
alter table public.daily_metrics enable row level security;
alter table public.daily_metrics force row level security;
alter table public.credential_metadata enable row level security;
alter table public.credential_metadata force row level security;
alter table public.contact_inquiries enable row level security;
alter table public.contact_inquiries force row level security;

create policy review_runs_select on public.review_runs for select to authenticated
using (public.is_active_account() and (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = (select auth.uid())) or public.has_role('reviewer') or public.has_role('admin')));
create policy duplicate_matches_select on public.duplicate_matches for select to authenticated
using (public.is_active_account() and (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = (select auth.uid())) or public.has_role('reviewer') or public.has_role('admin')));
create policy pipeline_events_select on public.pipeline_events for select to authenticated
using (public.is_active_account() and (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = (select auth.uid())) or public.has_role('reviewer') or public.has_role('admin')));
create policy reputation_rules_select on public.reputation_rules for select to authenticated using (public.is_active_account());
create policy reputation_snapshots_select_own on public.reputation_snapshots for select to authenticated using (public.is_active_account() and (user_id = (select auth.uid()) or public.has_role('reviewer') or public.has_role('admin')));
create policy reward_rules_select on public.reward_rules for select to authenticated using (public.is_active_account() and (enabled or public.has_role('reviewer') or public.has_role('admin')));
create policy wallet_accounts_select_own on public.wallet_accounts for select to authenticated using (public.is_active_account() and user_id = (select auth.uid()));
create policy wallet_transactions_select_own on public.wallet_transactions for select to authenticated using (public.is_active_account() and wallet_user_id = (select auth.uid()));
create policy redemption_requests_select_own on public.redemption_requests for select to authenticated using (public.is_active_account() and user_id = (select auth.uid()));
create policy display_rates_select on public.display_rates for select to anon using (true);
create policy display_rates_select_authenticated on public.display_rates for select to authenticated using (public.is_active_account());
create policy trending_topics_select on public.trending_topics for select to anon using (active);
create policy trending_topics_select_ops on public.trending_topics for select to authenticated using (public.is_active_account() and (active or public.has_role('reviewer') or public.has_role('admin')));
create policy topic_claims_select_own on public.topic_claims for select to authenticated using (public.is_active_account() and (user_id = (select auth.uid()) or public.has_role('reviewer') or public.has_role('admin')));
create policy health_checks_select_ops on public.health_checks for select to authenticated using (public.is_active_account() and (public.has_role('reviewer') or public.has_role('admin')));
create policy daily_metrics_select_ops on public.daily_metrics for select to authenticated using (public.is_active_account() and (public.has_role('reviewer') or public.has_role('admin')));
create policy credential_metadata_select_ops on public.credential_metadata for select to authenticated using (public.is_active_account() and public.has_role('admin'));
create policy contact_inquiries_no_client_access on public.contact_inquiries for select to authenticated using (public.is_active_account() and false);

revoke all on public.review_runs, public.duplicate_matches, public.pipeline_events,
  public.reputation_rules, public.reputation_snapshots, public.reward_rules,
  public.wallet_accounts, public.wallet_transactions, public.redemption_requests,
  public.display_rates, public.trending_topics, public.topic_claims,
  public.health_checks, public.daily_metrics, public.credential_metadata,
  public.contact_inquiries from anon, authenticated;
grant select on public.review_runs, public.duplicate_matches, public.pipeline_events,
  public.reputation_rules, public.reputation_snapshots, public.reward_rules,
  public.wallet_accounts, public.wallet_transactions, public.redemption_requests,
  public.trending_topics, public.topic_claims, public.health_checks,
  public.daily_metrics, public.credential_metadata to authenticated;
grant select on public.display_rates, public.trending_topics to anon;
grant all on public.review_runs, public.duplicate_matches, public.pipeline_events,
  public.reputation_rules, public.reputation_snapshots, public.reward_rules,
  public.wallet_accounts, public.wallet_transactions, public.redemption_requests,
  public.display_rates, public.trending_topics, public.topic_claims,
  public.health_checks, public.daily_metrics, public.credential_metadata,
  public.contact_inquiries to service_role;

-- Financial balances, append-only history, redemptions, and topic claims are
-- writable only through the private transactional RPCs above.
revoke insert, update, delete on public.wallet_accounts, public.wallet_transactions,
  public.redemption_requests, public.topic_claims from service_role;
grant select on public.wallet_accounts, public.wallet_transactions,
  public.redemption_requests, public.topic_claims to service_role;
