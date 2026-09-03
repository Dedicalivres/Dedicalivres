# NFC Analytics V1 — recette de validation staging

## Garde-fous

- Ne jamais utiliser la référence, l'URL ou le mot de passe du projet de production.
- La recette exige une base Supabase séparée et vide de données utilisateur.
- Aucun secret ne doit être ajouté au dépôt, à un commit ou à une capture d'écran.
- La V10 (`admin.html`) reste hors périmètre et la V11 reste en préactivation.

## Limite actuelle du dépôt

Le dossier `supabase/migrations/` ne constitue pas encore un historique initial
autosuffisant : ses premières migrations supposent que `public.events`,
`public.authors`, `private.is_admin()` et les rôles Supabase existent déjà.
Il ne faut donc pas annoncer qu'un `supabase db reset` reconstruit toute la base.

## Préparation d'un staging distant isolé

1. Créer une branche Supabase de prévisualisation ou un projet Supabase de test
   distinct. Ne pas cloner les données de production ; utiliser des données fictives.
2. Relever sa référence projet et confirmer visuellement qu'elle diffère de la
   production avant toute commande.
3. Appliquer d'abord le schéma de référence actuellement en production dans ce
   staging, puis seulement la migration :
   `supabase/migrations/20260903050044_nfc_analytics_cockpit_v1.sql`.
4. Exécuter `supabase/tests/nfc_analytics_cockpit_v1_test.sql` avec un compte SQL
   de staging. Le résultat attendu est `PASS nfc analytics staging SQL`.
5. Configurer une prévisualisation du front avec l'URL et la clé publique du
   staging. Ne jamais exposer la clé `service_role` dans le navigateur.

## Recette intégrée V11

1. Ouvrir `admin-v11.html`, s'authentifier avec un administrateur fictif et ouvrir
   **NFC & analytics**.
2. Créer un code inactif. Vérifier que `/nfc/?tag=CODE` le refuse.
3. Passer le code à `TESTED`, puis l'activer explicitement.
4. Scanner le lien depuis un téléphone et parcourir le Passage jusqu'au site.
5. Vérifier dans la V11 : un scan, l'engagement, l'intention, l'arrivée et, après
   une action reconnue, l'activation.
6. Vérifier les filtres 7/30/90 jours et les filtres support, campagne, partenaire,
   événement et code.
7. Désactiver le code et vérifier qu'un nouveau scan est refusé.
8. Contrôler qu'un visiteur anonyme ne peut ni lire ni écrire directement dans
   `nfc_tags`, `nfc_sessions` ou `nfc_events`.

## Critères de sortie

- Tous les tests automatiques et la recette intégrée sont PASS.
- Aucun appel du navigateur n'utilise une clé privilégiée.
- La migration n'a touché que le staging.
- Un export de contrôle et le nombre de lignes des trois tables sont conservés.
- Le rollback fonctionnel (désactivation de tous les codes) a été testé.

## Nettoyage et coûts

Après validation, supprimer la branche de prévisualisation ou mettre en pause le
projet de test selon l'offre utilisée. Avant suppression, exporter uniquement les
données fictives utiles à la preuve de recette. Aucun environnement temporaire ne
doit rester actif par défaut.
