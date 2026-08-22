create or replace function public.revert_author_merge(
  p_audit_id uuid
)
returns table (
  restored_presences integer,
  restored_author_id uuid
)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_audit public.author_merge_audit%rowtype;
  v_secondary public.authors%rowtype;
  v_presence jsonb;
  v_restored integer := 0;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;

  if p_audit_id is null then
    raise exception 'audit_id_required';
  end if;

  select *
  into v_audit
  from public.author_merge_audit
  where id = p_audit_id
  for update;

  if not found then
    raise exception 'merge_audit_not_found';
  end if;

  if v_audit.reverted_at is not null then
    raise exception 'merge_already_reverted';
  end if;

  select *
  into v_secondary
  from public.authors
  where id = v_audit.secondary_author_id
  for update;

  if not found then
    raise exception 'secondary_author_not_found';
  end if;

  if v_secondary.merged_into is distinct from v_audit.primary_author_id then
    raise exception 'merge_state_changed';
  end if;

  if v_secondary.merged_at is null then
    raise exception 'merge_state_changed';
  end if;

  update public.authors
  set
    pseudo = v_audit.secondary_author_snapshot ->> 'pseudo',
    slug = v_audit.secondary_author_snapshot ->> 'slug',
    website = nullif(v_audit.secondary_author_snapshot ->> 'website', ''),
    bio = nullif(v_audit.secondary_author_snapshot ->> 'bio', ''),
    avatar_url = nullif(v_audit.secondary_author_snapshot ->> 'avatar_url', ''),
    validated = coalesce(
      (v_audit.secondary_author_snapshot ->> 'validated')::boolean,
      false
    ),
    location = nullif(v_audit.secondary_author_snapshot ->> 'location', ''),
    shop_url = nullif(v_audit.secondary_author_snapshot ->> 'shop_url', ''),
    profile_type = nullif(v_audit.secondary_author_snapshot ->> 'profile_type', ''),
    merged_into = null,
    merged_at = null,
    updated_at = now()
  where id = v_audit.secondary_author_id;

  for v_presence in
    select value
    from jsonb_array_elements(v_audit.presence_snapshot)
  loop
    update public.event_authors_presence
    set
      author_id = nullif(v_presence ->> 'author_id', '')::uuid,
      author_slug = nullif(v_presence ->> 'author_slug', ''),
      author_identity_key = nullif(v_presence ->> 'author_identity_key', ''),
      updated_at = now()
    where
      id = (v_presence ->> 'id')::uuid
      and author_id = v_audit.primary_author_id;

    if found then
      v_restored := v_restored + 1;
    end if;
  end loop;

  if v_restored <> v_audit.reassigned_presences then
    raise exception
      'presence_restore_count_mismatch:%:%',
      v_restored,
      v_audit.reassigned_presences;
  end if;

  update public.author_merge_audit
  set
    reverted_at = now(),
    reverted_by = auth.uid()
  where id = v_audit.id;

  return query
  select
    v_restored,
    v_audit.secondary_author_id;
end;
$$;

revoke all on function public.revert_author_merge(uuid) from public;
revoke all on function public.revert_author_merge(uuid) from anon;
grant execute on function public.revert_author_merge(uuid) to authenticated;

comment on function public.revert_author_merge(uuid) is
  'Annule une fusion auteur auditée lorsque son état est encore cohérent. Restaure la fiche secondaire et les identités techniques exactes des présences sauvegardées.';
