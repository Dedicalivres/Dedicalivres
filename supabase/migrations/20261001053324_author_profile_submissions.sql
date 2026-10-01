begin;

create table if not exists public.author_profile_submissions (
  id uuid primary key default gen_random_uuid(),
  target_author_id uuid references public.authors(id) on delete restrict,
  request_type text not null,
  payload jsonb not null default '{}'::jsonb,
  proposed_avatar_url text,
  base_author_updated_at timestamptz,
  status text not null default 'pending',
  consent_accepted boolean not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  review_note text,
  constraint author_profile_submissions_request_type_check
    check (request_type in ('create', 'modify')),
  constraint author_profile_submissions_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint author_profile_submissions_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint author_profile_submissions_payload_keys_check
    check (
      payload - array[
        'pseudo', 'slug', 'bio', 'location', 'website', 'shop_url',
        'profile_type'
      ] = '{}'::jsonb
    ),
  constraint author_profile_submissions_identity_check
    check (
      (not (payload ? 'pseudo') or char_length(trim(payload ->> 'pseudo')) between 2 and 120)
      and
      (not (payload ? 'slug') or (
        char_length(payload ->> 'slug') between 1 and 120
        and payload ->> 'slug' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      ))
    ),
  constraint author_profile_submissions_lengths_check
    check (
      (not (payload ? 'bio') or char_length(payload ->> 'bio') <= 5000)
      and (not (payload ? 'location') or char_length(payload ->> 'location') <= 200)
      and (not (payload ? 'website') or char_length(payload ->> 'website') <= 500)
      and (not (payload ? 'shop_url') or char_length(payload ->> 'shop_url') <= 500)
    ),
  constraint author_profile_submissions_urls_check
    check (
      (not (payload ? 'website') or nullif(trim(payload ->> 'website'), '') is null or payload ->> 'website' ~* '^https?://[^[:space:]]+$')
      and
      (not (payload ? 'shop_url') or nullif(trim(payload ->> 'shop_url'), '') is null or payload ->> 'shop_url' ~* '^https?://[^[:space:]]+$')
      and
      (
        proposed_avatar_url is null
        or proposed_avatar_url ~ '^https://pub-45a59368068e48578d3b1a1bb519c543[.]r2[.]dev/author-portraits/'
      )
    ),
  constraint author_profile_submissions_profile_type_check
    check (
      not (payload ? 'profile_type')
      or nullif(payload ->> 'profile_type', '') is null
      or payload ->> 'profile_type' in ('author', 'artist_author', 'hybrid')
    ),
  constraint author_profile_submissions_mode_check
    check (
      (
        request_type = 'create'
        and base_author_updated_at is null
        and payload ? 'pseudo'
        and payload ? 'slug'
        and (
          (status in ('pending', 'rejected') and target_author_id is null)
          or (status = 'approved' and target_author_id is not null)
        )
      )
      or
      (
        request_type = 'modify'
        and target_author_id is not null
        and base_author_updated_at is not null
        and not (payload ? 'slug')
        and (payload <> '{}'::jsonb or proposed_avatar_url is not null)
      )
    ),
  constraint author_profile_submissions_consent_check
    check (consent_accepted = true),
  constraint author_profile_submissions_review_state_check
    check (
      (
        status = 'pending'
        and reviewed_at is null
        and reviewed_by is null
      )
      or
      (
        status in ('approved', 'rejected')
        and reviewed_at is not null
        and reviewed_by is not null
      )
    )
);

comment on table public.author_profile_submissions is
  'Propositions publiques de création ou modification de fiche auteur, appliquées uniquement après décision admin.';

alter table public.author_profile_submissions enable row level security;

revoke all on public.author_profile_submissions from anon, authenticated;

grant insert (
  target_author_id,
  request_type,
  payload,
  proposed_avatar_url,
  base_author_updated_at,
  consent_accepted
) on public.author_profile_submissions to anon, authenticated;

grant select, update on public.author_profile_submissions to authenticated;

-- Nécessaire au verrou optimiste des modifications. La policy de lecture
-- existante continue de limiter anon aux seules fiches publiées et prêtes.
grant select (updated_at) on public.authors to anon;

