-- E5-D2B: prepared only. Install E5-C/D0 first; do not run an import as part
-- of this migration. OBSERVED is not a CANARY attestation.
begin;

create unique index event_provenance_auto_matte_event_once_idx
  on private.event_provenance (event_id)
  where state = 'OBSERVED' and observed_channel = 'AUTO_MATTE';
create unique index event_provenance_auto_matte_reference_once_idx
  on private.event_provenance (auto_matte_reference)
  where state = 'OBSERVED' and observed_channel = 'AUTO_MATTE';

create function private.prepare_auto_matte_observed_import(
  p_manifest jsonb,
  p_expected_event_ids jsonb,
  p_expected_direct_ids jsonb,
  p_manifest_sha256 text,
  p_execute boolean default false
)
returns table (eligible integer, already_present integer, conflicts integer,
               excluded integer, blocked integer)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  expected_events text[];
  expected_direct text[];
  actual_events text[];
  actual_direct text[];
  seen_events uuid[] := array[]::uuid[];
  seen_refs text[] := array[]::text[];
  insert_events uuid[] := array[]::uuid[];
  insert_refs text[] := array[]::text[];
  item record;
  existing_count integer;
  same_count integer;
begin
  eligible := 0; already_present := 0; conflicts := 0; excluded := 0; blocked := 0;
  if jsonb_typeof(p_manifest) is distinct from 'array'
    or jsonb_typeof(p_expected_event_ids) is distinct from 'array'
    or jsonb_typeof(p_expected_direct_ids) is distinct from 'array'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_manifest_sha256 is null
    or p_execute is null then
    raise exception 'AUTO_MATTE_IMPORT_INPUT_INVALID';
  end if;
  if p_execute then
    if current_user <> 'postgres' then
      raise exception 'AUTO_MATTE_IMPORT_ADMIN_REQUIRED';
    end if;
    -- Stable lock order; no event, direct submission or provenance writer can
    -- change the checked state between this scan and the insertion.
    lock table public.events in share mode;
    lock table public.event_submission_contacts in share mode;
    lock table private.event_provenance in share row exclusive mode;
  end if;

  select coalesce(array_agg(value order by value), array[]::text[])
    into expected_events from jsonb_array_elements_text(p_expected_event_ids) x(value);
  select coalesce(array_agg(value order by value), array[]::text[])
    into expected_direct from jsonb_array_elements_text(p_expected_direct_ids) x(value);
  select coalesce(array_agg(id::text order by id::text), array[]::text[])
    into actual_events from public.events;
  select coalesce(array_agg(event_id::text order by event_id::text), array[]::text[])
    into actual_direct from public.event_submission_contacts;
  if expected_events is distinct from actual_events
    or expected_direct is distinct from actual_direct then
    if p_execute then raise exception 'AUTO_MATTE_IMPORT_EXPORT_STALE'; end if;
    blocked := jsonb_array_length(p_manifest);
    return next; return;
  end if;

  for item in
    select x.event_id, x.auto_matte_reference
    from jsonb_to_recordset(p_manifest)
      as x(event_id uuid, auto_matte_reference text)
  loop
    if item.event_id is null or item.auto_matte_reference is null
      or item.auto_matte_reference !~ '^evenements:[1-9][0-9]*$'
      or item.event_id = any(seen_events)
      or item.auto_matte_reference = any(seen_refs) then
      blocked := blocked + 1;
      continue;
    end if;
    seen_events := array_append(seen_events, item.event_id);
    seen_refs := array_append(seen_refs, item.auto_matte_reference);
    if not exists (select 1 from public.events e where e.id = item.event_id) then
      blocked := blocked + 1;
      continue;
    end if;
    if exists (select 1 from public.event_submission_contacts c where c.event_id = item.event_id) then
      excluded := excluded + 1;
      continue;
    end if;
    if exists (
      select 1 from private.event_provenance p
      where p.auto_matte_reference = item.auto_matte_reference
        and p.event_id <> item.event_id
    ) then
      conflicts := conflicts + 1;
      continue;
    end if;
    select count(*), count(*) filter (where p.state = 'OBSERVED'
        and p.observed_channel = 'AUTO_MATTE'
        and p.auto_matte_reference = item.auto_matte_reference)
      into existing_count, same_count
      from private.event_provenance p where p.event_id = item.event_id;
    if existing_count > same_count then
      conflicts := conflicts + 1;
    elsif same_count > 0 then
      already_present := already_present + 1;
    else
      eligible := eligible + 1;
      insert_events := array_append(insert_events, item.event_id);
      insert_refs := array_append(insert_refs, item.auto_matte_reference);
    end if;
  end loop;
  if p_execute then
    if conflicts > 0 or excluded > 0 or blocked > 0 then
      raise exception 'AUTO_MATTE_IMPORT_PRECONDITION_FAILED';
    end if;
    insert into private.event_provenance
      (event_id, state, observed_channel, attested_origin,
       auto_matte_reference, justification_reference)
    select x.event_id, 'OBSERVED', 'AUTO_MATTE', null,
      x.auto_matte_reference, 'manifest-sha256:' || p_manifest_sha256
    from unnest(insert_events, insert_refs) as x(event_id, auto_matte_reference);
  end if;
  return next;
end;
$$;

revoke all on function private.prepare_auto_matte_observed_import(
  jsonb, jsonb, jsonb, text, boolean) from public, anon, authenticated, service_role;

commit;
