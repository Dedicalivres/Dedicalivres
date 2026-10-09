\set ON_ERROR_STOP on

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema auth;
create schema private;
grant usage on schema auth, private to authenticated;

create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant execute on function auth.uid() to authenticated;

create table public.admin_users (user_id uuid primary key references auth.users(id));
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create table public.events (
  id uuid primary key,
  validated boolean not null default false,
  rejected boolean not null default false
);
grant select, update on public.events to authenticated;
alter table public.events enable row level security;
create policy events_admin_select on public.events for select to authenticated
using ((select private.is_admin()));
create policy events_admin_update on public.events for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

insert into auth.users values
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222');
insert into public.admin_users values ('11111111-1111-4111-8111-111111111111');
insert into public.events values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, false),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false, false);

create table public.publication_transition_probe (event_id uuid, transition text);
grant select, insert on public.publication_transition_probe to authenticated;
create function public.record_publication_transition() returns trigger language plpgsql as $$
begin
  if old.validated and not old.rejected and new.rejected then
    insert into public.publication_transition_probe values (new.id, 'unpublish');
  end if;
  return new;
end;
$$;
create trigger publication_probe after update on public.events for each row
execute function public.record_publication_transition();

\ir ../supabase/migrations/20261009204509_admin_event_rejection_reason.sql

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
begin
  begin
    perform public.reject_event_with_reason('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '   ');
    raise exception 'empty reason accepted';
  exception when raise_exception then
    if sqlerrm <> 'REJECTION_REASON_REQUIRED_1_TO_500' then raise; end if;
  end;
  begin
    perform public.reject_event_with_reason('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('x', 501));
    raise exception 'long reason accepted';
  exception when raise_exception then
    if sqlerrm <> 'REJECTION_REASON_REQUIRED_1_TO_500' then raise; end if;
  end;
  if (select rejected from public.events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'invalid reason changed event';
  end if;
end;
$$;

select public.reject_event_with_reason('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  Informations inexactes  ');
do $$
begin
  if not (select rejected and not validated from public.events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'event status not updated';
  end if;
  if (select reason from public.get_event_rejection_reason('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) <> 'Informations inexactes' then
    raise exception 'private reason not stored';
  end if;
  if (select rejected_by from public.get_event_rejection_reason('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) <> auth.uid() then
    raise exception 'decision author not stored';
  end if;
  if (select count(*) from public.publication_transition_probe where transition = 'unpublish') <> 1 then
    raise exception 'publication transition missing';
  end if;
  begin
    perform public.reject_event_with_reason('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Second rejet');
    raise exception 'second decision accepted';
  exception when raise_exception then
    if sqlerrm <> 'EVENT_NOT_REJECTABLE' then raise; end if;
  end;
end;
$$;

reset role;
create function private.fail_reason_write() returns trigger language plpgsql as $$
begin
  raise exception 'SIMULATED_REASON_WRITE_FAILURE';
end;
$$;
create trigger fail_reason_write before insert on private.event_rejection_reasons
for each row execute function private.fail_reason_write();
set role authenticated;
do $$
begin
  begin
    perform public.reject_event_with_reason('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Valide');
    raise exception 'reason write failure not propagated';
  exception when raise_exception then
    if sqlerrm <> 'SIMULATED_REASON_WRITE_FAILURE' then raise; end if;
  end;
  if (select rejected from public.events where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'partial event update after reason failure';
  end if;
end;
$$;
reset role;
drop trigger fail_reason_write on private.event_rejection_reasons;
drop function private.fail_reason_write();
set role authenticated;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  begin
    perform public.reject_event_with_reason('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Non autorisé');
    raise exception 'non-admin rejection accepted';
  exception when raise_exception then
    if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if;
  end;
  begin
    perform * from public.get_event_rejection_reason('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'non-admin reason read accepted';
  exception when raise_exception then
    if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if;
  end;
end;
$$;

reset role;
set role anon;
do $$
begin
  if has_function_privilege('anon', 'public.get_event_rejection_reason(uuid)', 'EXECUTE') then
    raise exception 'anon can read reasons';
  end if;
  if has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'anon can access private schema';
  end if;
end;
$$;

select 'PASS SQL admin event rejection reason' as result;
