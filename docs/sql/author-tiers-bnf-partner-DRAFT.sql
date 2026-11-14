-- DRAFT ONLY: review before any Supabase migration.
-- This file is intentionally NOT applied to production.
-- Partner status is exclusively admin-controlled, defaults to false.
alter table public.authors
  add column if not exists is_partner boolean not null default false;

-- Private cache: never expose unverified bibliographic data through a
-- public SELECT policy. Service-role worker is the only writer.
create table if not exists public.author_bnf_cache (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  authority_id text not null,
  notice_id text not null,
  notice_url text not null,
  title text not null,
  isbn text,
  publication_year text,
  match_verified boolean not null default false,
  cover_url text,
  cover_reuse_authorized boolean not null default false,
  source text not null default 'BnF',
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, authority_id, notice_id)
);
alter table public.author_bnf_cache enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE policies are granted to anon/authenticated.
-- Before deployment: review existing policies, grants, triggers, worker
-- permissions and the actual author publication flow. Never use public
-- author pages to query this cache directly.
