\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create schema auth;
create schema private;
create role anon;
create role authenticated;
create table auth.users (id uuid primary key);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.test_uid', true), '')::uuid
$$;
create function private.is_admin() returns boolean language sql stable as $$ select true $$;

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  slug text unique not null,
  website text,
  bio text,
  avatar_url text,
  location text,
  shop_url text,
  profile_type text,
  validated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  merged_into uuid,
  publication_ready boolean not null default false,
  publication_ready_at timestamptz,
  publication_ready_by uuid,
  editorial_status text not null default 'INCOMPLETE',
  editorial_review jsonb not null default '{}'::jsonb,
  editorial_status_at timestamptz,
  editorial_status_by uuid,
  published boolean not null default false,
  published_at timestamptz,
  published_by uuid
);

create function private.invalidate_author_editorial_readiness()
returns trigger language plpgsql as $$
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
create trigger authors_invalidate_editorial_readiness
before update of pseudo, slug, website, bio, avatar_url, location, shop_url,
  profile_type, validated, merged_into on public.authors
for each row execute function private.invalidate_author_editorial_readiness();

\ir ../supabase/migrations/20261001153248_author_profile_submissions.sql
\ir ../supabase/migrations/20261009052049_author_profile_submission_approval_publish.sql

insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('app.test_uid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

insert into public.authors (
  id, pseudo, slug, website, bio, avatar_url, profile_type, validated, updated_at
) values (
  '11111111-1111-4111-8111-111111111111', 'Auteure Test', 'auteure-test',
  'https://example.com/', 'Bio avant', 'https://images.example/portrait.jpg',
  'author', true, '2026-10-09T04:00:00Z'
);

insert into public.author_profile_submissions (
  id, target_author_id, request_type, payload, base_author_updated_at, consent_accepted
) values (
  '21111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111', 'modify',
  '{"bio":"Bio approuvée","website":"https://example.org/"}',
  '2026-10-09T04:00:00Z', true
);

select public.approve_author_profile_submission('21111111-1111-4111-8111-111111111111');

do $$
declare row public.authors%rowtype;
begin
  select * into row from public.authors where id = '11111111-1111-4111-8111-111111111111';
  assert row.slug = 'auteure-test', 'slug existant modifié';
  assert row.bio = 'Bio approuvée', 'mise à jour non appliquée';
  assert row.website = 'https://example.org/', 'URL non conservée';
  assert row.avatar_url = 'https://images.example/portrait.jpg', 'portrait existant perdu';
  assert row.validated and row.publication_ready and row.editorial_status = 'READY' and row.published,
    'auteur modifié non public';
end $$;

insert into public.author_profile_submissions (
  id, request_type, payload, proposed_avatar_url, consent_accepted
) values (
  '31111111-1111-4111-8111-111111111111', 'create',
  '{"pseudo":"Auteure Test Deux","slug":"auteure-test","bio":"Bio","profile_type":"author"}',
  'https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev/author-portraits/test.webp', true
);
select public.approve_author_profile_submission('31111111-1111-4111-8111-111111111111');

do $$
declare row public.authors%rowtype;
begin
  select * into row from public.authors where slug = 'auteure-test-2';
  assert found, 'slug unique non attribué';
  assert row.avatar_url like 'https://pub-%/author-portraits/%', 'portrait proposé perdu';
  assert row.validated and row.publication_ready and row.editorial_status = 'READY' and row.published,
    'nouvel auteur non public';
  assert (select count(*) from public.authors where pseudo = 'Auteure Test Deux') = 1,
    'doublon auteur créé';
end $$;

do $$
begin
  perform public.approve_author_profile_submission('31111111-1111-4111-8111-111111111111');
  raise exception 'double traitement accepté';
exception when others then
  assert sqlerrm = 'SUBMISSION_ALREADY_REVIEWED', 'mauvaise protection double traitement';
end $$;

insert into public.author_profile_submissions (
  id, request_type, payload, consent_accepted
) values (
  '41111111-1111-4111-8111-111111111111', 'create',
  '{"pseudo":"Auteure Rejetée","slug":"auteure-rejetee","profile_type":"author"}', true
);
select public.reject_author_profile_submission('41111111-1111-4111-8111-111111111111', 'Refus test');

do $$
begin
  assert not exists (select 1 from public.authors where slug = 'auteure-rejetee'),
    'le rejet a créé un auteur';
  assert exists (
    select 1 from public.author_profile_submissions
    where id = '41111111-1111-4111-8111-111111111111'
      and status = 'rejected' and reviewed_at is not null and reviewed_by is not null
  ), 'rejet non traçable';
  assert (select count(*) from public.authors where published and validated and publication_ready and editorial_status = 'READY') = 2,
    'catalogue public inattendu';
end $$;

select 'PASS author profile approval transaction' as result;
