# Upgrade admin - 2026-05-26

## Objectif

Restructurer l'administration Dédicalivres en vrai centre de contrôle, plus lisible sur Mac, tablette et téléphone.

## Sauvegarde avant modification

Les fichiers admin d'origine ont été copiés ici :

`admin-backups/2026-05-25_21-55-57/`

Fichiers sauvegardés :

- `admin.html`
- `admin.css`
- `admin.js`
- `admin-v4.js`
- `admin-testimonials.js`
- `admin-author-requests.js`
- `admin-visits-counter-fix.js`

## Fichiers modifiés ou ajoutés

- `admin.html`
  - ajout des onglets `Qualité`, `Statistiques` et `Sécurité`
  - renommage de l'en-tête en `CENTRE DE CONTRÔLE`
  - ajout de la feuille de style `admin-cockpit.css`

- `admin.js`
  - ajout du rendu des nouveaux panneaux cockpit
  - ajout d'indicateurs de qualité, statistiques et sécurité
  - ajout de couleurs d'état sur les cartes événements

- `admin-cockpit.css`
  - nouvelle couche visuelle responsive
  - navigation latérale confortable sur grand écran
  - navigation basse sur mobile
  - codes couleur pour les états importants

## Retour arrière local

Sur demande, il suffit de restaurer les fichiers depuis :

`admin-backups/2026-05-25_21-55-57/`

et de supprimer `admin-cockpit.css`.

## Vérifications effectuées

- syntaxe JavaScript admin valide
- vérification globale du projet OK
- références locales de `admin.html` OK
- aucun identifiant HTML dupliqué dans `admin.html`
- structure CSS de `admin-cockpit.css` équilibrée
