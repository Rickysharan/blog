begin;

select plan(21);

select has_column('public', 'contact_inquiries', 'source_site', 'contact source is stored');
select has_column('public', 'contact_inquiries', 'inquiry_type', 'contact route is stored');
select has_column('public', 'contact_inquiries', 'sender_name', 'contact sender name is stored');
select has_column('public', 'contact_inquiries', 'subject', 'contact subject is stored');
select has_column('public', 'contact_inquiries', 'identity_hash', 'pseudonymous rate-limit identity is stored');
select has_column('public', 'contact_inquiries', 'idempotency_key', 'contact idempotency key is stored');
select has_column('public', 'contact_inquiries', 'notification_error_code', 'notification failure is visible');

select ok(
  not has_table_privilege('service_role', 'public.contact_inquiries', 'INSERT'),
  'service role cannot bypass the contact RPC with direct inserts'
);
select ok(
  not has_table_privilege('service_role', 'public.contact_inquiries', 'UPDATE'),
  'service role cannot bypass the contact RPC with direct updates'
);
select ok(
  has_table_privilege('service_role', 'public.contact_inquiries', 'SELECT'),
  'service role can reconcile stored and failed enquiries'
);
select function_privs_are(
  'public',
  'submit_contact_inquiry',
  array['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'service_role',
  array['EXECUTE'],
  'service role can call the narrow contact insert RPC'
);
select function_privs_are(
  'public',
  'mark_contact_notification',
  array['uuid', 'uuid', 'text', 'text'],
  'service_role',
  array['EXECUTE'],
  'service role can record notification state'
);
select function_privs_are(
  'public',
  'submit_contact_inquiry',
  array['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous clients cannot call the contact insert RPC'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select results_eq(
  $$select created from public.submit_contact_inquiry(
    'blog', 'support', 'Fixture Sender', 'contact@example.invalid', null,
    'Fixture correction', 'This is a sufficiently detailed fixture message.',
    repeat('a', 64), '00000000-0000-4000-8000-000000000501'
  )$$,
  array[true],
  'the first idempotency key creates an enquiry'
);
select results_eq(
  $$select created from public.submit_contact_inquiry(
    'blog', 'support', 'Fixture Sender', 'contact@example.invalid', null,
    'Fixture correction', 'This is a sufficiently detailed fixture message.',
    repeat('a', 64), '00000000-0000-4000-8000-000000000501'
  )$$,
  array[false],
  'the same idempotency key does not create a second enquiry'
);
select is(
  (select count(*)::integer from public.contact_inquiries
    where idempotency_key = '00000000-0000-4000-8000-000000000501'),
  1,
  'idempotent retries store one row'
);
select lives_ok(
  $assertion$do $rate_limit$
  declare
    v_key uuid;
  begin
    foreach v_key in array array[
      '00000000-0000-4000-8000-000000000502'::uuid,
      '00000000-0000-4000-8000-000000000503'::uuid,
      '00000000-0000-4000-8000-000000000504'::uuid,
      '00000000-0000-4000-8000-000000000505'::uuid
    ] loop
      perform public.submit_contact_inquiry(
        'blog', 'general', 'Fixture Sender', 'contact@example.invalid', null,
        'Fixture enquiry', 'This is a sufficiently detailed fixture message.',
        repeat('a', 64), v_key
      );
    end loop;
  end
  $rate_limit$;
  $assertion$,
  'five distinct enquiries fit inside the database rate limit'
);
select throws_ok(
  $$select public.submit_contact_inquiry(
    'blog', 'general', 'Fixture Sender', 'contact@example.invalid', null,
    'Fixture enquiry', 'This is a sufficiently detailed fixture message.',
    repeat('a', 64), '00000000-0000-4000-8000-000000000506'
  )$$,
  null,
  'the database rejects the sixth enquiry in one hour'
);
select ok(
  public.mark_contact_notification(
    (select id from public.contact_inquiries
      where idempotency_key = '00000000-0000-4000-8000-000000000501'),
    '00000000-0000-4000-8000-000000000501',
    'failed',
    'notification_failed'
  ),
  'notification failure can be recorded'
);
select is(
  (select delivery_state from public.contact_inquiries
    where idempotency_key = '00000000-0000-4000-8000-000000000501'),
  'failed',
  'failed delivery remains visible for follow-up'
);

select throws_ok(
  $$select public.submit_contact_inquiry(
    'blog', 'support', 'Fixture Sender', 'contact@example.invalid', null,
    'Fixture correction', 'This is a sufficiently detailed fixture message.',
    repeat('b', 64), null
  )$$,
  null,
  'a missing idempotency key is rejected'
);

select * from finish();
rollback;
