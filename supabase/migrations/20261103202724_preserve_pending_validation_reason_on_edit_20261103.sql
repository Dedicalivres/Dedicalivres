-- Dédicalivres: keep an initial publication as `validation` while a validated
-- event is edited before publication. Applied to Supabase 2026-11-03 (version
-- 20261103202724). Git sync only; the remote migration is already recorded.
-- No event or queued job is altered by this schema migration.
-- Fails closed if the installed trigger differs from the expected predecessor.

DO $patch$
DECLARE
  current_definition text;
  old_fragment constant text := E'      reason =\n        excluded.reason,';
  new_fragment constant text := E'      -- Editing an approved event before its first static publication\n'
    || E'      -- must not transform its pending creation into an update.\n'
    || E'      reason =\n'
    || E'        CASE\n'
    || E'          WHEN public.event_publication_jobs.reason = ''validation''\n'
    || E'           AND excluded.reason = ''edit''\n'
    || E'          THEN ''validation''\n'
    || E'          ELSE excluded.reason\n'
    || E'        END,';
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_publication_jobs WHERE status='RUNNING') THEN
    RAISE EXCEPTION 'PUBLICATION_QUEUE_MIGRATION_RUNNING';
  END IF;
  SELECT pg_get_functiondef('private.queue_event_publication_job()'::regprocedure)
    INTO current_definition;
  IF current_definition IS NULL OR current_definition NOT LIKE '%SECURITY DEFINER%'
    OR current_definition NOT LIKE '%on conflict (event_id)%' THEN
    RAISE EXCEPTION 'PUBLICATION_QUEUE_MIGRATION_UNEXPECTED_FUNCTION';
  END IF;
  IF position('WHEN public.event_publication_jobs.reason = ''validation''' IN current_definition)>0 THEN
    -- Already applied on production; replay is idempotent.
    RETURN;
  END IF;
  IF length(current_definition)-length(replace(current_definition,old_fragment,''))
    IS DISTINCT FROM length(old_fragment) THEN
    RAISE EXCEPTION 'PUBLICATION_QUEUE_MIGRATION_UNEXPECTED_PREDECESSOR';
  END IF;
  EXECUTE replace(current_definition,old_fragment,new_fragment);
  IF pg_get_functiondef('private.queue_event_publication_job()'::regprocedure)
     NOT LIKE '%WHEN public.event_publication_jobs.reason = ''validation''%' THEN
    RAISE EXCEPTION 'PUBLICATION_QUEUE_MIGRATION_VERIFICATION_FAILED';
  END IF;
END $patch$;
