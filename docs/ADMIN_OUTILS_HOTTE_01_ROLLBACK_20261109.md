# ADMIN-OUTILS-HOTTE-01 — Relais, risques et retour arrière

Date : 2026-11-09
Dépôt : Dedicalivres/Dedicalivres
Branche isolée : `feature/admin-outils-hotte-widgets-20261109`
État : **DRAFT / LABORATOIRE — ne pas fusionner ni déployer sans revue Safari et validation explicite**.

## Objet

Compléter la page **Outils** de l'Admin V11 sans modifier le système d'authentification ou les services actifs.

1. La carte **Widgets** réutilise l'identifiant et le moteur existants `data-tool-open="partners"` et `widget.js`. Trois choix s'y trouvent : *Agenda / partenaires* (inchangé), *Hotte de Noël* (simulation du widget flottant approuvé) et *HelloAsso* (emplacement de dons inactif).
2. Une carte **Hotte de Noël** ouvre, à la manière du module NFC, une section interne du workspace V11 comportant *Gestion* (lots fictifs et compteurs) et *Aperçu visiteur* (cadre isolé du prototype externe).
3. Le menu latéral **Événements** continue de désigner les salons, festivals, dédicaces et rencontres du catalogue. Les événements associatifs ne sont pas ajoutés à cette rubrique.
4. Aucun nouveau rôle, nouvelle table, règle RLS, collecte, publication, paiement ou messagerie réelle n'est créé. Les lotissements fictifs sont uniquement conservés en mémoire jusqu'au rechargement de la page.

## Fichiers touchés

- `admin.html` et `admin-v11.html` : carte Hotte, libellé Widgets, panneau du module Hotte, liens statiques vers JS/CSS.
- `admin-shell.js` : entrée `hotte` dans `toolLabels`, `toolDescriptions` et `slotMap`; appels optionnels au module Hotte.
- `admin-v11-hotte-tools.js` (nouveau) : trois onglets de widgets et gestion/aperçu Hotte, sans appels Supabase.
- `admin-v11-hotte-tools.css` (nouveau) : styles préfixés `v11-hotte-`.
- `scripts/test-admin-v11-hotte-tools.mjs` (nouveau) : vérifications statiques des invariants et du périmètre.
- `scripts/test-admin-v11-hotte-browser.mjs` (nouveau) : recette Playwright offline à exécuter, sur fixture de faux administrateur.

Les fichiers `admin-context.js`, `admin-v11-partner-widget.js`, `admin-nfc-cockpit.js`, `config.js`, `widget.js`, `index.html` et tout le schéma Supabase **ne sont pas modifiés**.

## Empreintes de référence de la branche `main` avant développement

- `admin.html` et `admin-v11.html` : blob SHA Git `59c1ce29f597ae170a1ba9427920e774d3954c49`.
- `admin-shell.js` : blob SHA Git `83c4e3b1f1007fd1006c2bc4a5c8ce666c69ae15`.
- `admin-v11-partner-widget.js` : blob SHA Git `a5d26a2bf95307e3c0bbfa525e9e8662ef87b45e`.
- `admin-context.js` : blob SHA Git `bef888b41b58a61fa013b71ccc520636d66c0a84`.

Ces valeurs sont des identifiants de blobs Git, pas des empreintes SHA-256 des fichiers.

## Vérifications déjà réalisées

**35 contrôles statiques PASS, 0 FAIL** sur les sources récupérées de la branche :
- deux variantes d'Admin HTML identiques ;
- présence d'une seule carte Hotte et d'un seul panneau pour chacune ;
- carte partenaires et panneau NFC toujours présents ;
- branchement des onglets et des panneaux dans le workspace existant ;
- syntaxe JavaScript valide ;
- API du module initialisée en isolation ;
- garde admin `authenticated=true && status=ready` ;
- cadre visiteur `sandbox="allow-scripts"`, sans `allow-same-origin` ;
- absence de requêtes réseau ou opérations SQL dans le module de laboratoire ;
- `admin-context.js` et `admin-v11-partner-widget.js` **byte-identiques au main au moment du contrôle**.

**Non réalisé :** lancement de l'Admin V11 dans Safari, exécution du script Playwright sur le code modifié, tests de couverture navigateur/mobile, contrôle effectif de la disponibilité externe du cadre Vercel et exécution de la suite complète. Le test Playwright est versionné mais **non exécuté**.

Commandes de recette **sur environnement isolé** : `node scripts/test-admin-v11-hotte-tools.mjs` (statique) puis `node scripts/test-admin-v11-hotte-browser.mjs` (Chromium local + Playwright, tous les accès extérieurs bloqués). Les suites Auth/NFC/Widgets existantes restent obligatoires avant fusion. Ne pas annoncer une réussite de ces contrôles.

## Tests à passer avant fusion

1. Ouverture `admin.html` avec administrateur autorisé ; navigation Outils → Widgets → chaque onglet → Hotte → Gestion/Visiteur → fermer.
2. Widget partenaires : aperçu moteur réel, paramètres pays, filtres, code d'intégration et copier-coller inchangés.
3. NFC, Maintenance, Social, Exports, Auto-Matte et page Agenda : aucune régression.
4. Compte non-administrateur, session expirée ou renouvelée : aucune vue privée visible pendant l'attente.
5. Simulation des lots : calculs des comptes et valeurs, ajout d'un lot, refus/acceptation, reset, aucun accès réseau.
6. Navigation au clavier (bouton carte et onglets), Safari desktop/mobile, textes lisibles.
7. Visiteur : affichage dans `iframe` sandboxée ; si bloqué par navigateur, lien externe fonctionnel.
8. Différence du compteur visiteurs : aucune page admin ou maquette ne doit être comptabilisée comme visite publique.
9. **Zéro écriture vers Supabase, HelloAsso ou Dédicalivres public** pendant la recette.

## Risques et décision

- P1 : confirmer qu'une page externe peut être affichée en `iframe` sandboxée dans l'Admin, sans conflit de politique CSP. Fallback en nouvel onglet prévu.
- P1 : tant que l'échange de coordonnées et les frais de port gagnants ne sont pas validés juridiquement, ne pas raccorder le module au backend.
- P2 : données fictives potentiellement confondues avec des données réelles. Les mentions Laboratoire/Simulation sont omniprésentes et aucune persistance n'existe.
- P2 : styles et comportements Safari non vérifiés en navigateur natif.
- Exclu : correctif du bandeau « Vérification de la session… » de l'Admin, qui fonctionne selon le retour utilisateur.

## Plan de rollback

**Avant fusion :** fermer la PR draft et ne pas fusionner la branche. Aucun rollback de production nécessaire.

**Après fusion (uniquement si autorisée ultérieurement) :** ouvrir immédiatement une PR de revert de l'intégralité du merge Hotte (ou restaurer les deux blobs HTML et le blob shell ci-dessus, supprimer les deux nouveaux assets et le test), refaire les tests Auth/NFC/Widgets partenaires, puis redéployer la version corrigée. Ne jamais modifier `admin-context.js` pour obtenir ce rollback. En cas de bug visuel bloquant, privilégier d'abord le retour à la dernière version de déploiement validée.

**Interdits explicites :** merge automatique, déploiement public automatique demandé par ce lot, changement d'authentification, modification de RLS, publication des inscriptions, paiement, tirage ou contact réel avec les auteurs.
