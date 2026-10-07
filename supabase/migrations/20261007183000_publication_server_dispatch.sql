-- Dédicalivres
-- Déclenchement serveur de la publication statique.
--
-- La validation/rejet restent des décisions humaines.
-- Ce trigger ne modifie aucun événement.
-- Il ne fait que réveiller le worker GitHub lorsqu'un job PENDING existe.

create extension if not exists pg_net;


create table if not exists private.publication_dispatch_config (
  singleton boolean primary key
    default true
    check (singleton = true),

  dispatch_secret text not null,

  created_at timestamptz
    not null
    default now()
);


revoke all
  on private.publication_dispatch_config
  from public, anon, authenticated;


insert into private.publication_dispatch_config (
  singleton,
  dispatch_secret
)

values (
  true,

  replace(
    gen_random_uuid()::text,
    '-',
    ''
  )
  ||
  replace(
    gen_random_uuid()::text,
    '-',
    ''
  )
)

on conflict (singleton)
do nothing;


create or replace function
  private.verify_publication_dispatch_secret(
    candidate text
  )

returns boolean

language sql

stable

security definer

set search_path = private

as $function$

  select
    candidate is not null
    and candidate <> ''
    and exists (
      select 1

      from private.publication_dispatch_config

      where
        singleton = true

        and dispatch_secret =
          candidate
    );

$function$;


revoke all
  on function
    private.verify_publication_dispatch_secret(text)
  from public, anon, authenticated;


grant execute
  on function
    private.verify_publication_dispatch_secret(text)
  to service_role;


create or replace function
  private.dispatch_pending_publication_job()

returns trigger

language plpgsql

security definer

set search_path = public, private, net

as $function$

declare
  v_secret text;

begin

  if
    new.status <> 'PENDING'
    or new.event_id is null
    or new.reason not in (
      'validation',
      'edit'
    )
    or coalesce(
      new.attempt_count,
      0
    ) >= 3

  then
    return new;
  end if;


  -- En UPDATE, un job n'est redéclenché que si
  -- queue_event_publication_job() a rafraîchi requested_at.
  if
    tg_op = 'UPDATE'
    and new.requested_at
        is not distinct from
        old.requested_at

  then
    return new;
  end if;


  select dispatch_secret

  into v_secret

  from private.publication_dispatch_config

  where singleton = true;


  if
    v_secret is null
    or v_secret = ''

  then
    raise warning
      'publication dispatch secret missing';

    return new;
  end if;


  perform net.http_post(
    url :=
      'https://pwyetrqyiaxpzjrafpvb.supabase.co/functions/v1/event-publication-dispatch',

    body :=
      jsonb_build_object(
        'job_id',
        new.id,

        'dispatch_secret',
        v_secret,

        'source',
        'database'
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

    -- Le job reste PENDING :
    -- le cron GitHub reste le filet de secours.
    raise warning
      'publication dispatch enqueue failed: %',
      sqlerrm;

    return new;

end;

$function$;


revoke all
  on function
    private.dispatch_pending_publication_job()
  from public, anon, authenticated;


drop trigger if exists
  event_publication_jobs_dispatch_server
  on public.event_publication_jobs;


create trigger
  event_publication_jobs_dispatch_server

after insert
or update of requested_at

on public.event_publication_jobs

for each row

execute function
  private.dispatch_pending_publication_job();
