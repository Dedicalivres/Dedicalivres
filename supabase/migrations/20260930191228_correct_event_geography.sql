-- Data-only correction. No schema, RLS, storage or event deletion change.
-- Every update is restricted to a reviewed event ID.

update public.events
set region = 'Centre-Val de Loire'
where id = '18a26cb3-ee56-47b5-9519-ef530ce3faf6'
  and country_code = 'FR';

update public.events
set city = 'Mâcon',
    region = 'Bourgogne-Franche-Comté',
    lat = null,
    lng = null
where id = '5ec59d7a-5ee8-4fe6-a4a3-bb99330877a9'
  and country_code = 'FR';

update public.events
set region = 'Centre-Val de Loire'
where id = '6c2b8a95-1d9a-477e-af6c-5d445a379f80'
  and country_code = 'FR';

update public.events
set region = 'Grand Est'
where id = 'a1bb4d6e-81a0-4619-a037-5a7962d81146'
  and country_code = 'FR';

update public.events
set country_code = 'CH',
    region = 'Valais'
where id = 'c1e5f65f-1902-4d8f-967d-373218c4b7fa';

update public.events
set region = 'Bruxelles-Capitale'
where id in (
  '1fb9347c-7fb1-4734-8cea-a37c178a1dbe',
  'a9e84fea-5b7d-4f0f-8f80-ef1b98db8f27',
  'f55bec3f-3ae5-4488-83a4-cfe50e3448a5'
)
  and country_code = 'BE';

update public.events
set city = 'Contern',
    region = 'Luxembourg',
    country_code = 'LU',
    lat = 49.5858294,
    lng = 6.2262883
where id = 'c55d3cad-5be3-48d5-a6ae-39e038ca6fef';

update public.events
set city = 'Bulle'
where id = 'e45c488f-0aff-42f7-9de5-e0a2c62b4b8d'
  and country_code = 'CH'
  and region = 'Fribourg';

-- Rejected records remain rejected; only their geography is made coherent.
update public.events
set country_code = 'CH',
    region = 'Fribourg'
where id = 'e98a8bf5-4a70-452d-bfa4-0d905e7ca530';

update public.events
set region = 'Auvergne-Rhône-Alpes'
where id = '4821acd4-caad-4e61-9d2e-730887e6a60e'
  and country_code = 'FR';
