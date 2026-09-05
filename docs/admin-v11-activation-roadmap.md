# Admin V11 — feuille de route d’activation

## Versions à ne pas confondre

- `admin.html` est le point d’entrée actif et correspond à la V11 validée.
- `admin-v11.html` reste la source V11 de référence ; les deux fichiers doivent rester identiques.
- La V10 demeure restaurable depuis le commit `4b6bf27`, uniquement par une branche et une PR dédiées.

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
- soumission transactionnelle d’un candidat Veille vers un événement non validé ;
- retrait réversible des présences auteurs et témoignages, protégé côté serveur et activé après les PR #140 et #141.

### Hors périmètre actif

- Studio de dédicace : module réservé ;

Le Studio ne doit pas être activé dans un lot de finition. Il exige d’abord un
cadrage produit, puis son propre contrat serveur, ses tests et sa procédure de rollback.

## Lots restants après activation

1. Terminer la recette sur appareils physiques Safari iPhone, Chrome Android et tablette ; les largeurs correspondantes, les cibles tactiles et l’absence de débordement sont validées en émulation.
2. Exécuter la coupure réseau réelle sur appareils ; les messages hors ligne/reconnexion, les boutons d’attente, les rôles/RLS NFC, les doubles clics et les sessions expirées sont couverts par le code et les tests.
3. Conserver le point de restauration V10 au commit `4b6bf27` et le manifeste de rollback.
4. Cadrer séparément le Studio de dédicace avant tout développement ou activation.

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
soumission sans supprimer les candidats, événements ou journaux d’audit. Pour
la Communauté, remettre `adminV11CommunityArchiveEnabled` à `false` coupe les
actions d’archivage et de restauration sans supprimer les données.
