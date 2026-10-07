-- Align repository migration history with the privilege hardening
-- already applied in production for event_publication_jobs.
--
-- Authenticated users may inspect publication jobs through the existing
-- RLS policy, but must not insert, update, or delete them directly.

revoke all on public.event_publication_jobs from authenticated;
grant select on public.event_publication_jobs to authenticated;
