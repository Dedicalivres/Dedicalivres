create or replace function public.merge_author_profiles(
  p_primary_id uuid,
  p_secondary_id uuid
)
returns table (
  reassigned_presences integer,
  primary_id uuid,
  secondary_id uuid
)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_primary public.authors%rowtype;
  v_secondary public.authors%rowtype;
  v_presence_snapshot jsonb := '[]'::jsonb;
  v_audit_id uuid;
  v_reassigned integer := 0;
  v_conflicts integer := 0;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;

  if p_primary_id is null or p_secondary_id is null then
    raise exception 'author_id_required';
  end if;

  if p_primary_id = p_secondary_id then
    raise exception 'cannot_merge_author_into_itself';
  end if;

  select *
  into v_primary
  from public.authors
  where id = p_primary_id
  for update;

  if not found then
    raise exception 'primary_author_not_found';
  end if;

  select *
  into v_secondary
  from public.authors
  where id = p_secondary_id
  for update;

  if not found then
    raise exception 'secondary_author_not_found';
  end if;

  if v_primary.merged_into is not null then
    raise exception 'primary_author_already_merged';
  end if;

  if v_secondary.merged_into is not null then
    raise exception 'secondary_author_already_merged';
  end if;

  select count(*)
  into v_conflicts
  from public.event_authors_presence secondary_presence
  where
    secondary_presence.participant_type <> 'publisher'
    and (
      secondary_presence.author_id = v_secondary.id
      or (
        secondary_presence.author_id is null
        and (
          secondary_presence.author_slug = v_secondary.slug
          or secondary_presence.author_identity_key = v_secondary.slug
        )
      )
    )
    and exists (
      select 1
      from public.event_authors_presence primary_presence
      where
        primary_presence.event_id = secondary_presence.event_id
        and primary_presence.id <> secondary_presence.id
        and primary_presence.participant_type <> 'publisher'
        and (
          primary_presence.author_id = v_primary.id
          or (
            primary_presence.author_id is null
            and (
              primary_presence.author_slug = v_primary.slug
              or primary_presence.author_identity_key = v_primary.slug
            )
          )
        )
    );

  if v_conflicts > 0 then
    raise exception 'presence_event_conflict:%', v_conflicts;
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(presence)
      order by presence.created_at, presence.id
    ),
    '[]'::jsonb
  )
  into v_presence_snapshot
  from public.event_authors_presence presence
  where
    presence.participant_type <> 'publisher'
    and (
      presence.author_id = v_secondary.id
      or (
        presence.author_id is null
        and (
          presence.author_slug = v_secondary.slug
          or presence.author_identity_key = v_secondary.slug
        )
      )
    );

  insert into public.author_merge_audit (
    primary_author_id,
    secondary_author_id,
    primary_author_snapshot,
    secondary_author_snapshot,
    presence_snapshot
  )
  values (
    v_primary.id,
    v_secondary.id,
    to_jsonb(v_primary),
    to_jsonb(v_secondary),
    v_presence_snapshot
  )
  returning id into v_audit_id;

  update public.event_authors_presence
  set
    author_id = v_primary.id,
    author_slug = v_primary.slug,
    author_identity_key = v_primary.slug,
    updated_at = now()
  where
    participant_type <> 'publisher'
    and (
      author_id = v_secondary.id
      or (
        author_id is null
        and (
          author_slug = v_secondary.slug
          or author_identity_key = v_secondary.slug
        )
      )
    );

  get diagnostics v_reassigned = row_count;

  update public.author_merge_audit
  set reassigned_presences = v_reassigned
  where id = v_audit_id;

  update public.authors
  set
    merged_into = v_primary.id,
    merged_at = now(),
    validated = false,
    updated_at = now()
  where id = v_secondary.id;

  return query
  select
    v_reassigned,
    v_primary.id,
    v_secondary.id;
end;
$$;

revoke all on function public.merge_author_profiles(uuid, uuid) from public;
revoke all on function public.merge_author_profiles(uuid, uuid) from anon;
grant execute on function public.merge_author_profiles(uuid, uuid) to authenticated;

comment on function public.merge_author_profiles(uuid, uuid) is
  'Fusion contrôlée et auditée de deux fiches auteurs. Sauvegarde les états initiaux avant réaffectation des présences et archivage logique de la fiche secondaire.';
