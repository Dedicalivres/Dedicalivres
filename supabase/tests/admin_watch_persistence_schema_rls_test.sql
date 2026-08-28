begin;
select no_plan();

-- Structure: the four durable objects and their critical PostgreSQL types.
select ok(to_regclass('public.admin_watch_candidates') is not null, 'candidates table exists');
select ok(to_regclass('public.admin_watch_sources') is not null, 'sources table exists');
select ok(to_regclass('public.admin_event_watch_alerts') is not null, 'event alerts table exists');
select ok(to_regclass('public.admin_watch_transitions') is not null, 'transitions table exists');

select is(
  (select format_type(a.atttypid, a.atttypmod)
   from pg_attribute a
   where a.attrelid = 'public.admin_watch_candidates'::regclass
     and a.attname = 'duplicate_event_id'),
  'uuid',
  'candidate event foreign key uses uuid'
);
select is(
  (select format_type(a.atttypid, a.atttypmod)
   from pg_attribute a
   where a.attrelid = 'public.admin_event_watch_alerts'::regclass
     and a.attname = 'event_id'),
  'uuid',
  'alert event foreign key uses uuid'
);
select is(
  (select format_type(a.atttypid, a.atttypmod)
   from pg_attribute a
   where a.attrelid = 'public.admin_event_watch_alerts'::regclass
     and a.attname = 'confidence'),
  'numeric(5,4)',
  'alert confidence has bounded numeric type'
);
select is(
  (select format_type(a.atttypid, a.atttypmod)
   from pg_attribute a
   where a.attrelid = 'public.admin_event_watch_alerts'::regclass
     and a.attname = 'proof'),
  'jsonb',
  'alert proof uses jsonb'
);
select is(
  (select a.attidentity::text
   from pg_attribute a
   where a.attrelid = 'public.admin_watch_transitions'::regclass
     and a.attname = 'id'),
  'a',
  'transition id is generated always'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_watch_candidates'::regclass
      and conname = 'admin_watch_candidates_workflow_status_check'
      and contype = 'c'
  ),
  'candidate workflow constraint exists'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_event_watch_alerts'::regclass
      and conname = 'admin_event_watch_alerts_workflow_status_check'
      and contype = 'c'
  ),
  'alert workflow constraint exists'
);
select ok(
  (select count(*) = 3
   from pg_constraint
   where conname in (
     'admin_watch_sources_version_check',
     'admin_watch_candidates_version_check',
     'admin_event_watch_alerts_version_check'
   )),
  'all business tables constrain version'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_watch_transitions'::regclass
      and conname = 'admin_watch_transitions_single_target_check'
      and contype = 'c'
  ),
  'transition requires exactly one target'
);
select ok(
  (select count(*) = 3
   from pg_constraint c
   join pg_class target on target.oid = c.confrelid
   join pg_namespace target_namespace on target_namespace.oid = target.relnamespace
   where c.conrelid in (
       'public.admin_watch_candidates'::regclass,
       'public.admin_event_watch_alerts'::regclass
     )
     and c.contype = 'f'
     and target_namespace.nspname = 'public'
     and target.relname = 'events'
     and c.confdeltype = 'n'),
  'three event references use ON DELETE SET NULL'
);
select ok(
  to_regclass('public.admin_watch_candidates_identity_key_key') is not null,
  'candidate identity key is unique'
);
select ok(
  to_regclass('public.admin_watch_sources_url_hash_key') is not null,
  'source URL hash is unique'
);
select ok(
  to_regclass('public.admin_event_watch_alerts_identity_key_key') is not null,
  'alert identity key is unique'
);
select ok(
  (select i.indisunique
     and lower(pg_get_expr(i.indpred, i.indrelid)) like '%engine_alert_id is not null%'
   from pg_index i
   where i.indexrelid = 'public.admin_event_watch_alerts_engine_alert_key'::regclass),
  'engine alert identity has the expected partial unique index'
);
select ok(
  (select count(*) = 22
   from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'admin_watch_sources_url_hash_key',
       'admin_watch_sources_active_last_seen_idx',
       'admin_watch_sources_last_seen_idx',
       'admin_watch_candidates_identity_key_key',
       'admin_watch_candidates_match_fingerprint_idx',
       'admin_watch_candidates_status_updated_idx',
       'admin_watch_candidates_last_seen_idx',
       'admin_watch_candidates_source_id_idx',
       'admin_watch_candidates_duplicate_event_id_idx',
       'admin_watch_candidates_submitted_event_id_idx',
       'admin_watch_candidates_status_updated_by_idx',
       'admin_event_watch_alerts_identity_key_key',
       'admin_event_watch_alerts_engine_alert_key',
       'admin_event_watch_alerts_status_detected_idx',
       'admin_event_watch_alerts_event_id_idx',
       'admin_event_watch_alerts_field_idx',
       'admin_event_watch_alerts_detected_idx',
       'admin_event_watch_alerts_status_updated_by_idx',
       'admin_watch_transitions_candidate_changed_idx',
       'admin_watch_transitions_alert_changed_idx',
       'admin_watch_transitions_changed_by_idx',
       'admin_watch_transitions_changed_at_idx'
     )),
  'required identity, queue, and foreign-key indexes exist'
);

