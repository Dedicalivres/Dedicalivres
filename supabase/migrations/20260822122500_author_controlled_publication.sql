alter table public.authors
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid;

comment on column public.authors.published is
  'Publication publique explicite de la fiche auteur. Ne peut être vraie que si la fiche a été préalablement validée comme prête à publier.';

comment on column public.authors.published_at is
  'Date de publication publique manuelle de la fiche auteur.';

comment on column public.authors.published_by is
  'Identifiant de l’administrateur ayant déclenché la publication publique.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_publication_state_check'
  ) then
    alter table public.authors
      add constraint authors_publication_state_check
      check (
        (
          published = false
          and published_at is null
          and published_by is null
        )
        or
        (
          published = true
          and published_at is not null
          and published_by is not null
          and publication_ready = true
          and validated is true
          and merged_into is null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_published_by_fkey'
  ) then
    alter table public.authors
      add constraint authors_published_by_fkey
      foreign key (published_by)
      references auth.users(id)
      on delete restrict;
  end if;
end
$$;
