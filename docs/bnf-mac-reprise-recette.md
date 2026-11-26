# FRONT-AUTEURS-BNF-03 — Reprise Mac / recette locale
26 novembre 2026. PR [#295](https://github.com/Dedicalivres/Dedicalivres/pull/295), branche `feature/front-auteurs-bnf-consolidation-20261125`.
Ne pas utiliser Codex, fusionner, déployer, écrire dans Supabase réel ou modifier ses RLS existantes.

## Lots préparés
- Connecteur SRU lecture seule, pagination, instantanés locaux : CI du commit 308916835d33475c42045310d757b78eef7f2d8d : 4/4 réussies. Réseau réel non qualifié.
- Galerie publique optionnelle et conflits d'autorités : CI réussie au même commit. Aucune activation publique.
- Brouillons de décisions et prototype Admin V11 : tests CI réussis ; navigateur et intégration réelle non qualifiés.
- Journal privé : `docs/bnf-review-history-draft.sql` et `docs/bnf-review-history-local-test.sql`. Brouillons non exécutés. Aucun rôle applicatif autorisé, aucun accès public, pas de migration automatique. Vérifier types/FK, schéma exposé, auth et identité des auteurs en local avant de générer une vraie migration.

## Ordre de recette Mac
1. Vérifier les modifications locales et récupérer la branche sans écraser de travail concurrent. Noter le HEAD et vérifier les CI de ce HEAD. Travailler sur une copie isolée.
2. Dans une copie Git isolée, propre et sans dossier `bnf-preview-artifact` existant, avec Node 22, Python 3 et Git, lancer `node scripts/recipe-bnf-local.mjs`. Le lanceur regroupe les neuf commandes ci-dessous, conserve un rapport JSON et les logs dans un répertoire temporaire annoncé, et vérifie l'absence de changements suivis. Il ne lance ni SQL, ni requête SRU réelle. Les tests existants utilisent des données fictives et des réponses réseau simulées ; ce lanceur n'est pas un sandbox réseau. Le verdict concerne seulement les fixtures. Pour une reprise manuelle :
```sh
node scripts/test-author-public-features.mjs
node scripts/test-author-bnf-cache-policy.mjs
node --test scripts/test-author-bnf-reviewed-gallery.mjs
node --test scripts/test-author-bnf-admin-review-draft.mjs
python3 scripts/test_preview_bnf_author.py
node --test scripts/test-author-presences-live.mjs
node scripts/test-author-seo-pages.mjs
node scripts/preview-author-bnf-gallery.mjs
node scripts/preview-author-bnf-admin.mjs
```
3. Ouvrir les HTML générés dans Safari Mac/iPhone. Tester la sélection, les trois orientations, l'absence de preuve, les erreurs, le défilement, les cartes existantes et l'absence de fuite. Aucun résultat fictif publié.
4. Qualifier l'API réelle en lecture seule :
```sh
python3 scripts/preview_bnf_author.py --authority 11918746 --start 1
python3 scripts/preview_bnf_author.py --authority 11918746 --start 21
python3 scripts/preview_bnf_author.py --name "Katell Poquet"
```
Vérifier les notices dans le catalogue, le rôle d'auteur, les totaux, la pagination, les homonymes et les erreurs. Aucun résultat n'est une décision humaine. Pour le cache, utiliser un répertoire privé extérieur au dépôt et au site avec `--cache-dir`, puis `--cache-only`. Vérifier la fraîcheur et la conservation en cas de panne.
5. Journal : créer une base Supabase locale jetable, non liée à un projet distant. Confirmer la cible loopback, le nom de la base et le rôle local avant toute commande SQL. Vérifier le type UUID des identifiants auteurs et les règles de fusion/suppression ; confirmer que le nouveau schéma ne figure pas parmi les schémas Data API exposés. Exécuter uniquement sur cette base les deux fichiers SQL, dans cet ordre, avec psql et ON_ERROR_STOP=1. Le second fichier effectue un rollback des données de test. Le brouillon n'est pas une migration prête à appliquer. Ne pas utiliser de push distant. Réaliser les tests d'accès effectifs par rôle et de concurrence avant de créer une migration locale via Supabase CLI.
6. Raccordement restant : backend authentifié, contrôle admin en serveur, preuve liée à la source rechargée, révision attendue, transaction de lot atomique, lecture de l'historique et séparation entre approbation et publication. Puis intégrer l'interface dans Communauté > Auteurs > Préparation éditoriale. Pas de RLS existante modifiée. Ce raccordement reste à développer et tester.

## GO / NO-GO
GO recette locale isolée après contrôle du HEAD. NO-GO fusion et production. Droits des couvertures non qualifiés, cadre graphique à revoir plus tard. Recette Safari, API SRU réelle et persistance serveur non terminées.
Retour arrière : conserver les commits dans la PR brouillon et révoquer uniquement les commits concernés sur branche isolée si nécessaire. Base de recette jetable : ne jamais supprimer de schéma ou de données en production.
