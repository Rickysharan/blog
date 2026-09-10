create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create type public.app_role as enum ('contributor', 'reviewer', 'admin');
create type public.account_status as enum ('active', 'suspended', 'banned');
create type public.submission_status as enum (
  'draft', 'under_review', 'manual_review', 'changes_requested', 'rejected',
  'approved', 'publishing', 'published', 'publishing_failed'
);
create type public.actor_type as enum ('contributor', 'reviewer', 'admin', 'system');
create type public.decision_kind as enum ('approve', 'reject', 'request_changes');
create type public.publication_state as enum ('pending', 'publishing', 'published', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Contributor' check (char_length(display_name) between 1 and 100),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  preferred_language text not null default 'en' check (preferred_language ~ '^[A-Za-z]{2,3}(?:-[A-Za-z]{4}|-[A-Za-z]{2}|-[0-9]{3}|-[A-Za-z0-9]{5,8})*$'),
  payout_preference text not null default 'not_configured' check (payout_preference in ('not_configured', 'bank_transfer_interest', 'gift_card_interest')),
  account_status public.account_status not null default 'active',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  content_document jsonb not null check (octet_length(content_document::text) <= 300000),
  category text not null check (category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market')),
  region text not null check (region in ('global', 'africa', 'asia', 'europe', 'middle-east', 'north-america', 'latin-america', 'oceania')),
  language text not null check (language ~ '^[A-Za-z]{2,3}(?:-[A-Za-z]{4}|-[A-Za-z]{2}|-[0-9]{3}|-[A-Za-z0-9]{5,8})*$'),
  primary_source_name text not null check (char_length(primary_source_name) between 1 and 200),
  primary_source_url text not null check (primary_source_url ~ '^https://'),
  private_image_path text not null check (
    private_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
    and split_part(private_image_path, '/', 1) = author_id::text
    and split_part(private_image_path, '/', 2) = id::text
  ),
  guidelines_version text not null check (char_length(guidelines_version) between 1 and 64),
  guidelines_accepted boolean not null check (guidelines_accepted),
  status public.submission_status not null default 'draft',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table app_private.account_status_mutation_guards (
  transaction_id bigint primary key
);
revoke all on table app_private.account_status_mutation_guards from public, anon, authenticated, service_role;

create table app_private.audit_contexts (
  transaction_id bigint primary key,
  actor_type public.actor_type not null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 10 and 2000)
);
revoke all on table app_private.audit_contexts from public, anon, authenticated, service_role;

create or replace function app_private.set_audit_context(
  p_actor_type public.actor_type,
  p_actor_id uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_reason is null
     or p_actor_type is null
     or char_length(trim(p_reason)) not between 10 and 2000
     or p_actor_type not in ('contributor', 'reviewer', 'admin', 'system') then
    raise exception 'invalid_audit_context';
  end if;
  if p_actor_type = 'system' and p_actor_id is not null then
    raise exception 'invalid_audit_actor';
  end if;
  if p_actor_type <> 'system'
     and (p_actor_id is null or not exists (
       select 1 from public.profiles where id = p_actor_id and account_status = 'active'
     )) then
    raise exception 'invalid_audit_actor';
  end if;
  if p_actor_type in ('reviewer', 'admin')
     and not exists (
       select 1 from public.roles
       where user_id = p_actor_id and role::text = p_actor_type::text
     ) then
    raise exception 'invalid_audit_actor';
  end if;
  insert into app_private.audit_contexts(transaction_id, actor_type, actor_id, reason)
  values (txid_current(), p_actor_type, p_actor_id, trim(p_reason))
  on conflict (transaction_id) do update
    set actor_type = excluded.actor_type,
        actor_id = excluded.actor_id,
        reason = excluded.reason;
end;
$$;
revoke all on function app_private.set_audit_context(public.actor_type, uuid, text) from public, anon, authenticated;
grant execute on function app_private.set_audit_context(public.actor_type, uuid, text) to service_role;

create table public.submission_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  submission_version bigint not null check (submission_version > 0),
  content_document jsonb not null check (octet_length(content_document::text) <= 300000),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (submission_id, submission_version)
);

create table public.review_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  submission_version bigint not null check (submission_version > 0),
  actor_type public.actor_type not null,
  actor_id uuid references auth.users(id) on delete set null,
  decision public.decision_kind not null,
  reason text not null check (char_length(reason) between 10 and 2000),
  created_at timestamptz not null default now(),
  unique (submission_id, submission_version, decision)
);

