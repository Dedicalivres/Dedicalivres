alter table public.events
  add column if not exists country_code text;

update public.events
set country_code = 'FR'
where country_code is null or btrim(country_code) = '';

alter table public.events
  alter column country_code set default 'FR',
  alter column country_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_country_code_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_country_code_check
      check (country_code in ('FR', 'BE', 'LU', 'CH', 'MC'));
  end if;
end
$$;

comment on column public.events.country_code is
  'Pays de l’événement : FR, BE, LU, CH ou MC. La colonne region conserve la subdivision locale.';

create index if not exists events_country_region_start_idx
  on public.events (country_code, region, start_date)
  where rejected = false;

alter table public.newsletter_subscribers
  add column if not exists country_code text;

update public.newsletter_subscribers
set country_code = 'FR'
where country_code is null or btrim(country_code) = '';

alter table public.newsletter_subscribers
  alter column country_code set default 'FR',
  alter column country_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_subscribers_country_code_check'
      and conrelid = 'public.newsletter_subscribers'::regclass
  ) then
    alter table public.newsletter_subscribers
      add constraint newsletter_subscribers_country_code_check
      check (country_code in ('FR', 'BE', 'LU', 'CH', 'MC'));
  end if;
end
$$;

comment on column public.newsletter_subscribers.country_code is
  'Pays associé au territoire suivi par l’abonné.';

alter table public.location_tracking
  add column if not exists country_code text;

update public.location_tracking
set country_code = 'FR'
where country_code is null or btrim(country_code) = '';

alter table public.location_tracking
  alter column country_code set default 'FR';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'location_tracking_country_code_check'
      and conrelid = 'public.location_tracking'::regclass
  ) then
    alter table public.location_tracking
      add constraint location_tracking_country_code_check
      check (
        country_code is null
        or country_code in ('FR', 'BE', 'LU', 'CH', 'MC')
      );
  end if;
end
$$;

comment on column public.location_tracking.country_code is
  'Pays approximatif issu de la géolocalisation volontaire du visiteur.';

create index if not exists location_tracking_country_created_idx
  on public.location_tracking (country_code, created_at desc);;
