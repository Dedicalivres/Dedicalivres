-- P0-C3-C: a DELETE supersedes any still-pending publication decision for the
-- same durable target.  RUNNING and terminal jobs are deliberately untouched.

do $precheck$
begin
  if exists (
    select 1
    from public.event_publication_jobs
    where status = 'PENDING'
      and target_event_id is not null
    group by target_event_id
    having count(*) > 1
  ) then
    raise exception
      'PENDING_TARGET_EVENT_DUPLICATES: resolve historical jobs manually before applying this migration';
  end if;
end;
$precheck$;

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
