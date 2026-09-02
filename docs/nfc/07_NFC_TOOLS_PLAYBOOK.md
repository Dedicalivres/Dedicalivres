# NFC Tools Pro — playbook

## Contenu public
Un seul enregistrement NDEF URL : `https://dedicalivres.fr/nfc/?t=XXXXXXXX`.

Ne pas encoder directement salon, ville, partenaire ou campagne. L'affectation change côté Dédicalivres sans réécrire la puce.

## Séquence future
1. créer la fiche de puce ; 2. générer le token ; 3. copier l'URL ; 4. NFC Tools Pro → Écrire → URL ; 5. approcher la puce ; 6. relire ; 7. tester ; 8. marquer testée ; 9. installer.

## Verrouillage
Ne jamais verrouiller pendant les essais. Le verrouillage peut être irréversible. Décider seulement après plusieurs tests réels.

## Inventaire
Identifiant, token, support, lieu/événement/partenaire, campagne, date programmation, date installation, statut, notes.
