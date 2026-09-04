# V11 — soumission transactionnelle de la Veille

## Objectif

Remplacer les deux écritures clientes séparées par un seul RPC PostgreSQL. La
création de l’événement et le rattachement du candidat réussissent ensemble ou
sont annulés ensemble.

## Garanties

- appel réservé à une session authentifiée reconnue par `private.is_admin()` ;
- fonction `SECURITY INVOKER`, soumise aux RLS et privilèges existants ;
- verrouillage du candidat et contrôle optimiste de sa version ;
- état serveur `ready` et champs obligatoires exigés ;
- refus d’un candidat déjà soumis ;
- données de l’événement construites depuis la fiche serveur persistée ;
- événement créé non validé, non mis en avant, non rejeté et non vérifié ;
- mise à jour du workflow et journal d’audit dans la même transaction ;
- aucun droit pour `anon` ou `PUBLIC` ; exécution accordée uniquement à `authenticated`.

## Activation

Le lot initial conservait `adminV11WatchSubmissionEnabled` à `false`. Le RPC a
depuis été appliqué et validé en production le 4 septembre 2026 ; son ouverture
applicative reste réversible avec ce même drapeau.

La recette SQL `scripts/recipe-admin-v11-watch-transactional-submit.sql` s’exécute
dans une transaction annulée à la fin. Elle vérifie le succès admin, les drapeaux
de modération, le refus d’une seconde soumission, le candidat incomplet, le refus
non-admin, les droits anonymes et le rollback atomique après rupture forcée.

## Validation staging du 3 septembre 2026

Projet isolé `mnlheukcdadykblnxeuo` :

- recette SQL transactionnelle : PASS ;
- appel REST avec la session administrateur de test : PASS ;
- candidat passé de `ready` version 1 à `submitted` version 2 ;
- un seul événement lié et une seule transition d’audit ;
- `validated`, `featured`, `rejected` et `verified` tous à `false` ;
- fixtures candidat, transition et événement supprimées après contrôle ;
- conseiller performance : aucun problème ;
- conseiller sécurité : avertissement staging préexistant sur la protection des
  mots de passe compromis, sans lien avec ce RPC.

## Validation production du 4 septembre 2026

- migration enregistrée sous `20260904155821_admin_watch_transactional_submit` ;
- recette SQL complète exécutée sans erreur puis annulée par `rollback` ;
- aucune fixture candidat ou événement conservée ;
- exécution anonyme refusée et rôle authentifié soumis à `private.is_admin()`.

## Rollback

1. Remettre ou conserver `adminV11WatchSubmissionEnabled` à `false`.
2. Revenir le code client vers le parcours précédent si nécessaire.
3. Supprimer uniquement la fonction avec :
   `drop function if exists public.submit_admin_watch_candidate(uuid, bigint);`

Le rollback ne supprime ni événement, ni candidat, ni historique.
