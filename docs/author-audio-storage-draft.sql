-- DESIGN DRAFT. Not a migration. Disposable local database only.
-- No changes to existing RLS, roles or production objects.
begin;
create schema author_audio_private;
revoke all on schema author_audio_private from public, anon, authenticated, service_role;
create table author_audio_private.recordings (
 id uuid primary key, author_id uuid not null,
 private_object_key text not null unique,
 media_sha256 text not null check (media_sha256 ~ '^[a-f0-9]{64}$'),
 mime text not null check (mime in ('audio/mpeg','audio/mp4')),
 bytes integer not null check (bytes between 1 and 10000000),
 seconds numeric not null check (seconds > 0 and seconds <= 120),
 transcript text not null check (length(btrim(transcript)) between 1 and 6000),
 consent_at timestamptz, consent_version text,
 consent_withdrawn_at timestamptz,
 created_at timestamptz not null default now(),
 check ((consent_at is null) = (consent_version is null))
);
create table author_audio_private.decisions (
 author_id uuid not null, recording_id uuid not null references author_audio_private.recordings(id),
 revision integer not null check (revision>0), actor_id uuid not null,
 action text not null check (action in ('submit','approve','reject','request_information','publish','withdraw')),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 recorded_at timestamptz not null default now(), primary key(author_id,revision)
);
create table author_audio_private.active_recording (
 author_id uuid primary key, recording_id uuid not null unique references author_audio_private.recordings(id),
 revision integer not null check(revision>0)
);
-- Real migration must add composite author/recording FKs, reconcile author merge and
-- owner identity, bind consent to content digest, enforce append-only journal,
-- server-side media validation and transactional revision checks. No public API.
alter table author_audio_private.recordings enable row level security;
alter table author_audio_private.decisions enable row level security;
alter table author_audio_private.active_recording enable row level security;
revoke all on all tables in schema author_audio_private from public, anon, authenticated, service_role;
commit;
