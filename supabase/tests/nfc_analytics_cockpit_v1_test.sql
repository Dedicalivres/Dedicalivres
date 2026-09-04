begin;

do $$
declare
  v_tag public.nfc_tags%rowtype;
  v_session uuid := gen_random_uuid();
  v_other_session uuid := gen_random_uuid();
  v_token text := 'TEST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  if (
    select count(*) from pg_class c
    where c.oid in (
      'public.nfc_tags'::regclass,
      'public.nfc_sessions'::regclass,
      'public.nfc_events'::regclass
    ) and c.relrowsecurity
  ) <> 3 then
    raise exception 'RLS must be enabled on all NFC tables';
  end if;

  insert into public.nfc_tags(public_token, label, support_type, lifecycle_status, active)
  values (v_token, 'Support staging inactif', 'card', 'TO_PROGRAM', false)
  returning * into v_tag;

  if exists(select 1 from public.nfc_resolve_tag(v_token)) then
    raise exception 'An inactive tag must not resolve';
  end if;

  begin
    update public.nfc_tags set active = true where id = v_tag.id;
    raise exception 'An untested tag was activated';
  exception when check_violation then
    null;
  end;

  update public.nfc_tags
  set lifecycle_status = 'TESTED', active = true
  where id = v_tag.id;

  if not exists(select 1 from public.nfc_resolve_tag(lower(v_token))) then
    raise exception 'An active tested tag must resolve case-insensitively';
  end if;

  if not public.nfc_track_event(v_token, v_session, 'nfc_open', 'open', p_device_class => 'mobile') then
    raise exception 'A valid event must be accepted';
  end if;

  perform public.nfc_track_event(v_token, v_session, 'nfc_open', 'open', p_device_class => 'mobile');
  if (select count(*) from public.nfc_events where session_id = v_session) <> 1 then
    raise exception 'A duplicate event must not create a second row';
  end if;

  if public.nfc_track_event(v_token, v_other_session, 'invalid_event', 'invalid') then
    raise exception 'An invalid event name must be rejected';
  end if;

  update public.nfc_tags set active = false where id = v_tag.id;
  if public.nfc_track_event(v_token, v_other_session, 'nfc_open', 'open') then
    raise exception 'An inactive tag must reject tracking';
  end if;

  if has_table_privilege('anon', 'public.nfc_tags', 'SELECT')
     or has_table_privilege('anon', 'public.nfc_sessions', 'SELECT')
     or has_table_privilege('anon', 'public.nfc_events', 'SELECT')
     or has_table_privilege('anon', 'public.nfc_events', 'INSERT') then
    raise exception 'Anonymous direct table access must remain revoked';
  end if;

  if has_function_privilege('anon', 'private.nfc_public_context(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.nfc_public_context(text)', 'EXECUTE')
     or has_function_privilege('anon', 'private.nfc_record_event(text,uuid,text,text,text,text,smallint,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.nfc_record_event(text,uuid,text,text,text,text,smallint,text,text)', 'EXECUTE') then
    raise exception 'Internal SECURITY DEFINER helpers must not be directly executable';
  end if;

  if not has_function_privilege('anon', 'public.nfc_resolve_tag(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.nfc_track_event(text,uuid,text,text,text,text,smallint,text,text)', 'EXECUTE') then
    raise exception 'Anonymous visitors must only access the validated public RPC surface';
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid = 'public.nfc_resolve_tag(text)'::regprocedure)
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.nfc_track_event(text,uuid,text,text,text,text,smallint,text,text)'::regprocedure) then
    raise exception 'Public wrappers must own the privilege boundary';
  end if;
end $$;

rollback;

select 'PASS nfc analytics staging SQL' as result;
