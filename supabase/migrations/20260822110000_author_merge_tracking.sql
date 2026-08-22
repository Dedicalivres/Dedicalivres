alter table public.authors
  add column if not exists merged_into uuid,
  add column if not exists merged_at timestamptz;

comment on column public.authors.merged_into is
  'Identifiant de la fiche auteur principale lorsqu’une fiche a été fusionnée. Null si la fiche est active.';

comment on column public.authors.merged_at is
  'Date de fusion vers la fiche principale. Null si la fiche n’a pas été fusionnée.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_merge_state_check'
  ) then
    alter table public.authors
      add constraint authors_merge_state_check
      check (
        (merged_into is null and merged_at is null)
        or
        (
          merged_into is not null
          and merged_at is not null
          and merged_into <> id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_merged_into_fkey'
  ) then
    alter table public.authors
      add constraint authors_merged_into_fkey
      foreign key (merged_into)
      references public.authors(id)
      on delete restrict;
  end if;
end
$$;

create index if not exists authors_merged_into_idx
  on public.authors (merged_into);
