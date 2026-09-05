# Admin V11 — retrait réversible Communauté

## Décision

La suppression physique des présences et témoignages n’est pas activée. Le lot
introduit un archivage logique administrateur : l’objet disparaît des lectures
publiques et des listes courantes, mais reste intact et restaurable.

## Sécurité serveur

- `private.is_admin()` est vérifié par chaque RPC ;
- les fonctions sont `security invoker` ;
- `anon` ne peut ni archiver ni restaurer ;
- le droit `DELETE` direct est retiré à `authenticated` sur les deux tables ;
- les politiques publiques excluent systématiquement `archived_at is not null` ;
- le motif, l’administrateur et la date sont persistés.

## Déploiement contrôlé — terminé

1. Préparation fusionnée par la PR #140 avec le drapeau désactivé.
2. Migration `20260904190703` validée dans PostgreSQL 17 temporaire puis appliquée seule en production.
3. Appels anonymes d’archivage et de restauration refusés avec HTTP 401.
4. Activation fusionnée par la PR #141 après passage de la suite complète de tests.

## Rollback

Le drapeau à `false` coupe toute action depuis la V11. La migration ne supprime
aucune ligne. Les objets déjà archivés restent restaurables par la RPC admin.

## Recette locale du 4 septembre 2026

Migration exécutée dans PostgreSQL 17 temporaire : PASS. Archivage puis
restauration d’une présence et d’un témoignage fictifs : PASS. Exécution des RPC
par `anon` : refusée. Droit `DELETE` direct pour `authenticated` et `anon` :
retiré. Le conteneur et toutes ses données fictives ont ensuite été supprimés.

## Vérification de production du 5 septembre 2026

Migration présente dans l’historique distant : PASS. Drapeau public de
configuration actif : PASS. Fonctions d’archivage et de restauration refusées
à `anon` : PASS. Aucune suppression physique de donnée n’a été réalisée.
