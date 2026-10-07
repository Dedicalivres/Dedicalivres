begin;

create table public.event_submission_contacts (
  event_id uuid primary key references public.events(id) on delete cascade,
  submitter_name text,
  submitter_email text not null,
  created_at timestamptz not null default now(),
  constraint event_submission_contacts_name_check
    check (
      submitter_name is null
      or char_length(trim(submitter_name)) between 1 and 160
    ),
  constraint event_submission_contacts_email_check
    check (
      char_length(trim(submitter_email)) between 5 and 254
      and submitter_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
);

comment on table public.event_submission_contacts is
  'Coordonnées privées associées aux propositions publiques d’événements.';

alter table public.event_submission_contacts enable row level security;

revoke all on public.event_submission_contacts from anon, authenticated;
grant select on public.event_submission_contacts to authenticated;

create policy "Admins can read event submission contacts"
on public.event_submission_contacts
for select
to authenticated
using ((select private.is_admin()));

create or replace function public.submit_event_with_contact(
  p_event jsonb,
  p_submitter_name text,
  p_submitter_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_type text;
  v_registration_enabled boolean;
  v_submitter_name text := nullif(trim(p_submitter_name), '');
  v_submitter_email text := lower(trim(coalesce(p_submitter_email, '')));
begin
  if jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'INVALID_EVENT_PAYLOAD';
  end if;

  if p_event - array[
    'id', 'title', 'type', 'country_code', 'region', 'city', 'price',
    'start_date', 'end_date', 'website', 'description', 'lat', 'lng',
    'image_url', 'validated', 'featured', 'rejected', 'verified',
    'registration_enabled', 'registration_open_date',
    'registration_deadline', 'registration_url', 'registration_audience',
    'registration_note', 'registration_force_status'
  ] <> '{}'::jsonb then
    raise exception 'UNEXPECTED_EVENT_FIELD';
  end if;

  if v_submitter_name is not null and char_length(v_submitter_name) > 160 then
    raise exception 'INVALID_SUBMITTER_NAME';
  end if;

  if char_length(v_submitter_email) not between 5 and 254
    or v_submitter_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'INVALID_SUBMITTER_EMAIL';
  end if;

  v_event_id := (p_event ->> 'id')::uuid;
  v_type := nullif(trim(p_event ->> 'type'), '');
  v_registration_enabled := coalesce((p_event ->> 'registration_enabled')::boolean, false);

  if nullif(trim(p_event ->> 'title'), '') is null
    or nullif(trim(p_event ->> 'city'), '') is null
    or nullif(p_event ->> 'start_date', '') is null
    or nullif(p_event ->> 'lat', '') is null
    or nullif(p_event ->> 'lng', '') is null
    or (p_event ->> 'lat')::double precision not between -90 and 90
    or (p_event ->> 'lng')::double precision not between -180 and 180
    or coalesce((p_event ->> 'validated')::boolean, false) <> false
    or coalesce((p_event ->> 'rejected')::boolean, false) <> false
    or coalesce((p_event ->> 'featured')::boolean, false) <> false
    or coalesce((p_event ->> 'verified')::boolean, false) <> false
    or (v_registration_enabled and v_type not in ('Salon', 'Festival'))
  then
    raise exception 'INVALID_EVENT_SUBMISSION';
  end if;

  insert into public.events (
    id, title, type, country_code, region, city, price,
    start_date, end_date, website, description, lat, lng, image_url,
    validated, featured, rejected, verified,
    registration_enabled, registration_open_date,
    registration_deadline, registration_url, registration_audience,
    registration_note, registration_force_status
  ) values (
    v_event_id,
    trim(p_event ->> 'title'),
    v_type,
    coalesce(nullif(trim(p_event ->> 'country_code'), ''), 'FR'),
    nullif(trim(p_event ->> 'region'), ''),
    trim(p_event ->> 'city'),
    nullif(trim(p_event ->> 'price'), ''),
    (p_event ->> 'start_date')::date,
    nullif(p_event ->> 'end_date', '')::date,
    nullif(trim(p_event ->> 'website'), ''),
    nullif(trim(p_event ->> 'description'), ''),
    (p_event ->> 'lat')::double precision,
    (p_event ->> 'lng')::double precision,
    nullif(trim(p_event ->> 'image_url'), ''),
    false, false, false, false,
    v_registration_enabled,
    nullif(p_event ->> 'registration_open_date', '')::date,
    nullif(p_event ->> 'registration_deadline', '')::date,
    nullif(trim(p_event ->> 'registration_url'), ''),
    case
      when jsonb_typeof(p_event -> 'registration_audience') = 'array'
      then array(select jsonb_array_elements_text(p_event -> 'registration_audience'))
      else '{}'::text[]
    end,
    nullif(trim(p_event ->> 'registration_note'), ''),
    nullif(trim(p_event ->> 'registration_force_status'), '')
  );

  insert into public.event_submission_contacts (
    event_id,
    submitter_name,
    submitter_email
  ) values (
    v_event_id,
    v_submitter_name,
    v_submitter_email
  );

  return v_event_id;
end;
$$;

revoke all on function public.submit_event_with_contact(jsonb, text, text) from public;
grant execute on function public.submit_event_with_contact(jsonb, text, text) to anon, authenticated;

commit;
;
