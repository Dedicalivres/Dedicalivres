-- DÉDICALIVRES NFC — DRAFT UNIQUEMENT — NE PAS EXÉCUTER EN PRODUCTION
begin;
create table if not exists public.nfc_tags (
 id uuid primary key default gen_random_uuid(), public_token text not null unique, label text not null, support_type text not null, campaign_key text, event_id text, partner_key text, context_location text, cta_variant text not null default 'general', active boolean not null default true, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.nfc_sessions (
 id uuid primary key default gen_random_uuid(), tag_id uuid references public.nfc_tags(id) on delete set null, opened_at timestamptz not null default now(), last_event_at timestamptz not null default now(), page_version text, support_type_snapshot text, campaign_key_snapshot text, event_id_snapshot text, partner_key_snapshot text, context_location_snapshot text, intent_id text, device_class text, os_family text, browser_family text, entered_site boolean not null default false, site_arrival boolean not null default false, activated boolean not null default false
);
create table if not exists public.nfc_events (
 id bigint generated always as identity primary key, session_id uuid not null references public.nfc_sessions(id) on delete cascade, event_name text not null, scene_id text, intent_id text, cta_id text, destination text, progress_bucket smallint, activation_type text, error_code text, created_at timestamptz not null default now(), constraint nfc_events_progress_bucket_check check (progress_bucket is null or progress_bucket in (25,50,75,100))
);
create index if not exists nfc_tags_public_token_idx on public.nfc_tags(public_token);
create index if not exists nfc_sessions_tag_opened_idx on public.nfc_sessions(tag_id, opened_at desc);
create index if not exists nfc_events_session_created_idx on public.nfc_events(session_id, created_at);
alter table public.nfc_tags enable row level security;
alter table public.nfc_sessions enable row level security;
alter table public.nfc_events enable row level security;
-- Aucune policy publique ajoutée ici. Écriture future via RPC/Edge Function whitelistée.
rollback;
