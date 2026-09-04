# Admin V11 — feuille de route d’activation

## Versions à ne pas confondre

- `admin.html` est le point d’entrée actif : V10 avant la bascule, copie validée de la V11 après celle-ci.
- `admin-v11.html` reste la source V11 de référence et la route de préactivation.
- Aucun lot V11 ne doit modifier le point d’entrée actif avant la bascule finale validée.

## État vérifié

### Opérationnel dans la V11

- authentification et chargement du contexte Supabase ;
- consultation, validation et édition des événements ;
- suppression sécurisée avec contrôle des dépendances ;
- modération des présences et témoignages ;
- préparation, édition et publication contrôlée des auteurs ;
- fusion auteur unitaire, auditée et réversible ;
- exports, générateur social, widget partenaires et maintenance ;
- intégration Auto-Matte en lecture et persistance de la veille ;
- NFC Analytics actif en production : collecte, RLS, cockpit, recette et rollback ;
- soumission transactionnelle d’un candidat Veille vers un événement non validé.

### Encore verrouillé volontairement

- retrait réversible des objets Communauté préparé, mais verrouillé jusqu’à validation et application de son backend ;
- Studio de dédicace : module réservé ;

Ces verrous ne doivent pas être retirés dans un lot de finition visuelle. Chacun
exige son propre contrat serveur, ses tests RLS et sa procédure de rollback.

## Lots restants après activation

1. Terminer la recette sur appareils physiques Safari iPhone, Chrome Android et tablette ; les largeurs correspondantes, les cibles tactiles et l’absence de débordement sont validées en émulation.
2. Exécuter la coupure réseau réelle sur appareils ; les messages hors ligne/reconnexion, les boutons d’attente, les rôles/RLS NFC, les doubles clics et les sessions expirées sont couverts par le code et les tests.
3. Conserver le point de restauration V10 au commit `4b6bf27` et le manifeste de rollback.
4. Traiter séparément les fonctions encore verrouillées : suppression Communauté et Studio de dédicace.

## Critères de bascule

- tous les tests automatisés sont PASS ;
- aucune donnée simulée ou affirmation non vérifiée n’est visible ;
- aucun bouton requis n’est orphelin ;
- les verrous restants sont explicitement assumés et documentés ;
- la V10 reste restaurable par revert du seul commit de bascule ;
- validation humaine explicite avant merge et déploiement.

## Rollback

Le rollback global reste le retour au point V10 `4b6bf27`. Pour la seule Veille,
remettre `adminV11WatchSubmissionEnabled` à `false` coupe immédiatement la
soumission sans supprimer les candidats, événements ou journaux d’audit.
