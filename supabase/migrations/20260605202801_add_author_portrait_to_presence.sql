alter table public.event_authors_presence
  add column if not exists author_portrait_url text,
  add column if not exists author_portrait_storage_key text,
  add column if not exists author_identity_key text;

comment on column public.event_authors_presence.author_portrait_url is 'V2 auteurs : portrait optionnel transmis par l’auteur et stocké dans R2.';
comment on column public.event_authors_presence.author_portrait_storage_key is 'V2 auteurs : chemin ou clé R2 du portrait si disponible.';
comment on column public.event_authors_presence.author_identity_key is 'V2 auteurs : clé normalisée issue du nom, prénom ou pseudonyme pour faciliter le rapprochement futur.';;
