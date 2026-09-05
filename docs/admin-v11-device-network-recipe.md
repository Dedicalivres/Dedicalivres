# Admin V11 — recette appareils et réseau

## Contrôles automatisés

- aucun débordement horizontal aux largeurs téléphone et tablette ;
- cibles tactiles principales d’au moins 44 × 44 px ;
- boutons de connexion et d’actualisation protégés pendant l’attente ;
- message distinct pour une erreur réseau et des identifiants refusés ;
- état « Hors ligne » dans le bloc Supabase ;
- notification lors de la perte et du retour de connexion ;
- verrou de soumission Veille activé après validation de son backend ;
- point d’entrée actif V11 conservé identique à sa source de référence.

## Matrice de validation

| Surface | Contrôle | État |
|---|---|---|
| Téléphone 390–433 px | disposition, navigation basse, absence de débordement | PASS en émulation |
| Android 360–400 px | disposition, boutons et absence de débordement | PASS en émulation |
| Tablette 768–853 px | disposition, navigation latérale et boutons | PASS en émulation |
| Safari iPhone physique | rotation, clavier, safe-area, retour après veille | À tester |
| Chrome Android physique | clavier, retour arrière, reconnexion réelle | À tester |
| Safari/Chrome tablette physique | orientation portrait/paysage | À tester |

Une émulation de largeur ne valide pas le moteur Safari iOS, le clavier logiciel,
la rotation réelle, la mémoire disponible ni une coupure radio. Ces lignes ne
doivent passer à PASS qu’après contrôle sur le matériel correspondant.

## Recette réseau manuelle

1. Ouvrir la V11 avec une session administrateur valide.
2. Couper le Wi-Fi : vérifier « Hors ligne » et la notification d’indisponibilité.
3. Tester Actualiser : vérifier le message réseau et le retour du bouton actif.
4. Rétablir le Wi-Fi : vérifier la notification demandant une actualisation.
5. Actualiser et confirmer le retour à « Opérationnel ».
6. Sur l’écran de connexion, distinguer une coupure réseau d’un mot de passe refusé.

## Rollback

Revert du commit de ce lot. Aucun schéma, aucune donnée et aucune configuration
Supabase ne sont modifiés.
