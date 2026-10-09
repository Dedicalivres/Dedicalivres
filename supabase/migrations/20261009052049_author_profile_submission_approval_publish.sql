begin;

create or replace function public.approve_author_profile_submission(p_submission_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission public.author_profile_submissions%rowtype;
  current_author public.authors%rowtype;
  applied_author_id uuid;
  admin_id uuid := auth.uid();
  decision_at timestamptz := now();
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
begin
  if admin_id is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into submission
  from public.author_profile_submissions
  where id = p_submission_id
  for update;

  if not found then raise exception 'SUBMISSION_NOT_FOUND'; end if;
  if submission.status <> 'pending' then raise exception 'SUBMISSION_ALREADY_REVIEWED'; end if;

  if submission.request_type = 'create' then
    base_slug := trim(submission.payload ->> 'slug');
    candidate_slug := base_slug;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('author-slug:' || base_slug, 0)
    );
    while exists (select 1 from public.authors where slug = candidate_slug) loop
      suffix := suffix + 1;
      candidate_slug := left(base_slug, 120 - char_length('-' || suffix::text)) || '-' || suffix::text;
    end loop;

    insert into public.authors (
      pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type,
      validated, publication_ready, publication_ready_at, publication_ready_by,
      editorial_status, editorial_status_at, editorial_status_by,
      published, published_at, published_by, updated_at
    ) values (
      trim(submission.payload ->> 'pseudo'), candidate_slug,
      nullif(trim(submission.payload ->> 'website'), ''),
      nullif(trim(submission.payload ->> 'bio'), ''), submission.proposed_avatar_url,
      nullif(trim(submission.payload ->> 'location'), ''),
      nullif(trim(submission.payload ->> 'shop_url'), ''),
      coalesce(nullif(submission.payload ->> 'profile_type', ''), 'author'),
      true, true, decision_at, admin_id, 'READY', decision_at, admin_id,
      true, decision_at, admin_id, decision_at
    ) returning id into applied_author_id;
  else
    select * into current_author
    from public.authors
    where id = submission.target_author_id
    for update;

    if not found then raise exception 'TARGET_AUTHOR_NOT_FOUND'; end if;
    if current_author.merged_into is not null then raise exception 'TARGET_AUTHOR_MERGED'; end if;
    if current_author.updated_at is distinct from submission.base_author_updated_at then
      raise exception 'TARGET_AUTHOR_CHANGED';
    end if;

    -- Cette première écriture déclenche l'invalidation éditoriale existante.
    update public.authors
    set
      pseudo = case when submission.payload ? 'pseudo' then trim(submission.payload ->> 'pseudo') else pseudo end,
      website = case when submission.payload ? 'website' then nullif(trim(submission.payload ->> 'website'), '') else website end,
      bio = case when submission.payload ? 'bio' then nullif(trim(submission.payload ->> 'bio'), '') else bio end,
      avatar_url = case when submission.proposed_avatar_url is not null then submission.proposed_avatar_url else avatar_url end,
      location = case when submission.payload ? 'location' then nullif(trim(submission.payload ->> 'location'), '') else location end,
      shop_url = case when submission.payload ? 'shop_url' then nullif(trim(submission.payload ->> 'shop_url'), '') else shop_url end,
      profile_type = case when submission.payload ? 'profile_type' then nullif(submission.payload ->> 'profile_type', '') else profile_type end,
      validated = true,
      updated_at = decision_at
    where id = current_author.id
    returning id into applied_author_id;

    -- Les champs ci-dessous ne sont pas surveillés par le trigger : la décision
    -- humaine rétablit donc explicitement l'état public dans la même transaction.
    update public.authors
    set
      publication_ready = true, publication_ready_at = decision_at, publication_ready_by = admin_id,
      editorial_status = 'READY', editorial_status_at = decision_at, editorial_status_by = admin_id,
      published = true, published_at = decision_at, published_by = admin_id,
      updated_at = decision_at
    where id = applied_author_id;
  end if;

  update public.author_profile_submissions
  set target_author_id = applied_author_id, status = 'approved',
      reviewed_at = decision_at, reviewed_by = admin_id, review_note = null
  where id = submission.id;

  return applied_author_id;
end;
$$;

revoke all on function public.approve_author_profile_submission(uuid) from public, anon;
grant execute on function public.approve_author_profile_submission(uuid) to authenticated;

commit;
