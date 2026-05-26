# Audit Supabase en lecture seule

Date: 2026-05-25  
Projet audite via MCP Supabase, sans modification directe de la base.

## Etat global

- Tables publiques detectees: `events`, `authors`, `event_authors_presence`, `testimonials`, `newsletter_subscribers`, `site_visits`, `event_visits`, `location_tracking`, `visits`, `admin_users`.
- RLS: active sur toutes les tables publiques auditees.
- Edge Functions: aucune fonction deployee.
- Migrations Supabase: aucune migration listee.
- Storage: deux buckets publics, `event-images` et `testimonial-images`.

## Points positifs

- Les contenus publics principaux sont proteges par RLS.
- Les evenements publics visibles sont limites a `validated = true` et `rejected = false`.
- Les soumissions publiques d'evenements, temoignages et presences auteurs sont forcees en attente via `validated = false`.
- Les tables sensibles ne sont pas lisibles publiquement d'apres les policies observees: newsletter, visites, tracking localisation.
- Un compte admin est deja reference dans `public.admin_users`.

## Risques observes

### Priorite haute

1. Les buckets publics permettent l'upload public sans limite MIME/taille configuree.
   - Buckets concernes: `event-images`, `testimonial-images`.
   - Impact: risque d'upload de fichiers trop lourds ou de formats inattendus si le fallback Supabase Storage est utilise.
   - Correction preparee: limites `image/jpeg`, `image/png`, `image/webp`, taille max 3 Mo, policies d'upload restreintes.

2. Les policies Storage SELECT permettent de lister les fichiers.
   - Supabase signale que les buckets publics n'ont pas besoin d'une policy SELECT large pour servir une URL publique.
   - Impact: exposition inutile de l'inventaire des fichiers.
   - Correction preparee: suppression des policies SELECT larges, conservation des buckets publics pour l'affichage des images.

3. Le script `SUPABASE_SECURITY_HARDENING.sql` local etait desynchronise avec les policies reelles.
   - Impact: une execution telle quelle pouvait ajouter des policies en double.
   - Correction faite localement: le fichier a ete recale pour supprimer les anciens noms de policies avant recreation.

### Priorite moyenne

4. `public.is_admin()` est une fonction `SECURITY DEFINER` exposee en schema public.
   - Supabase signale l'execution possible via `/rest/v1/rpc/is_admin`.
   - Impact reel limite car la fonction retourne seulement si l'utilisateur courant est admin, mais c'est une surface inutile.
   - Correction preparee: nouveau helper `private.is_admin()`, policies admin recalees dessus, revoke execute sur `public.is_admin()`.

5. Plusieurs policies publiques utilisent `WITH CHECK true`.
   - Tables concernees: `site_visits`, `event_visits`, `location_tracking`, `newsletter_subscribers`, `visits`.
   - Impact: les insertions publiques sont trop peu contraintes.
   - Correction preparee: checks minimum sur `path`, `event_id`, email et coordonnees.

6. `admin_users` a RLS active mais aucune policy.
   - Impact faible car la fonction admin peut fonctionner en `SECURITY DEFINER`, mais Supabase le signale.
   - Correction preparee: policy de lecture de sa propre ligne admin.

7. `public.set_updated_at()` n'a pas de `search_path` fixe.
   - Impact: risque classique sur les fonctions SQL/PLpgSQL si le chemin de recherche est mutable.
   - Correction preparee: `alter function ... set search_path = public`.

### Priorite basse

8. L'extension `unaccent` est installee dans `public`.
   - Impact faible pour ce projet, aucune utilisation directe n'a ete trouvee dans les fichiers locaux.
   - Correction non appliquee automatiquement: deplacement possible vers `extensions` apres verification.

9. Plusieurs index sont signales comme inutilises.
   - Tables concernees notamment: `event_authors_presence`, `authors`, `visits`.
   - Impact: leger cout d'ecriture et de stockage.
   - Action conseillee: attendre plus de trafic avant suppression, car un index "unused" peut simplement manquer d'historique.

## Reprise conseillee

1. Faire ou verifier une sauvegarde complete Supabase.
2. Relire `SUPABASE_SECURITY_HARDENING.sql`.
3. Executer le script sur une branche Supabase si disponible, sinon sur production uniquement apres backup.
4. Relancer les advisors Supabase.
5. Tester:
   - lecture publique des evenements;
   - soumission evenement public;
   - inscription newsletter;
   - soumission temoignage avec et sans image;
   - connexion admin;
   - validation/modification/suppression admin;
   - statistiques admin;
   - upload image admin.

## Important

Aucune modification n'a ete appliquee a Supabase pendant cet audit. Les changements effectues sont uniquement locaux dans les fichiers SQL/documentation du projet.
