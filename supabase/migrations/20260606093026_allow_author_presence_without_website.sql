alter table public.event_authors_presence
  alter column website drop not null;

comment on column public.event_authors_presence.website
  is 'Champ historique de lien auteur. Peut être nul depuis les portraits auteurs V2 ; utiliser author_profile_url lorsque disponible.';;
