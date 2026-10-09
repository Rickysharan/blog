select app_private.set_audit_context('system', null, 'Publication pipeline configuration initialized');

insert into app_private.settings(key, value)
values ('BLOG_PUBLISHING_PAUSED', 'false'::jsonb)
on conflict (key) do nothing;

insert into public.reward_rules(event_type, points, enabled)
values ('article_published', 25, true)
on conflict (event_type) do nothing;

drop policy if exists submission_images_update_own on storage.objects;
create policy submission_images_update_own on storage.objects
for update to authenticated
using (
  public.is_active_account()
  and bucket_id = 'submission-images'
  and owner_id::text = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.submissions submission
    where submission.id::text = (storage.foldername(name))[2]
      and submission.author_id = (select auth.uid())
      and submission.status in ('draft', 'changes_requested')
  )
)
with check (
  public.is_active_account()
  and bucket_id = 'submission-images'
  and owner_id::text = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
  and exists (
    select 1
    from public.submissions submission
    where submission.id::text = (storage.foldername(name))[2]
      and submission.author_id = (select auth.uid())
      and submission.status in ('draft', 'changes_requested')
  )
);

create table app_private.publication_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_id uuid not null unique references public.publications(publication_id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete restrict,
  submission_version bigint not null check (submission_version > 0),
  state text not null default 'queued' check (
    state in ('queued', 'processing', 'retryable', 'paused', 'manual_review', 'published', 'failed')
  ),
  reward_points numeric(14,2) not null check (reward_points > 0),
  approved_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_owner uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  git_commit_url text check (git_commit_url is null or char_length(git_commit_url) <= 2048),
  article_path text check (article_path is null or char_length(article_path) <= 240),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_.-]{1,80}$'),
  last_error_reason text check (
    last_error_reason is null
    or (char_length(last_error_reason) between 10 and 500 and last_error_reason !~ '[[:cntrl:]]')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_outbox_submission_version_key unique (submission_id, submission_version),
  constraint publication_outbox_lease_complete check (
    (lease_owner is null and lease_token is null and lease_expires_at is null)
    or (lease_owner is not null and lease_token is not null and lease_expires_at is not null)
  )
);

create index publication_outbox_claim_idx
on app_private.publication_outbox(state, next_attempt_at, lease_expires_at, created_at);

alter table app_private.publication_outbox enable row level security;
alter table app_private.publication_outbox force row level security;
revoke all on table app_private.publication_outbox from public, anon, authenticated, service_role;

create trigger publication_outbox_touch
before update on app_private.publication_outbox
for each row execute function app_private.touch_updated_at();

create trigger publication_outbox_audit
after insert or update or delete on app_private.publication_outbox
for each row execute function app_private.record_audit();

create or replace function app_private.reject_submission_reversal_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('approved', 'publishing', 'published', 'publishing_failed')
     and new.status in ('rejected', 'changes_requested') then
    raise exception 'approved_submission_decision_is_final';
  end if;
  return new;
end;
$$;
revoke all on function app_private.reject_submission_reversal_after_approval() from public, anon, authenticated, service_role;

create trigger submissions_reject_after_approval_guard
before update of status on public.submissions
for each row execute function app_private.reject_submission_reversal_after_approval();

create or replace function app_private.enqueue_approved_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved_version bigint;
  approved_timestamp timestamptz;
  publication_uuid uuid := extensions.gen_random_uuid();
  reward numeric(14,2);
  slug_base text;
  generated_slug text;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select rd.submission_version, rd.created_at
  into approved_version, approved_timestamp
  from public.review_decisions rd
  where rd.submission_id = new.id and rd.decision = 'approve'
  order by rd.created_at desc
  limit 1;

  approved_version := coalesce(approved_version, greatest(new.version - 1, 1));
  approved_timestamp := coalesce(approved_timestamp, now());

  select rr.points
  into reward
  from public.reward_rules rr
  where rr.event_type = 'article_published' and rr.enabled
  limit 1;
  if reward is null or reward <= 0 then
    raise exception 'publication_reward_rule_missing';
  end if;

  slug_base := trim(both '-' from regexp_replace(lower(new.title), '[^a-z0-9]+', '-', 'g'));
  slug_base := coalesce(nullif(slug_base, ''), 'story');
  generated_slug := left(slug_base, 100) || '-' || left(replace(publication_uuid::text, '-', ''), 8);

  insert into public.publications(submission_id, publication_id, article_slug, state)
  values (new.id, publication_uuid, generated_slug, 'pending');

  insert into app_private.publication_outbox(
    publication_id, submission_id, submission_version, reward_points, approved_at
  ) values (
    publication_uuid, new.id, approved_version, reward, approved_timestamp
  )
  on conflict (submission_id, submission_version) do nothing;

  return new;
