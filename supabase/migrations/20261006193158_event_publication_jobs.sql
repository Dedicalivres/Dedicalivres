-- Dédicalivres
-- File de publication post-validation humaine.
--
-- Ne valide, ne rejette et ne supprime aucun événement.

create table if not exists public.event_publication_jobs (
  id uuid primary key default gen_random_uuid(),

  event_id uuid
    references public.events(id)
    on delete set null,

  reason text not null
    check (
      reason in (
        'validation',
        'edit',
        'manual'
      )
    ),

  status text not null
    default 'PENDING'
    check (
      status in (
        'PENDING',
        'RUNNING',
        'SUCCESS',
        'FAILED',
        'BLOCKED'
      )
    ),

  requested_at timestamptz
    not null
    default now(),

  requested_by uuid
    references auth.users(id)
    on delete set null,

  started_at timestamptz,
  finished_at timestamptz,

  attempt_count integer
    not null
    default 0
    check (attempt_count >= 0),

  batch_id uuid,

  commit_sha text,

  last_error text
);

comment on table public.event_publication_jobs is
  'File technique de publication statique. '
  'La décision events.validated reste humaine.';

alter table public.event_publication_jobs
  enable row level security;

drop policy if exists
  "Admins can read event publication jobs"
  on public.event_publication_jobs;

create policy
  "Admins can read event publication jobs"
  on public.event_publication_jobs
  for select
  to authenticated
  using (
    private.is_admin()
  );

revoke all
  on public.event_publication_jobs
  from anon;

revoke insert, update, delete
  on public.event_publication_jobs
  from authenticated;

grant select
  on public.event_publication_jobs
  to authenticated;

grant all
  on public.event_publication_jobs
  to service_role;

create index if not exists
  event_publication_jobs_status_requested_idx
  on public.event_publication_jobs (
    status,
    requested_at
  );

create index if not exists
  event_publication_jobs_event_idx
  on public.event_publication_jobs (
    event_id,
    requested_at desc
  );

create unique index if not exists
  event_publication_jobs_one_pending_per_event_idx
  on public.event_publication_jobs (
    event_id
  )
  where
    event_id is not null
    and status = 'PENDING';

create or replace function
  private.queue_event_publication_job()
returns trigger
language plpgsql
security definer
set search_path = public, private, auth
as $function$
declare
  old_is_public boolean := false;
  new_is_public boolean := false;
  job_reason text := null;
begin
  new_is_public :=
    coalesce(
      new.validated,
      false
    )
    and not coalesce(
      new.rejected,
      false
    );

  if tg_op = 'UPDATE' then
    old_is_public :=
      coalesce(
        old.validated,
        false
      )
      and not coalesce(
        old.rejected,
        false
      );
  end if;

  if not new_is_public then
    return new;
  end if;

  if
    tg_op = 'INSERT'
    or not old_is_public
  then
    job_reason := 'validation';

  elsif (
    new.title,
    new.type,
    new.country_code,
    new.region,
    new.city,
    new.start_date,
    new.end_date,
    new.description,
    new.image_url,
    new.website,
    new.price,
    new.lat,
    new.lng,
    new.featured,
    new.verified,
    new.registration_enabled,
    new.registration_open_date,
    new.registration_deadline,
    new.registration_url,
    new.registration_audience,
    new.registration_note,
    new.registration_force_status
  )
  is distinct from
  (
    old.title,
    old.type,
    old.country_code,
    old.region,
    old.city,
    old.start_date,
    old.end_date,
    old.description,
    old.image_url,
    old.website,
    old.price,
    old.lat,
    old.lng,
    old.featured,
    old.verified,
    old.registration_enabled,
    old.registration_open_date,
    old.registration_deadline,
    old.registration_url,
    old.registration_audience,
    old.registration_note,
    old.registration_force_status
  )
  then
    job_reason := 'edit';
  end if;

  if job_reason is null then
    return new;
  end if;

  insert into public.event_publication_jobs (
    event_id,
    reason,
    status,
    requested_at,
    requested_by
  )
  values (
    new.id,
    job_reason,
    'PENDING',
    now(),
    auth.uid()
  )
  on conflict (event_id)
    where
      event_id is not null
      and status = 'PENDING'
  do update
    set
      reason =
        excluded.reason,
      requested_at =
        excluded.requested_at,
      requested_by =
        coalesce(
          excluded.requested_by,
          public.event_publication_jobs.requested_by
        ),
      last_error =
        null;

  return new;
end;
$function$;

revoke all
  on function private.queue_event_publication_job()
  from public;

drop trigger if exists
  events_queue_static_publication
  on public.events;

create trigger
  events_queue_static_publication
after insert or update
on public.events
for each row
execute function
  private.queue_event_publication_job();;
