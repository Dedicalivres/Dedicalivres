# Admin V11 — feuille de route d’activation

## Versions à ne pas confondre

- `admin.html` est la V10 actuellement active.
- `admin-v11.html` est la V11 en préactivation.
- Aucun lot V11 ne doit modifier la V10 avant la bascule finale validée.

## État vérifié

### Opérationnel dans la V11

- authentification et chargement du contexte Supabase ;
- consultation, validation et édition des événements ;
- suppression sécurisée avec contrôle des dépendances ;
- modération des présences et témoignages ;
- préparation, édition et publication contrôlée des auteurs ;
- exports, générateur social, widget partenaires et maintenance ;
- intégration Auto-Matte en lecture et persistance de la veille ;
- NFC Analytics validé sur staging isolé : collecte, RLS, cockpit et rollback.

### Encore verrouillé volontairement

- création d’un événement depuis la Veille : `V11_WATCH_WRITE_GUARD` reste actif ;
- fusion auteur : action destructive non ouverte ;
- suppression des objets Communauté conservée verrouillée pour le lancement ; la modification des présences et la modération sont déjà actives ;
- Studio de dédicace : module réservé ;

Ces verrous ne doivent pas être retirés dans un lot de finition visuelle. Chacun
exige son propre contrat serveur, ses tests RLS et sa procédure de rollback.

## Lots restants avant activation

1. Appliquer et valider en production le RPC transactionnel Veille déjà fusionné, dans une opération séparée ; le verrou reste fermé jusque-là.
2. Terminer la recette sur appareils physiques Safari iPhone, Chrome Android et tablette ; les largeurs correspondantes, les cibles tactiles et l’absence de débordement sont validées en émulation.
3. Exécuter la coupure réseau réelle sur appareils ; les messages hors ligne/reconnexion, les boutons d’attente, les rôles/RLS NFC, les doubles clics et les sessions expirées sont couverts par le code et les tests.
4. Faire une sauvegarde des fichiers V10 et relever le commit de rollback.
5. Basculer `admin.html` vers la V11 dans une PR exclusivement dédiée à l’activation.

## Critères de bascule

- tous les tests automatisés sont PASS ;
- aucune donnée simulée ou affirmation non vérifiée n’est visible ;
- aucun bouton requis n’est orphelin ;
- les verrous restants sont explicitement assumés et documentés ;
- la V10 reste restaurable par revert du seul commit de bascule ;
- validation humaine explicite avant merge et déploiement.

## Rollback

La future bascule doit tenir dans un commit indépendant. Le rollback consiste à
revenir ce commit afin de restaurer immédiatement la route V10, sans supprimer
les fichiers V11 ni les données Supabase.
