create or replace function app_private.create_submission_draft(
  p_submission_id uuid,
  p_author_id uuid,
  p_title text,
  p_content_document jsonb,
  p_category text,
  p_region text,
  p_language text,
  p_primary_source_name text,
  p_primary_source_url text,
  p_private_image_path text,
  p_guidelines_version text,
  p_guidelines_accepted boolean
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.submissions;
begin
  perform app_private.set_audit_context('contributor', p_author_id, 'Contributor created a private draft');
  insert into public.submissions (
    id, author_id, title, content_document, category, region, language,
    primary_source_name, primary_source_url, private_image_path,
    guidelines_version, guidelines_accepted, status
  ) values (
    p_submission_id, p_author_id, trim(p_title), p_content_document, p_category, p_region, p_language,
    trim(p_primary_source_name), p_primary_source_url, p_private_image_path,
    trim(p_guidelines_version), p_guidelines_accepted, 'draft'
  ) returning * into created;
  return created;
end;
$$;

create or replace function app_private.save_submission(
  p_submission_id uuid,
  p_author_id uuid,
  p_expected_version bigint,
  p_title text,
  p_content_document jsonb,
  p_category text,
  p_region text,
  p_language text,
  p_primary_source_name text,
  p_primary_source_url text,
  p_private_image_path text,
  p_guidelines_version text,
  p_guidelines_accepted boolean,
  p_submit boolean
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.submissions;
begin
  perform app_private.set_audit_context('contributor', p_author_id, case when p_submit then 'Contributor submitted a draft for review' else 'Contributor saved a private draft' end);
  update public.submissions
  set title = trim(p_title),
      content_document = p_content_document,
      category = p_category,
      region = p_region,
      language = p_language,
      primary_source_name = trim(p_primary_source_name),
      primary_source_url = p_primary_source_url,
      private_image_path = p_private_image_path,
      guidelines_version = trim(p_guidelines_version),
      guidelines_accepted = p_guidelines_accepted,
      status = case when p_submit then 'under_review'::public.submission_status else status end,
      submitted_at = case when p_submit then coalesce(submitted_at, now()) else submitted_at end
  where id = p_submission_id
    and author_id = p_author_id
    and version = p_expected_version
    and status in ('draft', 'changes_requested');

  if not found then raise exception 'submission_version_conflict'; end if;
  select * into saved from public.submissions where id = p_submission_id;
  insert into public.submission_revisions (submission_id, author_id, submission_version, content_document, content_sha256)
  values (saved.id, saved.author_id, saved.version, saved.content_document,
          encode(extensions.digest(saved.content_document::text, 'sha256'), 'hex'));
  return saved;
end;
$$;

revoke all on function app_private.create_submission_draft(uuid, uuid, text, jsonb, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function app_private.create_submission_draft(uuid, uuid, text, jsonb, text, text, text, text, text, text, text, boolean) to service_role;
revoke all on function app_private.save_submission(uuid, uuid, bigint, text, jsonb, text, text, text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function app_private.save_submission(uuid, uuid, bigint, text, jsonb, text, text, text, text, text, text, text, boolean, boolean) to service_role;
