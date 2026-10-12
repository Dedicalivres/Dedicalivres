-- Read-only gate. Run with psql -X -v ON_ERROR_STOP=1 -f this_file.
-- Deployment and public artifact evidence must also be checked outside SQL.
with expected(id, event_id, reason, validated, rejected) as (
  values
    ('21d2d1eb-5b65-46e3-9624-0e877df1702d'::uuid, '14b81335-1dab-4f6d-9667-5e88675c6f98'::uuid, 'validation', true, false),
    ('c098bfc8-4482-4452-857d-d9227b422a41'::uuid, 'c69b157c-bf2f-4ddf-affa-a57497d261c2'::uuid, 'unpublish', false, true)
), checked as (
  select x.id, j.status, j.attempt_count, j.batch_id, j.commit_sha,
    (j.id is not null and j.event_id = x.event_id and j.target_event_id = x.event_id
      and j.reason = x.reason and j.status = 'FAILED' and j.attempt_count = 4
      and j.batch_id is null and j.commit_sha is null
      and e.validated is not distinct from x.validated
      and e.rejected is not distinct from x.rejected) as valid
  from expected x
  left join public.event_publication_jobs j on j.id = x.id
  left join public.events e on e.id = x.event_id
)
select count(*) = 2 and bool_and(valid) and not exists (
  select 1 from public.event_publication_jobs j
  where j.status = 'RUNNING' and (
    j.event_id in (select event_id from expected)
    or j.target_event_id in (select event_id from expected)
  )
) as ready, jsonb_agg(to_jsonb(checked) order by id) as jobs
from checked;
