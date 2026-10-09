alter table public.studio_tasks
  drop constraint studio_tasks_category_check,
  add constraint studio_tasks_category_check
    check (category is null or category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market', 'top-10'));

alter table public.publication_events
  drop constraint publication_events_category_check,
  add constraint publication_events_category_check
    check (category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market', 'top-10'));

alter table public.submissions
  drop constraint submissions_category_check,
  add constraint submissions_category_check
    check (category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market', 'top-10'));

alter table public.trending_topics
  drop constraint trending_topics_category_check,
  add constraint trending_topics_category_check
    check (category in ('anime', 'movies', 'politics', 'sports', 'finance', 'share-market', 'top-10'));
