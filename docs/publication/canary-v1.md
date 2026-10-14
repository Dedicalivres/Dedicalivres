# CANARY V1 — procédure avant activation

Cette PR ne déploie pas la migration, n'arme pas le CANARY et ne modifie pas
`PUBLICATION_AUTOMATION_ENABLED`. La migration additive crée un état **désarmé**.
Un changement de variable seul ne permet donc aucune réservation automatique.

## Preuve éditoriale

Un administrateur vérifie personnellement une publication précise d'un
organisateur, d'une librairie, d'un éditeur, d'un auteur ou d'une institution
concernée. Il enregistre via `record_publication_canary_evidence` l'ID de
l'événement, l'URL précise, l'identité de la source et la référence de
l'annonce. Il confirme explicitement le titre, la ville et les dates actuels
de la fiche. Le serveur fixe `checked_at` et `checked_by` ; la preuve expire
après 30 jours ou dès divergence de ces champs. `events.verified=true` et les
trois entrées historiques du registre territorial ne sont pas importés comme
preuves CANARY. Une URL générale de profil Facebook/Instagram est refusée.

Seuls les jobs `validation`, jamais tentés (`attempt_count=0`, sans
`last_error`), peuvent être sélectionnés automatiquement. Les jobs `edit`,
`unpublish` et `delete` continuent de nécessiter le chemin manuel approuvé.
Le statut `registration_force_status='annule'` est refusé par précaution.
Le PREVIEW/EXECUTE manuel conserve son empreinte et sa confirmation, même si
le CANARY est armé ; il n'utilise pas le quota CANARY.

## Armement et reprise humaine

1. Faire examiner la PR et les tests, fusionner seulement sur autorisation,
   puis installer séparément la migration après contrôle de son SQL et de ses
   droits. Ne pas activer la variable pendant cette opération.
2. Vérifier les incidents GitHub Actions planifiés, l'historique CANARY, les
   jobs `RUNNING` et les déploiements Pages incertains. Consigner le dernier
   identifiant de run réellement examiné et une note de revue de 20 caractères
   minimum dans `arm_publication_canary`. Cette RPC est réservée à un
   administrateur authentifié ; le moteur de publication ne peut pas l'appeler.
   La note, l'identité de l'administrateur et la date restent dans l'historique
   `private.publication_canary_reviews`.
3. Seulement après une autorisation distincte, régler
   `PUBLICATION_AUTOMATION_ENABLED=true`. Le cron peut rester à cinq minutes :
   la RPC CANARY réserve au plus une tentative sur 24 heures glissantes.

Un échec enregistré désarme le CANARY et conserve le run, le motif, l'heure et
le batch lorsqu'il existe. Si Supabase est inaccessible au moment de
l'incident, le prochain précontrôle lit les conclusions GitHub Actions ; une
lecture impossible ou un run échoué/non terminé interdit toute réservation.
Les reruns planifiés (`GITHUB_RUN_ATTEMPT>1`) sont refusés. Un job remis en
`PENDING` après échec ne redevient pas éligible automatiquement.

Pour arrêter les **nouveaux** runs, remettre la variable à `false`. Cela ne
révoque pas une réservation déjà `RUNNING` : examiner et traiter ce cas avant
toute reprise. Ne jamais effacer l'historique d'incidents ou de tentatives
pour contourner le quota. Pour revenir au code antérieur, garder la variable
à `false` et laisser les tables additives en place jusqu'à une décision
séparée sur les données historiques ; aucun rollback destructif automatique.
