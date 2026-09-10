select app_private.set_audit_context('system', null, 'Publication outbox claim hardening initialized');

alter table public.submissions
  drop constraint if exists submissions_primary_source_name_check;
alter table public.submissions
  add constraint submissions_primary_source_name_check
  check (char_length(trim(primary_source_name)) between 1 and 120) not valid;

alter table public.publications
  add constraint publications_article_slug_length_check
  check (char_length(article_slug) <= 120) not valid;

alter table app_private.publication_outbox
  add column publication_claim jsonb;

create or replace function app_private.publication_claim_is_valid(p_claim jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  required_keys constant text[] := array[
    'publicationId', 'submissionId', 'submissionVersion', 'authorId',
    'contributorName', 'title', 'slug', 'approvedAt', 'category', 'region',
    'language', 'sourceName', 'sourceUrl', 'privateImagePath',
    'guidelinesVersion', 'contentDocument', 'rewardPoints'
  ];
  string_keys constant text[] := array[
    'publicationId', 'submissionId', 'authorId', 'contributorName', 'title',
    'slug', 'approvedAt', 'category', 'region', 'language', 'sourceName',
    'sourceUrl', 'privateImagePath', 'guidelinesVersion'
  ];
begin
  if jsonb_typeof(p_claim) <> 'object'
     or not (p_claim ?& required_keys)
     or (select count(*) from jsonb_object_keys(p_claim)) <> cardinality(required_keys)
     or exists (
       select 1
       from jsonb_each(p_claim) field
       where field.key = any(string_keys) and jsonb_typeof(field.value) <> 'string'
     )
     or jsonb_typeof(p_claim->'submissionVersion') <> 'number'
     or jsonb_typeof(p_claim->'rewardPoints') <> 'number'
     or jsonb_typeof(p_claim->'contentDocument') <> 'object'
     or p_claim->'contentDocument'->>'type' <> 'doc'
     or octet_length((p_claim->'contentDocument')::text) > 300000
     or (p_claim->>'publicationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (p_claim->>'submissionId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or (p_claim->>'authorId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (p_claim->>'submissionVersion') !~ '^[1-9][0-9]*$'
     or char_length(trim(p_claim->>'contributorName')) not between 1 and 100
     or char_length(trim(p_claim->>'title')) not between 1 and 180
     or char_length(p_claim->>'slug') > 120
     or (p_claim->>'slug') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or (p_claim->>'approvedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$'
     or (p_claim->>'category') not in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market')
     or (p_claim->>'region') not in ('global', 'africa', 'asia', 'europe', 'middle-east', 'north-america', 'latin-america', 'oceania')
     or (p_claim->>'language') !~ '^[A-Za-z]{2,3}(?:-[A-Za-z]{4}|-[A-Za-z]{2}|-[0-9]{3}|-[A-Za-z0-9]{5,8})*$'
     or char_length(trim(p_claim->>'sourceName')) not between 1 and 120
     or char_length(p_claim->>'sourceUrl') > 2048
     or (p_claim->>'sourceUrl') !~ '^https://'
     or char_length(trim(p_claim->>'guidelinesVersion')) not between 1 and 64
     or (p_claim->>'privateImagePath') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
     or split_part(p_claim->>'privateImagePath', '/', 1) <> p_claim->>'authorId'
     or split_part(p_claim->>'privateImagePath', '/', 2) <> p_claim->>'submissionId'
     or (p_claim->>'rewardPoints')::numeric <= 0
     or (p_claim->>'rewardPoints')::numeric > 1000000 then
    return false;
  end if;

  perform (p_claim->>'publicationId')::uuid;
  perform (p_claim->>'submissionId')::uuid;
  perform (p_claim->>'authorId')::uuid;
  perform (p_claim->>'submissionVersion')::bigint;
  perform (p_claim->>'approvedAt')::timestamptz;
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function app_private.publication_claim_is_valid(jsonb) from public, anon, authenticated, service_role;

update app_private.publication_outbox o
set publication_claim = jsonb_build_object(
  'publicationId', o.publication_id,
  'submissionId', o.submission_id,
  'submissionVersion', o.submission_version,
  'authorId', s.author_id,
  'contributorName', trim(profile.display_name),
  'title', trim(s.title),
  'slug', publication.article_slug,
  'approvedAt', decision.created_at,
  'category', s.category,
  'region', s.region,
  'language', s.language,
  'sourceName', trim(s.primary_source_name),
  'sourceUrl', s.primary_source_url,
  'privateImagePath', s.private_image_path,
  'guidelinesVersion', trim(s.guidelines_version),
  'contentDocument', s.content_document,
  'rewardPoints', o.reward_points
)
from public.submissions s,
     public.profiles profile,
     public.publications publication,
     public.review_decisions decision
where s.id = o.submission_id
  and profile.id = s.author_id
  and publication.publication_id = o.publication_id
  and decision.submission_id = o.submission_id
  and decision.submission_version = o.submission_version
  and decision.decision = 'approve';

update app_private.publication_outbox
set publication_claim = '{}'::jsonb,
    state = case when state = 'published' then state else 'manual_review' end,
    lease_owner = null,
    lease_token = null,
    lease_expires_at = null,
    last_error_code = case when state = 'published' then last_error_code else 'publication_claim_invalid' end,
    last_error_reason = case when state = 'published' then last_error_reason else 'Publication claim requires manual review' end
where publication_claim is null;

alter table app_private.publication_outbox
  alter column publication_claim set not null;

create or replace function app_private.guard_publication_claim_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_claim is distinct from new.publication_claim
     or old.publication_id is distinct from new.publication_id
     or old.submission_id is distinct from new.submission_id
     or old.submission_version is distinct from new.submission_version
     or old.reward_points is distinct from new.reward_points
     or old.approved_at is distinct from new.approved_at then
    raise exception 'publication_claim_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_publication_claim_immutable() from public, anon, authenticated, service_role;

create trigger publication_outbox_claim_immutable
before update on app_private.publication_outbox
for each row execute function app_private.guard_publication_claim_immutable();

create or replace function app_private.enqueue_approved_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved_timestamp timestamptz;
  publication_uuid uuid := extensions.gen_random_uuid();
  reward numeric(14,2);
  contributor_name text;
  slug_base text;
  generated_slug text;
  claim jsonb;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select rd.created_at
  into approved_timestamp
  from public.review_decisions rd
  where rd.submission_id = new.id
    and rd.submission_version = old.version
    and rd.decision = 'approve';
  if not found then
    raise exception 'publication_approval_evidence_missing';
  end if;

  select rr.points
  into reward
  from public.reward_rules rr
  where rr.event_type = 'article_published' and rr.enabled
  limit 1;
  if reward is null or reward <= 0 then
    raise exception 'publication_reward_rule_missing';
  end if;

  select p.display_name into contributor_name
  from public.profiles p
  where p.id = new.author_id;
  if contributor_name is null then
    raise exception 'publication_contributor_missing';
  end if;

  slug_base := trim(both '-' from regexp_replace(lower(new.title), '[^a-z0-9]+', '-', 'g'));
  slug_base := coalesce(nullif(slug_base, ''), 'story');
  slug_base := trim(both '-' from left(slug_base, 111));
  slug_base := coalesce(nullif(slug_base, ''), 'story');
  generated_slug := slug_base || '-' || left(replace(publication_uuid::text, '-', ''), 8);

  claim := jsonb_build_object(
    'publicationId', publication_uuid,
    'submissionId', new.id,
    'submissionVersion', old.version,
    'authorId', new.author_id,
    'contributorName', trim(contributor_name),
    'title', trim(new.title),
    'slug', generated_slug,
    'approvedAt', approved_timestamp,
    'category', new.category,
    'region', new.region,
    'language', new.language,
    'sourceName', trim(new.primary_source_name),
    'sourceUrl', new.primary_source_url,
    'privateImagePath', new.private_image_path,
    'guidelinesVersion', trim(new.guidelines_version),
    'contentDocument', new.content_document,
    'rewardPoints', reward
  );
  if not app_private.publication_claim_is_valid(claim) then
    raise exception 'publication_claim_invalid';
  end if;

  insert into public.publications(submission_id, publication_id, article_slug, state)
  values (new.id, publication_uuid, generated_slug, 'pending');

  insert into app_private.publication_outbox(
    publication_id, submission_id, submission_version, reward_points, approved_at, publication_claim
  ) values (
    publication_uuid, new.id, old.version, reward, approved_timestamp, claim
  )
  on conflict (submission_id, submission_version) do nothing;

  return new;
end;
$$;
revoke all on function app_private.enqueue_approved_publication() from public, anon, authenticated, service_role;

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
  candidate app_private.publication_outbox%rowtype;
  token uuid;
  invalid_claim boolean;
  terminalized_count integer := 0;
begin
  if p_worker_id is null or p_lease_seconds is null or p_lease_seconds not between 15 and 300 then
    raise exception 'invalid_publication_lease';
  end if;
  if coalesce((select value from app_private.settings where key = 'BLOG_PUBLISHING_PAUSED'), 'false'::jsonb) = 'true'::jsonb then
    return null;
  end if;

  loop
    select o.* into candidate
    from app_private.publication_outbox o
    where o.state in ('queued', 'retryable', 'processing')
      and (
        (o.state in ('queued', 'retryable') and o.next_attempt_at <= now())
        or (o.state = 'processing' and o.lease_expires_at <= now())
      )
      and o.attempt_count >= o.max_attempts
    order by o.next_attempt_at, o.created_at, o.id
    for update skip locked
    limit 1;

    if found then
      perform app_private.set_audit_context('system', null, 'Publication retry budget exhausted after lease expiry');
      update app_private.publication_outbox
      set state = 'failed',
          lease_owner = null,
          lease_token = null,
          lease_expires_at = null,
          last_error_code = 'publication_retry_exhausted',
          last_error_reason = 'Publication retry budget was exhausted'
      where id = candidate.id;
      update public.publications
      set state = 'failed', retry_count = candidate.attempt_count,
          last_error_code = 'publication_retry_exhausted', updated_at = now()
      where publication_id = candidate.publication_id and state <> 'published';
      update public.submissions set status = 'publishing_failed'
      where id = candidate.submission_id and status <> 'published';
      insert into public.pipeline_events(submission_id, stage, event_type, payload)
      values (candidate.submission_id, 'publication', 'publishing_failed',
              jsonb_build_object('publicationId', candidate.publication_id, 'code', 'publication_retry_exhausted', 'state', 'failed'));
      terminalized_count := terminalized_count + 1;
      if terminalized_count >= 25 then return null; end if;
      continue;
    end if;

    select o.* into candidate
    from app_private.publication_outbox o
    where (
        (o.state in ('queued', 'retryable') and o.next_attempt_at <= now())
        or (o.state = 'processing' and o.lease_expires_at <= now())
      )
      and o.attempt_count < o.max_attempts
    order by o.next_attempt_at, o.created_at, o.id
    for update skip locked
    limit 1;
    if not found then return null; end if;

    invalid_claim := not coalesce(app_private.publication_claim_is_valid(candidate.publication_claim), false);
    if not invalid_claim then
      invalid_claim := candidate.publication_claim->>'publicationId' <> candidate.publication_id::text
        or candidate.publication_claim->>'submissionId' <> candidate.submission_id::text
        or (candidate.publication_claim->>'submissionVersion')::bigint <> candidate.submission_version
        or (candidate.publication_claim->>'approvedAt')::timestamptz <> candidate.approved_at
        or (candidate.publication_claim->>'rewardPoints')::numeric <> candidate.reward_points;
    end if;
    if invalid_claim then
      perform app_private.set_audit_context('system', null, 'Malformed publication claim sent to manual review');
      update app_private.publication_outbox
      set state = 'manual_review',
          lease_owner = null,
          lease_token = null,
          lease_expires_at = null,
          last_error_code = 'publication_claim_invalid',
          last_error_reason = 'Publication claim requires manual review'
      where id = candidate.id;
      update public.publications
      set state = 'failed', last_error_code = 'publication_claim_invalid', updated_at = now()
      where publication_id = candidate.publication_id and state <> 'published';
      update public.submissions set status = 'publishing_failed'
      where id = candidate.submission_id and status <> 'published';
      insert into public.pipeline_events(submission_id, stage, event_type, payload)
      values (candidate.submission_id, 'publication', 'publishing_failed',
              jsonb_build_object('publicationId', candidate.publication_id, 'code', 'publication_claim_invalid', 'state', 'manual_review'));
      terminalized_count := terminalized_count + 1;
      if terminalized_count >= 25 then return null; end if;
      continue;
    end if;

    token := extensions.gen_random_uuid();
    perform app_private.set_audit_context('system', null, 'Publication outbox work leased');
    update app_private.publication_outbox
    set state = 'processing',
        attempt_count = attempt_count + 1,
        lease_owner = p_worker_id,
        lease_token = token,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error_code = null,
        last_error_reason = null
    where id = candidate.id
    returning * into candidate;

    update public.publications
    set state = 'publishing', retry_count = candidate.attempt_count,
        last_error_code = null, updated_at = now()
    where publication_id = candidate.publication_id and state <> 'published';

    update public.submissions
    set status = 'publishing'
    where id = candidate.submission_id and status in ('approved', 'publishing_failed');

    return candidate.publication_claim || jsonb_build_object(
      'outboxId', candidate.id,
      'attemptCount', candidate.attempt_count,
      'leaseToken', candidate.lease_token
    );
  end loop;
end;
$$;
revoke all on function app_private.claim_publication_outbox(uuid, integer) from public, anon, authenticated, service_role;

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
  claim jsonb;
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
  claim := item.publication_claim;
  if not coalesce(app_private.publication_claim_is_valid(claim), false) then
    raise exception 'publication_claim_invalid';
  end if;
  if claim->>'publicationId' <> item.publication_id::text
     or claim->>'submissionId' <> item.submission_id::text
     or (claim->>'submissionVersion')::bigint <> item.submission_version
     or (claim->>'approvedAt')::timestamptz <> item.approved_at
     or (claim->>'rewardPoints')::numeric <> item.reward_points then
    raise exception 'publication_claim_invalid';
  end if;

  select * into publication
  from public.publications
  where publication_id = item.publication_id;
  expected_path := 'content/articles/' || claim->>'category' || '/' || claim->>'slug' || '.mdx';
  if p_article_path <> expected_path or p_article_url !~ ('/article/' || (claim->>'slug') || '$') then
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
    (claim->>'authorId')::uuid,
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
    (claim->>'authorId')::uuid,
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

comment on column app_private.publication_outbox.publication_claim is
  'Immutable complete publication pre-image captured only from an exact approve decision.';
