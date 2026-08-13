-- V1 enrichie auteur : inscriptions organisateurs et présences qualifiées.
-- Migration additive uniquement. Elle n'est appliquée automatiquement à aucun projet.

alter table public.events
  add column if not exists registration_enabled boolean not null default false,
  add column if not exists registration_open_date date,
  add column if not exists registration_deadline date,
  add column if not exists registration_url text,
  add column if not exists registration_audience text[] not null default '{}'::text[],
  add column if not exists registration_note text,
  add column if not exists registration_force_status text;

comment on column public.events.registration_audience is
  'Publics acceptés pour les inscriptions : author, artist_author, hybrid, publisher.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_type_check'
  ) then
    alter table public.events add constraint events_registration_type_check
      check (not registration_enabled or type in ('Salon', 'Festival'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_dates_check'
  ) then
    alter table public.events add constraint events_registration_dates_check
      check (
        registration_open_date is null
        or registration_deadline is null
        or registration_open_date <= registration_deadline
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_audience_check'
  ) then
    alter table public.events add constraint events_registration_audience_check
      check (
        coalesce(registration_audience, '{}'::text[])
          <@ array['author', 'artist_author', 'hybrid', 'publisher']::text[]
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_force_status_check'
  ) then
    alter table public.events add constraint events_registration_force_status_check
      check (
        registration_force_status is null
        or registration_force_status in ('complet', 'cloture', 'annule')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_url_check'
  ) then
    alter table public.events add constraint events_registration_url_check
      check (
        registration_url is null
        or registration_url ~* '^https?://[^[:space:]]+$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_registration_text_lengths_check'
  ) then
    alter table public.events add constraint events_registration_text_lengths_check
      check (
        length(coalesce(registration_note, '')) <= 1000
        and length(coalesce(registration_url, '')) <= 500
      );
  end if;
end
$$;

alter table public.event_authors_presence
  add column if not exists participant_type text not null default 'author',
  add column if not exists organization_name text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists presence_verified boolean not null default false;

comment on column public.event_authors_presence.participant_type is
  'Nature de la présence. Indépendante de publication_mode, qui reste la situation éditoriale d’un auteur.';
comment on column public.event_authors_presence.contact_name is
  'Contact privé de modération, jamais exposé au rôle anon.';
comment on column public.event_authors_presence.contact_email is
  'Contact privé de modération, jamais exposé au rôle anon.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.event_authors_presence'::regclass
      and conname = 'event_presence_participant_type_check'
  ) then
    alter table public.event_authors_presence
      add constraint event_presence_participant_type_check
      check (participant_type in ('author', 'artist_author', 'hybrid', 'publisher'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.event_authors_presence'::regclass
      and conname = 'event_presence_publisher_organization_check'
  ) then
    alter table public.event_authors_presence
      add constraint event_presence_publisher_organization_check
      check (
        participant_type <> 'publisher'
        or (
          length(trim(coalesce(organization_name, ''))) between 2 and 160
          and length(trim(coalesce(author_profile_url, website, ''))) between 8 and 500
          and coalesce(author_profile_url, website) ~* '^https?://[^[:space:]]+$'
          and length(trim(coalesce(contact_name, ''))) between 2 and 160
          and length(trim(coalesce(contact_email, ''))) between 5 and 254
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.event_authors_presence'::regclass
      and conname = 'event_presence_contact_check'
  ) then
    alter table public.event_authors_presence
      add constraint event_presence_contact_check
      check (
        length(coalesce(contact_name, '')) <= 160
        and length(coalesce(contact_email, '')) <= 254
        and (
          contact_email is null
          or contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.event_authors_presence'::regclass
      and conname = 'event_presence_identity_separation_check'
  ) then
    alter table public.event_authors_presence
      add constraint event_presence_identity_separation_check
      check (
        (
          participant_type = 'publisher'
          and author_id is null
          and author_slug is null
          and author_identity_key is null
          and author_portrait_url is null
          and author_portrait_storage_key is null
          and book_or_publisher_url is null
          and book_or_publisher_url_type is null
          and publisher_name is null
          and coalesce(publication_mode, 'unknown') = 'unknown'
        )
        or (
          participant_type <> 'publisher'
          and organization_name is null
          and contact_name is null
          and contact_email is null
        )
      );
  end if;
end
$$;

-- Les politiques existantes restent en place et sont seulement renforcées.
alter policy "Public can submit pending events"
on public.events
with check (
  nullif(trim(title), '') is not null
  and nullif(trim(city), '') is not null
  and start_date is not null
  and lat between -90 and 90
  and lng between -180 and 180
  and coalesce(validated, false) = false
  and coalesce(rejected, false) = false
  and coalesce(featured, false) = false
  and coalesce(verified, false) = false
  and admin_note is null
  and source_label is null
  and imported_source is null
  and last_checked_at is null
  and (not registration_enabled or type in ('Salon', 'Festival'))
);

alter policy "Public can submit pending author presences"
on public.event_authors_presence
with check (
  event_id is not null
  and nullif(trim(pseudo), '') is not null
  and length(trim(pseudo)) between 2 and 160
  and coalesce(validated, false) = false
  and coalesce(rejected, false) = false
  and coalesce(presence_verified, false) = false
  and admin_note is null
  and author_id is null
  and participant_type in ('author', 'artist_author', 'hybrid', 'publisher')
  and (
    participant_type <> 'publisher'
    or (
      length(trim(coalesce(organization_name, ''))) between 2 and 160
      and length(trim(coalesce(author_profile_url, website, ''))) between 8 and 500
      and length(trim(coalesce(contact_name, ''))) between 2 and 160
      and length(trim(coalesce(contact_email, ''))) between 5 and 254
      and author_slug is null
      and author_identity_key is null
      and author_portrait_url is null
      and author_portrait_storage_key is null
      and book_or_publisher_url is null
      and book_or_publisher_url_type is null
      and publisher_name is null
      and coalesce(publication_mode, 'unknown') = 'unknown'
    )
  )
  and (
    participant_type = 'publisher'
    or (
      organization_name is null
      and contact_name is null
      and contact_email is null
    )
  )
);

-- Privilèges publics minimaux. RLS continue de filtrer les lignes.
revoke all on table public.events from anon;
grant select on table public.events to anon;
grant insert (
  id, title, type, country_code, region, city, price, start_date, end_date,
  website, description, lat, lng, image_url, validated, featured, rejected,
  verified, registration_enabled, registration_open_date,
  registration_deadline, registration_url, registration_audience,
  registration_note, registration_force_status
) on public.events to anon;

revoke all on table public.event_authors_presence from anon;
grant select (
  id, event_id, pseudo, website, validated, created_at, author_id, author_slug,
  source, updated_at, publication_mode, author_profile_url,
  author_profile_url_type, book_or_publisher_url, book_or_publisher_url_type,
  publisher_name, rejected, author_portrait_url, author_identity_key,
  participant_type, organization_name, presence_verified
) on public.event_authors_presence to anon;
grant insert (
  event_id, pseudo, website, validated, author_slug, publication_mode,
  author_profile_url, author_profile_url_type, book_or_publisher_url,
  book_or_publisher_url_type, publisher_name, rejected, author_portrait_url,
  author_portrait_storage_key, author_identity_key, participant_type,
  organization_name, contact_name, contact_email, presence_verified
) on public.event_authors_presence to anon;
