-- Dédicalivres
-- Réveil serveur de la publication statique.
--
-- Aucun événement n'est validé, rejeté ou supprimé ici.
-- La file event_publication_jobs reste la source de vérité.

create extension if not exists pg_net;

alter table public.event_publication_jobs
  add column if not exists dispatch_requested_at timestamptz;

comment on column public.event_publication_jobs.dispatch_requested_at
is 'Date du réveil GitHub Actions demandé par le serveur Supabase.';

create or replace function public.claim_event_publication_dispatch(p_job_id uuid)
returns table (event_id uuid, reason text)
language sql
volatile
security definer
set search_path = public
as $function$
  update public.event_publication_jobs as job
  set dispatch_requested_at = now()
  where job.id = p_job_id
    and job.status = 'PENDING'
    and job.event_id is not null
    and job.reason in ('validation','edit')
    and coalesce(job.attempt_count,0) < 3
    and job.dispatch_requested_at is null
  returning job.event_id, job.reason;
$function$;

revoke all on function public.claim_event_publication_dispatch(uuid)
from public, anon, authenticated;

grant execute on function public.claim_event_publication_dispatch(uuid)
to service_role;

create or replace function public.release_event_publication_dispatch(p_job_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $function$
  update public.event_publication_jobs
  set dispatch_requested_at = null
  where id = p_job_id
    and status = 'PENDING';
$function$;

revoke all on function public.release_event_publication_dispatch(uuid)
from public, anon, authenticated;

grant execute on function public.release_event_publication_dispatch(uuid)
to service_role;

create or replace function private.dispatch_pending_publication_job()
returns trigger
language plpgsql
security definer
set search_path = public, private, net
as $function$
begin
  if new.status <> 'PENDING'
     or new.event_id is null
     or new.reason not in ('validation','edit')
     or coalesce(new.attempt_count,0) >= 3
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.requested_at is not distinct from old.requested_at
  then
    return new;
  end if;

  perform net.http_post(
    url := 'https://pwyetrqyiaxpzjrafpvb.supabase.co/functions/v1/event-publication-dispatch',
    body := jsonb_build_object('job_id', new.id),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning 'publication server dispatch failed: %', sqlerrm;
    return new;
end;
$function$;

revoke all on function private.dispatch_pending_publication_job()
from public, anon, authenticated;

drop trigger if exists event_publication_jobs_dispatch_server
on public.event_publication_jobs;

create trigger event_publication_jobs_dispatch_server
after insert or update of requested_at
on public.event_publication_jobs
for each row
execute function private.dispatch_pending_publication_job();;