-- RLS, policies, grants, and function exposure.
select ok(
  (select bool_and(c.relrowsecurity) and count(*) = 4
   from pg_class c
   where c.oid in (
     'public.admin_watch_sources'::regclass,
     'public.admin_watch_candidates'::regclass,
     'public.admin_event_watch_alerts'::regclass,
     'public.admin_watch_transitions'::regclass
   )),
  'RLS is enabled on all four tables'
);
select is(
  (select count(*)::bigint
   from pg_policies
   where schemaname = 'public'
     and tablename in (
       'admin_watch_sources',
       'admin_watch_candidates',
       'admin_event_watch_alerts',
       'admin_watch_transitions'
     )),
  10::bigint,
  'exactly ten scoped policies exist'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename like 'admin%watch%'
      and ('public' = any(roles) or 'anon' = any(roles))
  ),
  'no watch policy is public or anonymous'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename like 'admin%watch%'
      and cmd = 'DELETE'
  ),
  'no watch policy permits deletion'
);
select ok(
  (select count(*) = 10
   from pg_policies
   where schemaname = 'public'
     and tablename in (
       'admin_watch_sources',
       'admin_watch_candidates',
       'admin_event_watch_alerts',
       'admin_watch_transitions'
     )
     and 'authenticated' = any(roles)
     and coalesce(qual, with_check) like '%is_admin%'),
  'every policy delegates authorization to private.is_admin'
);
select ok(
  not has_table_privilege('anon', 'public.admin_watch_sources', 'SELECT')
  and not has_table_privilege('anon', 'public.admin_watch_sources', 'INSERT')
  and not has_table_privilege('anon', 'public.admin_watch_candidates', 'SELECT')
  and not has_table_privilege('anon', 'public.admin_event_watch_alerts', 'SELECT')
  and not has_table_privilege('anon', 'public.admin_watch_transitions', 'SELECT'),
  'anonymous role has no table privilege'
);
select ok(
  has_table_privilege('authenticated', 'public.admin_watch_sources', 'SELECT')
  and has_table_privilege('authenticated', 'public.admin_watch_sources', 'INSERT')
  and has_table_privilege('authenticated', 'public.admin_watch_sources', 'UPDATE')
  and has_table_privilege('authenticated', 'public.admin_watch_candidates', 'SELECT')
  and has_table_privilege('authenticated', 'public.admin_watch_candidates', 'INSERT')
  and has_table_privilege('authenticated', 'public.admin_watch_candidates', 'UPDATE')
  and has_table_privilege('authenticated', 'public.admin_event_watch_alerts', 'SELECT')
  and has_table_privilege('authenticated', 'public.admin_event_watch_alerts', 'INSERT')
  and has_table_privilege('authenticated', 'public.admin_event_watch_alerts', 'UPDATE'),
  'authenticated role has only the required business operations'
);
select ok(
  not has_table_privilege('authenticated', 'public.admin_watch_sources', 'DELETE')
  and not has_table_privilege('authenticated', 'public.admin_watch_candidates', 'DELETE')
  and not has_table_privilege('authenticated', 'public.admin_event_watch_alerts', 'DELETE')
  and not has_table_privilege('authenticated', 'public.admin_watch_transitions', 'DELETE'),
  'authenticated role has no deletion privilege'
);
select ok(
  has_table_privilege('authenticated', 'public.admin_watch_transitions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.admin_watch_transitions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.admin_watch_transitions', 'UPDATE'),
  'transition journal is read-only to authenticated clients'
);
select ok(
  not has_function_privilege('anon', 'private.audit_admin_watch_workflow()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.audit_admin_watch_workflow()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.touch_admin_watch_source()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.touch_admin_watch_source()', 'EXECUTE'),
  'private trigger functions cannot be executed directly by clients'
);
select ok(
  (select p.prosecdef
     and array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
   from pg_proc p
   where p.oid = 'private.audit_admin_watch_workflow()'::regprocedure),
  'audit trigger is SECURITY DEFINER with an empty search path'
);
select ok(
  (select not p.prosecdef
     and array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
   from pg_proc p
   where p.oid = 'private.touch_admin_watch_source()'::regprocedure),
  'source touch trigger is SECURITY INVOKER with an empty search path'
);
select is(
  (select count(*)::bigint
   from pg_trigger
   where not tgisinternal
     and tgfoid in (
       'private.audit_admin_watch_workflow()'::regprocedure,
       'private.touch_admin_watch_source()'::regprocedure
     )),
  3::bigint,
  'exactly three private maintenance triggers exist'
);
select ok(
  not exists (
    select 1 from pg_trigger
    where not tgisinternal
      and tgrelid = 'public.events'::regclass
      and tgfoid in (
        'private.audit_admin_watch_workflow()'::regprocedure,
        'private.touch_admin_watch_source()'::regprocedure
      )
  ),
  'watch triggers never target events'
);

