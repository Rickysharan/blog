begin;

select plan(4);

select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.studio_tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%top-10%'
  ),
  1::bigint,
  'Studio tasks accept the Top 10 category'
);

select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.publication_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%top-10%'
  ),
  1::bigint,
  'Studio publication history accepts the Top 10 category'
);

select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.submissions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%top-10%'
  ),
  1::bigint,
  'Contributor submissions accept the Top 10 category'
);

select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.trending_topics'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%top-10%'
  ),
  1::bigint,
  'Trending topics accept the Top 10 category'
);

select * from finish();
rollback;
