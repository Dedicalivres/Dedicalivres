# Préparation locale — critères favoris et informations auteur

Base : origin/main 78ea13a, récupérée le 5 septembre 2026. Travail dans une copie Git indépendante, branche codex/local-preferences-v1. Aucun push, migration SQL ou déploiement.

## Comportement

- Favoris d'événements : clé historique inchangée, erreurs d'écriture désormais signalées.
- Critères : jusqu'à 20 combinaisons pays/région/type. ET dans une combinaison, OU entre combinaisons. Les filtres texte, date et géolocalisation sont exclus explicitement.
- Première activation : les événements déjà chargés constituent la référence.
- Nouveautés : événements à venir chargés par l'agenda dont les identifiants ne sont pas encore reconnus par un suivi. Elles persistent jusqu'à acquittement explicite.
- Les modifications d'un événement existant ne déclenchent pas une nouveauté dans cette version.
- L'agenda charge désormais le catalogue public par pages de 500 avec curseur sur l'identifiant, jusqu'à une page vide. Les tris visuels existants restent appliqués. Les préférences ne sont jamais envoyées dans ces requêtes. En cas d'erreur ou de page répétée, aucun état de référence partiel n'est enregistré. Un plafond de 200 pages évite une boucle sans fin. Une modification simultanée du catalogue pendant son chargement reste possible ; il ne s'agit pas d'une transaction instantanée.
- Auteur : mémorisation facultative des informations réutilisables dans les formulaires de présence et de soumission. Les deux formulaires ont leur stockage distinct. Il ne s'agit pas de sauvegarder l'ensemble d'une proposition d'événement : dates, images, pièces jointes et cases de consentement sont exclues.
- Effacement ciblé des quatre clés de cette fonctionnalité. Les réglages d'accessibilité et les sessions administrateur restent intacts.

## Confidentialité

Pas de transmission des critères ou des brouillons par ces modules. Les requêtes existantes d'agenda, de suivi de visites et les soumissions volontaires continuent. Les données locales sont accessibles au même profil navigateur et aux scripts exécutés sur le site ; aucun chiffrement absolu n'est promis. Aucun bénéfice carbone chiffré n'est revendiqué.

## Vérification effectuée

- npm run check : suite existante réussie.
- node scripts/test-local-preferences.mjs : référence initiale, correspondance géographique/type, nouvelle visite, acquittement, suppression, données corrompues, stockage bloqué et favoris historiques.
- scripts/test-local-browser.mjs avec Playwright Chromium : interactions au format mobile, rendu du texte hostile sans HTML, acquittement, opt-in auteur, exclusion des fichiers/consentements et effacement. Page servie par interception ; aucun appel de production.
- scripts/test-local-full-pages.mjs : pages HTML, CSS et JavaScript réels sous Chromium, Firefox et WebKit. Données de démonstration interceptées et carte externe indisponible simulée. Restauration du formulaire éditeur réel, nom auteur dans la soumission, nouveautés après rechargement, acquittement durable, favoris et effacement entre onglets, consentement décoché. Les trois moteurs passent sans erreur JavaScript. WebKit ne remplace pas une recette sur iPhone physique.
- scripts/test-public-catalog.mjs : pagination avec plafond serveur inférieur à la taille demandée, erreur intermédiaire et page répétée. Deux requêtes publiques de deux identifiants chacune ont confirmé le curseur sur l'API existante, sans écriture. Le guide Supabase a servi à vérifier le chargement avant cette correction.
- Syntaxe des quatre modules JavaScript et git diff --check.

## Avant publication

Recette visuelle et parcours automatisés terminés. Il reste la validation visuelle par le responsable du site, puis la revue du diff contre le main distant actualisé avant publication. Aucun push n'a été effectué. Retour arrière : rétablir la version précédente des fichiers de cette livraison ; la clé historique des favoris n'a pas changé. Les clés supplémentaires peuvent rester sur l'appareil jusqu'à effacement des données du site ; elles ne sont plus lues si les modules sont retirés.

Commandes réutilisables au terminal : `npm run test:local`, `npm run check`. Pour les navigateurs, définir `PLAYWRIGHT_MODULE` vers le module Playwright installé puis exécuter `BROWSER=chromium npm run test:local-browser` (ou `firefox`, `webkit`). Aucune dépendance n'a été ajoutée au site.

## Coût et modèles

Les tests Node sont rejouables directement au terminal sans raisonnement IA. Luna convient aux corrections ciblées. Une revue finale de migration/confidentialité peut bénéficier d'un modèle plus fort ; aucune bascule automatique n'est effectuée.
