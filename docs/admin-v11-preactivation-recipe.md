# Admin V11 — recette de préactivation

## État au 3 septembre 2026

| Contrôle | État | Preuve |
| --- | --- | --- |
| Safari desktop | PASS | connexion staging et cockpit NFC visibles |
| NFC public vers statistiques | PASS | scans, engagement, intention et arrivée enregistrés |
| RLS NFC anonyme | PASS | lecture directe refusée HTTP 401 |
| Rôle administrateur NFC | PASS | lecture des codes et événements HTTP 200 |
| Double clic connexion | PASS automatisé | bouton désactivé pendant l'écriture |
| Session expirée | PASS automatisé | `SIGNED_OUT` referme l'accès |
| Jeton rafraîchi | PASS automatisé | `TOKEN_REFRESHED` remplace la session |
| Safari iPhone | À tester | appareil réel requis |
| Android | À tester | appareil réel requis |
| Tablette | À tester | appareil réel requis |
| Veille avec écriture | Verrouillé | drapeau maintenu à `false` |
| Suppression Communauté | Verrouillé assumé | non requise au lancement |

## Recette appareil

Pour chaque appareil restant : connexion, navigation dans les cinq sections,
ouverture du cockpit NFC, modification des six filtres, contrôle du tableau et
déconnexion. Noter le navigateur, la largeur d'écran, le résultat et joindre une
capture uniquement si elle ne contient aucune donnée personnelle.

## Rollback

Le présent lot se retire en revertant son commit. Il ne modifie ni la V10, ni le
schéma Supabase, ni les données. Le verrou Veille reste fermé.
