\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create schema private;
create function private.is_admin()
returns boolean language sql stable as $$ select false $$;

create table public.events (
  id uuid primary key,
  title text not null,
  type text,
  country_code text,
  region text,
  city text not null,
  price text,
  start_date date not null,
  end_date date,
  website text,
  description text,
  lat double precision not null,
  lng double precision not null,
  image_url text,
  validated boolean not null default false,
  featured boolean not null default false,
  rejected boolean not null default false,
  verified boolean not null default false,
  registration_enabled boolean not null default false,
  registration_open_date date,
  registration_deadline date,
  registration_url text,
  registration_audience text[] not null default '{}',
  registration_note text,
  registration_force_status text
);

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  slug text unique not null,
  validated boolean not null default false,
  published boolean not null default false
);

insert into public.authors (id, pseudo, slug, validated, published)
values (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'Auteure Test',
  'auteure-test',
  true,
  true
);

create table public.event_authors_presence (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  pseudo text not null,
  author_id uuid references public.authors(id) on delete set null,
  author_slug text,
  author_identity_key text,
  website text,
  author_profile_url text,
  author_profile_url_type text,
  publication_mode text,
  book_or_publisher_url text,
  book_or_publisher_url_type text,
  publisher_name text,
  author_portrait_url text,
  author_portrait_storage_key text,
  source text,
  participant_type text not null default 'author',
  presence_verified boolean not null default false,
  validated boolean not null default false,
  rejected boolean not null default false
);

\ir ../migrations/20261002181029_event_submission_contacts.sql
\ir ../migrations/20261009143100_atomic_event_author_submission.sql

begin;

set local role anon;
select public.submit_event_with_contact(
  '{"id":"10000000-0000-4000-8000-000000000001","title":"Salon sans auteur","type":"Salon","country_code":"FR","city":"Lille","start_date":"2026-12-01","lat":50.63,"lng":3.06,"validated":false,"featured":false,"rejected":false,"verified":false,"website":"https://example.com/salon"}'::jsonb,
  'Organisation Test',
  'contact@example.com'
);
reset role;

do $$
begin
  assert exists (
    select 1 from public.events
    where id = '10000000-0000-4000-8000-000000000001'
      and not validated and not featured and not rejected and not verified
      and website = 'https://example.com/salon'
  ), 'événement sans auteur absent ou statuts incorrects';
  assert exists (
    select 1 from public.event_submission_contacts
    where event_id = '10000000-0000-4000-8000-000000000001'
      and submitter_email = 'contact@example.com'
  ), 'contact privé absent';
  assert not exists (
    select 1 from public.event_authors_presence
    where event_id = '10000000-0000-4000-8000-000000000001'
  ), 'présence créée sans auteur';
  assert not exists (
    select 1 from pg_attribute
    where attrelid = 'public.events'::regclass
      and not attisdropped
      and attname in ('submitter_name', 'submitter_email')
  ), 'données privées exposées dans events';
end $$;

set local role anon;
select public.submit_event_with_contact(
  '{"id":"20000000-0000-4000-8000-000000000002","title":"Dédicace atomique","type":"Dédicace","country_code":"BE","city":"Bruxelles","start_date":"2026-12-02","lat":50.85,"lng":4.35,"validated":false,"featured":false,"rejected":false,"verified":false,"author_presence":{"pseudo":"Auteure Test","author_slug":"auteure-test","author_identity_key":"auteure-test","website":"https://example.com/auteure","author_profile_url":"https://example.com/auteure","author_profile_url_type":"site_officiel","publication_mode":"unknown","book_or_publisher_url":null,"book_or_publisher_url_type":null,"publisher_name":null,"author_portrait_url":null,"author_portrait_storage_key":null}}'::jsonb,
  null,
  'auteure@example.com'
);
reset role;

do $$
begin
  assert exists (
    select 1
    from public.events e
    join public.event_submission_contacts c on c.event_id = e.id
    join public.event_authors_presence p on p.event_id = e.id
    where e.id = '20000000-0000-4000-8000-000000000002'
      and p.pseudo = 'Auteure Test'
      and p.author_id is null
      and p.source = 'event_submission'
      and not p.validated and not p.rejected and not p.presence_verified
  ), 'triplet événement/contact/présence incomplet ou auteur rattaché sans preuve';
  assert (
    select count(*) = 1 from public.authors where slug = 'auteure-test'
  ), 'la soumission a créé un doublon auteur';
end $$;

create function public.fail_test_contact_insert()
returns trigger language plpgsql as $$
begin
  if new.submitter_email = 'rollback-contact@example.com' then
    raise exception 'TEST_CONTACT_FAILURE';
  end if;
  return new;
end $$;
create trigger fail_test_contact_insert
before insert on public.event_submission_contacts
for each row execute function public.fail_test_contact_insert();

