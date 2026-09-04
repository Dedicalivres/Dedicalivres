# Admin V11 — préparation de la bascule et rollback

## Point de restauration V10

- commit : `4b6bf27874b8229604d484d3c0620dd33f9ab51a` ;
- fichier : `admin.html` ;
- SHA-256 : `e6ed2cf869d430c505da98d547ea98aac720eafd4055c694a0527e9e0525cbcc`.

Git conserve le contenu exact de la V10 dans ce commit. Le test de préparation
extrait ce fichier depuis l’objet Git et vérifie son empreinte : la sauvegarde ne
dépend donc ni du checkout principal local, ni d’une copie manuelle susceptible
de dériver.

## Préconditions avant bascule

1. Toutes les PR V11 requises sont fusionnées et `npm run check` est PASS.
2. Les verrous fonctionnels restant fermés sont explicitement acceptés.
3. La migration Veille n’est appliquée en production que dans une opération
   séparée, avec sa recette et son propre rollback.
4. La validation finale est donnée par l’utilisateur avant merge et déploiement.
5. La bascule ne modifie que `admin.html` dans une PR dédiée.

## Bascule proposée

Remplacer le contenu de `admin.html` par le contenu validé de `admin-v11.html`,
sans supprimer `admin-v11.html` et sans modifier les modules partagés. Vérifier
ensuite que les deux routes chargent les mêmes ressources V11.

## Contrôles avant PR d’activation

```sh
npm run check
npm run test:admin-v11-cutover
git diff --check
git diff --name-only origin/main...HEAD
```

Le dernier résultat doit contenir uniquement `admin.html` pour la PR de bascule.

## Rollback immédiat

Le moyen privilégié est le revert du commit unique de bascule. Si une restauration
de fichier est nécessaire sur une branche de rollback dédiée :

```sh
git show 4b6bf27874b8229604d484d3c0620dd33f9ab51a:admin.html > admin.html
shasum -a 256 admin.html
```

L’empreinte obtenue doit être exactement celle du manifeste. Exécuter ensuite les
tests, committer sur la branche de rollback et ouvrir une PR. Ne jamais restaurer
directement sur `main`.

Le rollback du fichier ne supprime aucune donnée et ne revient sur aucune migration.