create table public.publications (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete restrict,
  publication_id uuid not null unique,
  article_slug text not null unique check (article_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  blog_url text check (blog_url is null or blog_url ~ '^https://'),
  git_commit_sha text,
  state public.publication_state not null default 'pending',
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 80),
  title text not null check (char_length(title) between 1 and 180),
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,
  email_state text not null default 'pending' check (email_state in ('pending', 'sent', 'retryable', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_type public.actor_type not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  target_type text not null check (char_length(target_type) between 1 and 80),
  target_id uuid,
  prior_state jsonb,
  new_state jsonb,
  reason text check (reason is null or char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create index submissions_author_id_idx on public.submissions(author_id);
create index submissions_status_updated_idx on public.submissions(status, updated_at desc);
create index submission_revisions_author_id_idx on public.submission_revisions(author_id);
create index review_decisions_submission_id_idx on public.review_decisions(submission_id, created_at desc);
create index publications_submission_id_idx on public.publications(submission_id);
create index notifications_user_id_created_idx on public.notifications(user_id, created_at desc);

create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.roles
    where user_id = (select auth.uid()) and role = required_role
  );
$$;
revoke all on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;

create or replace function public.is_active_account()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and account_status = 'active'
  );
$$;
revoke all on function public.is_active_account() from public, anon;
grant execute on function public.is_active_account() to authenticated;

create or replace function app_private.reject_immutable_mutation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'immutable_record';
end;
$$;
revoke all on function app_private.reject_immutable_mutation() from public, anon, authenticated;
grant execute on function app_private.reject_immutable_mutation() to service_role;

create trigger submission_revisions_immutable
before update or delete on public.submission_revisions
for each row execute function app_private.reject_immutable_mutation();
create trigger review_decisions_immutable
before update or delete on public.review_decisions
for each row execute function app_private.reject_immutable_mutation();
create trigger audit_log_immutable
before update or delete on public.audit_log
for each row execute function app_private.reject_immutable_mutation();

create or replace function public.bump_profile_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.account_status is distinct from new.account_status
     and not exists (
       select 1 from app_private.account_status_mutation_guards
       where transaction_id = txid_current()
     ) then
    raise exception 'account_status_is_server_managed';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.bump_profile_version() from public, anon, authenticated;
grant execute on function public.bump_profile_version() to service_role;
create trigger profiles_version before update on public.profiles
for each row execute function public.bump_profile_version();

create or replace function public.guard_submission_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.author_id is distinct from new.author_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'author_is_immutable';
  end if;
  if old.status is distinct from new.status
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'status_is_server_managed';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_submission_update() from public, anon, authenticated;
grant execute on function public.guard_submission_update() to service_role;
create trigger submissions_version before update on public.submissions
for each row execute function public.guard_submission_update();

create or replace function public.guard_notification_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and (old.user_id, old.kind, old.title, old.body, old.email_state) is distinct from
         (new.user_id, new.kind, new.title, new.body, new.email_state) then
    raise exception 'notification_fields_are_server_managed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_notification_update() from public, anon, authenticated;
grant execute on function public.guard_notification_update() to service_role;
create trigger notifications_guard before update on public.notifications
for each row execute function public.guard_notification_update();

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.set_audit_context('system', null, 'Account profile provisioned');
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 100), ''), 'Contributor'))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function app_private.set_submission_status(
  submission_uuid uuid, expected_version bigint, next_status public.submission_status
)
returns public.submission_status
language plpgsql security definer set search_path = ''
as $$
declare resulting_status public.submission_status;
begin
  perform app_private.set_audit_context('system', null, 'Submission status transition');
  update public.submissions
  set status = next_status,
      submitted_at = case when next_status = 'under_review' then coalesce(submitted_at, now()) else submitted_at end
  where id = submission_uuid and version = expected_version
  returning status into resulting_status;
  if resulting_status is null then raise exception 'submission_version_conflict'; end if;
  return resulting_status;
