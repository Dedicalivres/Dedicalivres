begin;

create table public.admin_watch_sources (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null,
  url_hash text not null,
  source_url text not null,
  title text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  analyses_count bigint not null default 0,
  metrics_since timestamptz,
  observed_count bigint,
  complete_count bigint,
  review_count bigint,
  rejected_count bigint,
  duplicate_certain_count bigint,
  duplicate_probable_count bigint,
  with_image_count bigint,
  without_image_count bigint,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint admin_watch_sources_url_hash_key unique (url_hash),
  constraint admin_watch_sources_analyses_count_check check (analyses_count >= 0),
  constraint admin_watch_sources_observed_count_check check (observed_count is null or observed_count >= 0),
  constraint admin_watch_sources_complete_count_check check (complete_count is null or complete_count >= 0),
  constraint admin_watch_sources_review_count_check check (review_count is null or review_count >= 0),
  constraint admin_watch_sources_rejected_count_check check (rejected_count is null or rejected_count >= 0),
  constraint admin_watch_sources_duplicate_certain_count_check check (duplicate_certain_count is null or duplicate_certain_count >= 0),
  constraint admin_watch_sources_duplicate_probable_count_check check (duplicate_probable_count is null or duplicate_probable_count >= 0),
  constraint admin_watch_sources_with_image_count_check check (with_image_count is null or with_image_count >= 0),
  constraint admin_watch_sources_without_image_count_check check (without_image_count is null or without_image_count >= 0),
  constraint admin_watch_sources_version_check check (version > 0)
);

