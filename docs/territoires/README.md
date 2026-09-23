# Pages territoriales et contrôles admin

**DONE local — 23 septembre 2026.** Publication prioritaire, analyses non bloquantes. Aucun déploiement, push, fusion ni changement distant effectué. [Roadmap](ROADMAP.md) · [Audit](audit.json) · [Signalements et observations originales](signalements.json).

## Règle de visibilité

Une annonce `validated=true` et `rejected=false` reste affichée sur la page correspondant au pays et au territoire enregistrés. Une alerte de qualité ne modifie jamais ces statuts, ne corrige aucun champ et ne supprime aucune annonce. Les doublons potentiels sont affichés tant que l'admin ne décide pas de les corriger ou retirer par son parcours habituel.

Une date invalide ou manquante conserve l'annonce dans « Dates à confirmer ». Un pays/territoire inconnu n'est pas inventé : l'annonce reste dans le catalogue général, sans affectation arbitraire à l'un des pilotes ; une alerte admin indique le rattachement à vérifier.

## Résultat sur le catalogue public

Capture du **23 septembre 2026 à 05:39:26.649 UTC** : 569 UUID publics, tous conservés par rapport à la capture précédente. Seule différence observée : début du Salon du Livre de Wallonie déplacé du 27 au **26 septembre**, fin maintenue au **27 septembre**.

| Pilote | Annonces publiées affichées | À venir / en cours | Archives | Exclusion automatique |
| --- | ---: | ---: | ---: | ---: |
| Bretagne, France | 98 | 25 / 0 | 73 | 0 |
| Wallonie, Belgique | 8 | 3 / 0 | 5 | 0 |

Les huit annonces précédemment écartées sont réintégrées. L'alerte de dates de Mons est résolue ; sept de ces observations restent à contrôler. À l'échelle des 569 événements, le panneau calcule **14 annonces signalées**, dont une publiée à venir / aux dates à confirmer dans cette capture. Ce total inclut cinq rattachements absents ou inconnus et deux annonces formant une paire de doublons exacts, en plus des sept observations encore actives.

Les observations initiales sont conservées dans `signalements.json` avec les valeurs observées le 22 septembre, la source, la date de contrôle et les valeurs attendues lorsque documentées. Elles ne constituent plus une liste d'exclusion. Les sources citées y restent consultables, notamment celle du [Salon du Livre de Wallonie](https://www.monslivre.be/salon-du-livre-de-wallonie/).

## Suivi des publications

Les mêmes fonctions de classement et de rendu servent à la génération HTML et à l'actualisation dans le navigateur. Le HTML initial contient l'ensemble des listes et compteurs de la capture. Avec JavaScript, chaque ouverture du pilote relit le catalogue public complet ; un bouton permet ensuite une nouvelle actualisation. Une publication, une correction ou un retrait décidé dans l'admin est donc reflété à la prochaine lecture réussie.

La lecture utilise les mêmes règles publiques que l'agenda existant, avec pagination par curseur. Elle ne transmet aucune préférence, aucun favori ni donnée utilisateur. Aucun polling, compte, synchronisation de stockage personnel ou nouveau suivi analytique.

En cas d'erreur réseau, de pagination incomplète ou de collision d'identifiant, la liste déjà affichée est conservée, sa date reste visible et un message indique l'échec. Aucune liste partielle ne remplace une liste complète.

**Limite sans JavaScript :** les robots ou visiteurs ne lançant pas le script voient le HTML daté de la dernière génération. Il faut régénérer ce HTML lors d'une future publication du site pour actualiser cette représentation. Aucun pipeline de déploiement automatique n'est ajouté dans ce lot.

## Contrôles dans l'admin existant

Panneau « Anomalies territoriales à vérifier » dans **Événements**, sur `admin.html` et `admin-v11.html`, gardés identiques avec leur manifeste de contrôle actualisé.

- Par défaut : annonces publiées à venir ou aux dates à confirmer ; un filtre donne accès à toutes les alertes, archives comprises.
- Contrôles : pays/territoire inconnu, dates manquantes/invalides/inversées, titre ou ville absent, doublons exacts et observations sourcées.
- Bouton « Vérifier / corriger la fiche » : ouvre le panneau de détail existant, puis son éditeur habituel. Aucun nouveau parcours d'écriture, de fusion ou de suppression.
- Recalcul depuis le contexte admin après rafraîchissement/enregistrement. La correction 26–27 septembre résout l'alerte Mons, sans toucher à la publication.
- Panneau vidé et masqué à la déconnexion. En cas de chargement incomplet/erreur du contexte, il n'annonce pas « aucune anomalie ».
- Périmètre clairement affiché : événements déjà chargés par le contexte admin, actuellement plafonné à 1 000 par son chargeur existant. Aucune prétention à un audit de toute la base privée au-delà de ce périmètre.
- Aucun acquittement persistant ni masquage manuel ajouté. Une alerte peut être un faux positif ; l'absence d'alerte n'est pas une validation exhaustive.