end;
$$;
revoke all on function app_private.set_submission_status(uuid, bigint, public.submission_status) from public, anon, authenticated;
grant execute on function app_private.set_submission_status(uuid, bigint, public.submission_status) to service_role;

create or replace function app_private.set_account_status(
  p_user_id uuid,
  p_expected_version bigint,
  p_next_status public.account_status,
  p_actor_type public.actor_type,
  p_actor_id uuid,
  p_reason text
)
returns public.account_status
language plpgsql security definer set search_path = ''
as $$
declare resulting_status public.account_status;
begin
  if p_expected_version is null
     or p_expected_version <= 0
     or p_reason is null
     or p_actor_type is null
     or char_length(trim(p_reason)) not between 10 and 2000
     or p_actor_type not in ('admin', 'system') then
    raise exception 'invalid_account_status_change';
  end if;
  if p_actor_type = 'system' and p_actor_id is not null then
    raise exception 'invalid_account_status_actor';
  end if;
  if p_actor_type = 'admin'
     and (p_actor_id is null or not exists (
       select 1
       from public.roles r
       join public.profiles p on p.id = r.user_id
       where r.user_id = p_actor_id and r.role = 'admin' and p.account_status = 'active'
     )) then
    raise exception 'invalid_account_status_actor';
  end if;
  perform app_private.set_audit_context(p_actor_type, p_actor_id, p_reason);
  insert into app_private.account_status_mutation_guards(transaction_id)
  values (txid_current());
  update public.profiles
  set account_status = p_next_status
  where id = p_user_id
    and version = p_expected_version
    and account_status is distinct from p_next_status
  returning account_status into resulting_status;
  delete from app_private.account_status_mutation_guards where transaction_id = txid_current();
  if resulting_status is null then raise exception 'profile_version_conflict'; end if;
  return resulting_status;
end;
$$;
revoke all on function app_private.set_account_status(uuid, bigint, public.account_status, public.actor_type, uuid, text) from public, anon, authenticated;
grant execute on function app_private.set_account_status(uuid, bigint, public.account_status, public.actor_type, uuid, text) to service_role;

