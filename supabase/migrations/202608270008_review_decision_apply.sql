create or replace function app_private.apply_review_decision(
  p_submission_id uuid,
  p_submission_version bigint,
  p_actor_type public.actor_type,
  p_actor_id uuid,
  p_decision public.decision_kind,
  p_reason text
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.submissions;
  next_status public.submission_status;
begin
  if p_submission_version is null or p_submission_version <= 0
     or p_actor_type is null or p_actor_type not in ('reviewer', 'admin', 'system')
     or p_reason is null or char_length(trim(p_reason)) not between 10 and 2000 then
    raise exception 'invalid_review_decision';
  end if;
  if p_actor_type = 'system' and p_actor_id is not null then raise exception 'invalid_review_actor'; end if;
  if p_actor_type in ('reviewer', 'admin') and (p_actor_id is null or not exists (
    select 1 from public.roles r join public.profiles p on p.id = r.user_id
    where r.user_id = p_actor_id and r.role::text = p_actor_type::text and p.account_status = 'active'
  )) then raise exception 'invalid_review_actor'; end if;
  if exists (
    select 1 from public.review_decisions
    where submission_id = p_submission_id
      and submission_version = p_submission_version
      and decision = p_decision
  ) then
    select * into result from public.submissions where id = p_submission_id;
    if found then
      perform app_private.set_audit_context(p_actor_type, p_actor_id, p_reason);
      return result;
    end if;
  end if;
  perform app_private.record_review_decision(p_submission_id, p_submission_version, p_actor_type, p_actor_id, p_decision, p_reason);
  next_status := case p_decision when 'approve' then 'approved'::public.submission_status when 'reject' then 'rejected'::public.submission_status else 'changes_requested'::public.submission_status end;
  perform app_private.set_audit_context(p_actor_type, p_actor_id, p_reason);
  update public.submissions set status = next_status
  where id = p_submission_id and version = p_submission_version and status in ('under_review', 'manual_review')
  returning * into result;
  if not found then
    select * into result from public.submissions where id = p_submission_id and status = next_status;
    if not found then raise exception 'submission_version_conflict'; end if;
  end if;
  return result;
end;
$$;
revoke all on function app_private.apply_review_decision(uuid, bigint, public.actor_type, uuid, public.decision_kind, text) from public, anon, authenticated;
grant execute on function app_private.apply_review_decision(uuid, bigint, public.actor_type, uuid, public.decision_kind, text) to service_role;
