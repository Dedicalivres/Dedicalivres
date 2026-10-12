# P0-C1 — régularisation administrative préparée, non exécutée

Cette PR ne modifie aucun job. Exécution future uniquement sur autorisation explicite, après renouvellement de tous les précontrôles. Ne pas utiliser `recover_failed_p0`, `success()` ni un workflow de publication.

## Preuves au 2026-10-12

- `main` : `e72cd2973c9666013c4e3e30f166da44f4822881`.
- Publication : `cd2817bb4b845f5ce3bc8d70075cff9abf905b8f` ; [Pages #38208721209](https://github.com/Dedicalivres/Dedicalivres/actions/runs/38208721209) `SUCCESS`. [Pages #38268588908](https://github.com/Dedicalivres/Dedicalivres/actions/runs/38268588908) `SUCCESS` pour la PR #211.
- Seclin `14b81335-1dab-4f6d-9667-5e88675c6f98` : `validated=true`, `rejected=false`, présent dans `sitemap-evenements.xml` et la carte canonique. Job `21d2d1eb-5b65-46e3-9624-0e877df1702d` : `validation`, `FAILED`, 4 tentatives.
- Pascal `c69b157c-bf2f-4ddf-affa-a57497d261c2` : `validated=false`, `rejected=true`, absent du sitemap et de la carte. Job `c098bfc8-4482-4452-857d-d9227b422a41` : `unpublish`, `FAILED`, 4 tentatives.
- Les deux jobs ont `batch_id=NULL`, `commit_sha=NULL`, `last_error='GitHub Actions publication failed | GitHub Actions publication failed'` ; aucun job `RUNNING` lié. `PUBLICATION_AUTOMATION_ENABLED=false`.

## Exécution future (non autorisée par cette PR)

1. Vérifier à nouveau les deux fiches publiques, sitemap, carte canonique, commit, Pages, variable d'automatisation et états Supabase ; arrêter à la moindre dérive. Ne pas se fier seulement à cette preuve datée.
2. Exécuter `scripts/p0c1-verify-historical-jobs.sql` en lecture seule ; exiger `ready=true` et les deux bons identifiants.
3. Après une **nouvelle autorisation explicite**, utiliser `psql -X -v ON_ERROR_STOP=1 -v deployment_evidence='38208721209:cd2817bb4b845f5ce3bc8d70075cff9abf905b8f' -f scripts/p0c1-reconcile-historical-jobs.sql` via une connexion d'administration contrôlée. Ne jamais lancer depuis un workflow automatique.
4. Vérifier les deux `SUCCESS`, `commit_sha` exact, `attempt_count=4`, tous les autres champs inchangés, absence de troisième job modifié. Archiver la sortie de commande et les preuves Pages avec la date, l'identité de l'opérateur et l'autorisation dans un ticket d'audit durable. Cette PR ne prétend pas que l'opération a déjà eu lieu.

Rapport d'audit à remplir **après** l'autorisation et l'exécution :

| Champ | Valeur à consigner |
| --- | --- |
| Opérateur, autorisation, date UTC | À compléter |
| Job Seclin / état avant → après | `21d2d1eb-5b65-46e3-9624-0e877df1702d` / `FAILED` → `SUCCESS` |
| Job Pascal / état avant → après | `c098bfc8-4482-4452-857d-d9227b422a41` / `FAILED` → `SUCCESS` |
| Commit / Pages | `cd2817bb4b845f5ce3bc8d70075cff9abf905b8f` / `38208721209` |
| Motif | Publication déjà déployée ; échec historique du workflow antérieur |
| Champs modifiés | `status`, `commit_sha` uniquement |
| Champs préservés | `attempt_count`, `last_error`, `started_at`, `finished_at`, `requested_at`, `batch_id` et tous les autres |
| Contrôles après exécution | Deux lignes exactes ; pages/sitemap/carte ; aucun job tiers ; automatisation `false` |
| Sortie et horodatage de la transaction | À joindre au ticket |
| Retour arrière | Conditionnel, comme décrit ci-dessous ; jamais automatique |

La transaction change **uniquement** `status` (`FAILED` → `SUCCESS`) et `commit_sha` (NULL → commit de publication) sur les deux IDs. Elle ne modifie ni `requested_at`, ni `last_error`, ni `started_at`, ni `finished_at`, ni `attempt_count`, ni `batch_id`. Le trigger de dispatch est `AFTER INSERT OR UPDATE OF requested_at` ; il n'est pas déclenché par ces deux colonnes. Un contrôle raté provoque une exception et le rollback intégral. Une deuxième exécution échoue avant mutation.

## Retour arrière conditionnel

En cas d'erreur administrative confirmée, ne pas inverser aveuglément. Préparer une transaction distincte, approuvée, verrouillant exactement les deux IDs et vérifiant `SUCCESS`, `commit_sha` exact, `attempt_count=4`, et l'absence de nouveau workflow/publication. Restaurer alors seulement `status='FAILED'` et `commit_sha=NULL`, en conservant tous les autres champs, puis auditer. Ne pas exécuter ce retour arrière dans cette PR.
