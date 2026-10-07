drop policy if exists "Public upload event images" on storage.objects;
create policy "Public upload event images"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'event-images'
  and (
    name like 'public-submissions/%'
    or name like 'author-portraits/%'
  )
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);

drop policy if exists "Public can upload testimonial images" on storage.objects;
create policy "Public can upload testimonial images"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'testimonial-images'
  and name like 'testimonial-submissions/%'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);;
