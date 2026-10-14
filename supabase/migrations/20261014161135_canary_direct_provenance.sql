-- SITE-C3C-03-E5-C. Additive, disarmed, no event/job/backfill writes.
-- Private references are opaque dossier identifiers, never contact details or public R2 URLs.
begin;

create table private.event_provenance (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  state text not null check (state in ('OBSERVED', 'DECLARED', 'ATTESTED', 'REVOKED')),
  observed_channel text not null check (observed_channel in
    ('DIRECT_FORM', 'AUTO_MATTE', 'ADMIN', 'UNKNOWN')),
  declared_origin text check (declared_origin in
    ('DIRECT_AUTHOR', 'DIRECT_ORGANIZER', 'DIRECT_OTHER')),
  attested_origin text check (attested_origin in
    ('DIRECT_AUTHOR', 'DIRECT_ORGANIZER', 'DIRECT_OTHER',
     'AUTO_MATTE', 'ADMIN_MANUAL', 'LEGACY_UNKNOWN')),
  submission_event_id uuid,
  auto_matte_reference text,
  identity_method text check (identity_method in
    ('OFFICIAL_CHANNEL_REPLY', 'OFFICIAL_PHONE',
     'VERIFIED_PROFESSIONAL_PROFILE', 'PREVIOUS_CONTACT_RECONFIRMED')),
  justification_reference text,
  verified_by uuid,
  verified_at timestamptz,
  revokes_id bigint references private.event_provenance(id),
  revocation_reason text,
  retention_review_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint event_provenance_state_shape check (
    (state = 'OBSERVED' and declared_origin is null and attested_origin is null
      and revokes_id is null and revocation_reason is null)
    or (state = 'DECLARED' and declared_origin is not null and attested_origin is null
      and revokes_id is null and revocation_reason is null)
    or (state = 'ATTESTED' and attested_origin is not null
      and verified_by is not null and verified_at is not null
      and revokes_id is null and revocation_reason is null)
    or (state = 'REVOKED' and attested_origin is null
      and verified_by is not null and verified_at is not null
      and revokes_id is not null
      and nullif(btrim(revocation_reason), '') is not null)
  ),
  constraint event_provenance_direct_attestation check (
    state <> 'ATTESTED' or attested_origin not in
      ('DIRECT_AUTHOR', 'DIRECT_ORGANIZER', 'DIRECT_OTHER')
    or (observed_channel = 'DIRECT_FORM'
      and submission_event_id is not null
      and submission_event_id = event_id
      and identity_method is not null
      and justification_reference is not null
      and justification_reference ~ '^evidence:[A-Za-z0-9_-]{8,128}$')
  )
);
create index event_provenance_event_latest_idx
  on private.event_provenance (event_id, id desc);
create index event_provenance_revokes_idx
  on private.event_provenance (revokes_id) where revokes_id is not null;
alter table private.event_provenance enable row level security;
revoke all on private.event_provenance from public, anon, authenticated, service_role;
revoke all on sequence private.event_provenance_id_seq from public, anon, authenticated, service_role;

-- Existing rows are PUBLIC_OFFICIAL. Widen source_url only for the new private route.
alter table private.publication_canary_evidence
  add column proof_type text not null default 'PUBLIC_OFFICIAL',
  add column provenance_id bigint references private.event_provenance(id),
  alter column source_url drop not null,
  add constraint publication_canary_evidence_type_check check (
    (proof_type = 'PUBLIC_OFFICIAL' and source_url is not null and provenance_id is null)
    or (proof_type = 'DIRECT_VERIFIED' and source_url is null and provenance_id is not null)
  );
create index publication_canary_evidence_provenance_idx
  on private.publication_canary_evidence (provenance_id)
  where provenance_id is not null;