-- Local fixtures only. The enclosing transaction is rolled back by this test.
insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000501', 'watch-admin-test@example.invalid'),
  ('00000000-0000-4000-8000-000000000502', 'watch-user-test@example.invalid');

insert into public.admin_users (user_id, email)
values ('00000000-0000-4000-8000-000000000501', 'watch-admin-test@example.invalid');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.admin_watch_candidates),
  0::bigint,
  'authenticated non-admin cannot select business rows'
);
select throws_ok(
  $$insert into public.admin_watch_candidates (identity_key) values ('candidate:test:non-admin')$$,
  '42501',
  'new row violates row-level security policy for table "admin_watch_candidates"',
  'authenticated non-admin cannot insert'
);

reset role;
insert into public.admin_watch_candidates (identity_key, title)
values ('candidate:test:protected', 'Protected candidate');

set local role authenticated;
select lives_ok(
  $$update public.admin_watch_candidates set title = 'Forbidden' where identity_key = 'candidate:test:protected'$$,
  'authenticated non-admin update is safely filtered by RLS'
);

reset role;
select is(
  (select title from public.admin_watch_candidates where identity_key = 'candidate:test:protected'),
  'Protected candidate',
  'authenticated non-admin cannot change a business row'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.admin_watch_candidates),
  1::bigint,
  'authenticated admin can select business rows'
);
select lives_ok(
  $$insert into public.admin_watch_sources (canonical_url, url_hash, source_url)
    values ('https://example.invalid/', 'source:v1:test', 'https://example.invalid/')$$,
  'authenticated admin can insert a source'
);
select lives_ok(
  $$insert into public.admin_watch_candidates (identity_key, title)
    values ('candidate:test:audit', 'Audit candidate')$$,
  'authenticated admin can insert a candidate'
);
select lives_ok(
  $$insert into public.admin_event_watch_alerts (identity_key, field, detected_at)
    values ('event-watch:test:audit', 'title', now())$$,
  'authenticated admin can insert an Event Watch alert'
);

reset role;
select is(
  (select count(*) from public.admin_watch_transitions),
  0::bigint,
  'initial inserts create no invented transition'
);

