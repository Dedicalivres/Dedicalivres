begin;

-- Le dernier motif reste hors du schéma exposé par l'API publique.
create table private.event_rejection_reasons (
  event_id uuid primary key references public.events(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500 and reason = btrim(reason)),
  rejected_by uuid not null references auth.users(id),
  rejected_at timestamptz not null default now()
);

alter table private.event_rejection_reasons enable row level security;
revoke all on private.event_rejection_reasons from public, anon;
grant select, insert, update on private.event_rejection_reasons to authenticated;

create policy event_rejection_reasons_admin_select
on private.event_rejection_reasons for select to authenticated
using ((select private.is_admin()));

create policy event_rejection_reasons_admin_insert
on private.event_rejection_reasons for insert to authenticated
with check ((select private.is_admin()));

create policy event_rejection_reasons_admin_update
on private.event_rejection_reasons for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create function public.reject_event_with_reason(p_event_id uuid, p_reason text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  decision_author uuid := auth.uid();
  cleaned_reason text := btrim(p_reason);
  updated_event_id uuid;
begin
  if decision_author is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if cleaned_reason is null or char_length(cleaned_reason) not between 1 and 500 then
    raise exception 'REJECTION_REASON_REQUIRED_1_TO_500';
  end if;

  update public.events
  set rejected = true, validated = false
  where id = p_event_id and rejected is distinct from true
  returning id into updated_event_id;

  if updated_event_id is null then
    raise exception 'EVENT_NOT_REJECTABLE';
  end if;

  insert into private.event_rejection_reasons (event_id, reason, rejected_by, rejected_at)
  values (updated_event_id, cleaned_reason, decision_author, now())
  on conflict (event_id) do update
  set reason = excluded.reason,
      rejected_by = excluded.rejected_by,
      rejected_at = excluded.rejected_at;

  return true;
end;
$$;

create function public.get_event_rejection_reason(p_event_id uuid)
returns table(reason text, rejected_by uuid, rejected_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  select record.reason, record.rejected_by, record.rejected_at
  from private.event_rejection_reasons as record
  join public.events as event on event.id = record.event_id
  where record.event_id = p_event_id and event.rejected = true;
end;
$$;

revoke all on function public.reject_event_with_reason(uuid, text) from public, anon;
revoke all on function public.get_event_rejection_reason(uuid) from public, anon;
grant execute on function public.reject_event_with_reason(uuid, text) to authenticated;
grant execute on function public.get_event_rejection_reason(uuid) to authenticated;

commit;
