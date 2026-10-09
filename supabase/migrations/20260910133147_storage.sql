insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('submission-images', 'submission-images', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('published-images', 'published-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy submission_images_insert_own on storage.objects
for insert to authenticated
with check (
  public.is_active_account()
  and bucket_id = 'submission-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
);

create policy submission_images_select_owner_or_reviewer on storage.objects
for select to authenticated
using (
  public.is_active_account()
  and bucket_id = 'submission-images'
  and ((owner_id::text = (select auth.uid()::text)) or public.has_role('reviewer') or public.has_role('admin'))
);

create policy submission_images_update_own on storage.objects
for update to authenticated
using (
  public.is_active_account()
  and bucket_id = 'submission-images' and owner_id::text = (select auth.uid()::text)
)
with check (
  public.is_active_account()
  and bucket_id = 'submission-images'
  and owner_id::text = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'
);

create policy published_images_select_public on storage.objects
for select to anon, authenticated
using (bucket_id = 'published-images');

create policy published_images_write_service on storage.objects
for all to service_role
using (bucket_id = 'published-images')
with check (bucket_id = 'published-images');