create table public.admin_watch_candidates (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  match_fingerprint text,
  origin_url text,
  canonical_origin_url text,
  source_id uuid references public.admin_watch_sources (id) on delete set null,
  title text,
  start_date date,
  city text,
  workflow_status text not null default 'review',
  duplicate_event_id uuid references public.events (id) on delete set null,
  submitted_event_id uuid references public.events (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  status_updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint admin_watch_candidates_identity_key_key unique (identity_key),
  constraint admin_watch_candidates_workflow_status_check check (
    workflow_status in ('ready', 'review', 'duplicate', 'submitted', 'handled', 'rejected')
  ),
  constraint admin_watch_candidates_version_check check (version > 0)
);

create table public.admin_event_watch_alerts (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  engine_origin text not null default 'automatte-local',
  engine_alert_id text,
  event_id uuid references public.events (id) on delete set null,
  field text not null,
  field_label text,
  event_title text,
  event_date date,
  event_city text,
  old_value jsonb,
  new_value jsonb,
  source_url text,
  proof jsonb,
  detected_at timestamptz not null,
  confidence numeric(5,4),
  status_label text,
  workflow_status text not null default 'review',
  status_updated_at timestamptz not null default now(),
  status_updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint admin_event_watch_alerts_identity_key_key unique (identity_key),
  constraint admin_event_watch_alerts_confidence_check check (
    confidence is null or confidence between 0 and 1
  ),
  constraint admin_event_watch_alerts_workflow_status_check check (
    workflow_status in ('review', 'confirmed', 'ignored', 'handled')
  ),
  constraint admin_event_watch_alerts_version_check check (version > 0)
);

create table public.admin_watch_transitions (
  id bigint generated always as identity primary key,
  candidate_id uuid references public.admin_watch_candidates (id) on delete restrict,
  event_watch_alert_id uuid references public.admin_event_watch_alerts (id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  change_source text not null default 'admin-ui',
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint admin_watch_transitions_single_target_check check (
    (candidate_id is not null and event_watch_alert_id is null)
    or (candidate_id is null and event_watch_alert_id is not null)
  ),
  constraint admin_watch_transitions_change_source_check check (
    change_source in ('admin-ui', 'legacy-import', 'system')
  ),
  constraint admin_watch_transitions_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint admin_watch_transitions_candidate_status_check check (
    candidate_id is null
    or (
      (from_status is null or from_status in ('ready', 'review', 'duplicate', 'submitted', 'handled', 'rejected'))
      and to_status in ('ready', 'review', 'duplicate', 'submitted', 'handled', 'rejected')
    )
  ),
  constraint admin_watch_transitions_alert_status_check check (
    event_watch_alert_id is null
    or (
      (from_status is null or from_status in ('review', 'confirmed', 'ignored', 'handled'))
      and to_status in ('review', 'confirmed', 'ignored', 'handled')
    )
  )
);

create index admin_watch_sources_active_last_seen_idx
  on public.admin_watch_sources (is_active, last_seen_at desc);
create index admin_watch_sources_last_seen_idx
  on public.admin_watch_sources (last_seen_at desc);

create index admin_watch_candidates_match_fingerprint_idx
  on public.admin_watch_candidates (match_fingerprint)
  where match_fingerprint is not null;
create index admin_watch_candidates_status_updated_idx
  on public.admin_watch_candidates (workflow_status, status_updated_at desc);
create index admin_watch_candidates_last_seen_idx
  on public.admin_watch_candidates (last_seen_at desc);
create index admin_watch_candidates_source_id_idx
  on public.admin_watch_candidates (source_id);
create index admin_watch_candidates_duplicate_event_id_idx
  on public.admin_watch_candidates (duplicate_event_id);
create index admin_watch_candidates_submitted_event_id_idx
  on public.admin_watch_candidates (submitted_event_id);
create index admin_watch_candidates_status_updated_by_idx
  on public.admin_watch_candidates (status_updated_by);

create unique index admin_event_watch_alerts_engine_alert_key
  on public.admin_event_watch_alerts (engine_origin, engine_alert_id)
  where engine_alert_id is not null;
create index admin_event_watch_alerts_status_detected_idx
  on public.admin_event_watch_alerts (workflow_status, detected_at desc);
create index admin_event_watch_alerts_event_id_idx
  on public.admin_event_watch_alerts (event_id);
create index admin_event_watch_alerts_field_idx
  on public.admin_event_watch_alerts (field);
create index admin_event_watch_alerts_detected_idx
  on public.admin_event_watch_alerts (detected_at desc);
create index admin_event_watch_alerts_status_updated_by_idx
  on public.admin_event_watch_alerts (status_updated_by);

create index admin_watch_transitions_candidate_changed_idx
  on public.admin_watch_transitions (candidate_id, changed_at desc);
create index admin_watch_transitions_alert_changed_idx
  on public.admin_watch_transitions (event_watch_alert_id, changed_at desc);
create index admin_watch_transitions_changed_by_idx
  on public.admin_watch_transitions (changed_by);
create index admin_watch_transitions_changed_at_idx
  on public.admin_watch_transitions (changed_at desc);

create function private.audit_admin_watch_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if tg_table_schema <> 'public'
    or tg_table_name not in ('admin_watch_candidates', 'admin_event_watch_alerts') then
    raise exception 'unsupported audit target %.%', tg_table_schema, tg_table_name;
  end if;

  if tg_op = 'INSERT' then
    new.version := 1;
    new.updated_at := now();
    new.status_updated_at := now();
    new.status_updated_by := null;
    return new;
  end if;

  if new.identity_key is distinct from old.identity_key then
    raise exception 'identity_key is immutable';
  end if;

  new.updated_at := now();
  new.version := old.version + 1;

  if new.workflow_status is distinct from old.workflow_status then
    if not coalesce((select private.is_admin()), false) then
      raise exception 'administrator role required for workflow transitions'
        using errcode = '42501';
    end if;

    new.status_updated_at := now();
    new.status_updated_by := actor_id;

    if tg_table_name = 'admin_watch_candidates' then
      insert into public.admin_watch_transitions (
        candidate_id,
        from_status,
        to_status,
        changed_by,
        change_source
      ) values (
        new.id,
        old.workflow_status,
        new.workflow_status,
        actor_id,
        'admin-ui'
      );
    else
      insert into public.admin_watch_transitions (
        event_watch_alert_id,
        from_status,
        to_status,
        changed_by,
        change_source
      ) values (
        new.id,
        old.workflow_status,
        new.workflow_status,
        actor_id,
        'admin-ui'
      );
    end if;
  else
    new.status_updated_at := old.status_updated_at;
    new.status_updated_by := old.status_updated_by;
  end if;

  return new;
end;
$$;

revoke execute on function private.audit_admin_watch_workflow() from public, anon, authenticated;

create trigger audit_admin_watch_candidate_workflow
before insert or update on public.admin_watch_candidates
for each row execute function private.audit_admin_watch_workflow();

create trigger audit_admin_event_watch_alert_workflow
before insert or update on public.admin_event_watch_alerts
for each row execute function private.audit_admin_watch_workflow();

create function private.touch_admin_watch_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'admin_watch_sources' then
    raise exception 'unsupported touch target %.%', tg_table_schema, tg_table_name;
  end if;

  if tg_op = 'INSERT' then
    new.version := 1;
    new.updated_at := now();
    return new;
  end if;

  if new.url_hash is distinct from old.url_hash then
    raise exception 'url_hash is immutable';
  end if;

  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

revoke execute on function private.touch_admin_watch_source() from public, anon, authenticated;

create trigger touch_admin_watch_source
before insert or update on public.admin_watch_sources
for each row execute function private.touch_admin_watch_source();

alter table public.admin_watch_sources enable row level security;
alter table public.admin_watch_candidates enable row level security;
alter table public.admin_event_watch_alerts enable row level security;
alter table public.admin_watch_transitions enable row level security;

revoke all privileges on table public.admin_watch_sources from anon, authenticated;
revoke all privileges on table public.admin_watch_candidates from anon, authenticated;
revoke all privileges on table public.admin_event_watch_alerts from anon, authenticated;
revoke all privileges on table public.admin_watch_transitions from anon, authenticated;
revoke all privileges on sequence public.admin_watch_transitions_id_seq from anon, authenticated;

grant select, insert, update on table public.admin_watch_sources to authenticated;
grant select, insert, update on table public.admin_watch_candidates to authenticated;
grant select, insert, update on table public.admin_event_watch_alerts to authenticated;
grant select on table public.admin_watch_transitions to authenticated;

create policy admin_watch_sources_select_admin
on public.admin_watch_sources
for select
to authenticated
using ((select private.is_admin()));

create policy admin_watch_sources_insert_admin
on public.admin_watch_sources
for insert
to authenticated
with check ((select private.is_admin()));

create policy admin_watch_sources_update_admin
on public.admin_watch_sources
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy admin_watch_candidates_select_admin
on public.admin_watch_candidates
for select
to authenticated
using ((select private.is_admin()));

create policy admin_watch_candidates_insert_admin
on public.admin_watch_candidates
for insert
to authenticated
with check ((select private.is_admin()));

create policy admin_watch_candidates_update_admin
on public.admin_watch_candidates
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy admin_event_watch_alerts_select_admin
on public.admin_event_watch_alerts
for select
to authenticated
using ((select private.is_admin()));

create policy admin_event_watch_alerts_insert_admin
on public.admin_event_watch_alerts
for insert
to authenticated
with check ((select private.is_admin()));

create policy admin_event_watch_alerts_update_admin
on public.admin_event_watch_alerts
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy admin_watch_transitions_select_admin
on public.admin_watch_transitions
for select
to authenticated
using ((select private.is_admin()));

comment on table public.admin_watch_sources is
  'Internal watch source registry and bounded aggregate counters; no fetched page bodies or secrets.';
comment on table public.admin_watch_candidates is
  'Internal durable watch candidates; detailed editable payloads remain outside this compact persistence layer.';
comment on table public.admin_event_watch_alerts is
  'Internal Event Watch alerts; JSON evidence must remain compact and must not contain full pages, HTML captures, or secrets.';
comment on table public.admin_watch_transitions is
  'Append-only workflow transition ledger populated only by private audit triggers.';
comment on column public.admin_event_watch_alerts.proof is
  'Compact structured evidence only; never store full page bodies, HTML captures, or credentials.';
comment on column public.admin_watch_transitions.metadata is
  'Compact structured transition metadata only; never store secrets or unbounded source payloads.';

commit;

-- Rollback reference (manual, never run against production without review):
-- 1. Drop the ten RLS policies above.
-- 2. Drop the three triggers above.
-- 3. Drop private.audit_admin_watch_workflow() and private.touch_admin_watch_source().
-- 4. Drop public.admin_watch_transitions, then public.admin_event_watch_alerts,
--    public.admin_watch_candidates, and finally public.admin_watch_sources.
-- This rollback deliberately leaves public.events, public.admin_users, and
-- private.is_admin() untouched.
