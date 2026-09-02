begin;

alter table public.authors
  add column if not exists editorial_status text not null default 'INCOMPLETE',
  add column if not exists editorial_review jsonb not null default '{}'::jsonb,
  add column if not exists editorial_status_at timestamptz,
  add column if not exists editorial_status_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_editorial_status_check'
  ) then
    alter table public.authors
      add constraint authors_editorial_status_check
      check (editorial_status in ('READY', 'NEEDS_REVIEW', 'INCOMPLETE', 'AMBIGUOUS'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.authors'::regclass
      and conname = 'authors_editorial_status_by_fkey'
  ) then
    alter table public.authors
      add constraint authors_editorial_status_by_fkey
      foreign key (editorial_status_by)
      references auth.users(id)
      on delete restrict;
  end if;
end
$$;

-- Fail closed: les décisions V1 stockées dans le navigateur ne constituent pas
-- une preuve serveur. Toute fiche doit être revue après cette migration.
update public.authors
set
  published = false,
  published_at = null,
  published_by = null,
  publication_ready = false,
  publication_ready_at = null,
  publication_ready_by = null,
  editorial_status = case
    when published = true or publication_ready = true then 'NEEDS_REVIEW'
    else 'INCOMPLETE'
  end,
  editorial_review = '{}'::jsonb,
  editorial_status_at = null,
  editorial_status_by = null
where published = true
   or publication_ready = true;

alter table public.authors
  drop constraint if exists authors_publication_state_check;

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
      and editorial_status = 'READY'
    )
  );

create or replace function private.invalidate_author_editorial_readiness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.publication_ready := false;
  new.publication_ready_at := null;
  new.publication_ready_by := null;
  new.published := false;
  new.published_at := null;
  new.published_by := null;
  new.editorial_status := 'NEEDS_REVIEW';
  new.editorial_status_at := null;
  new.editorial_status_by := null;
  return new;
end;
$$;

drop trigger if exists authors_invalidate_editorial_readiness
on public.authors;

create trigger authors_invalidate_editorial_readiness
before update of pseudo, slug, website, bio, avatar_url, location, shop_url,
  profile_type, validated, merged_into
on public.authors
for each row
when (
  old.pseudo is distinct from new.pseudo
  or old.slug is distinct from new.slug
  or old.website is distinct from new.website
  or old.bio is distinct from new.bio
  or old.avatar_url is distinct from new.avatar_url
  or old.location is distinct from new.location
  or old.shop_url is distinct from new.shop_url
  or old.profile_type is distinct from new.profile_type
  or old.validated is distinct from new.validated
  or old.merged_into is distinct from new.merged_into
)
execute function private.invalidate_author_editorial_readiness();

drop policy if exists "Public can read published authors"
on public.authors;

create policy "Public can read published ready authors"
on public.authors
for select
to anon
using (
  validated = true
  and publication_ready = true
  and editorial_status = 'READY'
  and published = true
  and merged_into is null
);

-- Les champs de décision et les identifiants admin restent inaccessibles à anon.
revoke select on public.authors from anon;
grant select (
  id, pseudo, slug, website, bio, avatar_url, location, shop_url,
  profile_type, validated, created_at, merged_into, published, published_at
) on public.authors to anon;

comment on column public.authors.editorial_status is
  'Décision éditoriale serveur contrôlant la publication publique.';
comment on column public.authors.editorial_review is
  'Décisions internes persistées, dont ambiguïtés et rapprochements ignorés.';

commit;
