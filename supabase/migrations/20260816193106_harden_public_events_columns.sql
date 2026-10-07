revoke select on table public.events from anon;
grant select (
  id,title,type,region,city,start_date,end_date,description,image_url,website,price,
  lat,lng,validated,created_at,featured,rejected,updated_at,verified,country_code,
  registration_enabled,registration_open_date,registration_deadline,registration_url,
  registration_audience,registration_note,registration_force_status
) on table public.events to anon;

revoke insert on table public.events from anon;
grant insert (
  id,title,type,region,city,start_date,end_date,description,image_url,website,price,
  lat,lng,validated,featured,rejected,verified,country_code,
  registration_enabled,registration_open_date,registration_deadline,registration_url,
  registration_audience,registration_note,registration_force_status
) on table public.events to anon;;
