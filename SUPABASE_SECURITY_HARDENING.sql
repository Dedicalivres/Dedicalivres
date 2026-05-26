-- =========================================================
-- DEDICALIVRES - DURCISSEMENT SUPABASE / RLS
-- Version recalee apres audit MCP du 2026-05-25.
--
-- IMPORTANT:
-- - Ne pas executer avant une sauvegarde complete Supabase.
-- - Ce fichier prepare les corrections, mais ne les applique pas ici.
-- - Il remplace les policies connues pour eviter les doublons.
-- - A executer d'abord sur une branche Supabase ou apres backup verifie.
-- =========================================================

begin;

-- 1) Schema prive pour les helpers non exposes par l'API REST.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- 2) Registre admin.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

drop policy if exists "Admin users can read themselves" on public.admin_users;
create policy "Admin users can read themselves"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);

-- L'ancien helper public est conserve seulement pour compatibilite SQL,
-- mais retire de l'API publique afin d'eviter /rest/v1/rpc/is_admin.
do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'revoke execute on function public.is_admin() from anon, authenticated, public';
  end if;
end
$$;

-- Evite les grants EXECUTE automatiques sur les futures fonctions publiques.
alter default privileges in schema public
revoke execute on functions from anon, authenticated, public;

-- 3) Fonctions existantes.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    execute 'alter function public.set_updated_at() set search_path = public';
  end if;
end
$$;


-- 4) Evenements.
alter table public.events enable row level security;

drop policy if exists "Admin can delete events" on public.events;
drop policy if exists "Admin can read all events" on public.events;
drop policy if exists "Admin can update events" on public.events;
drop policy if exists "Admins can manage events" on public.events;
drop policy if exists "Public can insert events" on public.events;
drop policy if exists "Public can submit pending events" on public.events;
drop policy if exists "Public can read validated events" on public.events;

create policy "Public can read validated events"
on public.events
for select
to anon
using (validated = true and rejected = false);

create policy "Public can submit pending events"
on public.events
for insert
to anon
with check (
  nullif(trim(title), '') is not null
  and nullif(trim(city), '') is not null
  and start_date is not null
  and lat between -90 and 90
  and lng between -180 and 180
  and coalesce(validated, false) = false
  and coalesce(rejected, false) = false
  and coalesce(featured, false) = false
  and coalesce(verified, false) = false
);

create policy "Admins can manage events"
on public.events
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());


-- 5) Presences auteurs.
alter table public.event_authors_presence enable row level security;

alter table public.event_authors_presence
  add column if not exists rejected boolean not null default false,
  add column if not exists updated_at timestamptz,
  add column if not exists author_profile_url text,
  add column if not exists author_profile_url_type text,
  add column if not exists publication_mode text,
  add column if not exists book_or_publisher_url text,
  add column if not exists book_or_publisher_url_type text,
  add column if not exists publisher_name text,
  add column if not exists admin_note text;

drop policy if exists "Admin can delete author presences" on public.event_authors_presence;
drop policy if exists "Admin can read all author presences" on public.event_authors_presence;
drop policy if exists "Admin can update author presences" on public.event_authors_presence;
drop policy if exists "Admins can manage author presences" on public.event_authors_presence;
drop policy if exists "Public can submit author presence requests" on public.event_authors_presence;
drop policy if exists "Public can submit pending author presences" on public.event_authors_presence;
drop policy if exists "Public can read validated author presences" on public.event_authors_presence;

create policy "Public can read validated author presences"
on public.event_authors_presence
for select
to anon
using (validated = true and coalesce(rejected, false) = false);

create policy "Public can submit pending author presences"
on public.event_authors_presence
for insert
to anon
with check (
  event_id is not null
  and nullif(trim(pseudo), '') is not null
  and length(trim(pseudo)) between 2 and 120
  and coalesce(validated, false) = false
  and coalesce(rejected, false) = false
);

create policy "Admins can manage author presences"
on public.event_authors_presence
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());


-- 6) Auteurs publics.
alter table public.authors enable row level security;

drop policy if exists "Admin can manage authors" on public.authors;
drop policy if exists "Admins can manage authors" on public.authors;
drop policy if exists "Public can insert authors" on public.authors;
drop policy if exists "Public can insert pending authors" on public.authors;
drop policy if exists "Public can read validated authors" on public.authors;

create policy "Public can read validated authors"
on public.authors
for select
to anon
using (validated = true);

create policy "Public can insert pending authors"
on public.authors
for insert
to anon
with check (
  nullif(trim(pseudo), '') is not null
  and nullif(trim(slug), '') is not null
  and coalesce(validated, false) = false
);

create policy "Admins can manage authors"
on public.authors
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());


-- 7) Temoignages.
alter table public.testimonials enable row level security;

drop policy if exists "Admin can delete testimonials" on public.testimonials;
drop policy if exists "Admin can read all testimonials" on public.testimonials;
drop policy if exists "Admin can update testimonials" on public.testimonials;
drop policy if exists "Admins can manage testimonials" on public.testimonials;
drop policy if exists "Authenticated users can read testimonials" on public.testimonials;
drop policy if exists "Authenticated users can update testimonials" on public.testimonials;
drop policy if exists "Authenticated users can delete testimonials" on public.testimonials;
drop policy if exists "Public can submit testimonials" on public.testimonials;
drop policy if exists "Public can insert pending testimonials" on public.testimonials;
drop policy if exists "Public can read validated testimonials" on public.testimonials;

