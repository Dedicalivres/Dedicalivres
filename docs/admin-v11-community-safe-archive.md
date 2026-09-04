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

## Déploiement contrôlé

1. Fusionner le code avec `adminV11CommunityArchiveEnabled: false`.
2. Appliquer la migration sur un environnement de recette.
3. Vérifier archive, invisibilité publique, restauration et refus anonyme.
4. Appliquer la migration en production après autorisation explicite.
5. Activer le drapeau dans une PR séparée et refaire la recette visuelle.

## Rollback

Le drapeau à `false` coupe toute action depuis la V11. La migration ne supprime
aucune ligne. Les objets déjà archivés restent restaurables par la RPC admin.

## Recette locale du 4 septembre 2026

Migration exécutée dans PostgreSQL 17 temporaire : PASS. Archivage puis
restauration d’une présence et d’un témoignage fictifs : PASS. Exécution des RPC
par `anon` : refusée. Droit `DELETE` direct pour `authenticated` et `anon` :
retiré. Le conteneur et toutes ses données fictives ont ensuite été supprimés.
