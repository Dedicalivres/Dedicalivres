-- Rafraichit les sorties statiques existantes quand une presence auteur publique change.
-- Aucun nouveau pipeline : la file event_publication_jobs declenche deja la generation
-- des evenements, territoires et pages auteurs.

create or replace function private.queue_author_presence_publication(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, auth
as $function$
begin
  if p_event_id is null or not exists (
    select 1
    from public.events event
    where event.id = p_event_id
      and event.validated = true
      and coalesce(event.rejected, false) = false
  ) then
    return;
  end if;

  insert into public.event_publication_jobs (
    event_id,
    target_event_id,
    dispatch_token,
    reason,
    status,
    requested_at,
    requested_by
  )
  values (
    p_event_id,
    p_event_id,
    gen_random_uuid(),
    'edit',
    'PENDING',
    now(),
    auth.uid()
  )
  on conflict (event_id)
    where event_id is not null and status = 'PENDING'
  do update set
    target_event_id = excluded.target_event_id,
    dispatch_token = excluded.dispatch_token,
    dispatch_requested_at = null,
    reason = excluded.reason,
    requested_at = excluded.requested_at,
    requested_by = coalesce(
      excluded.requested_by,
      public.event_publication_jobs.requested_by
    ),
    last_error = null;
end;
$function$;

revoke all on function private.queue_author_presence_publication(uuid) from public;

create or replace function private.queue_author_presence_static_refresh()
returns trigger
language plpgsql
security definer
set search_path = public, private, auth
as $function$
declare
  old_is_public boolean := false;
  new_is_public boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_is_public :=
      old.validated = true
      and coalesce(old.rejected, false) = false
      and old.archived_at is null
      and old.author_id is not null;
  end if;

  if tg_op <> 'DELETE' then
    new_is_public :=
      new.validated = true
      and coalesce(new.rejected, false) = false
      and new.archived_at is null
      and new.author_id is not null;
  end if;

  if tg_op = 'INSERT' then
    if new_is_public then
      perform private.queue_author_presence_publication(new.event_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old_is_public then
      perform private.queue_author_presence_publication(old.event_id);
    end if;
    return old;
  end if;

  if (old_is_public, old.event_id, old.author_id)
    is distinct from
    (new_is_public, new.event_id, new.author_id)
  then
    if old_is_public then
      perform private.queue_author_presence_publication(old.event_id);
    end if;
    if new_is_public and (not old_is_public or new.event_id is distinct from old.event_id) then
      perform private.queue_author_presence_publication(new.event_id);
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.queue_author_presence_static_refresh() from public;

drop trigger if exists event_authors_presence_queue_static_refresh
on public.event_authors_presence;

create trigger event_authors_presence_queue_static_refresh
after insert or update or delete
on public.event_authors_presence
for each row
execute function private.queue_author_presence_static_refresh();

-- Deux evenements publics dont le titre identifie Dylan Heskin sans ambiguite.
-- Une relation Dylan cachee ou deja existante empeche volontairement tout doublon.
insert into public.event_authors_presence (
  event_id,
  pseudo,
  website,
  author_slug,
  author_identity_key,
  author_id,
  participant_type,
  presence_verified,
  validated,
  rejected
)
select
  candidate.event_id,
  'Dylan Heskin',
  'https://dylanheskin.com',
  'dylan-heskin',
  'dylan-heskin',
  'ababf0dc-b962-43ff-a324-dbc54dcc4505'::uuid,
  'author',
  true,
  true,
  false
from (
  values
    ('f2df9ae0-6164-440e-8b67-1adafff70182'::uuid, 'Dedicace Dylan Heskin - Espace Culturel E. Leclerc Queven'),
    ('3d509e99-5e2d-478d-9300-f86ba6c478f6'::uuid, 'Dedicace Dylan Heskin - Cultura Brest')
) as candidate(event_id, expected_title)
join public.events event on event.id = candidate.event_id
where event.validated = true
  and coalesce(event.rejected, false) = false
  and lower(unaccent(event.title)) = lower(unaccent(candidate.expected_title))
  and exists (
    select 1
    from public.authors author
    where author.id = 'ababf0dc-b962-43ff-a324-dbc54dcc4505'::uuid
      and lower(unaccent(author.pseudo)) = 'dylan heskin'
      and author.slug = 'dylan-heskin'
      and author.validated = true
      and author.published = true
      and author.merged_into is null
  )
  and not exists (
    select 1
    from public.event_authors_presence presence
    where presence.event_id = candidate.event_id
      and (
        presence.author_id = 'ababf0dc-b962-43ff-a324-dbc54dcc4505'::uuid
        or presence.author_slug = 'dylan-heskin'
        or presence.author_identity_key = 'dylan-heskin'
        or lower(unaccent(trim(presence.pseudo))) = 'dylan heskin'
      )
  );
