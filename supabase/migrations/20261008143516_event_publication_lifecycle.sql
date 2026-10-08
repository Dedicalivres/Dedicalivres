-- Dédicalivres
-- Cycle complet publication / dépublication d'un événement.
--
-- La validation, le rejet et la suppression restent des décisions humaines.
-- Cette migration ne modifie aucun événement existant.
--
-- Le serveur ne fait qu'ajouter un job technique après la décision humaine.

alter table public.event_publication_jobs
  add column if not exists target_event_id uuid;


alter table public.event_publication_jobs
  add column if not exists dispatch_token uuid;


comment on column
  public.event_publication_jobs.target_event_id
is
  'Identifiant immuable de l événement concerné, conservé même après DELETE de events.';


comment on column
  public.event_publication_jobs.dispatch_token
is
  'Jeton serveur aléatoire par job pour authentifier le réveil Edge Function.';


update public.event_publication_jobs
set target_event_id = event_id
where
  target_event_id is null
  and event_id is not null;


update public.event_publication_jobs
set dispatch_token = gen_random_uuid()
where
  dispatch_token is null
  and status = 'PENDING'
  and target_event_id is not null;


create index if not exists
  event_publication_jobs_target_event_idx
on public.event_publication_jobs (
  target_event_id,
  requested_at desc
);


alter table public.event_publication_jobs
  drop constraint if exists
    event_publication_jobs_reason_check;


alter table public.event_publication_jobs
  add constraint
    event_publication_jobs_reason_check
  check (
    reason in (
      'validation',
      'edit',
      'unpublish',
      'delete',
      'manual'
    )
  );


create or replace function
  private.queue_event_publication_job()

returns trigger

language plpgsql

security definer

set search_path =
  public,
  private,
  auth

as $function$

declare
  old_is_public boolean :=
    false;

  new_is_public boolean :=
    false;

  job_reason text :=
    null;

  target_id uuid :=
    null;

  live_event_id uuid :=
    null;

begin

  if tg_op = 'DELETE'
  then

    target_id :=
      old.id;

    live_event_id :=
      null;

    job_reason :=
      'delete';

  else

    target_id :=
      new.id;

    live_event_id :=
      new.id;


    new_is_public :=
      coalesce(
        new.validated,
        false
      )
      and not coalesce(
        new.rejected,
        false
      );


    if tg_op = 'INSERT'
    then

      if new_is_public
      then
        job_reason :=
          'validation';

      else
        return new;
      end if;


    else

      old_is_public :=
        coalesce(
          old.validated,
          false
        )
        and not coalesce(
          old.rejected,
          false
        );


      if
        old_is_public
        and not new_is_public

      then

        job_reason :=
          'unpublish';


      elsif
        new_is_public
        and not old_is_public

      then

        job_reason :=
          'validation';


      elsif
        new_is_public
        and (
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

        job_reason :=
          'edit';

      else

        return new;

      end if;

    end if;

  end if;


  insert into
    public.event_publication_jobs (
      event_id,
      target_event_id,
      dispatch_token,
      reason,
      status,
      requested_at,
      requested_by
    )

  values (
    live_event_id,
    target_id,
    gen_random_uuid(),
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
      target_event_id =
        excluded.target_event_id,

      dispatch_token =
        excluded.dispatch_token,

      dispatch_requested_at =
        null,

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


  if tg_op = 'DELETE'
  then
    return old;
  end if;


  return new;

end;

$function$;


revoke all
  on function
    private.queue_event_publication_job()
  from public;


drop trigger if exists
  events_queue_static_publication
on public.events;


create trigger
  events_queue_static_publication

after insert
or update
or delete

on public.events

for each row

execute function
  private.queue_event_publication_job();


create or replace function
  public.claim_event_publication_dispatch(
    p_job_id uuid
  )

returns table (
  event_id uuid,
  reason text
)

language sql

volatile

security definer

set search_path = public

as $function$

  update
    public.event_publication_jobs as job

  set
    dispatch_requested_at =
      now()

  where
    job.id =
      p_job_id

    and job.status =
      'PENDING'

    and job.target_event_id
      is not null

    and job.reason in (
      'validation',
      'edit',
      'unpublish',
      'delete'
    )

    and coalesce(
      job.attempt_count,
      0
    ) < 3

    and job.dispatch_requested_at
      is null

  returning
    coalesce(
      job.event_id,
      job.target_event_id
    ) as event_id,

    job.reason;

$function$;


revoke all
  on function
    public.claim_event_publication_dispatch(uuid)
  from public, anon, authenticated;


grant execute
  on function
    public.claim_event_publication_dispatch(uuid)
  to service_role;


create or replace function
  public.claim_event_publication_dispatch(
    p_job_id uuid,
    p_dispatch_token uuid
  )

returns table (
  event_id uuid,
  reason text
)

language sql

volatile

security definer

set search_path = public

as $function$

  update
    public.event_publication_jobs as job

  set
    dispatch_requested_at =
      now(),

    dispatch_token =
      null

  where
    job.id =
      p_job_id

    and job.dispatch_token =
      p_dispatch_token

    and job.status =
      'PENDING'

    and (
      (
        job.target_event_id
          is not null

        and job.reason in (
          'validation',
          'edit',
          'unpublish',
          'delete'
        )
      )

      or (
        job.reason = 'manual'

        and job.event_id
          is null

        and job.target_event_id
          is null
      )
    )

    and coalesce(
      job.attempt_count,
      0
    ) < 3

    and job.dispatch_requested_at
      is null

  returning
    coalesce(
      job.event_id,
      job.target_event_id
    ) as event_id,

    job.reason;

$function$;


revoke all
  on function
    public.claim_event_publication_dispatch(uuid, uuid)
  from public, anon, authenticated;


grant execute
  on function
    public.claim_event_publication_dispatch(uuid, uuid)
  to service_role;


create or replace function
  private.dispatch_pending_publication_job()

returns trigger

language plpgsql

security definer

set search_path =
  public,
  private,
  net

as $function$

begin

  if
    new.status <> 'PENDING'

    or new.dispatch_token
      is null

    or not (
      (
        new.target_event_id
          is not null

        and new.reason in (
          'validation',
          'edit',
          'unpublish',
          'delete'
        )
      )

      or (
        new.reason = 'manual'

        and new.event_id
          is null

        and new.target_event_id
          is null
      )
    )

    or coalesce(
      new.attempt_count,
      0
    ) >= 3

  then
    return new;
  end if;


  if
    tg_op = 'UPDATE'

    and new.requested_at
      is not distinct from
      old.requested_at

  then
    return new;
  end if;


  perform
    net.http_post(
      url :=
        'https://pwyetrqyiaxpzjrafpvb.supabase.co/functions/v1/event-publication-dispatch',

      body :=
        jsonb_build_object(
          'job_id',
          new.id,

          'dispatch_token',
          new.dispatch_token
        ),

      headers :=
        jsonb_build_object(
          'Content-Type',
          'application/json'
        ),

      timeout_milliseconds :=
        5000
    );


  return new;


exception
  when others then

    raise warning
      'publication server dispatch failed: %',
      sqlerrm;

    return new;

end;

$function$;


revoke all
  on function
    private.dispatch_pending_publication_job()
  from public, anon, authenticated;
