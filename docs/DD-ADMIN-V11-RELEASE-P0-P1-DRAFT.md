# DD-ADMIN-V11-RELEASE-P0/P1 — suivi de PR brouillon

**État : brouillon non fusionnable.** La branche prépare une livraison contrôlée de l'Admin V11 ; aucune modification de Supabase, de données métier ou de production n'est autorisée.

## Corrections prévues dans la PR

- `admin-context.js` : pagination exhaustive des événements et des listes Communauté, contrôle des totaux, invalidation sûre des requêtes tardives.
- `admin-shell.js` : rafraîchissement ciblé après modification, navigation et pagination, calcul des auteurs mémoïsé pendant un rendu, invalidation quand le catalogue change.
- `admin.html` et `admin-v11.html` : commandes de pagination et versionnement des scripts, en préservant les modules Hotte et l'authentification.
- Ne **jamais** ajouter `admin-readonly-guard.js` à ces pages : ce script est réservé au laboratoire Safari.

## Preuves déjà fournies, hors GitHub

- 32/32 tests d'intégration synthétiques (VM sans réseau).
- Tests complémentaires de rendu et de calcul de complétude.
- Rebasage de quatre fichiers sur le commit `53b2df05cdf718ab30b70dffbe5dd0bd42296ec8` vérifié sur copie temporaire.
- Navigation Safari Mac fluide, vérifiée par l'utilisateur sur la copie locale finale.

## Blocages de fusion / déploiement

- [ ] Les **quatre fichiers candidats** ont été effectivement ajoutés à cette branche et le diff complet revu (cette première révision du brouillon ne contient que le suivi).
- [ ] Les tests sont rejoués sur la branche réelle.
- [ ] Les contrôles de sécurité de session, 401/403 et fuite de données sont validés.
- [ ] Recette iPhone / WebKit mobile de la version candidate en environnement isolé.
- [ ] Recette des écritures métier sur préproduction fictive uniquement.
- [ ] Revue indépendante et autorisation humaine explicite avant toute fusion.
- [ ] Vérifier les éventuels workflows de déploiement associés à la branche et au PR.

**Ne pas fusionner, ne pas déployer, ne pas faire d'action de gestion sur les données réelles.**
