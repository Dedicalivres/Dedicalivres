begin;

alter table public.event_authors_presence
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.testimonials
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.event_authors_presence
  drop constraint if exists event_authors_presence_archive_state_check;

alter table public.event_authors_presence
  add constraint event_authors_presence_archive_state_check
  check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or
    (
      archived_at is not null
      and archived_by is not null
      and char_length(trim(archive_reason)) between 3 and 500
    )
  );

alter table public.testimonials
  drop constraint if exists testimonials_archive_state_check;

alter table public.testimonials
  add constraint testimonials_archive_state_check
  check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or
    (
      archived_at is not null
      and archived_by is not null
      and char_length(trim(archive_reason)) between 3 and 500
    )
  );

create index if not exists event_authors_presence_active_idx
  on public.event_authors_presence (created_at desc)
  where archived_at is null;

create index if not exists testimonials_active_idx
  on public.testimonials (created_at desc)
  where archived_at is null;

drop policy if exists "Public can read validated author presences"
  on public.event_authors_presence;

create policy "Public can read validated author presences"
  on public.event_authors_presence
  for select
  to anon
  using (
    validated = true
    and coalesce(rejected, false) = false
    and archived_at is null
  );

drop policy if exists "Public can submit pending author presences"
  on public.event_authors_presence;

create policy "Public can submit pending author presences"
  on public.event_authors_presence
  for insert
  to anon
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
    and archived_at is null
    and archived_by is null
    and archive_reason is null
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

drop policy if exists "Public can read validated testimonials"
  on public.testimonials;

create policy "Public can read validated testimonials"
  on public.testimonials
  for select
  to anon
  using (
    validated = true
    and rejected = false
    and archived_at is null
  );

drop policy if exists "Public can insert pending testimonials"
  on public.testimonials;

create policy "Public can insert pending testimonials"
  on public.testimonials
  for insert
  to anon
  with check (
    nullif(trim(pseudo), '') is not null
    and nullif(trim(message), '') is not null
    and length(trim(message)) >= 20
    and coalesce(validated, false) = false
    and coalesce(rejected, false) = false
    and archived_at is null
    and archived_by is null
    and archive_reason is null
  );

create or replace function public.archive_community_item(
  p_kind text,
  p_id uuid,
  p_reason text
)
returns table (
  archived_kind text,
  archived_id uuid,
  archived_at timestamptz
)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_archived_at timestamptz := now();
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;

  if p_id is null then
    raise exception 'community_item_id_required';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'archive_reason_invalid';
  end if;

  if v_kind = 'presence' then
    perform 1
    from public.event_authors_presence
    where id = p_id
    for update;

    if not found then
      raise exception 'community_item_not_found';
    end if;

    update public.event_authors_presence as presence
    set
      archived_at = v_archived_at,
      archived_by = auth.uid(),
      archive_reason = v_reason,
      updated_at = now()
    where presence.id = p_id
      and presence.archived_at is null;
  elsif v_kind = 'testimonial' then
    perform 1
    from public.testimonials
    where id = p_id
    for update;

    if not found then
      raise exception 'community_item_not_found';
    end if;

    update public.testimonials as testimonial
    set
      archived_at = v_archived_at,
      archived_by = auth.uid(),
      archive_reason = v_reason
    where testimonial.id = p_id
      and testimonial.archived_at is null;
  else
    raise exception 'community_kind_invalid';
  end if;

  if not found then
    raise exception 'community_item_already_archived';
  end if;

  return query select v_kind, p_id, v_archived_at;
end;
$$;

create or replace function public.restore_community_item(
  p_kind text,
  p_id uuid
)
returns table (
  restored_kind text,
  restored_id uuid
)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;

  if p_id is null then
    raise exception 'community_item_id_required';
  end if;

  if v_kind = 'presence' then
    update public.event_authors_presence
    set
      archived_at = null,
      archived_by = null,
      archive_reason = null,
      updated_at = now()
    where id = p_id
      and archived_at is not null;
  elsif v_kind = 'testimonial' then
    update public.testimonials
    set
      archived_at = null,
      archived_by = null,
      archive_reason = null
    where id = p_id
      and archived_at is not null;
  else
    raise exception 'community_kind_invalid';
  end if;

  if not found then
    raise exception 'community_item_not_archived';
  end if;

  return query select v_kind, p_id;
end;
$$;

revoke all on function public.archive_community_item(text, uuid, text) from public;
revoke all on function public.archive_community_item(text, uuid, text) from anon;
grant execute on function public.archive_community_item(text, uuid, text) to authenticated;

revoke all on function public.restore_community_item(text, uuid) from public;
revoke all on function public.restore_community_item(text, uuid) from anon;
grant execute on function public.restore_community_item(text, uuid) to authenticated;

revoke delete on table public.event_authors_presence from authenticated;
revoke delete on table public.testimonials from authenticated;
revoke delete on table public.testimonials from anon;

comment on function public.archive_community_item(text, uuid, text) is
  'Archive logiquement une présence ou un témoignage après contrôle administrateur. Aucune suppression physique.';

comment on function public.restore_community_item(text, uuid) is
  'Restaure un objet Communauté archivé sans modifier son état de modération initial.';

commit;