create or replace function app_private.record_review_decision(
  p_submission_id uuid,
  p_submission_version bigint,
  p_actor_type public.actor_type,
  p_actor_id uuid,
  p_decision public.decision_kind,
  p_reason text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare decision_id uuid;
begin
  if p_submission_version is null
     or p_submission_version <= 0
     or p_actor_type is null
     or p_actor_type not in ('reviewer', 'admin', 'system')
     or p_reason is null
     or char_length(trim(p_reason)) not between 10 and 2000 then
    raise exception 'invalid_review_decision';
  end if;
  if p_actor_type = 'system' and p_actor_id is not null then
    raise exception 'invalid_review_actor';
  end if;
  if p_actor_type in ('reviewer', 'admin')
     and (p_actor_id is null or not exists (
       select 1
       from public.roles r
       join public.profiles p on p.id = r.user_id
       where r.user_id = p_actor_id
         and r.role::text = p_actor_type::text
         and p.account_status = 'active'
     )) then
    raise exception 'invalid_review_actor';
  end if;
  perform app_private.set_audit_context(p_actor_type, p_actor_id, p_reason);
  if not exists (
    select 1 from public.submissions
    where id = p_submission_id and version = p_submission_version
  ) then
    raise exception 'submission_version_conflict';
  end if;
  insert into public.review_decisions (
    submission_id, submission_version, actor_type, actor_id, decision, reason
  ) values (
    p_submission_id, p_submission_version, p_actor_type, p_actor_id, p_decision, trim(p_reason)
  ) on conflict (submission_id, submission_version, decision) do nothing
  returning id into decision_id;
  if decision_id is null then
    select id into decision_id
    from public.review_decisions
    where submission_id = p_submission_id
      and submission_version = p_submission_version
      and decision = p_decision;
  end if;
  return decision_id;
end;
$$;
revoke all on function app_private.record_review_decision(uuid, bigint, public.actor_type, uuid, public.decision_kind, text) from public, anon, authenticated;
grant execute on function app_private.record_review_decision(uuid, bigint, public.actor_type, uuid, public.decision_kind, text) to service_role;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.submissions enable row level security;
alter table public.submissions force row level security;
alter table public.submission_revisions enable row level security;
alter table public.submission_revisions force row level security;
alter table public.review_decisions enable row level security;
alter table public.review_decisions force row level security;
alter table public.publications enable row level security;
alter table public.publications force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

create policy profiles_select on public.profiles for select to authenticated
using (public.is_active_account() and (id = (select auth.uid()) or public.has_role('reviewer') or public.has_role('admin')));
create policy profiles_update_own on public.profiles for update to authenticated
using (public.is_active_account() and id = (select auth.uid())) with check (public.is_active_account() and id = (select auth.uid()));

create policy submissions_select on public.submissions for select to authenticated
using (public.is_active_account() and (author_id = (select auth.uid()) or public.has_role('reviewer') or public.has_role('admin')));
create policy submissions_insert_own on public.submissions for insert to authenticated
with check (public.is_active_account() and author_id = (select auth.uid()) and status = 'draft');
create policy submissions_update_own on public.submissions for update to authenticated
using (public.is_active_account() and author_id = (select auth.uid()) and status in ('draft', 'changes_requested'))
with check (public.is_active_account() and author_id = (select auth.uid()) and status in ('draft', 'changes_requested'));

create policy revisions_select on public.submission_revisions for select to authenticated
using (
  public.is_active_account() and (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = (select auth.uid()))
  or public.has_role('reviewer') or public.has_role('admin')
  )
);
create policy decisions_select on public.review_decisions for select to authenticated
using (
  public.is_active_account() and (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = (select auth.uid()))
  or public.has_role('reviewer') or public.has_role('admin')
  )
);
create policy publications_select on public.publications for select to authenticated
using (
  public.is_active_account() and (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = (select auth.uid()))
  or public.has_role('reviewer') or public.has_role('admin')
  )
);
create policy notifications_select on public.notifications for select to authenticated
using (public.is_active_account() and user_id = (select auth.uid()));
create policy notifications_update_read on public.notifications for update to authenticated
using (public.is_active_account() and user_id = (select auth.uid())) with check (public.is_active_account() and user_id = (select auth.uid()));

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.submissions, public.submission_revisions,
  public.review_decisions, public.publications, public.notifications to authenticated;
grant update on public.profiles, public.notifications to authenticated;
revoke all on public.roles, public.audit_log from anon, authenticated;

grant all on public.profiles, public.roles, public.submissions, public.notifications to service_role;
grant select, insert on public.submission_revisions to service_role;
grant select on public.review_decisions to service_role;
grant select, insert, update on public.publications to service_role;
grant select, insert on public.audit_log to service_role;

comment on table public.roles is 'Server-managed role assignments; never trust user metadata for authorization.';
comment on table public.submissions is 'Client writes are intentionally revoked; the server DAL validates editor documents before using the service role.';
comment on table public.audit_log is 'Append-only security and administrative audit records.';
