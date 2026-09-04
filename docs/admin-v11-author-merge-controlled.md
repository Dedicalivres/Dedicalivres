# Admin V11 — fusion auteur contrôlée

## Contrat

- seuls les rapprochements détectés avec un score d’au moins 70 sont proposés ;
- l’administrateur choisit explicitement la fiche conservée ;
- un aperçu nomme la fiche conservée, la fiche archivée et les présences liées ;
- une confirmation forte précède l’appel transactionnel `merge_author_profiles` ;
- aucune fiche n’est supprimée physiquement ;
- le journal `author_merge_audit` reste consultable depuis la V11 ;
- `revert_author_merge` restaure la fiche et les présences seulement si leur état est resté cohérent.

## Sécurité vérifiée

Les deux RPC existent en production et refusent le rôle anonyme. Elles contrôlent
également `private.is_admin()` avant toute opération. Le client ne remplace jamais
ces contrôles serveur.

## Migration

Aucune migration n’est ajoutée. Le lot réutilise les objets déjà présents :

- `merge_author_profiles(uuid, uuid)` ;
- `author_merge_audit` ;
- `revert_author_merge(uuid)` ;
- le déclencheur d’invalidation éditoriale qui dépublie la fiche secondaire.

## Rollback

Pour couper immédiatement l’interface de fusion, remettre
`adminV11AuthorMergeEnabled` à `false`. Les fusions déjà réalisées et leur journal
restent intacts. Chaque fusion active peut être annulée depuis le journal si le
serveur confirme que l’état est toujours cohérent.