-- Latest proof only: a revoked direct proof cannot reveal an older public proof.
create function private.publication_canary_proof_valid(p_event public.events)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists (
    select 1 from (
      select proof.* from private.publication_canary_evidence proof
      where proof.event_id = (p_event).id
      order by proof.checked_at desc, proof.id desc limit 1
    ) proof
    where proof.human_confirmed is true
      and proof.checked_at between clock_timestamp() - interval '30 days' and clock_timestamp()
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
      and (
        (proof.proof_type = 'PUBLIC_OFFICIAL'
          and nullif(btrim(proof.source_identity), '') is not null
          and nullif(btrim(proof.event_reference), '') is not null
          and private.publication_canary_source_url_valid(proof.source_url))
        or (proof.proof_type = 'DIRECT_VERIFIED'
          and exists (
            select 1 from private.event_provenance provenance
            join public.event_submission_contacts contact
              on contact.event_id = provenance.submission_event_id
            where provenance.id = proof.provenance_id
              and provenance.event_id = (p_event).id
              and provenance.submission_event_id = (p_event).id
              and provenance.state = 'ATTESTED'
              and provenance.observed_channel = 'DIRECT_FORM'
              and provenance.attested_origin in
                ('DIRECT_AUTHOR', 'DIRECT_ORGANIZER', 'DIRECT_OTHER')
              and provenance.identity_method is not null
              and provenance.justification_reference ~ '^evidence:[A-Za-z0-9_-]{8,128}$'
              and provenance.verified_by is not null
              and provenance.verified_at is not null
              and not exists (
                select 1 from private.event_provenance revoked
                where revoked.revokes_id = provenance.id and revoked.state = 'REVOKED'
              )
          ))
      )
  );
$$;
revoke all on function private.publication_canary_proof_valid(public.events)
  from public, anon, authenticated, service_role;

create or replace function private.publication_canary_evidence_valid(p_event public.events)
returns boolean language sql volatile security definer set search_path = '' as $$
  select private.publication_canary_proof_valid(p_event)
    and (p_event).validated is true
    and coalesce((p_event).rejected, false) is false
    and coalesce((p_event).registration_force_status, '') <> 'annule'
    and coalesce((p_event).end_date::date, (p_event).start_date::date)
      >= (clock_timestamp() at time zone 'Europe/Paris')::date;
$$;
revoke all on function private.publication_canary_evidence_valid(public.events)
  from public, anon, authenticated, service_role;

-- Same public RPC signature and status vocabulary used by Admin V11.
create or replace function public.get_publication_canary_evidence(p_event_id uuid)
returns table (
  proof_status text, checked_at timestamptz, source_url text,
  source_identity text, event_reference text, proof_count bigint,
  pending_validation_job boolean, technical_candidate boolean
)
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events%rowtype; proof private.publication_canary_evidence%rowtype;
  status text; pending_job boolean;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  select * into e from public.events where id = p_event_id;
  if not found then raise exception 'CANARY_EVENT_NOT_FOUND'; end if;
  select * into proof from private.publication_canary_evidence p
  where p.event_id = p_event_id order by p.checked_at desc, p.id desc limit 1;
  if proof.id is null then status := 'none';
  elsif proof.title_snapshot is distinct from e.title
    or proof.city_snapshot is distinct from e.city
    or proof.website_snapshot is distinct from e.website
    or proof.description_snapshot is distinct from e.description
    or proof.region_snapshot is distinct from e.region
    or proof.country_code_snapshot is distinct from e.country_code
    or proof.lat_snapshot is distinct from e.lat
    or proof.lng_snapshot is distinct from e.lng
    or proof.start_date_snapshot is distinct from e.start_date::text
    or proof.end_date_snapshot is distinct from e.end_date::text then status := 'invalidated';
  elsif proof.checked_at < clock_timestamp() - interval '30 days'
    or proof.checked_at > clock_timestamp() then status := 'expired';
  elsif private.publication_canary_proof_valid(e) then status := 'valid';
  else status := 'invalidated'; end if;
  select exists (
    select 1 from public.event_publication_jobs j
    where j.target_event_id = p_event_id and j.status = 'PENDING'
      and j.reason = 'validation' and j.event_id = j.target_event_id
      and j.attempt_count = 0 and j.last_error is null
      and j.batch_id is null and j.commit_sha is null
  ) into pending_job;
  return query select status, proof.checked_at, proof.source_url,
    proof.source_identity, proof.event_reference,
    (select count(*) from private.publication_canary_evidence p where p.event_id = p_event_id),
    pending_job, pending_job and status = 'valid'
      and private.publication_canary_evidence_valid(e);
