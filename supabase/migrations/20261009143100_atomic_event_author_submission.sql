begin;

-- Etend la RPC existante sans changer sa signature : les anciens clients qui
-- n'envoient pas author_presence conservent exactement le flux événement + contact.
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
  v_author_presence jsonb := p_event -> 'author_presence';
  v_author_pseudo text;
  v_author_slug text;
  v_author_profile_url text;
  v_author_portrait_url text;
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
    'registration_note', 'registration_force_status', 'author_presence'
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

  if v_author_presence is not null
    and jsonb_typeof(v_author_presence) is distinct from 'null'
  then
    if jsonb_typeof(v_author_presence) is distinct from 'object'
      or v_type is distinct from 'Dédicace'
      or v_author_presence - array[
        'pseudo', 'author_slug', 'author_identity_key', 'website',
        'author_profile_url', 'author_profile_url_type', 'publication_mode',
        'book_or_publisher_url', 'book_or_publisher_url_type',
        'publisher_name', 'author_portrait_url', 'author_portrait_storage_key'
      ] <> '{}'::jsonb
    then
      raise exception 'INVALID_AUTHOR_PRESENCE';
    end if;

    v_author_pseudo := nullif(trim(v_author_presence ->> 'pseudo'), '');
    v_author_slug := nullif(trim(v_author_presence ->> 'author_identity_key'), '');
    v_author_profile_url := nullif(trim(v_author_presence ->> 'author_profile_url'), '');
    v_author_portrait_url := nullif(trim(v_author_presence ->> 'author_portrait_url'), '');

    if char_length(coalesce(v_author_pseudo, '')) not between 2 and 120
      or nullif(trim(v_author_presence ->> 'author_slug'), '') is distinct from v_author_slug
      or (v_author_slug is not null and (
        char_length(v_author_slug) > 90
        or v_author_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      ))
      or nullif(trim(v_author_presence ->> 'website'), '') is distinct from v_author_profile_url
      or (v_author_profile_url is not null and (
        char_length(v_author_profile_url) > 500
        or v_author_profile_url !~* '^https?://[^[:space:]]+$'
      ))
      or coalesce(nullif(trim(v_author_presence ->> 'publication_mode'), ''), 'unknown') <> 'unknown'
      or nullif(trim(v_author_presence ->> 'book_or_publisher_url'), '') is not null
      or nullif(trim(v_author_presence ->> 'book_or_publisher_url_type'), '') is not null
      or nullif(trim(v_author_presence ->> 'publisher_name'), '') is not null
      or (nullif(trim(v_author_presence ->> 'author_profile_url_type'), '') is not null
        and trim(v_author_presence ->> 'author_profile_url_type') not in (
          'instagram', 'facebook', 'linktree', 'site_officiel', 'autre'
        ))
      or ((v_author_profile_url is null) <>
        (nullif(trim(v_author_presence ->> 'author_profile_url_type'), '') is null))
      or (v_author_portrait_url is not null and (
        char_length(v_author_portrait_url) > 1000
        or v_author_portrait_url !~* '^https://[^[:space:]]+$'
      ))
      or ((v_author_portrait_url is null) <>
        (nullif(trim(v_author_presence ->> 'author_portrait_storage_key'), '') is null))
      or char_length(coalesce(v_author_presence ->> 'author_portrait_storage_key', '')) > 1000
    then
      raise exception 'INVALID_AUTHOR_PRESENCE';
    end if;
  else
    v_author_presence := null;
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

  if v_author_presence is not null then
    insert into public.event_authors_presence (
      event_id, pseudo, author_slug, author_identity_key, website,
      author_profile_url, author_profile_url_type, publication_mode,
      book_or_publisher_url, book_or_publisher_url_type, publisher_name,
      author_portrait_url, author_portrait_storage_key, source,
      participant_type, presence_verified, validated, rejected
    ) values (
      v_event_id,
      v_author_pseudo,
      v_author_slug,
      v_author_slug,
      v_author_profile_url,
      v_author_profile_url,
      nullif(trim(v_author_presence ->> 'author_profile_url_type'), ''),
      'unknown',
      null,
      null,
      null,
      v_author_portrait_url,
      nullif(trim(v_author_presence ->> 'author_portrait_storage_key'), ''),
      'event_submission',
      'author',
      false,
      false,
      false
    );
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.submit_event_with_contact(jsonb, text, text) from public;
revoke all on function public.submit_event_with_contact(jsonb, text, text) from anon, authenticated;
grant execute on function public.submit_event_with_contact(jsonb, text, text) to anon, authenticated;

commit;
