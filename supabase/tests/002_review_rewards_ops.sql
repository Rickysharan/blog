begin;

select plan(42);

select has_table('public', 'review_runs', 'review runs table exists');
select has_table('public', 'duplicate_matches', 'duplicate matches table exists');
select has_table('public', 'pipeline_events', 'pipeline events table exists');
select has_table('public', 'reputation_rules', 'reputation rules table exists');
select has_table('public', 'reputation_snapshots', 'reputation snapshots table exists');
select has_table('public', 'reward_rules', 'reward rules table exists');
select has_table('public', 'wallet_accounts', 'wallet accounts table exists');
select has_table('public', 'wallet_transactions', 'wallet transactions table exists');
select has_table('public', 'redemption_requests', 'redemption requests table exists');
select has_table('public', 'display_rates', 'display rates table exists');
select has_table('public', 'trending_topics', 'trending topics table exists');
select has_table('public', 'topic_claims', 'topic claims table exists');
select has_table('public', 'health_checks', 'health checks table exists');
select has_table('public', 'daily_metrics', 'daily metrics table exists');
select has_table('public', 'credential_metadata', 'credential metadata table exists');
select has_table('public', 'contact_inquiries', 'contact inquiries table exists');

select has_index('public', 'review_runs', 'review_runs_submission_stage_attempt_key', 'review attempts are idempotent');
select has_index('public', 'wallet_transactions', 'wallet_transactions_earn_idempotency_key_key', 'wallet earns have an idempotency key');
select has_index('public', 'topic_claims', 'topic_claims_one_active_topic_key', 'one active claimant per topic');
select has_index('public', 'topic_claims', 'topic_claims_one_active_user_topic_key', 'one active claim per user and topic');

select ok(
  exists (select 1 from pg_proc where pronamespace = 'app_private'::regnamespace and proname = 'post_wallet_transaction'),
  'wallet posting is a private function'
);
select ok(
  exists (select 1 from pg_proc where pronamespace = 'app_private'::regnamespace and proname = 'request_redemption'),
  'redemption requests use a private function'
);
select ok(
  exists (select 1 from pg_proc where pronamespace = 'app_private'::regnamespace and proname = 'claim_topic'),
  'topic claims use a private function'
);
select ok(
  exists (
    select 1 from app_private.settings
    where key = 'REDEMPTIONS_ENABLED' and value = 'false'::jsonb
  ),
  'redemptions are disabled by the database default'
);
select ok(
  exists (select 1 from pg_proc where pronamespace = 'app_private'::regnamespace and proname = 'record_review_decision'),
  'review decisions use a private function'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'credential_metadata'
      and column_name in ('value', 'token', 'secret', 'api_key', 'credential_value')
  ),
  'credential metadata stores no secret values'
);

select has_policy('public', 'wallet_accounts', 'wallet_accounts_select_own', 'wallet account privacy policy exists');
select has_policy('public', 'wallet_transactions', 'wallet_transactions_select_own', 'wallet history privacy policy exists');
select has_policy('public', 'redemption_requests', 'redemption_requests_select_own', 'redemption privacy policy exists');
select has_policy('public', 'trending_topics', 'trending_topics_select', 'topics are readable');
select has_policy('public', 'contact_inquiries', 'contact_inquiries_no_client_access', 'contact has explicit deny policy');
select ok(
  exists (select 1 from pg_trigger where tgname = 'reputation_rules_audit'),
  'reputation rule changes are audited'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'reputation_snapshots_audit'),
  'reputation snapshot changes are audited'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'reward_rules_audit'),
  'reward rule changes are audited'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'display_rates_audit'),
  'display rate changes are audited'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'wallet@example.invalid', '', now(), '{}', '{}'),
  ('00000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'topic@example.invalid', '', now(), '{}', '{}');
set local role service_role;
do $$ begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform app_private.set_audit_context('system', null, 'Review rewards pgTAP fixture');
  perform app_private.post_wallet_transaction(
    '00000000-0000-4000-8000-000000000011', 25, 'earn', 'earn-once', 'test'
  );
  perform app_private.post_wallet_transaction(
    '00000000-0000-4000-8000-000000000011', 25, 'earn', 'earn-once', 'test'
  );
end $$;
select is(
  (select count(*)::integer from public.wallet_transactions where idempotency_key = 'earn-once'),
  1,
  'duplicate earn idempotency key credits exactly once'
);
select is(
  (select balance_points from public.wallet_accounts where user_id = '00000000-0000-4000-8000-000000000011'),
  25::numeric,
  'wallet balance is credited once'
);
select throws_ok(
  $$update public.wallet_transactions set amount_points = 99 where idempotency_key = 'earn-once'$$,
  NULL,
  'wallet history is append-only'
);
select throws_ok(
  $$select app_private.request_redemption('00000000-0000-4000-8000-000000000011', 10)$$,
  NULL,
  'disabled redemptions are rejected'
);
select throws_ok(
  $$select app_private.post_wallet_transaction('00000000-0000-4000-8000-000000000011', -1, 'earn', 'bad-sign-earn', 'test')$$,
  NULL,
  'earn transactions cannot debit the wallet'
);
select throws_ok(
  $$select app_private.post_wallet_transaction('00000000-0000-4000-8000-000000000011', 1, 'redemption', 'bad-sign-redemption', 'test')$$,
  NULL,
  'redemption transactions cannot credit the wallet'
);

select app_private.set_audit_context('system', null, 'Topic claim pgTAP fixture');

insert into public.trending_topics (id, topic_key, title, category)
values ('00000000-0000-4000-8000-000000000021', 'test-topic', 'Test topic', 'anime');
do $$ begin
  perform app_private.claim_topic(
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000011',
    interval '1 millisecond'
  );
end $$;
do $$ begin perform pg_sleep(0.01); end $$;
do $$ begin
  perform app_private.claim_topic(
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000012',
    interval '1 day'
  );
end $$;
select is(
  (select count(*)::integer from public.topic_claims where topic_id = '00000000-0000-4000-8000-000000000021' and status = 'active'),
  1,
  'expired topic claim frees the topic transactionally'
);

reset role;
select * from finish();
rollback;
