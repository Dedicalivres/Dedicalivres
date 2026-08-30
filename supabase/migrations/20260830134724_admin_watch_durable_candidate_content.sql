begin;

alter table public.admin_watch_candidates
  add column type text,
  add column end_date date,
  add column country text,
  add column venue text,
  add column address text,
  add column description text,
  add column official_url text,
  add column image_url text;

comment on table public.admin_watch_candidates is
  'Internal durable watch candidates with bounded editable event content and admin-only workflow persistence.';
comment on column public.admin_watch_candidates.type is
  'Human-reviewable event type; nullable while the candidate remains incomplete.';
comment on column public.admin_watch_candidates.end_date is
  'Optional event end date; NULL means that no end date is known.';
comment on column public.admin_watch_candidates.country is
  'Human-reviewable event country; nullable while the candidate remains in review.';
comment on column public.admin_watch_candidates.description is
  'Bounded candidate description only; never store full fetched pages or HTML captures.';

commit;

-- Rollback reference (manual, only after application code rollback and data review):
-- alter table public.admin_watch_candidates
--   drop column image_url,
--   drop column official_url,
--   drop column description,
--   drop column address,
--   drop column venue,
--   drop column country,
--   drop column end_date,
--   drop column type;
