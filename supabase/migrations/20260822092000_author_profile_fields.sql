begin;

alter table public.authors
  add column if not exists location text,
  add column if not exists shop_url text,
  add column if not exists profile_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'authors_profile_type_check'
      and conrelid = 'public.authors'::regclass
  ) then
    alter table public.authors
      add constraint authors_profile_type_check
      check (
        profile_type is null
        or profile_type in ('author', 'artist_author', 'hybrid')
      );
  end if;
end
$$;

comment on column public.authors.location is
  'Localisation générale publique ou éditoriale de l auteur.';

comment on column public.authors.shop_url is
  'Lien secondaire vers boutique, précommande ou page commerciale utile.';

comment on column public.authors.profile_type is
  'Type de profil auteur : author, artist_author ou hybrid.';

commit;
