-- Local-only deterministic fixtures. Every identity is in the reserved test UUID range.
-- Do not copy these rows, passwords, or role assignments into a production project.

set request.jwt.claim.role = 'service_role';
select app_private.set_audit_context('system', null, 'Deterministic fixture seed');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'fixture-contributor@example.invalid', '', '2026-01-15T12:00:00Z', '{}', '{"display_name":"Fixture Contributor"}'),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'fixture-reviewer@example.invalid', '', '2026-01-15T12:00:00Z', '{}', '{"display_name":"Fixture Reviewer"}'),
  ('00000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'fixture-admin@example.invalid', '', '2026-01-15T12:00:00Z', '{}', '{"display_name":"Fixture Admin"}')
on conflict (id) do nothing;

select app_private.set_audit_context('system', null, 'Deterministic fixture seed');

insert into public.roles (user_id, role, granted_by)
values
  ('00000000-0000-4000-8000-000000000102', 'reviewer', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000000103', 'admin', '00000000-0000-4000-8000-000000000103')
on conflict (user_id, role) do nothing;

insert into public.submissions (
  id, author_id, title, content_document, category, region, language,
  primary_source_name, primary_source_url, private_image_path, guidelines_version,
  guidelines_accepted, status, submitted_at
)
values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101', 'Fixture: under review', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Under review fixture"}]}]}', 'anime', 'global', 'en', 'Fixture Source', 'https://example.com/under-review', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000111/00000000-0000-4000-8000-000000000221.webp', 'fixture-v1', true, 'under_review', '2026-01-15T12:00:00Z'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000101', 'Fixture: published', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Published fixture"}]}]}', 'movies', 'global', 'en', 'Fixture Source', 'https://example.com/published', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000112/00000000-0000-4000-8000-000000000222.webp', 'fixture-v1', true, 'published', '2026-01-15T12:00:00Z'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000101', 'Fixture: rejected', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Rejected fixture"}]}]}', 'politics', 'global', 'en', 'Fixture Source', 'https://example.com/rejected', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000113/00000000-0000-4000-8000-000000000223.webp', 'fixture-v1', true, 'rejected', '2026-01-15T12:00:00Z'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000101', 'Fixture: duplicate conflict', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Duplicate conflict fixture"}]}]}', 'sports', 'global', 'en', 'Fixture Source', 'https://example.com/duplicate', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000114/00000000-0000-4000-8000-000000000224.webp', 'fixture-v1', true, 'manual_review', '2026-01-15T12:00:00Z'),
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-000000000101', 'Fixture: provider exhausted', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Provider exhausted fixture"}]}]}', 'finance', 'global', 'en', 'Fixture Source', 'https://example.com/provider-exhausted', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000115/00000000-0000-4000-8000-000000000225.webp', 'fixture-v1', true, 'publishing_failed', '2026-01-15T12:00:00Z')
on conflict (id) do update set status = excluded.status, submitted_at = excluded.submitted_at;

insert into public.submission_revisions (id, submission_id, author_id, submission_version, content_document, content_sha256)
values
  ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101', 1, '{"type":"doc","content":[]}', repeat('1', 64)),
  ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000101', 1, '{"type":"doc","content":[]}', repeat('2', 64))
on conflict (id) do nothing;

insert into public.review_runs (id, submission_id, submission_version, stage, attempt, provider, status, provider_result, completed_at)
values
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000111', 1, 'quality', 1, 'fixture-reviewer', 'passed', '{"score":0.9}', '2026-01-15T12:00:00Z'),
  ('00000000-0000-4000-8000-000000000132', '00000000-0000-4000-8000-000000000114', 1, 'duplicate', 1, 'fixture-reviewer', 'manual_review', '{"match":true}', '2026-01-15T12:00:00Z'),
  ('00000000-0000-4000-8000-000000000133', '00000000-0000-4000-8000-000000000115', 1, 'quality', 1, 'fixture-provider', 'failed', '{"provider":"exhausted"}', '2026-01-15T12:00:00Z')
on conflict do nothing;

insert into public.duplicate_matches (id, submission_id, candidate_submission_id, similarity, resolution)
values ('00000000-0000-4000-8000-000000000141', '00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000111', 0.9821, 'unresolved')
on conflict do nothing;

insert into public.pipeline_events (id, submission_id, stage, event_type, payload)
values
  ('00000000-0000-4000-8000-000000000151', '00000000-0000-4000-8000-000000000115', 'provider', 'exhausted', '{"provider":"fixture-provider"}')
on conflict (id) do nothing;

insert into public.publications (id, submission_id, publication_id, article_slug, blog_url, state)
values ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000162', 'fixture-published-story', 'https://blog.example.com/article/fixture-published-story', 'published')
on conflict (id) do nothing;

insert into public.reward_rules (event_type, points)
values ('fixture_published', 25)
on conflict (event_type) do update set points = excluded.points;
insert into public.display_rates (currency_code, points_per_unit)
values ('USD', 100)
on conflict (currency_code) do update set points_per_unit = excluded.points_per_unit;
do $$ begin
  perform app_private.post_wallet_transaction(
    '00000000-0000-4000-8000-000000000101', 25, 'earn', 'fixture-earn-published', '00000000-0000-4000-8000-000000000112'
  );
end $$;
select app_private.set_audit_context('system', null, 'Deterministic fixture seed');

insert into public.trending_topics (id, topic_key, title, category, trend_score)
values ('00000000-0000-4000-8000-000000000171', 'fixture-topic', 'Fixture trending topic', 'anime', 10)
on conflict (id) do update set trend_score = excluded.trend_score, active = true;
insert into public.topic_claims (id, topic_id, user_id, status, expires_at)
values ('00000000-0000-4000-8000-000000000172', '00000000-0000-4000-8000-000000000171', '00000000-0000-4000-8000-000000000101', 'expired', '2026-01-14T12:00:00Z')
on conflict (id) do update set status = excluded.status, expires_at = excluded.expires_at;

insert into public.health_checks (id, check_name, status, latency_ms, details)
values ('00000000-0000-4000-8000-000000000181', 'fixture-provider', 'degraded', 900, '{"reason":"provider quota"}')
on conflict (id) do update set status = excluded.status, latency_ms = excluded.latency_ms;
insert into public.daily_metrics (metric_date, category, metric_name, metric_value)
values ('2026-01-15', 'global', 'fixture_articles', 5)
on conflict (metric_date, category, metric_name) do update set metric_value = excluded.metric_value;
insert into public.credential_metadata (id, provider, label, environment, verification_state, rotation_url)
values ('00000000-0000-4000-8000-000000000191', 'fixture-provider', 'Local fixture only', 'development', 'verified', 'https://example.com/rotate')
on conflict (id) do update set verification_state = excluded.verification_state;
insert into public.notifications (id, user_id, kind, title, body, email_state)
values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'fixture_delivery', 'Fixture delivery failed', 'This fixture models a retryable email delivery.', 'retryable')
on conflict (id) do update set email_state = excluded.email_state;
insert into public.contact_inquiries (id, user_id, sender_email, message, delivery_state)
values ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000101', 'fixture@example.invalid', 'Local contact fixture', 'failed')
on conflict (id) do update set delivery_state = excluded.delivery_state;
