# Changements Supabase appliques

Date: 2026-05-25  
Projet: `pwyetrqyiaxpzjrafpvb` / Dedicalivres v2

## Backup utilise avant modification

Backup local verifie:

```text
/Users/jeanchristopheleguilly/SupabaseBackups/dedicalivres/2026-05-25_21-24-15
```

Checksums verifies:

```text
roles.sql: OK
schema.sql: OK
data.sql: OK
metadata.txt: OK
```

Backup Dashboard: non disponible sur le plan Free.

## Migrations appliquees

```text
20260525193535 dedicalivres_rls_storage_hardening_20260525_v2
20260525193720 dedicalivres_admin_users_rls_perf_20260525
```

## Changements principaux

- Creation du schema `private`.
- Creation de `private.is_admin()` pour sortir le helper admin du schema API public.
- Retrait de l'execution publique de `public.is_admin()`.
- Refonte des policies RLS sur:
  - `events`
  - `event_authors_presence`
  - `authors`
  - `testimonials`
  - `newsletter_subscribers`
  - `site_visits`
  - `event_visits`
  - `location_tracking`
  - `visits`
  - `admin_users`
- Durcissement Storage:
  - buckets `event-images` et `testimonial-images` limites a 3 Mo;
  - MIME autorises: `image/jpeg`, `image/png`, `image/webp`;
  - suppression des policies SELECT larges qui permettaient de lister les fichiers;
  - upload public limite aux extensions image attendues;
  - gestion complete reservee aux admins.

## Verifications effectuees

Lecture publique simulee en role `anon`:

```text
events visibles: 60
testimonials visibles: 2
presences auteurs visibles: 26
authors visibles: 1
```

Buckets verifies:

```text
event-images: public=true, file_size_limit=3145728
testimonial-images: public=true, file_size_limit=3145728
```

Permissions fonctions:

```text
public.is_admin(): anon=false, authenticated=false
private.is_admin(): anon=false, authenticated=true
```

## Advisors apres application

Alertes de securite restantes:

- `unaccent` est encore installee dans le schema `public`.
- Protection contre les mots de passe compromis desactivee dans Supabase Auth.

Alertes performance restantes:

- Index signales comme inutilises sur `event_authors_presence`, `authors`, `visits`.

Ces alertes restantes n'ont pas ete corrigees immediatement car elles ne bloquent pas le durcissement principal et peuvent etre traitees separement.

## Tests manuels a faire

- Ouvrir le site public et verifier que les evenements s'affichent.
- Tester une inscription newsletter.
- Tester une soumission d'evenement sans image.
- Tester une soumission de temoignage avec/sans image.
- Se connecter a l'admin.
- Verifier les compteurs admin.
- Modifier/valider un evenement.
- Tester un upload image admin.

## Tests techniques effectues apres application

Tests locaux:

```text
npm run check: OK
node --check sur scripts principaux: OK
7 pages cles verifiees, 36 references locales presentes
```

Le lancement d'un serveur statique local depuis la session Codex a ete bloque par le sandbox, donc le test navigateur local reste a faire manuellement.

Tests Supabase en transaction annulee:

```text
Soumission anon evenement: OK, rollback
Soumission anon newsletter: OK, rollback
Soumission anon temoignage: OK, rollback
Soumission anon presence auteur: OK, rollback
Insertion anon site_visits/event_visits/location_tracking/visits: OK, rollback
```

Verification qu'aucune donnee de test n'a ete conservee:

```text
rollback_events: 0
rollback_newsletter: 0
rollback_testimonials: 0
rollback_author_presences: 0
rollback_site_visits: 0
rollback_event_visits: 0
rollback_location_tracking: 0
rollback_legacy_visits: 0
```

Verification lecture publique:

```text
newsletter_subscribers visible par anon: 0
site_visits visible par anon: 0
event_visits visible par anon: 0
location_tracking visible par anon: 0
visits visible par anon: 0
admin_users visible par anon: 0
storage.objects listable par anon: 0
```

Simulation admin:

```text
private.is_admin(): true avec le user admin existant
events lisibles par admin: 60
newsletter_subscribers lisibles par admin: 15
site_visits lisibles par admin: 1241
location_tracking lisibles par admin: 12
testimonials lisibles par admin: 2
```
