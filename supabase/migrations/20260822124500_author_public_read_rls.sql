drop policy if exists "Public can read validated authors"
on public.authors;

create policy "Public can read published authors"
on public.authors
for select
to anon
using (
  validated = true
  and published = true
  and merged_into is null
);
