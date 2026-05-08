-- =========================================================
-- DÉDICALIVRES V7.5 — Témoignages
-- À exécuter dans Supabase SQL Editor avant le test public.
-- =========================================================

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  email text,
  message text not null,
  event_title text,
  image_url text,
  validated boolean not null default false,
  rejected boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.testimonials enable row level security;

-- Lecture publique : uniquement les témoignages validés et non refusés.
drop policy if exists "Public can read validated testimonials" on public.testimonials;
create policy "Public can read validated testimonials"
on public.testimonials
for select
using (validated = true and rejected = false);

-- Dépôt public : un visiteur peut proposer un témoignage en attente.
drop policy if exists "Public can insert pending testimonials" on public.testimonials;
create policy "Public can insert pending testimonials"
on public.testimonials
for insert
with check (validated = false and rejected = false);

-- Admin connecté : lecture complète.
drop policy if exists "Authenticated users can read testimonials" on public.testimonials;
create policy "Authenticated users can read testimonials"
on public.testimonials
for select
to authenticated
using (true);

-- Admin connecté : mise à jour / suppression.
drop policy if exists "Authenticated users can update testimonials" on public.testimonials;
create policy "Authenticated users can update testimonials"
on public.testimonials
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can delete testimonials" on public.testimonials;
create policy "Authenticated users can delete testimonials"
on public.testimonials
for delete
to authenticated
using (true);

-- Bucket à créer dans Storage : testimonial-images
-- Recommandé : public bucket.
-- Si le bucket existe déjà, ne pas le recréer.

-- Politiques storage indicatives si nécessaire :
-- insert public sur le bucket testimonial-images
-- select public sur le bucket testimonial-images
