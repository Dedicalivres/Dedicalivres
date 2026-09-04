begin;

create function public.submit_admin_watch_candidate(
  p_candidate_id uuid,
  p_expected_version bigint
)
returns table (
  event_id uuid,
  candidate_version bigint,
  candidate_status_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidate public.admin_watch_candidates%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_candidate_version bigint;
  v_status_updated_at timestamptz;
  v_updated_count integer;
  v_country_code text;
  v_description text;
begin
  if auth.uid() is null or not coalesce((select private.is_admin()), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_candidate_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid_candidate_reference' using errcode = '22023';
  end if;

  select candidate.*
  into v_candidate
  from public.admin_watch_candidates candidate
  where candidate.id = p_candidate_id
  for update;

  if not found then
    raise exception 'watch_candidate_not_found' using errcode = 'P0002';
  end if;

  if v_candidate.version <> p_expected_version then
    raise exception 'watch_candidate_version_conflict' using errcode = '40001';
  end if;

  if v_candidate.submitted_event_id is not null then
    raise exception 'watch_candidate_already_submitted' using errcode = '23505';
  end if;

  if v_candidate.workflow_status <> 'ready' then
    raise exception 'watch_candidate_not_ready' using errcode = '23514';
  end if;

  if nullif(btrim(v_candidate.title), '') is null
    or v_candidate.start_date is null
    or nullif(btrim(v_candidate.city), '') is null
    or nullif(btrim(v_candidate.country), '') is null then
    raise exception 'watch_candidate_incomplete' using errcode = '23514';
  end if;

  v_country_code := case
    when lower(v_candidate.country) like '%belg%' then 'BE'
    when lower(v_candidate.country) like '%luxembourg%' then 'LU'
    when lower(v_candidate.country) like '%suisse%'
      or lower(v_candidate.country) like '%switzerland%' then 'CH'
    when lower(v_candidate.country) like '%monaco%' then 'MC'
    else 'FR'
  end;

  v_description := concat_ws(
    E'\n',
    nullif(btrim(v_candidate.description), ''),
    'Fiche candidate issue de la veille Dédicalivres.',
    case
      when nullif(btrim(v_candidate.origin_url), '') is not null
        then 'Source à vérifier : ' || btrim(v_candidate.origin_url)
      else null
    end,
    'À compléter et relire avant validation.'
  );

  insert into public.events (
    id,
    title,
    type,
    country_code,
    region,
    city,
    price,
    start_date,
    end_date,
    registration_open_date,
    registration_deadline,
    website,
    description,
    image_url,
    validated,
    featured,
    rejected,
    verified
  ) values (
    v_event_id,
    btrim(v_candidate.title),
    case
      when v_candidate.type in ('Salon', 'Festival', 'Dédicace', 'Autre') then v_candidate.type
      else 'Autre'
    end,
    v_country_code,
    '',
    btrim(v_candidate.city),
    '',
    v_candidate.start_date,
    v_candidate.end_date,
    null,
    null,
    case
      when coalesce(v_candidate.official_url, v_candidate.origin_url, '') ~* '^https?://'
        then coalesce(v_candidate.official_url, v_candidate.origin_url)
      else ''
    end,
    v_description,
    case
      when coalesce(v_candidate.image_url, '') ~* '^https?://'
        then v_candidate.image_url
      else ''
    end,
    false,
    false,
    false,
    false
  );

  update public.admin_watch_candidates
  set
    workflow_status = 'submitted',
    submitted_event_id = v_event_id
  where id = v_candidate.id
  returning version, status_updated_at
  into v_candidate_version, v_status_updated_at;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'watch_candidate_link_failed' using errcode = 'P0001';
  end if;

  return query
  select v_event_id, v_candidate_version, v_status_updated_at;
end;
$$;

revoke all on function public.submit_admin_watch_candidate(uuid, bigint) from public;
revoke all on function public.submit_admin_watch_candidate(uuid, bigint) from anon;
revoke all on function public.submit_admin_watch_candidate(uuid, bigint) from authenticated;
grant execute on function public.submit_admin_watch_candidate(uuid, bigint) to authenticated;

comment on function public.submit_admin_watch_candidate(uuid, bigint) is
  'Atomically creates one unvalidated event from a READY persisted Watch candidate and links the candidate. Admin-only through RLS and private.is_admin().';

commit;

-- Rollback reference (manual, after reverting the application code):
-- drop function if exists public.submit_admin_watch_candidate(uuid, bigint);