## Référentiel, architecture et dates

Le référentiel reprend `geography.js` : France (13 régions métropolitaines), Belgique (3 régions), Luxembourg (12 cantons), Suisse (26 cantons), Monaco (1 territoire). Il ne prétend pas couvrir tous les pays ou territoires français.

`FR-BRE` et `BE-WAL` identifient les pilotes ; les autres codes `XX-local-NN` sont internes et persistants, pas des codes ISO. Ne pas réattribuer ces identifiants quand un libellé change. Le schéma distant reste inchangé.

L'audit inventorie les pages/canoniques existantes, les compteurs et six collisions entre anciens suffixes numériques de fiches statiques. Les pilotes utilisent les UUID actuels via `event.html?id=…`, sans reconstruire des correspondances incertaines vers ces anciennes fiches.

Bretagne garde son URL régionale et son en-tête/pied de page. Wallonie est le second pilote, relié à la page Belgique. L'accueil présente les deux liens. Aucune généralisation aux autres territoires.

Dates : fin inclusive ; sans fin, journée de début ; futurs chronologiques et archives par année décroissante. Création publique de Bretagne non établie (présence Git depuis le 27 avril 2026) ; Wallonie créée localement le 22 septembre. La date affichée du catalogue correspond à sa lecture réelle, pas à un `updated_at` inventé.

`registration_force_status=annule` signifie inscriptions annulées, pas nécessairement événement annulé. Cette limite reste affichée. Les lieux supplémentaires sont montrés seulement lorsque les observations organisatrices correspondent toujours au titre, à la ville et aux dates ; une correction du catalogue ne bloque jamais le rendu à cause d'une ancienne observation.

## Base de travail

- Dépôt utilisateur `/Users/leguillyjean-christophe/Documents/GitHub/Dedicalivres`, HEAD `ecee830`, checkout sale : intact.
- Clone isolé `/Users/leguillyjean-christophe/Documents/Codex/2026-09-22/files-pasted-by-the-user-dans/work/dedicalivres`.
- Branche `codex/pages-territoriales-seo-geo`, base `d28a0bc60bcd7cd207bed3c964a444fe6f5b8235` d'`origin/main` actualisé.
- Les scripts publics `app.js`, `event.js`, `local-preferences.js` correspondaient à cette base au contrôle horodaté dans [source-servie.json](source-servie.json). Ce contrôle ne prouve pas chaque ressource de production.

## Reproduction au Terminal

Depuis le clone :

```sh
npm run build:territories       # hors réseau, HTML à partir de la capture
npm run test:territories
npm run refresh:territories     # lecture publique puis génération locale, sans publication
python3 -m http.server 8765 --bind 127.0.0.1
```

Pilotes : `http://127.0.0.1:8765/evenements-litteraires-bretagne.html` et `http://127.0.0.1:8765/evenements-litteraires-wallonie.html`.

Recettes navigateur : `scripts/test-territorial-browser.mjs` et `scripts/test-territorial-live.mjs`. Playwright requis ; `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_BROWSERS_PATH` et `TEST_OUTPUT` configurables. Les tests utilisent des réponses publiques capturées et un contexte admin simulé ; aucune connexion admin réelle ou écriture réseau.

## Preuves et limites

PASS : égalité exacte des annonces publiées et des listes pilotes, dates, compteurs, canoniques, liens, rendu reproductible, collisions/erreurs de lecture contrôlées. Tests existants des préférences, catalogue public, inscriptions et cohérence des entrées admin.

Recette navigateur : desktop/mobile et JavaScript activé/désactivé ; ajout d'une annonce après ouverture ; correction de dates après ouverture ; échec de lecture sans perte ; admin avec alerte Mons active sur ancienne valeur puis résolue sur nouvelle valeur ; ouverture du vrai panneau de fiche ; masquage après déconnexion. Captures réelles du rendu des pages et du panneau admin avec contexte simulé.

Favoris et calendrier inchangés : test du favori après rechargement et téléchargement ICS explicite, dates du 10 au 11 octobre avec fin exclusive au 12 et UID existant. Pas de preuve d'import/rappels dans tous les agendas ; extensions différées à RÉG-04.

Les contrôles ne couvrent pas toutes les erreurs éditoriales possibles. Les rattachements erronés restent visibles selon les données publiées jusqu'à une décision admin. Les anciennes fiches statiques ambiguës ne sont pas corrigées par ce lot. L'indexation et les gains SEO/GEO ne sont pas mesurés ; sitemaps et robots inchangés.

Arrêt local : aucun push, fusion, déploiement, changement de schéma ou modification distante. Les deux pilotes restent le périmètre public du lot.
