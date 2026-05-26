# Securite Dedicalivres

## Regles de base

- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` dans le front.
- La cle publique Supabase est acceptable cote navigateur uniquement si les policies RLS sont strictes.
- Toute moderation doit passer par `private.is_admin()` cote Supabase, pas seulement par l'affichage admin.
- Les endpoints publics doivent accepter uniquement des contenus en attente.

## Donnees sensibles

Contiennent des donnees personnelles ou semi-personnelles:

- `newsletter_subscribers.email`
- `testimonials.email`
- `site_visits.user_agent`
- `event_visits.user_agent`
- `location_tracking.lat`, `location_tracking.lng`, `user_agent`

Ces tables ne doivent pas etre lisibles publiquement.

## Uploads

Le Worker d'upload R2 doit verifier:

- methode `POST` uniquement;
- origine autorisee;
- taille maximale;
- type MIME reel;
- extensions autorisees;
- dossier autorise (`event-images`, `testimonial-images`);
- nom de fichier aleatoire;
- rate-limit;
- suppression ou neutralisation des metadonnees EXIF.

## En-tetes HTTP

Le fichier `_headers` ajoute une CSP et des protections navigateur. Si une fonctionnalite cesse de charger apres deploiement, commencer par tester la CSP en mode report-only sur l'hebergeur, puis resserrer progressivement.

## Verification avant mise en ligne

```bash
npm run check
```

Puis verifier dans Supabase:

- RLS active sur toutes les tables publiques;
- aucune policy `authenticated using (true)` sur les tables admin;
- un seul utilisateur admin dans `public.admin_users` au depart;
- les buckets Storage ne sont pas ouverts en ecriture publique si R2 est actif.