do $$
begin
  begin
    perform public.submit_event_with_contact(
      '{"id":"30000000-0000-4000-8000-000000000003","title":"Rollback contact","type":"Salon","country_code":"FR","city":"Paris","start_date":"2026-12-03","lat":48.85,"lng":2.35,"validated":false,"featured":false,"rejected":false,"verified":false}'::jsonb,
      null,
      'rollback-contact@example.com'
    );
    raise exception 'échec contact non propagé';
  exception when others then
    assert sqlerrm = 'TEST_CONTACT_FAILURE', 'mauvaise erreur contact';
  end;
  assert not exists (
    select 1 from public.events where id = '30000000-0000-4000-8000-000000000003'
  ), 'événement conservé après échec contact';
end $$;

create function public.fail_test_presence_insert()
returns trigger language plpgsql as $$
begin
  if new.pseudo = 'Rollback Presence' then
    raise exception 'TEST_PRESENCE_FAILURE';
  end if;
  return new;
end $$;
create trigger fail_test_presence_insert
before insert on public.event_authors_presence
for each row execute function public.fail_test_presence_insert();

do $$
begin
  begin
    perform public.submit_event_with_contact(
      '{"id":"40000000-0000-4000-8000-000000000004","title":"Rollback présence","type":"Dédicace","country_code":"FR","city":"Lyon","start_date":"2026-12-04","lat":45.76,"lng":4.84,"validated":false,"featured":false,"rejected":false,"verified":false,"author_presence":{"pseudo":"Rollback Presence","author_slug":"rollback-presence","author_identity_key":"rollback-presence","website":null,"author_profile_url":null,"author_profile_url_type":null,"publication_mode":"unknown","book_or_publisher_url":null,"book_or_publisher_url_type":null,"publisher_name":null,"author_portrait_url":null,"author_portrait_storage_key":null}}'::jsonb,
      null,
      'rollback-presence@example.com'
    );
    raise exception 'échec présence non propagé';
  exception when others then
    assert sqlerrm = 'TEST_PRESENCE_FAILURE', 'mauvaise erreur présence';
  end;
  assert not exists (
    select 1 from public.events where id = '40000000-0000-4000-8000-000000000004'
  ), 'événement conservé après échec présence';
  assert not exists (
    select 1 from public.event_submission_contacts
    where event_id = '40000000-0000-4000-8000-000000000004'
  ), 'contact conservé après échec présence';
end $$;

set local role anon;
select public.submit_event_with_contact(
  '{"id":"50000000-0000-4000-8000-000000000005","title":"Même auteure autre date","type":"Dédicace","country_code":"FR","city":"Lyon","start_date":"2026-12-05","lat":45.76,"lng":4.84,"validated":false,"featured":false,"rejected":false,"verified":false,"author_presence":{"pseudo":"Auteure Test","author_slug":"auteure-test","author_identity_key":"auteure-test","website":"https://example.com/auteure","author_profile_url":"https://example.com/auteure","author_profile_url_type":"site_officiel","publication_mode":"unknown","book_or_publisher_url":null,"book_or_publisher_url_type":null,"publisher_name":null,"author_portrait_url":null,"author_portrait_storage_key":null}}'::jsonb,
  null,
  'auteure@example.com'
);
reset role;

do $$
begin
  assert (
    select count(*) = 2
    from public.event_authors_presence
    where author_identity_key = 'auteure-test'
      and event_id in (
        '20000000-0000-4000-8000-000000000002',
        '50000000-0000-4000-8000-000000000005'
      )
  ), 'double soumission a détourné une relation existante';
  assert has_function_privilege('anon', 'public.submit_event_with_contact(jsonb,text,text)', 'EXECUTE'),
    'anon ne peut pas appeler la RPC publique';
  assert has_function_privilege('authenticated', 'public.submit_event_with_contact(jsonb,text,text)', 'EXECUTE'),
    'authenticated ne peut pas appeler la RPC publique';
  assert (
    select p.prosecdef and array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
    from pg_proc p
    where p.oid = 'public.submit_event_with_contact(jsonb,text,text)'::regprocedure
  ), 'RPC non sécurisée';
end $$;

do $$
begin
  begin
    perform public.submit_event_with_contact(
      '{"id":"60000000-0000-4000-8000-000000000006","title":"Champ interdit","type":"Dédicace","country_code":"FR","city":"Lyon","start_date":"2026-12-06","lat":45.76,"lng":4.84,"validated":false,"featured":false,"rejected":false,"verified":false,"author_presence":{"event_id":"20000000-0000-4000-8000-000000000002","pseudo":"Détournement"}}'::jsonb,
      null,
      'blocked@example.com'
    );
    raise exception 'champ de relation interdit accepté';
  exception when others then
    assert sqlerrm = 'INVALID_AUTHOR_PRESENCE', 'mauvaise erreur de sécurité';
  end;
  assert not exists (
    select 1 from public.events where id = '60000000-0000-4000-8000-000000000006'
  ), 'événement conservé après tentative de détournement';
end $$;

rollback;

select 'PASS atomic event author submission transaction' as result;
