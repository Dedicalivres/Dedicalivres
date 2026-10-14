-- SITE-C3C-03-B-R3. Additive only; deliberately disarmed on installation.
-- Apply only after review. No historical event or publication job is changed.

create table private.publication_canary_state (
  id boolean primary key default true check (id),
  armed boolean not null default false,
  halted boolean not null default false,
  constraint publication_canary_state_modes check (not (armed and halted)),
  cleared_through_run_id bigint not null default 0 check (cleared_through_run_id >= 0),
  incident_at timestamptz,
  incident_run_id bigint,
  incident_batch_id uuid,
  incident_reason text
);
insert into private.publication_canary_state (id) values (true);

create table private.publication_canary_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null,
  batch_id uuid not null unique,
  run_id bigint not null,
  reserved_at timestamptz not null default clock_timestamp(),
  unique (run_id)
);
create index publication_canary_attempts_reserved_idx
  on private.publication_canary_attempts (reserved_at desc);

create table private.publication_canary_incidents (
  id bigint generated always as identity primary key,
  run_id bigint not null,
  run_attempt integer not null,
  batch_id uuid,
  reason text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (run_id, run_attempt)
);

create table private.publication_canary_reviews (
  id bigint generated always as identity primary key,
  reviewed_run_id bigint not null,
  review_note text not null,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default clock_timestamp()
);

create table private.publication_canary_evidence (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  source_url text not null,
  source_identity text not null,
  event_reference text not null,
  title_snapshot text not null,
  city_snapshot text not null,
  website_snapshot text,
  description_snapshot text,
  region_snapshot text,
  country_code_snapshot text,
  lat_snapshot double precision,
  lng_snapshot double precision,
  start_date_snapshot text not null,
  end_date_snapshot text,
  checked_at timestamptz not null default clock_timestamp(),
  checked_by uuid not null,
  human_confirmed boolean not null check (human_confirmed)
);
create index publication_canary_evidence_event_idx
  on private.publication_canary_evidence (event_id, checked_at desc, id desc);

alter table private.publication_canary_state enable row level security;
alter table private.publication_canary_attempts enable row level security;
alter table private.publication_canary_incidents enable row level security;
alter table private.publication_canary_reviews enable row level security;
alter table private.publication_canary_evidence enable row level security;
revoke all on private.publication_canary_state from public, anon, authenticated, service_role;
revoke all on private.publication_canary_attempts from public, anon, authenticated, service_role;
revoke all on private.publication_canary_incidents from public, anon, authenticated, service_role;
revoke all on private.publication_canary_reviews from public, anon, authenticated, service_role;
revoke all on private.publication_canary_evidence from public, anon, authenticated, service_role;

create function private.publication_canary_source_url_valid(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    case
      when p_url ~* '^https://(www\.|m\.)?instagram\.com/' then
        p_url ~* '^https://(www\.|m\.)?instagram\.com/(p|reel)/[a-z0-9_-]+'
      when p_url ~* '^https://(www\.|m\.)?facebook\.com/' then
        p_url ~* '^https://(www\.|m\.)?facebook\.com/(events/[0-9]+|[a-z0-9._-]+/posts/[0-9]+|permalink\.php\?story_fbid=[0-9]+)'
      else p_url ~ '^https://[^/?#]+/[^/?#][^?#]*'
    end, false
  );
$$;
revoke all on function private.publication_canary_source_url_valid(text)
  from public, anon, authenticated, service_role;

create function private.publication_canary_evidence_valid(p_event public.events)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists (
    select 1 from (
      select proof.* from private.publication_canary_evidence proof
      where proof.event_id = (p_event).id
      order by proof.checked_at desc, proof.id desc limit 1
    ) proof
    where proof.human_confirmed is true
      and proof.checked_at >= clock_timestamp() - interval '30 days'
      and proof.checked_at <= clock_timestamp()
      and proof.title_snapshot = (p_event).title
      and proof.city_snapshot = (p_event).city
      and proof.website_snapshot is not distinct from (p_event).website
      and proof.description_snapshot is not distinct from (p_event).description
      and proof.region_snapshot is not distinct from (p_event).region
      and proof.country_code_snapshot is not distinct from (p_event).country_code
      and proof.lat_snapshot is not distinct from (p_event).lat
      and proof.lng_snapshot is not distinct from (p_event).lng
      and proof.start_date_snapshot = (p_event).start_date::text
      and proof.end_date_snapshot is not distinct from (p_event).end_date::text
      and nullif(btrim(proof.source_identity), '') is not null
      and nullif(btrim(proof.event_reference), '') is not null
      and private.publication_canary_source_url_valid(proof.source_url)
  )
  and (p_event).validated is true
  and coalesce((p_event).rejected, false) is false
  and coalesce((p_event).registration_force_status, '') <> 'annule'
  and coalesce((p_event).end_date::date, (p_event).start_date::date)
      >= (clock_timestamp() at time zone 'Europe/Paris')::date;