create policy "Public can submit pending author profiles"
on public.author_profile_submissions
for insert
to anon, authenticated
with check (
  status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
  and consent_accepted = true
  and (
    request_type = 'create'
    or exists (
      select 1
      from public.authors
      where authors.id = author_profile_submissions.target_author_id
    )
  )
);

create policy "Admins can read author profile submissions"
on public.author_profile_submissions
for select
to authenticated
using ((select private.is_admin()));

create policy "Admins can update author profile submissions"
on public.author_profile_submissions
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create or replace function public.approve_author_profile_submission(
  p_submission_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission public.author_profile_submissions%rowtype;
  current_author public.authors%rowtype;
  applied_author_id uuid;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into submission
  from public.author_profile_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  if submission.status <> 'pending' then
    raise exception 'SUBMISSION_ALREADY_REVIEWED';
  end if;

  if submission.request_type = 'create' then
    insert into public.authors (
      pseudo,
      slug,
      website,
      bio,
      avatar_url,
      location,
      shop_url,
      profile_type,
      validated,
      updated_at
    ) values (
      trim(submission.payload ->> 'pseudo'),
      trim(submission.payload ->> 'slug'),
      nullif(trim(submission.payload ->> 'website'), ''),
      nullif(trim(submission.payload ->> 'bio'), ''),
      submission.proposed_avatar_url,
      nullif(trim(submission.payload ->> 'location'), ''),
      nullif(trim(submission.payload ->> 'shop_url'), ''),
      nullif(submission.payload ->> 'profile_type', ''),
      false,
      now()
    )
    returning id into applied_author_id;
  else
    select * into current_author
    from public.authors
    where id = submission.target_author_id
    for update;

    if not found then
      raise exception 'TARGET_AUTHOR_NOT_FOUND';
    end if;

    if current_author.updated_at is distinct from submission.base_author_updated_at then
      raise exception 'TARGET_AUTHOR_CHANGED';
    end if;

    update public.authors
    set
      pseudo = case when submission.payload ? 'pseudo' then trim(submission.payload ->> 'pseudo') else pseudo end,
      website = case when submission.payload ? 'website' then nullif(trim(submission.payload ->> 'website'), '') else website end,
      bio = case when submission.payload ? 'bio' then nullif(trim(submission.payload ->> 'bio'), '') else bio end,
      avatar_url = case when submission.proposed_avatar_url is not null then submission.proposed_avatar_url else avatar_url end,
      location = case when submission.payload ? 'location' then nullif(trim(submission.payload ->> 'location'), '') else location end,
      shop_url = case when submission.payload ? 'shop_url' then nullif(trim(submission.payload ->> 'shop_url'), '') else shop_url end,
      profile_type = case when submission.payload ? 'profile_type' then nullif(submission.payload ->> 'profile_type', '') else profile_type end,
      updated_at = now()
    where id = current_author.id
    returning id into applied_author_id;
  end if;

  update public.author_profile_submissions
  set
    target_author_id = applied_author_id,
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    review_note = null
  where id = submission.id;

  return applied_author_id;
end;
$$;

create or replace function public.reject_author_profile_submission(
  p_submission_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  update public.author_profile_submissions
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    review_note = left(nullif(trim(p_reason), ''), 500)
  where id = p_submission_id
    and status = 'pending';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'SUBMISSION_NOT_PENDING';
  end if;

  return true;
end;
$$;

revoke all on function public.approve_author_profile_submission(uuid) from public, anon;
revoke all on function public.reject_author_profile_submission(uuid, text) from public, anon;
grant execute on function public.approve_author_profile_submission(uuid) to authenticated;
grant execute on function public.reject_author_profile_submission(uuid, text) to authenticated;

commit;

-- Rollback borné :
-- begin;
-- drop function if exists public.reject_author_profile_submission(uuid, text);
-- drop function if exists public.approve_author_profile_submission(uuid);
-- drop table if exists public.author_profile_submissions;
-- revoke select (updated_at) on public.authors from anon;
-- commit;
