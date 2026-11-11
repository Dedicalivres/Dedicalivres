# DD-ADMIN-V11-RELEASE-P0/P1 — qualification de PR #278

**État : PR en brouillon. Ne pas fusionner / déployer sans autorisation explicite.**
**Référence applicative qualifiée :** `44249bc78c974d43e80b794da71c48aa3ff26760` au 11/11/2026.
**Base de rebasage :** `main` au commit `53b2df05cdf718ab30b70dffbe5dd0bd42296ec8`.
**PR :** https://github.com/Dedicalivres/Dedicalivres/pull/278

## Portée

- `admin-context.js` : pagination événements/Communauté, contrôles d'exhaustivité, session JWT et révocations 401/403, requêtes tardives, rafraîchissement ciblé.
- `admin-shell.js` : boutons de pagination, invalidation du rendu Auteurs et tri optimisé sans recalcul répétitif.
- `admin.html` / `admin-v11.html` : contrôles et scripts reversionnés en conservant les fonctions Hotte.
- Quatre scripts de tests sécurité/navigation ajustés au chargement différé.
- `.github/workflows/admin-hotte-lab-ci.yml` : Admin complet sous WebKit simulé, 1280 et 390 px.
- **Exclu** : `admin-readonly-guard.js`, réservé au laboratoire local, jamais inclus au site publié.

## Preuves et nature de validation

| Vérification | Résultat | Niveau de preuve |
|---|---|---|
| VM synthétique 32/32, pagination 1200+, rendu et complétude | PASS | Tests fictifs sans réseau, issus du paquet P1 |
| Safari Mac local protégé | OK déclaré par l'utilisateur | Navigation observée avant les derniers ajustements JWT |
| Safari iPhone via kit de laboratoire Wi-Fi | OK déclaré par l'utilisateur le 11/11/2026 | Recette utilisateur, **pas de trace instrumentée reçue** |
| Admin Hotte Lab CI | PASS | https://github.com/Dedicalivres/Dedicalivres/actions/runs/42980151899 |
| Publication preflight CI | PASS | https://github.com/Dedicalivres/Dedicalivres/actions/runs/42980151926 |
| WebKit desktop/mobile simulé, authentification, CANARY, refus | PASS | Workflow Admin Hotte Lab CI, mock API, **pas un iPhone physique instrumenté** |
| Écritures sur PostgreSQL jetable : CANARY, quotas, publication, réservation, provenance | PASS | Tests serveur fictifs du workflow publication |
| Édition d'événement UI → backend réellement isolé et réversible | **NON TESTÉ** | Staging Supabase existant inactif ; ne pas utiliser la production |
| Révision statique RLS (sans écriture) | Conforme sur six tables concernées | Métadonnées du projet Supabase de production, consultation uniquement |

## Revue d'autorisation (lecture seule)

- RLS activée : `events`, `authors`, `event_authors_presence`, `testimonials`, `event_submission_contacts`, `admin_users`.
- `event_submission_contacts` : politique SELECT authentifiée avec `private.is_admin()`, jamais accès public direct.
- `admin_users` : SELECT limité à la ligne de `auth.uid()`.
- RPC de preuve CANARY examinées : EXECUTE interdit à `anon` ; définitions référencent `private.is_admin()` et `auth.uid()`. **Présence du contrôle statique, non équivalente à un test d'intrusion complet**.
- Les cas 401, 403, révocation, déconnexion, session expirée et réponses tardives sont couverts par tests GitHub.

### Avertissements de sécurité préexistants, hors périmètre de la PR

Le diagnostic Supabase du 11/11/2026 indique des WARN :
- Fonctions `SECURITY DEFINER` publiques : `nfc_resolve_tag`, `nfc_track_event`, `submit_event_with_contact` appelables par `anon`. Leur caractère public peut être intentionnel ; contrôler quotas/validation et risques d'abus avant tout changement.
- Plusieurs RPC CANARY `SECURITY DEFINER` appelables par `authenticated` : vérification d'autorisation présente dans les fonctions examinées, mais audits complets et essais adversariaux à maintenir.
- Extensions `pg_net` et `unaccent` dans le schéma `public`.
- Protection contre les mots de passe compromis désactivée.

Remédiations officielles :
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

**Ces avertissements ne sont pas introduits par la PR et ne justifient aucune modification de la production pendant sa qualification.** Leur priorité doit être revue séparément.

## Vérifications finales avant fusion

- [x] Quatre fichiers applicatifs présents sur la branche, garde local exclu.
- [x] Deux workflows GitHub PASS sur `44249bc`.
- [x] Session JWT, réponses tardives, 401/403, WebKit 390 px fictif validés.
- [x] Recette iPhone acceptée sur déclaration utilisateur (pas de mesures jointes).
- [x] Contrôle statique complémentaire des RLS de six tables et des RPC principales.
- [ ] Contre-revue **indépendante** du correctif, notamment droits, flux de session et conditions de déploiement.
- [ ] Écriture métier de bout en bout sur **base non productive**, preuve du résultat et du retour arrière ; tests PostgreSQL jetables existants ne remplacent pas ce parcours complet.
- [ ] Autorisation explicite du responsable Dédicalivres pour la fusion.

## Déploiement et retour arrière (à préparer séparément)

1. Geler le SHA et vérifier que `main` n'a pas avancé ; sinon requalifier l'écart.
2. Établir la liste des déploiements effectivement déclenchés par GitHub ; aucun auto-merge.
3. Avant toute mise en service, conserver les SHA de `main` et de la PR, et le dernier artefact de site réputé sain ; vérifier la possibilité de revenir au SHA précédent.
4. Sur validation autorisée, contrôler les écrans accueil/événements/auteurs/Communauté, le cycle de reconnexion et les données privées sans écriture destructive.
5. Si régression P0 : arrêter la publication du nouveau code et revenir à l'artefact précédent après contrôle des éventuelles opérations en cours ; ne jamais réinitialiser des données métier.

**Aucune fusion, aucune requête d'écriture Supabase, aucun déploiement Vercel ni modification du site public dans ce lot.**
