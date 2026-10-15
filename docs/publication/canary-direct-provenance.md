# CANARY — provenance directe (E5-C)

Cette migration est préparatoire. Elle n'est pas appliquée en production et ne
modifie ni événement, ni job, ni état d'armement. L'interface Admin et Auto-Matte
restent inchangés dans ce lot.

## Modèle et confiance

`private.event_provenance` conserve des assertions horodatées. Le canal observé,
le rôle éventuellement déclaré et l'origine attestée sont séparés. Sans
attestation, l'origine affichée est `LEGACY_UNKNOWN` ; le contact d'une soumission
permet seulement d'observer `DIRECT_FORM`. Un score Auto-Matte, une affiche,
`events.verified` et un e-mail déclaré n'établissent pas l'identité ni le rôle.
Le registre n'a pas de suppression en cascade depuis `events`.

`private.publication_canary_evidence` garde tous les enregistrements existants
comme `PUBLIC_OFFICIAL`. Une preuve `DIRECT_VERIFIED` référence une attestation
privée et n'a pas d'URL publique. Le dépôt ne dispose d'aucun bucket de
justificatifs privé ; les buckets d'images existants sont publics. La migration
crée donc un **dossier de contrôle privé en base**, contenant la référence de
la source indépendante consultée et un compte rendu circonstancié du contrôle
d'identité, de rôle et d'événement. Il ne contient ni image R2 ni document
joint. Sa référence `evidence:...` est générée par PostgreSQL, jamais choisie
par l'appelant. Une référence syntaxiquement correcte mais sans dossier est
refusée.

## RPC administrateur

Le parcours comporte trois actions distinctes, toutes réservées à un
administrateur :

1. `record_direct_publication_canary_dossier` enregistre le compte rendu privé,
   la méthode, le rôle, l'événement et sa soumission. Le dossier reste
   `PENDING_REVIEW` et ne rend rien publiable.
2. `get_direct_publication_canary_dossier` permet de le relire ;
   `verify_direct_publication_canary_dossier` exige une confirmation humaine et
   une fiche inchangée avant de marquer le dossier `VERIFIED`.
3. `record_direct_publication_canary_evidence_checked` exige ce dossier
   vérifié, récent, non révoqué et lié au même événement, à la même soumission,
   au même rôle et à la même méthode. Elle verrouille l'événement, compare les
   dix champs avec gestion des NULL, puis écrit attestation et preuve dans une
   seule transaction. Elle ne crée pas de job.

Le validateur contrôle de nouveau l'existence, l'état et la concordance du
dossier lors de la réservation. Aucun `DIRECT_VERIFIED` n'est accepté sans ces
étapes. Le dossier est privé et aucun contenu n'est renvoyé par la RPC de
consultation générale `get_event_provenance`.

`revoke_direct_publication_canary_evidence` ajoute une décision de révocation
horodatée et marque le dossier associé `REVOKED`, sans effacer l'attestation ni
la preuve. Un nouveau dossier et une nouvelle vérification sont nécessaires
pour renouveler une preuve. Le validateur ne considère
que la preuve la plus récente : sa révocation ne réactive donc pas une preuve
plus ancienne. `get_event_provenance` n'expose que des métadonnées à
l'administrateur ; il ne renvoie ni contact, ni référence de dossier.

La migration Admin D0 ajoute
`get_latest_direct_publication_canary_reference(event_id)` : cette lecture
réservée à l'administrateur renvoie uniquement `proof_id`,
`dossier_reference` et `dossier_state` pour la **dernière** preuve, si elle est
`DIRECT_VERIFIED`. Elle ne renvoie aucune ligne sans preuve ou si la dernière
est `PUBLIC_OFFICIAL` ; elle ne cherche jamais une ancienne preuve directe.
Elle reste consultable pour une preuve directe expirée ou révoquée. L'Admin
peut alors relire le dossier par sa référence et transmettre le `proof_id`
à la RPC de révocation existante. Si une preuve plus récente apparaît entre
lecture et révocation, cette dernière refuse l'identifiant devenu obsolète.

La réservation CANARY verrouille aussi le registre de provenance avant de
recontrôler l'admissibilité. Le parcours `PUBLIC_OFFICIAL`, le quota de 24 h,
l'arrêt sur incident, les 30 jours, le réarmement humain et la publication
manuelle restent inchangés.

## Confidentialité et déploiement

Le compte rendu du dossier doit rester limité aux éléments nécessaires et ne
pas recopier de coordonnées privées dans `events` ou les journaux. Aucun
document binaire n'est stocké. `retention_review_at` est une métadonnée
nullable pour préparer une purge contrôlée ; aucune purge
automatique n'est créée. Les propositions de 12 mois pour les justificatifs
privés et de 24 mois pour l'audit non personnel, ainsi que la politique des
contacts, restent à valider avec les responsables métier et conformité.

Avant tout usage réel de `DIRECT_VERIFIED` : valider que le compte rendu privé
constitue un justificatif suffisant pour la méthode employée et que
l'administrateur peut vérifier sa source indépendante. Si une pièce jointe est
nécessaire, ce parcours ne doit pas être utilisé avant la définition d'un
stockage privé adapté. La base garantit l'existence et la liaison du dossier,
pas la véracité du compte rendu humain. Ne pas armer CANARY par l'installation.

Test isolé : `bash scripts/test-publication-canary-sql.sh` lance uniquement un
PostgreSQL Docker jetable ; aucune connexion Supabase production. Le banc crée
un schéma minimal de `events`, des contacts et des jobs, puis charge les
vraies migrations du lot de réservation, du CANARY V1, de l'Admin et d'E5-C.
Il vérifie ces parcours SQL, pas l'intégralité du schéma ni du moteur en
production.