$$;
revoke all on function private.publication_canary_evidence_valid(public.events)
  from public, anon, authenticated, service_role;

-- The admin records an explicit human source check. Neither the public event
-- flag "verified" nor the historical territorial venue register is imported.
create function public.record_publication_canary_evidence(
  p_event_id uuid, p_source_url text, p_source_identity text,
  p_event_reference text, p_title text, p_city text,
  p_start_date text, p_end_date text, p_human_confirmed boolean
) returns bigint language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; proof_id bigint;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  if p_human_confirmed is not true
    or not private.publication_canary_source_url_valid(p_source_url)
    or nullif(btrim(p_source_identity), '') is null
    or nullif(btrim(p_event_reference), '') is null then
    raise exception 'CANARY_SOURCE_EVIDENCE_INVALID';
  end if;
  select * into e from public.events where id = p_event_id;
  if not found or e.title is distinct from p_title
    or e.city is distinct from p_city
    or e.start_date::text is distinct from p_start_date
    or e.end_date::text is distinct from p_end_date then
    raise exception 'CANARY_SOURCE_EVIDENCE_STALE';
  end if;
  insert into private.publication_canary_evidence (
    event_id, source_url, source_identity, event_reference,
    title_snapshot, city_snapshot, website_snapshot, description_snapshot,
    region_snapshot, country_code_snapshot, lat_snapshot, lng_snapshot,
    start_date_snapshot, end_date_snapshot, checked_by, human_confirmed
  ) values (
    p_event_id, p_source_url, btrim(p_source_identity), btrim(p_event_reference),
    p_title, p_city, e.website, e.description, e.region, e.country_code,
    e.lat, e.lng, p_start_date, p_end_date, auth.uid(), true
  ) returning id into proof_id;
  return proof_id;
end;
$$;
revoke all on function public.record_publication_canary_evidence(
  uuid,text,text,text,text,text,text,text,boolean
) from public, anon, authenticated, service_role;
grant execute on function public.record_publication_canary_evidence(
  uuid,text,text,text,text,text,text,text,boolean
) to authenticated;

