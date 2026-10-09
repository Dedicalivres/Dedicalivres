\set ON_ERROR_STOP on
\ir test-admin-event-rejection-reason.sql

reset role;
insert into public.events values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', false, false);
\ir ../supabase/migrations/20261009210559_admin_event_moderation_history.sql

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

update public.events set validated = true, rejected = false
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select public.reject_event_with_reason('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ' Premier motif ');
update public.events set validated = true, rejected = false
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select public.reject_event_with_reason('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Second motif');

do $$
declare
  event_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  if (select count(*) from public.get_event_moderation_history(event_id)) <> 4 then
    raise exception 'expected four decisions';
  end if;
  if (select string_agg(decision, ',' order by id)
      from public.get_event_moderation_history(event_id)) <> 'validate,reject,validate,reject' then
    raise exception 'wrong decision sequence';
  end if;
  if (select string_agg(reason, ',' order by id)
      from public.get_event_moderation_history(event_id) where decision = 'reject') <> 'Premier motif,Second motif' then
    raise exception 'successive reasons lost';
  end if;
  if (select reason from public.get_event_rejection_reason(event_id)) <> 'Second motif' then
    raise exception 'last-reason RPC regressed';
  end if;
  if (select count(*) from public.publication_transition_probe as probe
      where probe.event_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 2 then
    raise exception 'unpublish transitions missing';
  end if;
end;
$$;

update public.events set validated = false, rejected = true
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$
begin
  if (select count(*) from private.event_moderation_history
      where event_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 4 then
    raise exception 'duplicate journal entry';
  end if;
  begin
    update public.events set validated = false, rejected = true
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'direct rejection without reason accepted';
  exception when raise_exception then
    if sqlerrm <> 'REJECTION_REASON_REQUIRED_1_TO_500' then raise; end if;
  end;
  if (select rejected from public.events where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'invalid rejection changed status';
  end if;
end;
$$;

reset role;
create function private.fail_moderation_append() returns trigger language plpgsql as $$
begin
  raise exception 'SIMULATED_HISTORY_FAILURE';
end;
$$;
create trigger fail_moderation_append before insert on private.event_moderation_history
for each row execute function private.fail_moderation_append();
set role authenticated;
do $$
begin
  begin
    update public.events set validated = true, rejected = false
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'history failure not propagated';
  exception when raise_exception then
    if sqlerrm <> 'SIMULATED_HISTORY_FAILURE' then raise; end if;
  end;
  if (select validated from public.events where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'partial validation after history error';
  end if;
end;
$$;
reset role;
drop trigger fail_moderation_append on private.event_moderation_history;
drop function private.fail_moderation_append();

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  begin
    perform * from public.get_event_moderation_history('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'non-admin history read accepted';
  exception when raise_exception then
    if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if;
  end;
  if (select count(*) from private.event_moderation_history) <> 0 then
    raise exception 'non-admin can read private table';
  end if;
  if has_table_privilege('authenticated', 'private.event_moderation_history', 'INSERT')
     or has_table_privilege('authenticated', 'private.event_moderation_history', 'UPDATE')
     or has_table_privilege('authenticated', 'private.event_moderation_history', 'DELETE') then
    raise exception 'direct history mutation granted';
  end if;
end;
$$;

reset role;
set role anon;
do $$
begin
  if has_function_privilege('anon', 'public.get_event_moderation_history(uuid)', 'EXECUTE')
     or has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'anonymous history access granted';
  end if;
end;
$$;

reset role;
delete from public.events where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
  if (select count(*) from public.get_event_moderation_history('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) <> 4 then
    raise exception 'history lost after event deletion';
  end if;
end;
$$;

select 'PASS SQL admin event moderation history' as result;
