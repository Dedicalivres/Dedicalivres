revoke all privileges on table public.site_visits from anon;
grant insert (page, path, referrer, user_agent, visitor_key) on table public.site_visits to anon;

revoke all privileges on table public.event_visits from anon;
grant insert (event_id, path, referrer, user_agent, visitor_key) on table public.event_visits to anon;;