-- A human must inspect incidents and supply the last reviewed Actions run ID.
-- The state starts disarmed: changing a GitHub variable alone never enables it.
create function public.arm_publication_canary(p_reviewed_run_id bigint, p_review_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  if p_reviewed_run_id is null or p_reviewed_run_id <= 0
    or char_length(btrim(coalesce(p_review_note, ''))) < 20 then
    raise exception 'CANARY_REVIEW_REQUIRED';
  end if;
  if exists (select 1 from public.event_publication_jobs where status = 'RUNNING') then
    raise exception 'CANARY_RUNNING_REVIEW_REQUIRED';
  end if;
  update private.publication_canary_state
  set armed = true, halted = false,
      cleared_through_run_id = greatest(cleared_through_run_id, p_reviewed_run_id)
  where id = true and p_reviewed_run_id >= coalesce(incident_run_id, 0);
  if not found then raise exception 'CANARY_INCIDENT_NOT_REVIEWED'; end if;
  insert into private.publication_canary_reviews
    (reviewed_run_id, review_note, reviewed_by)
  values (p_reviewed_run_id, btrim(p_review_note), auth.uid());
end;
$$;
revoke all on function public.arm_publication_canary(bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.arm_publication_canary(bigint,text) to authenticated;

create function public.publication_canary_status()
returns table (armed boolean, halted boolean, cleared_through_run_id bigint,
  last_reserved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.armed, s.halted, s.cleared_through_run_id,
    (select max(a.reserved_at) from private.publication_canary_attempts a)
  from private.publication_canary_state s where s.id = true;
$$;
revoke all on function public.publication_canary_status()
  from public, anon, authenticated, service_role;
grant execute on function public.publication_canary_status() to service_role;

create function public.publication_canary_candidate()
returns setof public.event_publication_jobs
language sql volatile security definer set search_path = '' as $$
  select j.* from public.event_publication_jobs j
  join public.events e on e.id = j.target_event_id
  where j.status = 'PENDING' and j.reason = 'validation'
    and j.event_id = j.target_event_id
    and j.attempt_count = 0 and j.last_error is null
    and j.batch_id is null and j.commit_sha is null
    and private.publication_canary_evidence_valid(e)
  order by j.requested_at asc, j.id asc limit 1;
$$;
revoke all on function public.publication_canary_candidate()
  from public, anon, authenticated, service_role;
grant execute on function public.publication_canary_candidate() to service_role;

create function public.claim_publication_canary_batch(
  p_expected jsonb, p_batch_id uuid, p_run_id bigint, p_run_attempt integer
) returns setof public.event_publication_jobs
language plpgsql security definer set search_path = '' as $$
declare s private.publication_canary_state%rowtype;
  selected_id uuid; selected_event_id uuid; claimed_count integer;
begin
  if p_expected is null or jsonb_typeof(p_expected) <> 'array'
    or jsonb_array_length(p_expected) <> 1 or p_batch_id is null
    or p_run_id is null or p_run_id <= 0 or p_run_attempt <> 1 then
    raise exception 'CANARY_INVALID_INPUT';
  end if;
  select * into s from private.publication_canary_state where id = true for update nowait;
  if not found or not s.armed or s.halted then
    raise exception 'CANARY_NOT_ARMED';
  end if;
  if exists (select 1 from private.publication_canary_attempts
             where reserved_at > clock_timestamp() - interval '24 hours') then
    raise exception 'CANARY_24H_LIMIT';
  end if;
  -- Keep evidence and event content stable until the existing claim RPC commits.
  lock table private.publication_canary_evidence in share mode nowait;
  selected_id := (p_expected->0->>'id')::uuid;
  select e.id into selected_event_id
  from public.event_publication_jobs j
  join public.events e on e.id = j.target_event_id
  where j.id = selected_id and j.status = 'PENDING'
    and j.reason = 'validation' and j.event_id = j.target_event_id
    and j.attempt_count = 0 and j.last_error is null
    and j.batch_id is null and j.commit_sha is null
    and private.publication_canary_evidence_valid(e)
  for share of e nowait;
  if selected_event_id is null then raise exception 'CANARY_SOURCE_OR_JOB_INVALID'; end if;
  return query select * from public.claim_event_publication_batch(p_expected, p_batch_id);
  get diagnostics claimed_count = row_count;
  if claimed_count <> 1 then raise exception 'CANARY_CLAIM_COUNT'; end if;
  insert into private.publication_canary_attempts (job_id, batch_id, run_id)
  values (selected_id, p_batch_id, p_run_id);
end;
$$;
revoke all on function public.claim_publication_canary_batch(jsonb,uuid,bigint,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_publication_canary_batch(jsonb,uuid,bigint,integer)
  to service_role;

create function public.record_publication_canary_incident(
  p_run_id bigint, p_run_attempt integer, p_batch_id uuid, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare effective_batch_id uuid;
begin
  if p_run_id is null or p_run_id <= 0 or p_run_attempt is null or p_run_attempt < 1
    or nullif(btrim(p_reason), '') is null then
    raise exception 'CANARY_INCIDENT_INVALID';
  end if;
  effective_batch_id := coalesce(p_batch_id,
    (select a.batch_id from private.publication_canary_attempts a
     where a.run_id = p_run_id));
  insert into private.publication_canary_incidents (run_id, run_attempt, batch_id, reason)
  values (p_run_id, p_run_attempt, effective_batch_id, left(p_reason, 500))
  on conflict (run_id, run_attempt) do nothing;
  update private.publication_canary_state
  set armed = false, halted = true, incident_at = clock_timestamp(),
      incident_run_id = p_run_id, incident_batch_id = effective_batch_id,
      incident_reason = left(p_reason, 500)
  where id = true;
  if not found then raise exception 'CANARY_STATE_MISSING'; end if;
end;
$$;
revoke all on function public.record_publication_canary_incident(bigint,integer,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_publication_canary_incident(bigint,integer,uuid,text)
  to service_role;
