create or replace function app_private.consume_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket app_private.rate_limit_buckets%rowtype;
begin
  if p_bucket_key is null or char_length(p_bucket_key) not between 16 and 300
     or p_max_requests is null or p_max_requests < 1 or p_max_requests > 1000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit';
  end if;

  insert into app_private.rate_limit_buckets(bucket_key, window_started_at, request_count, max_requests)
  values (p_bucket_key, now(), 1, p_max_requests)
  on conflict (bucket_key) do update
    set request_count = case
      when extract(epoch from (now() - app_private.rate_limit_buckets.window_started_at)) >= p_window_seconds then 1
      else app_private.rate_limit_buckets.request_count + 1
    end,
    window_started_at = case
      when extract(epoch from (now() - app_private.rate_limit_buckets.window_started_at)) >= p_window_seconds then now()
      else app_private.rate_limit_buckets.window_started_at
    end,
    max_requests = excluded.max_requests,
    updated_at = now()
  returning * into bucket;

  return bucket.request_count <= bucket.max_requests;
end;
$$;

revoke all on function app_private.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function app_private.consume_rate_limit(text, integer, integer) to service_role;
