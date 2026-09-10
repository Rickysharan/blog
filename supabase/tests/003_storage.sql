begin;

select plan(15);

select has_table('storage', 'buckets', 'storage buckets table exists');
select has_table('storage', 'objects', 'storage objects table exists');
select ok(
  exists (select 1 from storage.buckets where id = 'submission-images' and public = false),
  'submission images bucket is private'
);
select ok(
  exists (select 1 from storage.buckets where id = 'published-images' and public = true),
  'published images bucket is public-read'
);
select ok(
  exists (select 1 from storage.buckets where id = 'submission-images' and file_size_limit = 8388608),
  'submission images are capped at 8 MiB'
);
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'submission-images'
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'submission images allow only JPEG, PNG, and WebP'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'submission_images_insert_own'),
  'owners can upload to their folder'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'submission_images_select_owner_or_reviewer'),
  'private images have scoped reads'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'submission_images_update_own'),
  'owners can update only their folder'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'published_images_select_public'),
  'published derivatives are public-read'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'published_images_write_service'),
  'published derivatives are server-written'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'submission_images_delete_own'
  ),
  'submission images have no client delete policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'submission_images_update_own'
      and qual is not null and with_check is not null
  ),
  'storage update policy has USING and WITH CHECK guards'
);
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'submission-images' and allowed_mime_types @> array['image/jpeg']::text[]
      and allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'submission image MIME allowlist is closed'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'submission_images_%'),
  'submission storage policies are installed'
);

select * from finish();
rollback;
