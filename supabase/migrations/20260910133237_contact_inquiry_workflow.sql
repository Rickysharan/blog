alter table public.contact_inquiries
  add column source_site text not null default 'blog',
  add column inquiry_type text not null default 'general',
  add column sender_name text not null default 'Legacy sender',
  add column organisation text,
  add column subject text not null default 'Legacy enquiry',
  add column identity_hash text not null default repeat('0', 64),
  add column idempotency_key uuid not null default extensions.gen_random_uuid(),
  add column notification_error_code text;

alter table public.contact_inquiries
  add constraint contact_inquiries_source_site_check
    check (source_site in ('blog', 'contributor')),
  add constraint contact_inquiries_type_check
    check (inquiry_type in ('general', 'support', 'advertising', 'partnership')),
  add constraint contact_inquiries_sender_name_check
    check (char_length(trim(sender_name)) between 2 and 100),
  add constraint contact_inquiries_organisation_check
    check (organisation is null or char_length(organisation) between 1 and 160),
  add constraint contact_inquiries_subject_check
    check (char_length(trim(subject)) between 3 and 160),
  add constraint contact_inquiries_identity_hash_check
    check (identity_hash ~ '^[0-9a-f]{64}$'),
  add constraint contact_inquiries_notification_error_check
    check (notification_error_code is null or char_length(notification_error_code) between 1 and 80),
  add constraint contact_inquiries_idempotency_key_key unique (idempotency_key);

create index contact_inquiries_delivery_created_idx
  on public.contact_inquiries(delivery_state, created_at desc);

create or replace function public.submit_contact_inquiry(
  p_source_site text,
  p_inquiry_type text,
  p_sender_name text,
  p_sender_email text,
  p_organisation text,
  p_subject text,
  p_message text,
  p_identity_hash text,
  p_idempotency_key uuid
)
returns table(inquiry_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_created boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select ci.id
    into v_inquiry_id
    from public.contact_inquiries ci
   where ci.idempotency_key = p_idempotency_key;

  if v_inquiry_id is not null then
    return query select v_inquiry_id, false;
    return;
  end if;

  if p_source_site is null or p_source_site not in ('blog', 'contributor')
     or p_inquiry_type is null or p_inquiry_type not in ('general', 'support', 'advertising', 'partnership')
     or p_sender_name is null or char_length(trim(p_sender_name)) not between 2 and 100
     or p_sender_email is null or char_length(trim(p_sender_email)) > 254
     or trim(p_sender_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or (p_organisation is not null and char_length(trim(p_organisation)) not between 1 and 160)
     or p_subject is null or char_length(trim(p_subject)) not between 3 and 160
     or p_message is null or char_length(trim(p_message)) not between 20 and 5000
     or p_identity_hash is null or p_identity_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null then
    raise exception 'invalid_contact_inquiry';
  end if;

  if not app_private.consume_rate_limit(
    'contact:' || p_source_site || ':' || p_identity_hash,
    5,
    3600
  ) then
    raise exception 'contact_rate_limited';
  end if;

  perform app_private.set_audit_context('system', null, 'Validated contact inquiry stored');

  insert into public.contact_inquiries (
    source_site,
    inquiry_type,
    sender_name,
    sender_email,
    organisation,
    subject,
    message,
    identity_hash,
    idempotency_key
  ) values (
    p_source_site,
    p_inquiry_type,
    trim(p_sender_name),
    lower(trim(p_sender_email)),
    nullif(trim(p_organisation), ''),
    trim(p_subject),
    trim(p_message),
    p_identity_hash,
    p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_inquiry_id;

  if v_inquiry_id is not null then
    v_created := true;
  else
    select ci.id
      into v_inquiry_id
      from public.contact_inquiries ci
     where ci.idempotency_key = p_idempotency_key;
  end if;

  return query select v_inquiry_id, v_created;
end;
$$;

create or replace function public.mark_contact_notification(
  p_inquiry_id uuid,
  p_idempotency_key uuid,
  p_delivery_state text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     or p_inquiry_id is null
     or p_idempotency_key is null
     or p_delivery_state is null
     or p_delivery_state not in ('sent', 'failed')
     or (p_delivery_state = 'sent' and p_error_code is not null)
     or (p_delivery_state = 'failed' and (
       p_error_code is null or char_length(p_error_code) not between 1 and 80
     )) then
    raise exception 'invalid_contact_notification';
  end if;

  perform app_private.set_audit_context(
    'system',
    null,
    case
      when p_delivery_state = 'sent' then 'Contact notification accepted by provider'
      else 'Contact notification failed and requires follow-up'
    end
  );

  update public.contact_inquiries
     set delivery_state = p_delivery_state,
         notification_error_code = p_error_code
   where id = p_inquiry_id
     and idempotency_key = p_idempotency_key
     and delivery_state = 'pending';
  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

revoke all on function public.submit_contact_inquiry(text, text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_contact_inquiry(text, text, text, text, text, text, text, text, uuid)
  to service_role;

revoke all on function public.mark_contact_notification(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_contact_notification(uuid, uuid, text, text)
  to service_role;

revoke all on table public.contact_inquiries from service_role;
grant select on table public.contact_inquiries to service_role;