set local role authenticated;
select lives_ok(
  $$update public.admin_watch_candidates
    set workflow_status = 'ready'
    where identity_key = 'candidate:test:audit'$$,
  'authenticated admin can update candidate workflow'
);
select lives_ok(
  $$update public.admin_event_watch_alerts
    set workflow_status = 'confirmed'
    where identity_key = 'event-watch:test:audit'$$,
  'authenticated admin can update alert workflow'
);
select lives_ok(
  $$update public.admin_watch_sources
    set title = 'Example source'
    where url_hash = 'source:v1:test'$$,
  'authenticated admin can update source metrics metadata'
);
select throws_ok(
  $$delete from public.admin_watch_candidates where identity_key = 'candidate:test:audit'$$,
  '42501',
  'permission denied for table admin_watch_candidates',
  'authenticated admin cannot delete a business row'
);
select throws_ok(
  $$insert into public.admin_watch_transitions (candidate_id, to_status)
    select id, 'handled' from public.admin_watch_candidates
    where identity_key = 'candidate:test:audit'$$,
  '42501',
  'permission denied for table admin_watch_transitions',
  'authenticated admin cannot write directly to transition journal'
);
select throws_ok(
  $$update public.admin_watch_sources
    set url_hash = 'source:v1:changed'
    where url_hash = 'source:v1:test'$$,
  'P0001',
  'url_hash is immutable',
  'source URL hash is immutable'
);
select throws_ok(
  $$update public.admin_watch_candidates
    set identity_key = 'candidate:test:changed'
    where identity_key = 'candidate:test:audit'$$,
  'P0001',
  'identity_key is immutable',
  'candidate identity key is immutable'
);
select is(
  (select count(*) from public.admin_watch_transitions),
  2::bigint,
  'authenticated admin can select the two trigger-created transitions'
);

reset role;
select is(
  (select count(*)
   from public.admin_watch_transitions t
   join public.admin_watch_candidates c on c.id = t.candidate_id
   where c.identity_key = 'candidate:test:audit'),
  1::bigint,
  'one candidate workflow update creates exactly one transition'
);
select is(
  (select t.from_status || '>' || t.to_status
   from public.admin_watch_transitions t
   join public.admin_watch_candidates c on c.id = t.candidate_id
   where c.identity_key = 'candidate:test:audit'),
  'review>ready',
  'candidate transition records correct from and to states'
);
select is(
  (select changed_by
   from public.admin_watch_transitions t
   join public.admin_watch_candidates c on c.id = t.candidate_id
   where c.identity_key = 'candidate:test:audit'),
  '00000000-0000-4000-8000-000000000501'::uuid,
  'transition records auth.uid as actor'
);
select is(
  (select version from public.admin_watch_candidates
   where identity_key = 'candidate:test:audit'),
  2::bigint,
  'candidate version increments once'
);
select is(
  (select status_updated_by from public.admin_watch_candidates
   where identity_key = 'candidate:test:audit'),
  '00000000-0000-4000-8000-000000000501'::uuid,
  'candidate status actor is forced from auth.uid'
);
select ok(
  (select updated_at = now() and status_updated_at = now()
   from public.admin_watch_candidates
   where identity_key = 'candidate:test:audit'),
  'candidate audit timestamps are maintained by the trigger'
);
select is(
  (select version from public.admin_event_watch_alerts
   where identity_key = 'event-watch:test:audit'),
  2::bigint,
  'alert version increments once'
);
select is(
  (select version from public.admin_watch_sources
   where url_hash = 'source:v1:test'),
  2::bigint,
  'source version increments without creating a transition'
);
select ok(
  (select updated_at = now()
   from public.admin_watch_sources
   where url_hash = 'source:v1:test'),
  'source updated_at is maintained by its dedicated trigger'
);

-- Anonymous execution is denied by grants before RLS is even considered.
set local role anon;
select throws_ok(
  $$select * from public.admin_watch_candidates$$,
  '42501',
  'permission denied for table admin_watch_candidates',
  'anonymous role cannot select'
);
select throws_ok(
  $$insert into public.admin_watch_candidates (identity_key) values ('candidate:test:anon')$$,
  '42501',
  'permission denied for table admin_watch_candidates',
  'anonymous role cannot insert'
);

reset role;
select * from finish();
rollback;
