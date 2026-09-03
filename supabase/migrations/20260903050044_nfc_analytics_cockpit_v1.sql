begin;

create table public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique check (public_token ~ '^[A-Z0-9]{8,24}$'),
  label text not null check (char_length(label) between 1 and 120),
  support_type text not null check (support_type in ('sticker','card','poster','book','badge','other')),
  campaign_key text check (campaign_key is null or char_length(campaign_key) <= 80),
  event_id uuid references public.events(id) on delete set null,
  partner_key text check (partner_key is null or char_length(partner_key) <= 80),
  context_location text check (context_location is null or char_length(context_location) <= 120),
  cta_variant text not null default 'general' check (cta_variant in ('general','agenda','favorites','organizer')),
  lifecycle_status text not null default 'TO_PROGRAM' check (lifecycle_status in ('TO_PROGRAM','PROGRAMMED','TESTED','INSTALLED','MOVED','INACTIVE','LOST')),
  active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete restrict,
  check (active is false or lifecycle_status in ('TESTED','INSTALLED','MOVED'))
);

create table public.nfc_sessions (
  id uuid primary key,
  tag_id uuid not null references public.nfc_tags(id) on delete restrict,
  opened_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  page_version text not null default 'passage-v2',
  support_type_snapshot text not null,
  campaign_key_snapshot text,
  event_id_snapshot uuid,
  partner_key_snapshot text,
  context_location_snapshot text,
  intent_id text check (intent_id is null or intent_id in ('nearby','favorites','organizer','discover')),
  device_class text check (device_class is null or device_class in ('mobile','tablet','desktop','unknown')),
  entered_site boolean not null default false,
  activated boolean not null default false
);

create table public.nfc_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.nfc_sessions(id) on delete cascade,
  tag_id uuid not null references public.nfc_tags(id) on delete restrict,
  event_name text not null check (event_name in ('nfc_open','nfc_scene_view','nfc_progress','nfc_intent_select','nfc_cta_impression','nfc_cta_click','nfc_enter_site','nfc_site_arrival','nfc_activation','nfc_error')),
  event_key text not null check (char_length(event_key) between 1 and 80),
  scene_id text check (scene_id is null or scene_id in ('door','encounter','mission','intent','exit')),
  intent_id text check (intent_id is null or intent_id in ('nearby','favorites','organizer','discover')),
  progress_bucket smallint check (progress_bucket is null or progress_bucket in (25,50,75,100)),
  activation_type text check (activation_type is null or activation_type in ('favorite_added','nearby_used','event_opened','submission_started','author_presence_started')),
  created_at timestamptz not null default now(),
  unique (session_id, event_name, event_key)
);

create index nfc_sessions_tag_opened_idx on public.nfc_sessions(tag_id, opened_at desc);
create index nfc_events_tag_created_idx on public.nfc_events(tag_id, created_at desc);
create index nfc_events_name_created_idx on public.nfc_events(event_name, created_at desc);

alter table public.nfc_tags enable row level security;
alter table public.nfc_sessions enable row level security;
alter table public.nfc_events enable row level security;

revoke all on public.nfc_tags, public.nfc_sessions, public.nfc_events from anon, authenticated;
grant select, insert, update on public.nfc_tags to authenticated;
grant select on public.nfc_sessions, public.nfc_events to authenticated;

create policy nfc_tags_admin_all on public.nfc_tags for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy nfc_sessions_admin_read on public.nfc_sessions for select to authenticated
using ((select private.is_admin()));
create policy nfc_events_admin_read on public.nfc_events for select to authenticated
using ((select private.is_admin()));

create or replace function private.nfc_public_context(p_token text)
returns table(label text, support_type text, campaign_key text, event_id uuid, partner_key text, context_location text, cta_variant text)
language sql stable security definer set search_path = ''
as $$
  select t.label, t.support_type, t.campaign_key, t.event_id, t.partner_key,
         t.context_location, t.cta_variant
  from public.nfc_tags t
  where t.public_token = upper(trim(p_token)) and t.active is true
  limit 1
$$;

