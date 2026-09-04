begin;

do $$
begin
  if not exists (select 1 from public.admin_users) then
    raise exception 'staging_admin_fixture_required';
  end if;
end;
$$;

insert into public.admin_watch_candidates (
  id, identity_key, origin_url, official_url, title, type, start_date, city,
  country, description, workflow_status
) values (
  '00000000-0000-4000-8000-000000000711',
  'candidate:test:transaction-success',
  'https://example.invalid/watch-success',
  'https://example.invalid/watch-success',
  'Salon transactionnel',
  'Salon',
  '2026-10-10',
  'Paris',
  'France',
  'Fixture de recette transactionnelle.',
  'ready'
), (
  '00000000-0000-4000-8000-000000000712',
  'candidate:test:transaction-incomplete',
  'https://example.invalid/watch-incomplete',
  'https://example.invalid/watch-incomplete',
  'Salon incomplet',
  'Salon',
  '2026-10-11',
  'Paris',
  null,
  'Fixture volontairement incomplète.',
  'ready'
), (
  '00000000-0000-4000-8000-000000000713',
  'candidate:test:transaction-rollback',
  'https://example.invalid/watch-rollback',
  'https://example.invalid/watch-rollback',
  'Salon rollback atomique',
  'Salon',
  '2026-10-12',
  'Paris',
  'France',
  'Fixture de rupture forcée.',
  'ready'
);

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.admin_users order by created_at limit 1),
  true
);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select user_id::text from public.admin_users order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
declare
  v_result record;
begin
  select * into v_result
  from public.submit_admin_watch_candidate(
    '00000000-0000-4000-8000-000000000711', 1
  );

  if v_result.event_id is null or v_result.candidate_version <> 2 then
    raise exception 'success_result_invalid';
  end if;

  if not exists (
    select 1 from public.events
    where id = v_result.event_id
      and title = 'Salon transactionnel'
      and validated = false
      and featured = false
      and rejected = false
      and verified = false
  ) then
    raise exception 'safe_event_flags_missing';
  end if;

  if not exists (
    select 1 from public.admin_watch_candidates
    where id = '00000000-0000-4000-8000-000000000711'
      and workflow_status = 'submitted'
      and submitted_event_id = v_result.event_id
      and version = 2
  ) then
    raise exception 'candidate_link_missing';
  end if;
end;
$$;

do $$
begin
  perform public.submit_admin_watch_candidate(
    '00000000-0000-4000-8000-000000000711', 2
  );
  raise exception 'already_submitted_was_not_blocked';
exception
  when unique_violation then
    if sqlerrm <> 'watch_candidate_already_submitted' then raise; end if;
end;
$$;

do $$
begin
  perform public.submit_admin_watch_candidate(
    '00000000-0000-4000-8000-000000000712', 1
  );
  raise exception 'incomplete_candidate_was_not_blocked';
exception
  when check_violation then
    if sqlerrm <> 'watch_candidate_incomplete' then raise; end if;
end;
$$;

reset role;

create function pg_temp.force_watch_link_failure()
returns trigger
language plpgsql
as $$
begin
  if new.id = '00000000-0000-4000-8000-000000000713' then
    raise exception 'forced_link_failure';
  end if;
  return new;
end;
$$;

create trigger zz_watch_stage_force_link_failure
before update on public.admin_watch_candidates
for each row execute function pg_temp.force_watch_link_failure();

set local role authenticated;
do $$
begin
  perform public.submit_admin_watch_candidate(
    '00000000-0000-4000-8000-000000000713', 1
  );
  raise exception 'forced_failure_did_not_abort';
exception
  when raise_exception then
    if sqlerrm <> 'forced_link_failure' then raise; end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from public.events where title = 'Salon rollback atomique'
  ) then
    raise exception 'event_insert_was_not_rolled_back';
  end if;

  if not exists (
    select 1 from public.admin_watch_candidates
    where id = '00000000-0000-4000-8000-000000000713'
      and workflow_status = 'ready'
      and submitted_event_id is null
      and version = 1
  ) then
    raise exception 'candidate_changed_despite_rollback';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000799', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000799","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  perform public.submit_admin_watch_candidate(
    '00000000-0000-4000-8000-000000000712', 1
  );
  raise exception 'non_admin_was_not_blocked';
exception
  when insufficient_privilege then
    if sqlerrm <> 'admin_required' then raise; end if;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.submit_admin_watch_candidate(uuid,bigint)',
    'EXECUTE'
  ) then
    raise exception 'anon_execute_must_be_revoked';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.submit_admin_watch_candidate(uuid,bigint)',
    'EXECUTE'
  ) then
    raise exception 'authenticated_execute_missing';
  end if;
end;
$$;

rollback;
