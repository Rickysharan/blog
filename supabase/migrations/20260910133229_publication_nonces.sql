create table app_private.publication_nonces (
  nonce_digest text not null check (nonce_digest ~ '^[0-9a-f]{64}$'),
  audience text not null check (char_length(audience) between 1 and 128),
  publication_id uuid not null,
  body_digest text not null check (body_digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > received_at),
  primary key (nonce_digest, audience)
);

alter table app_private.publication_nonces enable row level security;
alter table app_private.publication_nonces force row level security;
revoke all on table app_private.publication_nonces from public, anon, authenticated, service_role;
grant select, insert, delete on table app_private.publication_nonces to service_role;

create or replace function app_private.claim_publication_nonce(
  p_nonce_digest text,
  p_audience text,
  p_publication_id uuid,
  p_body_digest text,
  p_received_at timestamptz,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing app_private.publication_nonces%rowtype;
begin
  if p_nonce_digest is null
     or p_nonce_digest !~ '^[0-9a-f]{64}$'
     or p_body_digest is null
     or p_body_digest !~ '^[0-9a-f]{64}$'
     or p_audience is null
     or char_length(p_audience) not between 1 and 128
     or p_publication_id is null
     or p_received_at is null
     or p_received_at < now() - interval '5 minutes'
     or p_received_at > now() + interval '1 minute'
     or p_expires_at is null
     or p_expires_at <= p_received_at
     or p_expires_at > p_received_at + interval '10 minutes'
     or p_expires_at <= now() then
    raise exception 'invalid_publication_nonce_claim';
  end if;

  delete from app_private.publication_nonces
  where expires_at <= now();

  insert into app_private.publication_nonces (
    nonce_digest, audience, publication_id, body_digest, received_at, expires_at
  )
  values (
    p_nonce_digest, p_audience, p_publication_id, p_body_digest, p_received_at, p_expires_at
  )
  on conflict (nonce_digest, audience) do nothing;

  if found then
    return 'claimed';
  end if;

  select * into existing
  from app_private.publication_nonces
  where nonce_digest = p_nonce_digest and audience = p_audience
  for key share;

  if existing.publication_id = p_publication_id and existing.body_digest = p_body_digest then
    return 'replayed';
  end if;

  return 'conflict';
end;
$$;

revoke all on function app_private.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function app_private.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz) to service_role;

create or replace function public.claim_publication_nonce(
  p_nonce_digest text,
  p_audience text,
  p_publication_id uuid,
  p_body_digest text,
  p_received_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
set search_path = ''
as $$
  select app_private.claim_publication_nonce(
    p_nonce_digest,
    p_audience,
    p_publication_id,
    p_body_digest,
    p_received_at,
    p_expires_at
  );
$$;

revoke all on function public.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.claim_publication_nonce(text, text, uuid, text, timestamptz, timestamptz) to service_role;
