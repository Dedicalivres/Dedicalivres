# P0-C3-A — moteur préparé, non activé

Cette PR ne lance aucune publication. `PUBLICATION_AUTOMATION_ENABLED` doit rester `false`. La migration `20261012155223_publication_batch_state_machine.sql` est **préparée, non appliquée**. Ne jamais l'activer avec un worker ancien : celui-ci utilise encore des mises à jour REST individuelles.

## Garanties

- Le claim RPC accepte seulement une liste d'IDs `PENDING` identifiés par le snapshot (`event_id`, `target_event_id`, `reason`, `attempt_count`, `requested_at`). Il refuse un lot incomplet, un autre `RUNNING`, les jobs `FAILED`, `BLOCKED`, `manual` et les tentatives épuisées. Les lignes sont verrouillées et mises à jour en une transaction ; seuls les jobs effectivement retournés autorisent la projection.
- La finalisation RPC exige le batch, tous ses IDs, leurs compteurs et un nombre exact de lignes. `SUCCESS` requiert un SHA ; échec avant commit → `PENDING` si une tentative reste, sinon `FAILED`. `last_error` est conservé et complété. Les jobs `RUNNING` anciens ne sont plus réarmés automatiquement.
- Après création d'un commit, push incertain, Pages en attente/échec, ou preuve publique incomplète, le batch reste `RUNNING` pour examen humain. Aucune tentative automatique supplémentaire ni faux `SUCCESS`.
- `SUCCESS` exige le workflow GitHub Pages réussi pour le SHA, la correspondance octet par octet des fichiers globaux publics, et chaque fiche du lot accessible ou réellement inaccessible selon le cas. Le catalogue Supabase est revérifié avant push et après déploiement. Un no-op n'est admis que si le résultat public est vérifié de la même manière.
- Les anciens inputs `preactivation_test` et `recover_failed_p0` ne peuvent plus lancer le job GitHub ; la préactivation CLI est refusée sans lecture/écriture Supabase. Les tests locaux PostgreSQL fictifs remplacent ces essais réels.

Les protections existantes de projection ciblée, des 282 legacy, du seuil de 250 fichiers, des canoniques, sitemaps, enrichissements et suppressions restent en place.

## Avant toute activation ultérieure

1. Revoir la PR, tester la migration sur une base isolée avec la version exacte des fonctions et contraintes de production, puis autoriser **séparément** son application. Vérifier les privilèges `service_role` et l'absence d'exécution `anon`/`authenticated`.
2. Maintenir l'automatisation désactivée pendant la migration et le déploiement du worker compatible. Si la migration doit être retirée avant activation, supprimer uniquement les deux fonctions nouvellement introduites, après vérification qu'aucun worker ne les appelle ; aucune donnée historique n'est migrée.
3. Confirmer qu'aucun job `RUNNING` ne reste non résolu, que Douai est toujours `PENDING` avec 0 tentative, et que les déploiements Pages/publics fonctionnent. N'activer qu'avec une autorisation explicite et un scénario de surveillance humain.

Un `RUNNING` ancien n'est **pas** une preuve d'absence de publication : examiner commit, push, Pages, site public et source Supabase avant toute décision manuelle. Ne jamais remettre un `FAILED` historique en attente automatiquement.
