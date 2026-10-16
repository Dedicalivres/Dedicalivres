-- SITE-C3C-03-E5-F1. Additive, fail-closed; no backfill or production activation.
-- If an environment already contains duplicate dossier attestations/proofs,
-- either unique index aborts this transaction without changing historical rows.
begin;

create unique index event_provenance_direct_dossier_once_idx
  on private.event_provenance (dossier_id)
  where state = 'ATTESTED' and observed_channel = 'DIRECT_FORM';

create unique index publication_canary_direct_provenance_once_idx
  on private.publication_canary_evidence (provenance_id)
  where proof_type = 'DIRECT_VERIFIED';

create or replace function public.record_direct_publication_canary_evidence_checked(
  p_event_id uuid, p_submission_event_id uuid, p_declared_origin text,
  p_attested_origin text, p_identity_method text, p_justification_reference text,
  p_expected_title text, p_expected_city text, p_expected_region text,
  p_expected_country_code text, p_expected_description text, p_expected_website text,
  p_expected_start_date text, p_expected_end_date text,
  p_expected_lat double precision, p_expected_lng double precision,
  p_human_confirmed boolean
) returns bigint language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype;
  dossier private.publication_canary_source_dossiers%rowtype;
  attestation private.event_provenance%rowtype;
  proof private.publication_canary_evidence%rowtype;
  latest_id bigint;
  attestation_id bigint;
  proof_id bigint;
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

  -- PUBLIC_OFFICIAL does not lock the event row. Serialize with its insert
  -- before deciding that an existing direct proof is still the latest.
  lock table private.publication_canary_evidence in share row exclusive mode;
  select * into dossier from private.publication_canary_source_dossiers d
    where d.evidence_reference = p_justification_reference for update;
  if not found or dossier.event_id is distinct from p_event_id
    or dossier.submission_event_id is distinct from p_submission_event_id
    or dossier.state <> 'VERIFIED'
    or dossier.verified_by is null
    or dossier.verified_at not between
      clock_timestamp() - interval '30 days' and clock_timestamp()
    or dossier.attested_origin is distinct from p_attested_origin
    or dossier.identity_method is distinct from p_identity_method
    or dossier.event_snapshot is distinct from
      private.publication_canary_dossier_snapshot(e) then
    raise exception 'CANARY_DIRECT_DOSSIER_NOT_VERIFIED';
  end if;

  select * into attestation from private.event_provenance p
    where p.dossier_id = dossier.id and p.state = 'ATTESTED'
      and p.observed_channel = 'DIRECT_FORM' for update;
  if found then
    select * into proof from private.publication_canary_evidence p
      where p.provenance_id = attestation.id
        and p.proof_type = 'DIRECT_VERIFIED' for update;
    select p.id into latest_id from private.publication_canary_evidence p
      where p.event_id = p_event_id
      order by p.checked_at desc, p.id desc limit 1;
    if proof.id is null
      or proof.id is distinct from latest_id
      or attestation.event_id is distinct from p_event_id
      or attestation.submission_event_id is distinct from p_submission_event_id
      or attestation.declared_origin is distinct from p_declared_origin
      or attestation.attested_origin is distinct from p_attested_origin
      or attestation.identity_method is distinct from p_identity_method
      or attestation.justification_reference is distinct from p_justification_reference
      or attestation.verified_by is distinct from auth.uid()
      or proof.checked_by is distinct from auth.uid()
      or not private.publication_canary_proof_valid(e) then
      raise exception 'CANARY_DIRECT_DOSSIER_ALREADY_USED';
    end if;
    return proof.id;
  end if;

  insert into private.event_provenance (
    event_id, state, observed_channel, declared_origin, attested_origin,
    submission_event_id, identity_method, justification_reference, dossier_id,
    verified_by, verified_at
  ) values (
    p_event_id, 'ATTESTED', 'DIRECT_FORM', p_declared_origin, p_attested_origin,
    p_submission_event_id, p_identity_method, p_justification_reference, dossier.id,
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

-- CREATE OR REPLACE preserves the existing authenticated-only EXECUTE grant.
commit;
