alter table public.authors
  add column if not exists publication_ready boolean not null default false,
  add column if not exists publication_ready_at timestamptz,
  add column if not exists publication_ready_by uuid;

comment on column public.authors.publication_ready is
  'Validation éditoriale interne indiquant que la fiche auteur est prête pour une future publication publique. Ne publie rien automatiquement.';

comment on column public.authors.publication_ready_at is
  'Date de validation manuelle de la fiche comme prête à publier.';

comment on column public.authors.publication_ready_by is
  'Identifiant de l’administrateur ayant validé la fiche comme prête à publier.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_publication_readiness_check'
  ) then
    alter table public.authors
      add constraint authors_publication_readiness_check
      check (
        (
          publication_ready = false
          and publication_ready_at is null
          and publication_ready_by is null
        )
        or
        (
          publication_ready = true
          and publication_ready_at is not null
          and publication_ready_by is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_publication_ready_by_fkey'
  ) then
    alter table public.authors
      add constraint authors_publication_ready_by_fkey
      foreign key (publication_ready_by)
      references auth.users(id)
      on delete restrict;
  end if;
end
$$;
