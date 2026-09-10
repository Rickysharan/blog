create table if not exists app_private.review_replay_nonces (
  nonce text primary key check (char_length(nonce) between 16 and 128),
  expires_at timestamptz not null
);
revoke all on table app_private.review_replay_nonces from public, anon, authenticated;
grant insert, delete on table app_private.review_replay_nonces to service_role;

create or replace function app_private.consume_review_nonce(p_nonce text, p_expires_at timestamptz)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  delete from app_private.review_replay_nonces where expires_at < now();
  insert into app_private.review_replay_nonces(nonce, expires_at) values (p_nonce, p_expires_at) on conflict do nothing;
  return found;
end;
$$;
revoke all on function app_private.consume_review_nonce(text, timestamptz) from public, anon, authenticated;
grant execute on function app_private.consume_review_nonce(text, timestamptz) to service_role;
