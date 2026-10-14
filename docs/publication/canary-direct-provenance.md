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
privée et n'a pas d'URL publique. Les références de justificatifs sont des
identifiants opaques `evidence:...`, non des documents, adresses ou URL R2.
Le dossier correspondant et le canal indépendant ayant servi au contrôle
devront être accessibles aux administrateurs avant usage réel de cette RPC.

## RPC administrateur

`record_direct_publication_canary_evidence_checked` exige une confirmation
humaine, une référence à `event_submission_contacts`, un rôle attesté, une
méthode de contrôle et une référence opaque. Elle verrouille l'événement,
compare les dix champs de sa photographie avec gestion des NULL, puis écrit
attestation et preuve dans une seule transaction. Elle ne crée pas de job.

`revoke_direct_publication_canary_evidence` ajoute une décision de révocation
horodatée, sans effacer l'attestation ni la preuve. Le validateur ne considère
que la preuve la plus récente : sa révocation ne réactive donc pas une preuve
plus ancienne. `get_event_provenance` n'expose que des métadonnées à
l'administrateur ; il ne renvoie ni contact, ni référence de dossier.

La réservation CANARY verrouille aussi le registre de provenance avant de
recontrôler l'admissibilité. Le parcours `PUBLIC_OFFICIAL`, le quota de 24 h,
l'arrêt sur incident, les 30 jours, le réarmement humain et la publication
manuelle restent inchangés.

## Confidentialité et déploiement

Aucun document privé n'est stocké dans cette migration. `retention_review_at`
est une métadonnée nullable pour préparer une purge contrôlée ; aucune purge
automatique n'est créée. Les propositions de 12 mois pour les justificatifs
privés et de 24 mois pour l'audit non personnel, ainsi que la politique des
contacts, restent à valider avec les responsables métier et conformité.

Avant tout usage réel de `DIRECT_VERIFIED` : valider les méthodes de preuve,
le stockage privé des dossiers et leur accès, puis installer la migration
après revue. Ne pas armer CANARY par cette installation.

Test isolé : `bash scripts/test-publication-canary-sql.sh` lance uniquement un
PostgreSQL Docker jetable ; aucune connexion Supabase production. Le banc crée
un schéma minimal de `events`, des contacts et des jobs, puis charge les
vraies migrations du lot de réservation, du CANARY V1, de l'Admin et d'E5-C.
Il vérifie ces parcours SQL, pas l'intégralité du schéma ni du moteur en
production.