end;
$$;
revoke all on function app_private.enqueue_approved_publication() from public, anon, authenticated, service_role;

create trigger submissions_enqueue_publication
after update of status on public.submissions
for each row
when (new.status = 'approved' and old.status is distinct from new.status)
execute function app_private.enqueue_approved_publication();

create or replace function app_private.claim_publication_outbox(
  p_worker_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_id uuid;
  token uuid := extensions.gen_random_uuid();
  result jsonb;
begin
  if p_worker_id is null or p_lease_seconds is null or p_lease_seconds not between 15 and 300 then
    raise exception 'invalid_publication_lease';
  end if;
  if coalesce((select value from app_private.settings where key = 'BLOG_PUBLISHING_PAUSED'), 'false'::jsonb) = 'true'::jsonb then
    return null;
  end if;

  select o.id
  into candidate_id
  from app_private.publication_outbox o
  where (
      (o.state in ('queued', 'retryable') and o.next_attempt_at <= now() and o.attempt_count < o.max_attempts)
      or (o.state = 'processing' and o.lease_expires_at <= now())
    )
  order by o.next_attempt_at, o.created_at, o.id
  for update skip locked
  limit 1;
  if candidate_id is null then return null; end if;

  perform app_private.set_audit_context('system', null, 'Publication outbox work leased');
  update app_private.publication_outbox
  set state = 'processing',
      attempt_count = attempt_count + 1,
      lease_owner = p_worker_id,
      lease_token = token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      last_error_reason = null
  where id = candidate_id;

  update public.publications p
  set state = 'publishing', retry_count = o.attempt_count, last_error_code = null, updated_at = now()
  from app_private.publication_outbox o
  where o.id = candidate_id and p.publication_id = o.publication_id and p.state <> 'published';

  update public.submissions s
  set status = 'publishing'
  from app_private.publication_outbox o
  where o.id = candidate_id and s.id = o.submission_id and s.status in ('approved', 'publishing_failed');

  select jsonb_build_object(
    'outboxId', o.id,
    'publicationId', o.publication_id,
    'submissionId', o.submission_id,
    'submissionVersion', o.submission_version,
    'authorId', s.author_id,
    'contributorName', p.display_name,
    'title', s.title,
    'slug', publication.article_slug,
    'approvedAt', o.approved_at,
    'category', s.category,
    'region', s.region,
    'language', s.language,
    'sourceName', s.primary_source_name,
    'sourceUrl', s.primary_source_url,
    'privateImagePath', s.private_image_path,
    'guidelinesVersion', s.guidelines_version,
    'contentDocument', s.content_document,
    'rewardPoints', o.reward_points,
    'attemptCount', o.attempt_count,
    'leaseToken', o.lease_token
  )
  into result
  from app_private.publication_outbox o
  join public.submissions s on s.id = o.submission_id
  join public.profiles p on p.id = s.author_id
  join public.publications publication on publication.publication_id = o.publication_id
  where o.id = candidate_id;

  return result;
end;
$$;
revoke all on function app_private.claim_publication_outbox(uuid, integer) from public, anon, authenticated, service_role;

create or replace function public.claim_publication_outbox(
  p_worker_id uuid,
  p_lease_seconds integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app_private.claim_publication_outbox(p_worker_id, p_lease_seconds);
$$;
revoke all on function public.claim_publication_outbox(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_publication_outbox(uuid, integer) to service_role;

create or replace function app_private.complete_publication_outbox(
  p_outbox_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_commit_sha text,
  p_commit_url text,
  p_article_path text,
  p_article_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item app_private.publication_outbox%rowtype;
  publication public.publications%rowtype;
  expected_path text;
begin
  if p_outbox_id is null or p_worker_id is null or p_lease_token is null
     or p_commit_sha is null or p_commit_sha !~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$'
     or p_commit_url is null or char_length(p_commit_url) > 2048
     or p_commit_url !~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/commit/[a-f0-9]{40,64}$'
     or right(p_commit_url, char_length(p_commit_sha)) <> p_commit_sha
     or p_article_path is null or p_article_url is null
     or char_length(p_article_url) > 2048
     or p_article_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?/article/[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_publication_receipt';
  end if;

  select * into item
  from app_private.publication_outbox
  where id = p_outbox_id
  for update;
  if not found then raise exception 'publication_outbox_not_found'; end if;

  select * into publication
  from public.publications
  where publication_id = item.publication_id;
  expected_path := 'content/articles/' || (select category from public.submissions where id = item.submission_id)
                   || '/' || publication.article_slug || '.mdx';
  if p_article_path <> expected_path or p_article_url !~ ('/article/' || publication.article_slug || '$') then
    raise exception 'invalid_publication_receipt';
  end if;

  if item.state = 'published' then
    if publication.git_commit_sha is distinct from p_commit_sha
       or publication.blog_url is distinct from p_article_url
       or item.git_commit_url is distinct from p_commit_url
       or item.article_path is distinct from p_article_path then
      raise exception 'publication_receipt_conflict';
    end if;
    return jsonb_build_object(
      'publicationId', item.publication_id,
      'commitSha', publication.git_commit_sha,
      'commitUrl', item.git_commit_url,
      'articlePath', item.article_path,
      'articleUrl', publication.blog_url,
      'replayed', true
    );
  end if;

  if item.state <> 'processing'
     or item.lease_owner is distinct from p_worker_id
     or item.lease_token is distinct from p_lease_token
     or item.lease_expires_at <= now() then
    raise exception 'publication_outbox_lease_lost';
  end if;

  perform app_private.set_audit_context('system', null, 'Publication commit acknowledged');
  update public.publications
  set git_commit_sha = p_commit_sha,
      blog_url = p_article_url,
      state = 'published',
      last_error_code = null,
      updated_at = now()
  where publication_id = item.publication_id;

  perform app_private.post_wallet_transaction(
    (select author_id from public.submissions where id = item.submission_id),
    item.reward_points,
    'earn',
    'publication:' || item.publication_id::text,
    'Publication reward for submission ' || item.submission_id::text
  );

  perform app_private.set_audit_context('system', null, 'Publication outbox completed');
  update app_private.publication_outbox
  set state = 'published',
      git_commit_url = p_commit_url,
      article_path = p_article_path,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = now(),
      last_error_code = null,
      last_error_reason = null
  where id = item.id;

  update public.submissions set status = 'published'
  where id = item.submission_id and status <> 'published';

  insert into public.pipeline_events(submission_id, stage, event_type, payload)
  values (item.submission_id, 'publication', 'published', jsonb_build_object('publicationId', item.publication_id));

  insert into public.notifications(user_id, kind, title, body)
  values (
    (select author_id from public.submissions where id = item.submission_id),
    'publication_published',
    'Your article is published',
    'Your approved article is live and its points were added once.'
  );

  return jsonb_build_object(
    'publicationId', item.publication_id,
    'commitSha', p_commit_sha,
    'commitUrl', p_commit_url,
    'articlePath', p_article_path,
    'articleUrl', p_article_url,
    'replayed', false
  );
end;
$$;
revoke all on function app_private.complete_publication_outbox(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;

create or replace function public.complete_publication_outbox(
  p_outbox_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_commit_sha text,
  p_commit_url text,
  p_article_path text,
  p_article_url text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app_private.complete_publication_outbox(
    p_outbox_id, p_worker_id, p_lease_token, p_commit_sha,
    p_commit_url, p_article_path, p_article_url
  );
$$;
revoke all on function public.complete_publication_outbox(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.complete_publication_outbox(uuid, uuid, uuid, text, text, text, text) to service_role;

create or replace function app_private.fail_publication_outbox(
  p_outbox_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_disposition text,
  p_error_code text,
  p_reason text,
  p_retry_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item app_private.publication_outbox%rowtype;
  next_state text;
begin
  if p_outbox_id is null or p_worker_id is null or p_lease_token is null
     or p_disposition is null or p_disposition not in ('retry', 'permanent', 'paused', 'manual_review')
     or p_error_code is null or p_error_code !~ '^[a-z0-9_.-]{1,80}$'
     or p_reason is null or char_length(trim(p_reason)) not between 10 and 500
     or p_reason ~ '[[:cntrl:]]'
     or (p_disposition = 'retry' and (p_retry_at is null or p_retry_at <= now() or p_retry_at > now() + interval '24 hours'))
     or (p_disposition <> 'retry' and p_retry_at is not null) then
    raise exception 'invalid_publication_failure';
  end if;

  select * into item
  from app_private.publication_outbox
  where id = p_outbox_id
  for update;
  if not found then raise exception 'publication_outbox_not_found'; end if;
  if item.state = 'published' then raise exception 'published_publication_is_immutable'; end if;
  if item.state <> 'processing'
     or item.lease_owner is distinct from p_worker_id
     or item.lease_token is distinct from p_lease_token
     or item.lease_expires_at <= now() then
    raise exception 'publication_outbox_lease_lost';
  end if;

  next_state := case
    when p_disposition = 'paused' then 'paused'
    when p_disposition = 'manual_review' then 'manual_review'
    when p_disposition = 'permanent' or item.attempt_count >= item.max_attempts then 'failed'
    else 'retryable'
  end;

  perform app_private.set_audit_context('system', null, 'Publication failure recorded safely');
  update app_private.publication_outbox
  set state = next_state,
      next_attempt_at = coalesce(p_retry_at, next_attempt_at),
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      last_error_reason = trim(p_reason)
  where id = item.id;

  update public.publications
  set state = case when next_state = 'retryable' then 'pending'::public.publication_state else 'failed'::public.publication_state end,
      retry_count = item.attempt_count,
      last_error_code = p_error_code,
      updated_at = now()
  where publication_id = item.publication_id and state <> 'published';

  if next_state <> 'retryable' then
    update public.submissions set status = 'publishing_failed'
    where id = item.submission_id and status <> 'published';
  end if;
  if next_state = 'paused' then
    update app_private.settings set value = 'true'::jsonb, updated_at = now()
    where key = 'BLOG_PUBLISHING_PAUSED';
  end if;

  insert into public.pipeline_events(submission_id, stage, event_type, payload)
  values (
    item.submission_id,
    'publication',
    case when next_state = 'retryable' then 'retry_scheduled' else 'publishing_failed' end,
    jsonb_build_object('publicationId', item.publication_id, 'code', p_error_code, 'state', next_state)
  );

  return jsonb_build_object('publicationId', item.publication_id, 'state', next_state);
end;
$$;
revoke all on function app_private.fail_publication_outbox(uuid, uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.fail_publication_outbox(
  p_outbox_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_disposition text,
  p_error_code text,
  p_reason text,
  p_retry_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app_private.fail_publication_outbox(
    p_outbox_id, p_worker_id, p_lease_token, p_disposition,
    p_error_code, p_reason, p_retry_at
  );
$$;
revoke all on function public.fail_publication_outbox(uuid, uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.fail_publication_outbox(uuid, uuid, uuid, text, text, text, timestamptz) to service_role;

create or replace function app_private.retry_publication_outbox(
  p_publication_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item app_private.publication_outbox%rowtype;
begin
  perform app_private.set_audit_context('admin', p_actor_id, p_reason);
  select * into item
  from app_private.publication_outbox
  where publication_id = p_publication_id
  for update;
  if not found or item.state not in ('failed', 'paused', 'manual_review') then
    raise exception 'publication_retry_not_available';
  end if;

  update app_private.publication_outbox
  set state = 'retryable',
      attempt_count = 0,
      next_attempt_at = now(),
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      last_error_reason = null
  where id = item.id;
  update public.publications
  set state = 'pending', retry_count = 0, last_error_code = null, updated_at = now()
  where publication_id = item.publication_id;
  update public.submissions set status = 'publishing'
  where id = item.submission_id;
  update app_private.settings set value = 'false'::jsonb, updated_at = now()
  where key = 'BLOG_PUBLISHING_PAUSED'
    and value = 'true'::jsonb
    and item.state = 'paused';
  return jsonb_build_object('publicationId', item.publication_id, 'state', 'retryable');
end;
$$;
revoke all on function app_private.retry_publication_outbox(uuid, uuid, text) from public, anon, authenticated, service_role;

create or replace function public.retry_publication_outbox(
  p_publication_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app_private.retry_publication_outbox(p_publication_id, p_actor_id, p_reason);
$$;
revoke all on function public.retry_publication_outbox(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.retry_publication_outbox(uuid, uuid, text) to service_role;

comment on table app_private.publication_outbox is
  'Private exactly-once publication work. Network calls happen only after a short lease RPC transaction.';
comment on function public.claim_publication_outbox(uuid, integer) is
  'Service-only Data API gateway for compare-and-set publication leases.';
comment on function public.complete_publication_outbox(uuid, uuid, uuid, text, text, text, text) is
  'Service-only atomic publication receipt and wallet-credit acknowledgement.';