end;
$$;
revoke all on function public.get_publication_canary_evidence(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_publication_canary_evidence(uuid) to authenticated;

-- One Admin action writes the attestation and proof in one transaction.
create function public.record_direct_publication_canary_evidence_checked(
  p_event_id uuid, p_submission_event_id uuid, p_declared_origin text,
  p_attested_origin text, p_identity_method text, p_justification_reference text,
  p_expected_title text, p_expected_city text, p_expected_region text,
  p_expected_country_code text, p_expected_description text, p_expected_website text,
  p_expected_start_date text, p_expected_end_date text,
  p_expected_lat double precision, p_expected_lng double precision,
  p_human_confirmed boolean
) returns bigint language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; attestation_id bigint; proof_id bigint;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  if p_human_confirmed is not true
    or p_attested_origin is null
    or p_attested_origin not in ('DIRECT_AUTHOR', 'DIRECT_ORGANIZER', 'DIRECT_OTHER')
    or (p_declared_origin is not null and p_declared_origin not in
      ('DIRECT_AUTHOR', 'DIRECT_ORGANIZER', 'DIRECT_OTHER'))
    or p_identity_method is null
    or p_identity_method not in ('OFFICIAL_CHANNEL_REPLY', 'OFFICIAL_PHONE',
      'VERIFIED_PROFESSIONAL_PROFILE', 'PREVIOUS_CONTACT_RECONFIRMED')
    or p_justification_reference is null
    or p_justification_reference !~ '^evidence:[A-Za-z0-9_-]{8,128}$'
  then raise exception 'CANARY_DIRECT_EVIDENCE_INVALID'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not found
    or e.title is distinct from p_expected_title
    or e.city is distinct from p_expected_city
    or e.region is distinct from p_expected_region
    or e.country_code is distinct from p_expected_country_code
    or e.description is distinct from p_expected_description
    or e.website is distinct from p_expected_website
    or e.start_date::text is distinct from p_expected_start_date
    or e.end_date::text is distinct from p_expected_end_date
    or e.lat is distinct from p_expected_lat
    or e.lng is distinct from p_expected_lng
  then raise exception 'CANARY_SOURCE_EVIDENCE_STALE'; end if;
  if p_submission_event_id is distinct from p_event_id
    or not exists (
      select 1 from public.event_submission_contacts c
      where c.event_id = p_submission_event_id for share
    ) then raise exception 'CANARY_DIRECT_SUBMISSION_INVALID'; end if;
  insert into private.event_provenance (
    event_id, state, observed_channel, declared_origin, attested_origin,
    submission_event_id, identity_method, justification_reference,
    verified_by, verified_at
  ) values (
    p_event_id, 'ATTESTED', 'DIRECT_FORM', p_declared_origin, p_attested_origin,
    p_submission_event_id, p_identity_method, p_justification_reference,
    auth.uid(), clock_timestamp()
  ) returning id into attestation_id;
  insert into private.publication_canary_evidence (
    event_id, source_url, source_identity, event_reference,
    title_snapshot, city_snapshot, website_snapshot, description_snapshot,
    region_snapshot, country_code_snapshot, lat_snapshot, lng_snapshot,
    start_date_snapshot, end_date_snapshot, checked_by, human_confirmed,
    proof_type, provenance_id
  ) values (
    p_event_id, null, 'Soumission directe vérifiée', 'Dossier privé',
    e.title, e.city, e.website, e.description, e.region, e.country_code,
    e.lat, e.lng, e.start_date::text, e.end_date::text, auth.uid(), true,
    'DIRECT_VERIFIED', attestation_id
  ) returning id into proof_id;
  return proof_id;
end;
$$;
revoke all on function public.record_direct_publication_canary_evidence_checked(
  uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,
  double precision,double precision,boolean
) from public, anon, authenticated, service_role;
grant execute on function public.record_direct_publication_canary_evidence_checked(
  uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,
  double precision,double precision,boolean
) to authenticated;

create function public.revoke_direct_publication_canary_evidence(
  p_event_id uuid, p_proof_id bigint, p_reason text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare proof private.publication_canary_evidence%rowtype;
  attestation private.event_provenance%rowtype; revocation_id bigint;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'CANARY_REVOCATION_REASON_REQUIRED';
  end if;
  perform 1 from public.events where id = p_event_id for update;
  if not found then raise exception 'CANARY_EVENT_NOT_FOUND'; end if;
  select * into proof from private.publication_canary_evidence p
    where p.event_id = p_event_id order by p.checked_at desc, p.id desc limit 1 for update;
  if not found or proof.id is distinct from p_proof_id
    or proof.proof_type <> 'DIRECT_VERIFIED' then
    raise exception 'CANARY_DIRECT_PROOF_NOT_LATEST';
  end if;
  select * into attestation from private.event_provenance
    where id = proof.provenance_id for update;
  if not found or attestation.state <> 'ATTESTED'
    or exists (select 1 from private.event_provenance r
      where r.revokes_id = attestation.id and r.state = 'REVOKED') then
    raise exception 'CANARY_DIRECT_ALREADY_REVOKED';
  end if;
  insert into private.event_provenance (
    event_id, state, observed_channel, revokes_id, revocation_reason,
    verified_by, verified_at
  ) values (
    p_event_id, 'REVOKED', attestation.observed_channel,
    attestation.id, btrim(p_reason), auth.uid(), clock_timestamp()
  ) returning id into revocation_id;
  return revocation_id;
end;
$$;
revoke all on function public.revoke_direct_publication_canary_evidence(uuid,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_direct_publication_canary_evidence(uuid,bigint,text)
  to authenticated;

-- Admin-only metadata; no contact address or private dossier reference is returned.
create function public.get_event_provenance(p_event_id uuid)
returns table (observed_channel text, declared_origin text, attested_origin text,
  attestation_state text, verified_at timestamptz, proof_type text,
  proof_checked_at timestamptz, history_count bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare provenance private.event_provenance%rowtype;
  declaration private.event_provenance%rowtype;
  proof private.publication_canary_evidence%rowtype;
  observed text;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  perform 1 from public.events where id = p_event_id;
  if not found then raise exception 'CANARY_EVENT_NOT_FOUND'; end if;
  select * into provenance from private.event_provenance p
    where p.event_id = p_event_id and p.state = 'ATTESTED'
    order by p.id desc limit 1;
  select * into declaration from private.event_provenance p
    where p.event_id = p_event_id and p.state = 'DECLARED'
    order by p.id desc limit 1;
  observed := case
    when exists (select 1 from public.event_submission_contacts c
      where c.event_id = p_event_id) then 'DIRECT_FORM'
    else coalesce((
      select p.observed_channel from private.event_provenance p
      where p.event_id = p_event_id and p.state = 'OBSERVED'
      order by p.id desc limit 1
    ), 'UNKNOWN') end;
  select * into proof from private.publication_canary_evidence p
    where p.event_id = p_event_id order by p.checked_at desc, p.id desc limit 1;
  return query select observed,
    coalesce(provenance.declared_origin, declaration.declared_origin),
    coalesce(provenance.attested_origin, 'LEGACY_UNKNOWN'),
    case when provenance.id is null then 'UNKNOWN'
      when exists (select 1 from private.event_provenance r
        where r.revokes_id = provenance.id and r.state = 'REVOKED') then 'REVOKED'
      else provenance.state end,
    provenance.verified_at, proof.proof_type, proof.checked_at,
    (select count(*) from private.event_provenance p where p.event_id = p_event_id);
end;
$$;
revoke all on function public.get_event_provenance(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_event_provenance(uuid) to authenticated;

-- Claim must serialize with both new attestations and revocations.
create or replace function public.claim_publication_canary_batch(
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
  lock table private.publication_canary_evidence in share mode nowait;
  lock table private.event_provenance in share mode nowait;
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

commit;
