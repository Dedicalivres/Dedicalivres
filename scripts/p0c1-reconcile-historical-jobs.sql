-- NOT AUTHORIZED FOR PRODUCTION EXECUTION BY THIS PR.
-- Requires an independently verified Pages deployment and explicit later approval.
-- psql -X -v ON_ERROR_STOP=1 -v deployment_evidence='38208721209:cd2817bb4b845f5ce3bc8d70075cff9abf905b8f' -f this_file
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
-- Blocks concurrent job writes briefly; NOWAIT fails closed instead of waiting.
lock table public.event_publication_jobs in share row exclusive mode nowait;
select set_config('p0c1.deployment_evidence', :'deployment_evidence', true);
do $reconcile$
declare
  seclin_job constant uuid := '21d2d1eb-5b65-46e3-9624-0e877df1702d';
  pascal_job constant uuid := 'c098bfc8-4482-4452-857d-d9227b422a41';
  seclin_event constant uuid := '14b81335-1dab-4f6d-9667-5e88675c6f98';
  pascal_event constant uuid := 'c69b157c-bf2f-4ddf-affa-a57497d261c2';
  publication_commit constant text := 'cd2817bb4b845f5ce3bc8d70075cff9abf905b8f';
  historical_before jsonb;
  historical_after jsonb;
  job_count integer;
  changed_count integer;
begin
  if current_setting('p0c1.deployment_evidence', true)
     is distinct from '38208721209:' || publication_commit then
    raise exception 'P0C1_DEPLOYMENT_NOT_CONFIRMED';
  end if;

  -- Locks the two business states before reading them. A missing event fails below.
  perform 1 from public.events
  where id in (seclin_event, pascal_event) order by id for update nowait;

  -- Ordered row locks; the table lock already excludes concurrent job writes.
  perform 1 from public.event_publication_jobs
  where id in (seclin_job, pascal_job) order by id for update nowait;

  select count(*) into job_count
  from public.event_publication_jobs j
  join public.events e on e.id = j.event_id
  where (j.id = seclin_job and j.event_id = seclin_event and j.target_event_id = seclin_event
    and j.reason = 'validation' and e.validated is true and e.rejected is false
    or j.id = pascal_job and j.event_id = pascal_event and j.target_event_id = pascal_event
    and j.reason = 'unpublish' and e.validated is false and e.rejected is true)
    and j.status = 'FAILED' and j.attempt_count = 4
    and j.batch_id is null and j.commit_sha is null;
  if job_count <> 2 then
    raise exception 'P0C1_PRECONDITION_FAILED: expected two matching FAILED jobs, got %', job_count;
  end if;

  if exists (
    select 1 from public.event_publication_jobs j
    where j.status = 'RUNNING'
      and (j.event_id in (seclin_event, pascal_event)
        or j.target_event_id in (seclin_event, pascal_event))
  ) then
    raise exception 'P0C1_CONCURRENT_JOB';
  end if;

  select jsonb_agg(to_jsonb(j) - 'status' - 'commit_sha' order by j.id)
  into historical_before
  from public.event_publication_jobs j where j.id in (seclin_job, pascal_job);

  update public.event_publication_jobs
  set status = 'SUCCESS', commit_sha = publication_commit
  where id in (seclin_job, pascal_job) and status = 'FAILED'
    and attempt_count = 4 and batch_id is null and commit_sha is null;
  get diagnostics changed_count = row_count;
  if changed_count <> 2 then
    raise exception 'P0C1_UPDATE_COUNT_MISMATCH: %', changed_count;
  end if;

  select jsonb_agg(to_jsonb(j) - 'status' - 'commit_sha' order by j.id)
  into historical_after
  from public.event_publication_jobs j where j.id in (seclin_job, pascal_job);
  if historical_before is distinct from historical_after then
    raise exception 'P0C1_HISTORICAL_FIELDS_CHANGED';
  end if;
end;
$reconcile$;
commit;
