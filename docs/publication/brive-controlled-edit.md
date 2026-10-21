# Brive : édition unique contrôlée, inactive par défaut

Cible exclusive : `83270534-e551-4562-8805-f10240a6007c`, job existant
`cd306af4-9b21-4f80-9e0e-557734585d8d`, raison `edit`, état initial `PENDING/0`, sans batch ni commit.
Sans manifeste approuvé, ce job précis est refusé dès la sélection manuelle. Le CANARY existant
refuse déjà les jobs edit ; aucune règle CANARY n’est élargie.
Aucun autre job, aucune écriture métier et aucune activation automatique ne sont autorisés par ce correctif.
La PR technique ne contient aucune page publique projetée.

## Correction et preuve

Ville : Brives → Brive-la-Gaillarde. Région : Centre-Val de Loire → Nouvelle-Aquitaine.
Dates conservées : 6–8 novembre 2026. Le JSON-LD passe de l'organisateur de repli
« Brives » à « Ville de Brive », sous autorisation explicite contenant cette modification.

La [Ville de Brive](https://www.brive.fr/culture/foire-livre-brive/) atteste l'organisateur.
Le [programme municipal 2026](https://www.brive.fr/foire-livre-2026/) et
[Brive Tourisme](https://www.brive-tourisme.com/fr/agenda/grands-rendez-vous/foire-du-livre-brive/infos-pratiques/)
confirment les dates et la manifestation multisite : Halle Georges Brassens,
Espace des Trois Provinces et autres lieux. Aucune adresse, coordonnée ou code postal n'est ajouté.
Le contrat traçable `scripts/event-publisher/brive-edit-proof.json` est lui-même empreinté dans le manifeste.

Canonical immuable :
`evenement/44-eme-foire-du-livre-de-brive-brives-83270534-e551-4562-8805-f10240a6007c.html`.
La description enrichie, l'affiche, le nom, les dates, le lien source, les liens,
le breadcrumb et l'URL de l'organisateur sont conservés depuis le HTML publié.
Seuls les champs géographiques et le nom d'organisateur explicitement autorisés changent.
Le générateur ordinaire et ses protections legacy demeurent inchangés.

## Pourquoi un chemin ciblé

Brive n'appartient pas au registre des 282 fiches legacy : aucune exception à ce registre n'est ajoutée.
`appliquer_slugs_statiques_existants` rapproche titre/ville/date ; la ville corrigée ne correspond plus
au HTML historique, et `attribuer_slugs` reconstruirait le slug avec la nouvelle ville.
Le générateur conserve par ailleurs l'organisateur publié (`published_organizer`) : il ne peut pas
transformer silencieusement le repli « Brives » en organisme vérifié.
Enfin, une reconstruction depuis la source brute propagerait les écarts Grenoble/Imaginambulles,
refusés par les gardes de contenu tiers. Aucun de ces gardes n'est supprimé.
Le chemin exact-job réutilise les gardes d'agrégats et les générateurs d'index existants sur le
catalogue Git figé ; la fiche Brive est corrigée seulement dans les emplacements explicitement autorisés.

## Préparation après fusion technique, sans exécution

1. Vérifier main propre et son SHA courant. Garder `PUBLICATION_AUTOMATION_ENABLED=false` et CANARY désarmé.
2. Avec les lectures privées déjà configurées (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`), exécuter localement :
   `node scripts/project-brive-edit.mjs draft /chemin/absolu/nouveau-dossier`.
   Ne jamais afficher ni versionner la clé, les lectures privées ou le manifeste.
   Cette commande ne réserve aucun job et ne fait aucune écriture Supabase.
3. Examiner `report.json`, `projection.patch` et la seconde projection identique.
   Le brouillon `authorization-draft.json` reste **DRAFT_NOT_APPROVED**.
   Le SHA de base est celui de main effectivement lu ; la date est le jour Europe/Paris.
   Tous les documents doivent être régénérés si la base, la date, la source ou la file évolue.
4. Demander une décision humaine distincte sur les modifications exactes, les preuves officielles et le diff.
   Après accord explicite seulement, produire le manifeste `APPROVED_SINGLE_BRIVE_EDIT` pour cette
   décision et ce batch uniques, expiration au plus une heure. Ne pas réutiliser un manifeste ancien.

## PREVIEW puis EXECUTE : décisions séparées

Après fusion, la PREVIEW GitHub utilise le workflow manuel existant `publish-events.yml` :
`manual_mode=preview`, `manual_job_ids=cd306af4-9b21-4f80-9e0e-557734585d8d`,
`brive_edit_authorization=<manifeste approuvé>`, aucun manifeste Lorient.
La permission de cette PREVIEW reste `contents: read` ; elle ne réserve rien.
Elle recalcule le diff isolé et vérifie son empreinte avant de fournir l'empreinte PREVIEW GitHub.

**Aucun EXECUTE n'est autorisé par cette PR.** Après nouvelle décision humaine, les paramètres seraient :
`manual_mode=execute`, le même job unique, le manifeste encore valide et inchangé,
`manual_preview_fingerprint=<empreinte fraîche GitHub>` et `manual_confirmation=EXECUTE`.
Les autres options restent désactivées. Si le manifeste expire, recommencer brouillon/accord/PREVIEW.

Avant toute réservation, le worker revalide la projection et relit la source/file privée.
La réservation conserve la RPC atomique existante, avec le batch scellé : `PENDING/0` → `RUNNING/1`.
Seul ce batch peut passer les gardes suivantes. Le diff entier doit être identique à celui scellé,
avec tous les autres fichiers Event et toutes les pages auteur identiques.
La source, la file, la donnée privée et le diff sont revérifiés avant push puis après déploiement.
La finalisation exige les preuves de déploiement habituelles. Aucun retry spécifique n'est ajouté.
Un état `PENDING/1`, `RUNNING` inattendu ou `SUCCESS` interdit la réutilisation.

## Périmètre et STOP

La projection utilise le catalogue Git publié, puis seulement les deux corrections de Brive.
Elle ne réintroduit pas Lorient, n'intègre aucune validation non publiée, et ne propage pas les
écarts connus Grenoble/Imaginambulles. Ces écarts restent contrôlés séparément, jamais effacés de Supabase.
Toute divergence supplémentaire arrête le parcours.

STOP sur SHA/date/empreinte/expiration différents, concurrence, job non sélectionné,
modification d'une fiche tierce ou auteur, canonical différent, enrichissement initial ambigu,
nouvelle URL non autorisée, perte/duplication, sitemap/archives incohérents ou diff hors périmètre.
Les éventuelles créations d'archives restent soumises à la garde temporelle existante.
Les lastmod ne changent que pour les HTML réellement modifiés, au jour Europe/Paris.

## Suite et retrait

Cette livraison autorise uniquement revue, tests et PR technique ; aucune publication réelle.
Après publication explicitement autorisée, vérifier le canonical historique public, le lieu,
le JSON-LD, l'image et les liens, les sitemaps ainsi que les jobs tiers inchangés.
Retirer ensuite l'entrée de workflow `brive_edit_authorization`, ses branchements et les modules
spécifiques dans une PR de nettoyage, en conservant les tests des refus legacy et tous les gardes généraux.
L'exception est déjà inutilisable après consommation du job exact.

Avant EXECUTE, le retour arrière consiste à abandonner le manifeste sans aucune donnée modifiée.
Après publication, aucun reset Supabase ni rejeu aveugle : isoler le commit de publication exact,
recalculer un correctif inverse relu humainement et vérifier les écritures intervenues entre-temps.
Un échec après réservation exige un diagnostic de l'état réel, jamais une remise à zéro automatique.
