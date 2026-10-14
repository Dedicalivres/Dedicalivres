-- Admin-only read of the latest CANARY source proof. Additive; no data change.
-- Install the CANARY V1 migration first. This function does not arm the CANARY.
create function public.get_publication_canary_evidence(p_event_id uuid)
returns table (
  proof_status text,
  checked_at timestamptz,
  source_url text,
  source_identity text,
  event_reference text,
  proof_count bigint,
  pending_validation_job boolean,
  technical_candidate boolean
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.events%rowtype;
  proof private.publication_canary_evidence%rowtype;
  status text;
  pending_job boolean;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  select * into e from public.events where id = p_event_id;
  if not found then raise exception 'CANARY_EVENT_NOT_FOUND'; end if;

  select * into proof from private.publication_canary_evidence p
  where p.event_id = p_event_id
  order by p.checked_at desc, p.id desc limit 1;

  if proof.id is null then
    status := 'none';
  elsif proof.title_snapshot is distinct from e.title
    or proof.city_snapshot is distinct from e.city
    or proof.website_snapshot is distinct from e.website
    or proof.description_snapshot is distinct from e.description
    or proof.region_snapshot is distinct from e.region
    or proof.country_code_snapshot is distinct from e.country_code
    or proof.lat_snapshot is distinct from e.lat
    or proof.lng_snapshot is distinct from e.lng
    or proof.start_date_snapshot is distinct from e.start_date::text
    or proof.end_date_snapshot is distinct from e.end_date::text then
    status := 'invalidated';
  elsif proof.checked_at < clock_timestamp() - interval '30 days'
    or proof.checked_at > clock_timestamp() then
    status := 'expired';
  elsif proof.human_confirmed is not true
    or nullif(btrim(proof.source_identity), '') is null
    or nullif(btrim(proof.event_reference), '') is null
    or not private.publication_canary_source_url_valid(proof.source_url) then
    status := 'invalidated';
  else
    status := 'valid';
  end if;

  select exists (
    select 1 from public.event_publication_jobs j
    where j.target_event_id = p_event_id
      and j.status = 'PENDING' and j.reason = 'validation'
      and j.event_id = j.target_event_id
      and j.attempt_count = 0 and j.last_error is null
      and j.batch_id is null and j.commit_sha is null
  ) into pending_job;

  return query select status, proof.checked_at, proof.source_url,
    proof.source_identity, proof.event_reference,
    (select count(*) from private.publication_canary_evidence p
     where p.event_id = p_event_id),
    pending_job,
    pending_job and status = 'valid'
      and private.publication_canary_evidence_valid(e);
end;
$$;
revoke all on function public.get_publication_canary_evidence(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_publication_canary_evidence(uuid)
  to authenticated;
