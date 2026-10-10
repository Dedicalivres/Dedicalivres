begin;

-- Historique durable, indépendant de la durée de vie de la fiche événement.
create table private.event_moderation_history (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  decision text not null check (decision in ('validate', 'reject')),
  admin_id uuid not null,
  decided_at timestamptz not null default clock_timestamp(),
  old_validated boolean not null,
  old_rejected boolean not null,
  new_validated boolean not null,
  new_rejected boolean not null,
  reason text,
  constraint event_moderation_history_reason_check check (
    (decision = 'validate' and reason is null)
    or (decision = 'reject' and reason is not null
        and char_length(reason) between 1 and 500 and reason = btrim(reason))
  )
);

create index event_moderation_history_event_idx
on private.event_moderation_history (event_id, id desc);

alter table private.event_moderation_history enable row level security;
revoke all on private.event_moderation_history from public, anon, authenticated;
grant select on private.event_moderation_history to authenticated;

create policy event_moderation_history_admin_read
on private.event_moderation_history for select to authenticated
using ((select private.is_admin()));

create function private.append_event_moderation_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision_type text;
  decision_reason text;
  decision_author uuid := auth.uid();
begin
  if new.rejected = true and old.rejected is distinct from true then
    decision_type := 'reject';
    decision_reason := btrim(current_setting('dedicalivres.event_rejection_reason', true));
    if decision_reason is null or char_length(decision_reason) not between 1 and 500 then
      raise exception 'REJECTION_REASON_REQUIRED_1_TO_500';
    end if;
  elsif new.validated = true and new.rejected = false
    and (old.validated is distinct from true or old.rejected is distinct from false) then
    decision_type := 'validate';
  else
    return new;
  end if;

  if decision_author is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  insert into private.event_moderation_history (
    event_id, decision, admin_id, old_validated, old_rejected,
    new_validated, new_rejected, reason
  ) values (
    new.id, decision_type, decision_author,
    coalesce(old.validated, false), coalesce(old.rejected, false),
    coalesce(new.validated, false), coalesce(new.rejected, false), decision_reason
  );

  if decision_type = 'reject' then
    perform set_config('dedicalivres.event_rejection_reason', '', true);
  end if;
  return new;
end;
$$;

revoke all on function private.append_event_moderation_history() from public, anon, authenticated;

create trigger events_append_moderation_history
after update of validated, rejected on public.events
for each row
when (old.validated is distinct from new.validated
      or old.rejected is distinct from new.rejected)
execute function private.append_event_moderation_history();

-- L'API existante conserve sa signature et sa table du dernier motif.
create or replace function public.reject_event_with_reason(p_event_id uuid, p_reason text)
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

  perform set_config('dedicalivres.event_rejection_reason', cleaned_reason, true);

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

create function public.get_event_moderation_history(p_event_id uuid)
returns table (
  id bigint, event_id uuid, decision text, admin_id uuid, decided_at timestamptz,
  old_validated boolean, old_rejected boolean,
  new_validated boolean, new_rejected boolean, reason text
)
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
  select h.id, h.event_id, h.decision, h.admin_id, h.decided_at,
         h.old_validated, h.old_rejected, h.new_validated, h.new_rejected, h.reason
  from private.event_moderation_history as h
  where h.event_id = p_event_id
  order by h.id desc;
end;
$$;

revoke all on function public.get_event_moderation_history(uuid) from public, anon;
grant execute on function public.get_event_moderation_history(uuid) to authenticated;

commit;