create or replace function public.nfc_resolve_tag(p_token text)
returns table(label text, support_type text, campaign_key text, event_id uuid, partner_key text, context_location text, cta_variant text)
language sql stable security invoker set search_path = ''
as $$ select * from private.nfc_public_context(p_token) $$;

create or replace function private.nfc_record_event(
  p_token text, p_session_id uuid, p_event_name text, p_event_key text,
  p_scene_id text default null, p_intent_id text default null,
  p_progress_bucket smallint default null, p_activation_type text default null,
  p_device_class text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_tag public.nfc_tags%rowtype;
begin
  if p_session_id is null or p_event_name not in ('nfc_open','nfc_scene_view','nfc_progress','nfc_intent_select','nfc_cta_impression','nfc_cta_click','nfc_enter_site','nfc_site_arrival','nfc_activation','nfc_error')
     or p_event_key !~ '^[a-z0-9:_-]{1,80}$' then return false; end if;
  select * into v_tag from public.nfc_tags where public_token = upper(trim(p_token)) and active is true;
  if not found then return false; end if;
  insert into public.nfc_sessions(id, tag_id, support_type_snapshot, campaign_key_snapshot, event_id_snapshot, partner_key_snapshot, context_location_snapshot, device_class)
  values (p_session_id, v_tag.id, v_tag.support_type, v_tag.campaign_key, v_tag.event_id, v_tag.partner_key, v_tag.context_location,
          case when p_device_class in ('mobile','tablet','desktop','unknown') then p_device_class else 'unknown' end)
  on conflict (id) do nothing;
  if not exists (select 1 from public.nfc_sessions where id = p_session_id and tag_id = v_tag.id) then return false; end if;
  if (select count(*) from public.nfc_events where session_id = p_session_id) >= 80 then return false; end if;
  if (select count(*) from public.nfc_events where tag_id = v_tag.id and created_at >= now() - interval '1 minute') >= 300 then return false; end if;
  insert into public.nfc_events(session_id, tag_id, event_name, event_key, scene_id, intent_id, progress_bucket, activation_type)
  values (p_session_id, v_tag.id, p_event_name, p_event_key,
    case when p_scene_id in ('door','encounter','mission','intent','exit') then p_scene_id end,
    case when p_intent_id in ('nearby','favorites','organizer','discover') then p_intent_id end,
    case when p_progress_bucket in (25,50,75,100) then p_progress_bucket end,
    case when p_activation_type in ('favorite_added','nearby_used','event_opened','submission_started','author_presence_started') then p_activation_type end)
  on conflict (session_id, event_name, event_key) do nothing;
  update public.nfc_sessions set last_event_at = now(),
    intent_id = coalesce(case when p_intent_id in ('nearby','favorites','organizer','discover') then p_intent_id end, intent_id),
    entered_site = entered_site or p_event_name in ('nfc_enter_site','nfc_site_arrival'),
    activated = activated or p_event_name = 'nfc_activation'
  where id = p_session_id;
  return true;
end $$;

create or replace function public.nfc_track_event(
  p_token text, p_session_id uuid, p_event_name text, p_event_key text,
  p_scene_id text default null, p_intent_id text default null,
  p_progress_bucket smallint default null, p_activation_type text default null,
  p_device_class text default null
) returns boolean language sql security invoker set search_path = ''
as $$ select private.nfc_record_event(p_token,p_session_id,p_event_name,p_event_key,p_scene_id,p_intent_id,p_progress_bucket,p_activation_type,p_device_class) $$;

revoke all on function private.nfc_public_context(text) from public;
revoke all on function private.nfc_record_event(text,uuid,text,text,text,text,smallint,text,text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.nfc_public_context(text) to anon, authenticated;
grant execute on function private.nfc_record_event(text,uuid,text,text,text,text,smallint,text,text) to anon, authenticated;
revoke execute on function public.nfc_resolve_tag(text) from public;
revoke execute on function public.nfc_track_event(text,uuid,text,text,text,text,smallint,text,text) from public;
grant execute on function public.nfc_resolve_tag(text) to anon, authenticated;
grant execute on function public.nfc_track_event(text,uuid,text,text,text,text,smallint,text,text) to anon, authenticated;

comment on table public.nfc_events is 'Événements NFC minimisés sans télémétrie personnelle ou localisation précise.';
commit;
