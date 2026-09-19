-- New Supabase sb_secret_* keys do not expose the legacy JWT role claim to
-- Postgres. Authorize status transitions by the audited private RPC context
-- instead, while keeping direct service-role status updates blocked.

revoke execute on function app_private.set_audit_context(public.actor_type, uuid, text)
from service_role;

create or replace function public.guard_submission_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.author_id is distinct from new.author_id then
    raise exception 'author_is_immutable';
  end if;

  if old.status is distinct from new.status
     and not exists (
       select 1
       from app_private.audit_contexts
       where transaction_id = txid_current()
     ) then
    raise exception 'status_is_server_managed';
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.guard_submission_update() from public, anon, authenticated;
grant execute on function public.guard_submission_update() to service_role;

comment on function public.guard_submission_update() is
  'Keeps authors immutable and permits status changes only inside an audited private mutation RPC.';
