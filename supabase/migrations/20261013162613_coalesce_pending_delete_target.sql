-- P0-C3-C: a DELETE supersedes any still-pending publication decision for the
-- same durable target.  RUNNING and terminal jobs are deliberately untouched.

with ranked_pending_jobs as (
  select
    id,
    row_number() over (
      partition by target_event_id
      order by
        case when reason = 'delete' then 0 else 1 end,
        requested_at desc,
        id desc
    ) as row_number
  from public.event_publication_jobs
  where status = 'PENDING'
    and target_event_id is not null
)
update public.event_publication_jobs as job
set
  status = 'BLOCKED',
  finished_at = coalesce(job.finished_at, now()),
  last_error = concat_ws(
    ' | ',
    job.last_error,
    'superseded pending publication decision for the same target'
  )
from ranked_pending_jobs as ranked
where job.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists
  event_publication_jobs_one_pending_per_target_idx
on public.event_publication_jobs (target_event_id)
where status = 'PENDING'
  and target_event_id is not null;

create or replace function private.retire_pending_publication_jobs_before_event_delete()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $function$
begin
  update public.event_publication_jobs
  set
    status = 'BLOCKED',
    finished_at = coalesce(finished_at, now()),
    last_error = concat_ws(
      ' | ',
      last_error,
      'superseded by event deletion'
    )
  where status = 'PENDING'
    and target_event_id = old.id;

  return old;
end;
$function$;

revoke all
  on function private.retire_pending_publication_jobs_before_event_delete()
  from public, anon, authenticated;

drop trigger if exists events_retire_pending_publication_before_delete
  on public.events;

create trigger events_retire_pending_publication_before_delete
before delete on public.events
for each row
execute function private.retire_pending_publication_jobs_before_event_delete();