create policy "Public can read validated testimonials"
on public.testimonials
for select
to anon
using (validated = true and rejected = false);

create policy "Public can insert pending testimonials"
on public.testimonials
for insert
to anon
with check (
  nullif(trim(pseudo), '') is not null
  and nullif(trim(message), '') is not null
  and length(trim(message)) >= 20
  and coalesce(validated, false) = false
  and coalesce(rejected, false) = false
);

create policy "Admins can manage testimonials"
on public.testimonials
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());


-- 8) Newsletter: insertion publique, lecture/suppression admin.
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Admin can read newsletter" on public.newsletter_subscribers;
drop policy if exists "Admins can read newsletter subscribers" on public.newsletter_subscribers;
drop policy if exists "Admins can delete newsletter subscribers" on public.newsletter_subscribers;
drop policy if exists "Public can subscribe newsletter" on public.newsletter_subscribers;

create policy "Public can subscribe newsletter"
on public.newsletter_subscribers
for insert
to anon, authenticated
with check (
  email is not null
  and length(email) between 6 and 254
  and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
);

create policy "Admins can read newsletter subscribers"
on public.newsletter_subscribers
for select
to authenticated
using (private.is_admin());

create policy "Admins can delete newsletter subscribers"
on public.newsletter_subscribers
for delete
to authenticated
using (private.is_admin());


-- 9) Tracking: insertion publique limitee, consultation admin.
alter table public.site_visits enable row level security;
alter table public.event_visits enable row level security;
alter table public.location_tracking enable row level security;
alter table public.visits enable row level security;

drop policy if exists "Admin can read site visits" on public.site_visits;
drop policy if exists "Admins can read site visits" on public.site_visits;
drop policy if exists "Public can insert site visits" on public.site_visits;

create policy "Public can insert site visits"
on public.site_visits
for insert
to anon, authenticated
with check (nullif(trim(path), '') is not null);

create policy "Admins can read site visits"
on public.site_visits
for select
to authenticated
using (private.is_admin());

drop policy if exists "Admin can read event visits" on public.event_visits;
drop policy if exists "Admins can read event visits" on public.event_visits;
drop policy if exists "Public can insert event visits" on public.event_visits;

create policy "Public can insert event visits"
on public.event_visits
for insert
to anon, authenticated
with check (
  event_id is not null
  and nullif(trim(path), '') is not null
);

create policy "Admins can read event visits"
on public.event_visits
for select
to authenticated
using (private.is_admin());

drop policy if exists "Admin can read location tracking" on public.location_tracking;
drop policy if exists "Admins can read location tracking" on public.location_tracking;
drop policy if exists "Public can insert location tracking" on public.location_tracking;

create policy "Public can insert location tracking"
on public.location_tracking
for insert
to anon, authenticated
with check (
  lat between -90 and 90
  and lng between -180 and 180
  and nullif(trim(page), '') is not null
);

create policy "Admins can read location tracking"
on public.location_tracking
for select
to authenticated
using (private.is_admin());

drop policy if exists "Admin can read visits" on public.visits;
drop policy if exists "Admins can read visits" on public.visits;
drop policy if exists "Public can insert visits" on public.visits;

create policy "Public can insert visits"
on public.visits
for insert
to anon, authenticated
with check (nullif(trim(path), '') is not null);

create policy "Admins can read visits"
on public.visits
for select
to authenticated
using (private.is_admin());


-- 10) Storage.
-- Les buckets restent publics pour servir les images par URL publique.
-- On retire les policies SELECT larges: elles permettent de lister les fichiers,
-- ce qui n'est pas necessaire pour afficher une URL publique.
update storage.buckets
set
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('event-images', 'testimonial-images');

drop policy if exists "Public read event images" on storage.objects;
drop policy if exists "Public upload event images" on storage.objects;
drop policy if exists "Public can read testimonial images" on storage.objects;
drop policy if exists "Public can upload testimonial images" on storage.objects;
drop policy if exists "Authenticated can manage testimonial images" on storage.objects;
drop policy if exists "Admins can manage event images" on storage.objects;
drop policy if exists "Admins can manage testimonial images" on storage.objects;

create policy "Public upload event images"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'event-images'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

create policy "Public can upload testimonial images"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'testimonial-images'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

create policy "Admins can manage event images"
on storage.objects
for all
to authenticated
using (bucket_id = 'event-images' and private.is_admin())
with check (bucket_id = 'event-images' and private.is_admin());

create policy "Admins can manage testimonial images"
on storage.objects
for all
to authenticated
using (bucket_id = 'testimonial-images' and private.is_admin())
with check (bucket_id = 'testimonial-images' and private.is_admin());


-- 11) Point volontairement manuel.
-- L'extension unaccent est actuellement dans public. Pour supprimer l'alerte
-- Supabase, la deplacer apres verification qu'aucun objet SQL ne depend de
-- public.unaccent explicitement:
--
-- alter extension unaccent set schema extensions;

commit;

-- Apres execution:
-- 1. relancer les advisors Supabase;
-- 2. tester le site public: lecture events, soumission evenement, newsletter;
-- 3. tester l'admin: connexion, validation, modification, statistiques;
-- 4. tester un upload image public et un upload admin.
