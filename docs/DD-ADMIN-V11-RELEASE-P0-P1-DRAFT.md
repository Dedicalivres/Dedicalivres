# DD-ADMIN-V11-RELEASE-P0/P1 — qualification de PR #278

**État : PR en brouillon. Ne pas fusionner / déployer sans autorisation explicite.**
**Référence applicative testée :** `2c6f8dd4a9d0a3409bf2b5aa8b1435730c95293f` au 11/11/2026. CI Hotte/écriture et publication : PASS.
**Base de rebasage :** `main` au commit `53b2df05cdf718ab30b70dffbe5dd0bd42296ec8`.
**PR :** https://github.com/Dedicalivres/Dedicalivres/pull/278

## Portée

- `admin-context.js` : pagination événements/Communauté, contrôles d'exhaustivité, session JWT et révocations 401/403, requêtes tardives, rafraîchissement ciblé.
- `admin-shell.js` : pagination, invalidation Auteurs, tri optimisé et **confirmation obligatoire du retour d'ID après chaque UPDATE événement** (édition, validation, mise en avant, édition de repli). Évite les faux succès lorsque RLS interdit ou ne trouve aucune ligne.
- `admin.html` / `admin-v11.html` : contrôles et scripts reversionnés en conservant les fonctions Hotte.
- Quatre scripts de tests sécurité/navigation ajustés au chargement différé.
- `.github/workflows/admin-hotte-lab-ci.yml` : Admin sous WebKit simulé à 1280/390 px et test supplémentaire formulaire réel → API locale fictive → PostgreSQL 17 jetable avec RLS.
- **Exclu** : `admin-readonly-guard.js`, réservé au laboratoire local, jamais inclus au site publié.

## Preuves et nature de validation

| Vérification | Résultat | Niveau de preuve |
|---|---|---|
| VM synthétique 32/32, pagination 1200+, rendu et complétude | PASS | Tests fictifs sans réseau, issus du paquet P1 |
| Safari Mac local protégé | OK déclaré par l'utilisateur | Navigation observée avant les derniers ajustements JWT |
| Safari iPhone via kit de laboratoire Wi-Fi | OK déclaré par l'utilisateur le 11/11/2026 | Recette utilisateur, **pas de trace instrumentée reçue** |
| Admin Hotte Lab CI | PASS sur candidat `2c6f8dd` | https://github.com/Dedicalivres/Dedicalivres/actions/runs/42986687748 |
| Publication preflight CI | PASS sur candidat `2c6f8dd` | https://github.com/Dedicalivres/Dedicalivres/actions/runs/42986687604 |
| WebKit desktop/mobile simulé, authentification, CANARY, refus | PASS | Workflow Admin Hotte Lab CI, mock API, **pas un iPhone physique instrumenté** |
| Écritures sur PostgreSQL jetable : CANARY, quotas, publication, réservation, provenance | PASS | Tests serveur fictifs du workflow publication |
| Édition événement depuis le formulaire Admin → HTTP local → PostgreSQL 17 jetable avec RLS → relecture ciblée → restauration | **PASS** | https://github.com/Dedicalivres/Dedicalivres/actions/runs/42986687748 ; 3 tentatives, 2 confirmées et 1 refusée par RLS, état final identique |
| Révision statique RLS (sans écriture) | Conforme sur six tables concernées | Métadonnées du projet Supabase de production, consultation uniquement |


### Portée précise du test PostgreSQL de la PR

- Le formulaire HTML et le code `admin-shell.js`/ `admin-context.js` sont authentiques ; seules l'authentification et l'API Supabase sont simulées.
- L'API fictive exécute les vraies requêtes sur un PostgreSQL 17 **local jetable**, avec rôles et politiques RLS analogues aux tables concernées. Elle ne reproduit pas tout le schéma SQL de Dédicalivres ni les jobs de publication de production.
- Une écriture valide met à jour la base et l'Admin sans rechargement général ; le retrait des droits laisse zéro ligne modifiée et provoque un message d'erreur ; une seconde écriture autorisée restaure la ligne initiale.
- Les preuves JSON et journaux du workflow sont conservés dans l'artefact GitHub `admin-v11-event-write-disposable-pg` ; le conteneur PostgreSQL est détruit après le test.
- Ce test ne justifie **aucune écriture sur Supabase V2** et ne constitue pas une contre-revue indépendante.

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
- [x] Deux workflows GitHub PASS sur `2c6f8dd`, incluant PostgreSQL jetable et refus RLS.
- [x] Session JWT, réponses tardives, 401/403, WebKit 390 px fictif validés.
- [x] Recette iPhone acceptée sur déclaration utilisateur (pas de mesures jointes).
- [x] Contrôle statique complémentaire des RLS de six tables et des RPC principales.
- [ ] Contre-revue **indépendante** du correctif, notamment droits, flux de session et conditions de déploiement. Aucun reviewer distinct n'a encore remis d'avis GitHub.
- [x] Écriture métier de bout en bout sur **PostgreSQL jetable**, refus RLS et retour arrière vérifiés, sans réseau extérieur.
- [ ] Équivalence complète au vrai schéma de staging Supabase et aux vrais déclencheurs métier : **non démontrée** (staging inactif). Non nécessaire pour les tests isolés, mais à qualifier lors d'un déploiement futur.
- [ ] Autorisation explicite du responsable Dédicalivres pour la fusion.

## Déploiement et retour arrière (à préparer séparément)

1. Geler le SHA et vérifier que `main` n'a pas avancé ; sinon requalifier l'écart.
2. Établir la liste des déploiements effectivement déclenchés par GitHub ; aucun auto-merge.
3. Avant toute mise en service, conserver les SHA de `main` et de la PR, et le dernier artefact de site réputé sain ; vérifier la possibilité de revenir au SHA précédent.
4. Sur validation autorisée, contrôler les écrans accueil/événements/auteurs/Communauté, le cycle de reconnexion et les données privées sans écriture destructive.
5. Si régression P0 : arrêter la publication du nouveau code et revenir à l'artefact précédent après contrôle des éventuelles opérations en cours ; ne jamais réinitialiser des données métier.

**Aucune fusion, aucune requête d'écriture Supabase, aucun déploiement Vercel ni modification du site public dans ce lot.**
