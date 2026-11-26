-- DRAFT ONLY — FRONT-AUTEURS-BNF-03. Not a Supabase migration.
-- Run only in a disposable LOCAL database after schema review.
-- No changes to existing tables, policies, roles or Data API exposure.
-- This private schema must remain outside the Data API exposed schemas.
begin;
create schema bnf_review_private;
revoke all on schema bnf_review_private from public, anon, authenticated, service_role;

create table bnf_review_private.decision_history (
  id bigint generated always as identity primary key,
  author_id uuid not null,
  notice_id text not null check (notice_id ~ '^ark:/12148/cb[0-9]+[a-z0-9]$'),
  revision integer not null check (revision >= 1),
  previous_revision integer,
  request_id uuid not null,
  reviewer_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  action text not null check (action in ('approve', 'request_information', 'reject')),
  authority_id text check (authority_id ~ '^ark:/12148/cb[0-9]+[a-z0-9]$'),
  title text not null check (length(btrim(title)) between 1 and 1000),
  evidence text not null check (length(btrim(evidence)) between 1 and 2000),
  source_retrieved_at timestamptz not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  constraint approval_requires_authority check (action <> 'approve' or authority_id is not null),
  constraint revision_chain check ((revision = 1 and previous_revision is null)
    or (revision > 1 and previous_revision is not null and previous_revision = revision - 1)),
  unique (author_id, notice_id, revision),
  unique (request_id, author_id, notice_id),
  foreign key (author_id, notice_id, previous_revision)
    references bnf_review_private.decision_history(author_id, notice_id, revision)
);
-- Author/reviewer foreign keys intentionally deferred until local schema audit:
-- do not assume deletion/merge semantics of the existing author records.
-- No publication state or public export is created by this draft.
alter table bnf_review_private.decision_history enable row level security;
alter table bnf_review_private.decision_history force row level security;
revoke all on table bnf_review_private.decision_history from public, anon, authenticated, service_role;
revoke all on all sequences in schema bnf_review_private from public, anon, authenticated, service_role;
-- No policies or grants for application roles. No privileged RPC.
-- A later authenticated backend must validate existing author and reviewer,
-- bind canonical authority and source digest to server-loaded candidate,
-- use a transaction and expected revision, and derive reviewer from session.
-- Corrections append a new row. No application UPDATE or DELETE.
commit;
