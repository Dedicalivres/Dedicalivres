-- P0-C3-A: atomic reservation and completion. Prepared only; do not apply
-- until the publication worker and isolated tests have been reviewed together.
-- No table or existing row is changed by this migration.

create or replace function public.claim_event_publication_batch(
  p_expected jsonb,
  p_batch_id uuid
)
returns setof public.event_publication_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  expected_count integer;
  matched_count integer;
  changed_count integer;
begin
  if p_batch_id is null or p_expected is null
    or jsonb_typeof(p_expected) <> 'array' then
    raise exception 'PUBLICATION_BATCH_INVALID_INPUT';
  end if;
  expected_count := jsonb_array_length(p_expected);
  if expected_count < 1 or expected_count > 500 then
    raise exception 'PUBLICATION_BATCH_INVALID_SIZE';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_expected)) <> expected_count then
    raise exception 'PUBLICATION_BATCH_DUPLICATE_ID';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(84210, 3) then
    raise exception 'PUBLICATION_BATCH_CONCURRENT_CLAIM';
  end if;
  if exists (select 1 from public.event_publication_jobs where status = 'RUNNING') then
    raise exception 'PUBLICATION_BATCH_ALREADY_RUNNING';
  end if;
  if exists (select 1 from public.event_publication_jobs where batch_id = p_batch_id) then
    raise exception 'PUBLICATION_BATCH_ID_REUSED';
  end if;

  -- Lock all selected rows in deterministic order, with no partial skip.
  perform 1 from public.event_publication_jobs j
  where j.id in (select (value->>'id')::uuid from jsonb_array_elements(p_expected))
  order by j.id for update nowait;

  select count(*) into matched_count
  from public.event_publication_jobs j
  join jsonb_to_recordset(p_expected) as x(
    id uuid, event_id uuid, target_event_id uuid, reason text,
    attempt_count integer, requested_at timestamptz
  ) on j.id = x.id
  where j.status = 'PENDING' and j.batch_id is null and j.commit_sha is null
    and j.reason in ('validation', 'edit', 'unpublish', 'delete')
    and j.target_event_id is not null and j.attempt_count < 3
    and j.event_id is not distinct from x.event_id
    and j.target_event_id is not distinct from x.target_event_id
    and j.reason is not distinct from x.reason
    and j.attempt_count is not distinct from x.attempt_count
    and j.requested_at is not distinct from x.requested_at
    and (
      (j.reason in ('validation', 'edit') and exists (
        select 1 from public.events e where e.id = j.target_event_id
          and e.validated is true and coalesce(e.rejected, false) is false
      ))
      or (j.reason = 'unpublish' and not exists (
        select 1 from public.events e where e.id = j.target_event_id
          and e.validated is true and coalesce(e.rejected, false) is false
      ))
      or (j.reason = 'delete' and not exists (
        select 1 from public.events e where e.id = j.target_event_id
      ))
    );
  if matched_count <> expected_count then
    raise exception 'PUBLICATION_BATCH_STALE_SELECTION: %/%', matched_count, expected_count;
  end if;

  return query
  update public.event_publication_jobs j
  set status = 'RUNNING', batch_id = p_batch_id,
      attempt_count = j.attempt_count + 1, started_at = now(), finished_at = null
  where j.id in (select (value->>'id')::uuid from jsonb_array_elements(p_expected))
    and j.status = 'PENDING'
  returning j.*;
  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception 'PUBLICATION_BATCH_CLAIM_COUNT: %/%', changed_count, expected_count;
  end if;
end;
$function$;

create or replace function public.complete_event_publication_batch(
  p_expected jsonb,
  p_batch_id uuid,
  p_outcome text,
  p_commit_sha text default null,
  p_error text default null
)
returns setof public.event_publication_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  expected_count integer;
  matched_count integer;
  changed_count integer;
begin
  if p_batch_id is null or p_expected is null or jsonb_typeof(p_expected) <> 'array'
    or p_outcome is null or p_outcome not in ('SUCCESS', 'FAILED') then
    raise exception 'PUBLICATION_COMPLETION_INVALID_INPUT';
  end if;
  expected_count := jsonb_array_length(p_expected);
  if expected_count < 1 or expected_count > 500
    or (select count(distinct value->>'id') from jsonb_array_elements(p_expected)) <> expected_count then
    raise exception 'PUBLICATION_COMPLETION_INVALID_SIZE';
  end if;
  if p_outcome = 'SUCCESS' and (p_commit_sha is null or p_commit_sha !~ '^[0-9a-f]{40}$') then
    raise exception 'PUBLICATION_COMPLETION_INVALID_SHA';
  end if;
  if p_outcome = 'FAILED' and (p_error is null or btrim(p_error) = '' or p_commit_sha is not null) then
    raise exception 'PUBLICATION_COMPLETION_INVALID_FAILURE';
  end if;

  perform 1 from public.event_publication_jobs j
  where j.batch_id = p_batch_id order by j.id for update nowait;
  if (select count(*) from public.event_publication_jobs where batch_id = p_batch_id) <> expected_count then
    raise exception 'PUBLICATION_COMPLETION_BATCH_SIZE';
  end if;
  select count(*) into matched_count
  from public.event_publication_jobs j
  join jsonb_to_recordset(p_expected) as x(id uuid, attempt_count integer) on j.id = x.id
  where j.status = 'RUNNING' and j.batch_id = p_batch_id and j.commit_sha is null
    and j.attempt_count = x.attempt_count and j.attempt_count between 1 and 3;
  if matched_count <> expected_count then
    raise exception 'PUBLICATION_COMPLETION_STALE_BATCH: %/%', matched_count, expected_count;
  end if;

  return query
  update public.event_publication_jobs j
  set status = case
        when p_outcome = 'SUCCESS' then 'SUCCESS'
        when j.attempt_count >= 3 or exists (
          select 1 from public.event_publication_jobs newer
          where newer.id <> j.id and newer.event_id = j.event_id
            and newer.status = 'PENDING'
        ) then 'FAILED'
        else 'PENDING' end,
      batch_id = case when p_outcome = 'FAILED' and j.attempt_count < 3
        and not exists (
          select 1 from public.event_publication_jobs newer
          where newer.id <> j.id and newer.event_id = j.event_id
            and newer.status = 'PENDING'
        ) then null else j.batch_id end,
      finished_at = case when p_outcome = 'SUCCESS' or j.attempt_count >= 3
        or exists (select 1 from public.event_publication_jobs newer
          where newer.id <> j.id and newer.event_id = j.event_id
            and newer.status = 'PENDING')
        then now() else null end,
      commit_sha = case when p_outcome = 'SUCCESS' then p_commit_sha else j.commit_sha end,
      last_error = case when p_outcome = 'SUCCESS' then j.last_error
        else concat_ws(' | ', j.last_error,
          'batch=' || p_batch_id::text || ': ' || left(p_error, 2000)) end
  where j.batch_id = p_batch_id and j.status = 'RUNNING'
  returning j.*;
  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception 'PUBLICATION_COMPLETION_UPDATE_COUNT: %/%', changed_count, expected_count;
  end if;
end;
$function$;

revoke all on function public.claim_event_publication_batch(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.complete_event_publication_batch(jsonb, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_event_publication_batch(jsonb, uuid) to service_role;
grant execute on function public.complete_event_publication_batch(jsonb, uuid, text, text, text) to service_role;
