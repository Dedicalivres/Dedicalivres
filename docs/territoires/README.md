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

## Rafraîchissement temporel isolé (SITE-SEO-GEO-01)

La date de capture décrit la provenance du catalogue ; elle n’est pas la date du classement. Les générateurs utilisent désormais le jour Europe/Paris, ou la référence explicite `PUBLICATION_REFERENCE_DATE`. Début strictement futur : à venir ; début atteint et fin incluse : en cours ; lendemain de la fin : archives. Les aperçus « Prochains événements » excluent les événements en cours ; l’accueil dispose d’un aperçu statique séparé pour « Aujourd’hui et en cours ». Les catégories territoriales « À venir et en cours » conservent leur regroupement explicite.

Préparer le diff complet, sans modifier le site ni récupérer des données métier :

```sh
python3 scripts/refresh-temporal-catalogues.py --output /tmp/dedicalivres-temporal-preview
# Date simulée facultative : --today 2026-10-26
```

Le dossier de sortie doit être nouveau et extérieur au dépôt. Le programme clone localement la base, réutilise les générateurs existants et leur garde d’agrégats avec **zéro événement autorisé à changer**, puis vérifie une deuxième génération identique. Il produit uniquement `projection.patch` et `report.json`. Il ne réserve aucun job, ne capture pas Supabase, ne modifie aucune fiche Event ou auteur, et ne publie rien.

Contrôles : corpus canonique complet, aucune suppression, aucune nouvelle page sauf pagination France justifiée, garde existante de présentation métier, statuts des aperçus et territoires, métadonnées SEO et données structurées conservées hors dateModified, liens canoniques inchangés, sitemap XML valide avec URLs uniques et ordre préservé. Le lastmod n’évolue que pour une page dont le contenu change effectivement. Les 282 fiches historiques restent couvertes par l’interdiction de modifier **toutes** les fiches Event. Les données, manifests et capturedAt restent inchangés. Toute sortie hors périmètre ou au-delà de 250 fichiers provoque STOP avant production d’un artefact valide.

Le workflow `refresh-event-index.yml` conserve son calendrier quotidien existant et le verrou commun `dedicalivres-event-publication` pendant les deux jobs successifs. **A — refresh-index** rétablit le rafraîchissement existant depuis les fiches publiées : garde de diff stricte, seuls `evenement/index.html` et `sitemap-evenements.xml` peuvent être committés/poussés, sans accès Supabase ni publication métier. Son token dispose de `contents: write` (GitHub ne permet pas une permission limitée par chemin ; la restriction des deux fichiers est imposée par la garde et le staging explicite). **B — project-temporal**, dépendant du succès de A, possède seulement `contents: read` et des credentials non persistés. Il relit main, vérifie le SHA émis par A et produit uniquement l’artefact complet à examiner. Une modification externe de main entre les jobs provoque STOP. Aucun nouveau calendrier, aucune modification de `publish-events.yml`, aucune activation de `PUBLICATION_AUTOMATION_ENABLED`. Les autres HTML publics ne changent pas avant une livraison explicitement autorisée du diff revu.

Tests hors réseau : `python3 scripts/test-temporal-catalogues.py`. Ils couvrent les 18, 19, 20, 25 et 26 octobre 2026, les bornes inclusives, le changement d’heure, l’idempotence et les refus de périmètre/corpus/sitemap. Les rapports de projection donnent les listes exactes ; aucun nombre permanent d’événements n’est codé dans ce nouveau parcours.

### Vérification des pages villes (R2)

Les 20 pages villes sont intitulées « Événements littéraires à … » et leur aperçu ne porte pas le libellé « Prochains événements ». `citySelection()` regroupe donc légitimement les événements futurs et en cours, puis affiche des références historiques quand aucun événement actif n’existe. Aucune modification de sélection ou de mise en page n’est nécessaire sur ces pages. Les aperçus explicitement nommés « Prochains événements » (accueil et catégories) restent strictement futurs, avec contrôles dédiés. Tests de référence : ville avec futur + en cours, ville avec seulement en cours, repli historique, villes vides.

## Audit ciblé SITE-SEO-GEO-02-03 — 19 octobre 2026

Base : `10a26bc52020d0b84c7c68eca3175ca675282ceb` (PR #238 fusionnée). Trois fiches examinées ; aucune donnée métier, fiche publiée ou workflow modifié par ce lot. La présence de données JSON-LD ne prouve pas leur exactitude : ici, plusieurs informations visibles et structurées reproduisent les mêmes erreurs de source.

| Fiche et identité conservée | Informations publiées | Vérification officielle | Décision |
| --- | --- | --- | --- |
| Foire de Brive — `83270534-e551-4562-8805-f10240a6007c` | Titre « 44 eme foire du livre de Brive » ; ville Brives, région Centre-Val de Loire ; France ; 6–8 novembre 2026 ; lieu JSON-LD Brives, adresse/postal absents ; organizer.name Brives | [Site organisateur](https://www.foiredulivredebrive.net/) : 44e édition, 6–8 novembre, organisée par la Ville de Brive. [Office de tourisme](https://www.brive-tourisme.com/fr/agenda/grands-rendez-vous/foire-du-livre-brive/) : Brive-la-Gaillarde, Corrèze. [Ville](https://www.brive.fr/communaute-dagglomeration/) : Corrèze, Nouvelle-Aquitaine. | Ville/région erronées ; dates et pays corrects. Département attendu Corrèze (19), non représenté séparément. Nom acceptable, typographie non prioritaire. Correction métier requise avant toute livraison. |
| Senlis — `ec8ec360-b0c4-41ca-b400-87dd1ffde104` | Titre assorti du nom de l’office de tourisme ; Senlis, Hauts-de-France, France ; 30 septembre 2026 seul ; lieu JSON-LD « Adresse » ; Place Saint-Pierre, 60300 ; organizer.name Senlis | [Ville](https://www.ville-senlis.fr/salon-du-livre-de-senlis/) : programme 29 septembre–4 octobre ; rencontres publiques à l’Espace Saint-Pierre les 3–4 octobre. [Office de tourisme](https://www.visitchantillysenlis.com/agenda/salon-du-livre-de-senlis-2026/) : introduction encore datée du 30 septembre, mais agenda détaillé et ouverture le 29 septembre ; organisation bibliothèque municipale avec partenaires. [INSEE](https://www.insee.fr/fr/metadonnees/geographie/commune/60612-senlis) : Oise (60), Hauts-de-France. | Réduction à une seule journée fausse, et contradictoire avec la description visible allant jusqu’au 4 octobre. Choisir explicitement le périmètre : programme complet 29/09–04/10, ou salon public 03–04/10. Lieu « Adresse » non informatif ; Espace Saint-Pierre ne couvre pas à lui seul les animations multisites de la semaine. Géographie et pays corrects ; aucune date inventée ni correction automatique. |
| Lorient — `eb6672b2-900f-4c6a-9021-ea84c5036769` | Salon du livre jeunesse du Pays de Lorient ; Lorient, Bretagne, France ; 21–26 novembre 2026 ; JSON-LD Palais des Congrès de Lorient, streetAddress « Quai Gustave Mansion 56100 Lorient », postalCode 56100 ; organizer.name Lorient | [Infos organisateur](https://salondulivrejeunesselorient.fr/infos-pratiques/) : 20–25 novembre 2026, Palais des congrès, Quai Gustave Mansion, 56100 Lorient. [Gestionnaire du lieu](https://lorient-evenements.bzh/agenda/salon-livre-jeunesse-lorient-26/) : mêmes dates, organisation Ligue de l’enseignement du Morbihan. [Ville sur data.gouv.fr](https://www.data.gouv.fr/organizations/ville-de-lorient/dataservices) : Morbihan, Bretagne. | Dates décalées d’un jour ; ville/région/pays et lieu corrects. Département attendu Morbihan (56), non représenté séparément. Le code postal et la ville sont déjà incorporés à streetAddress, puis répétés dans l’affichage ; normalisation à autoriser comme enrichissement. |

### Lieux, adresses et organisateurs

- Brive est un événement multisite : [FAQ de l’organisateur](https://www.foiredulivredebrive.net/faq/) et [informations pratiques de l’office](https://www.brive-tourisme.com/fr/agenda/grands-rendez-vous/foire-du-livre-brive/infos-pratiques/) indiquent Halle Brassens / place du 14 juillet et Espace des Trois Provinces. L’adresse postale de contact de la mairie n’est pas une adresse du salon. Ne pas inventer un numéro de rue ni réduire le programme à un site unique.
- Senlis : Espace Saint-Pierre / place Saint-Pierre, 60300, pour le salon public des 3–4 octobre ([programme patrimonial municipal confirmant l’adresse](https://www.ville-senlis.fr/app/uploads/2025/03/JEP-Programme-2023-2023-08-25-v05.pdf)). Le programme complet comprend aussi bibliothèque, Manège Ordener, établissements scolaires et cinéma : l’étendue temporelle doit être décidée avec le lieu correspondant.
- Les organisateurs attestés sont Ville de Brive, bibliothèque municipale de Senlis avec partenaires, et Ligue de l’enseignement du Morbihan. Aucun de ces noms ne doit être remplacé automatiquement par une ville ou par Dédicalivres. Leur introduction dans les fiches existantes exige un enrichissement autorisé ; ce lot ne crée aucun champ Supabase.

### Défaut commun et correction du générateur

`jsonld_event()` déduisait une Organization de la présence d’un site web, en nommant cet organisateur d’après la ville. Une URL officielle seule n’identifie pas une personne morale. Le générateur cesse cette déduction : pour un nouvel événement sans organisateur connu, il omet `organizer`. Pour un UUID déjà publié, il conserve exactement la valeur du JSON-LD publié, après contrôle du manifeste, du chemin, du canonical et de l’unicité de l’Event. Une source publiée incohérente provoque STOP.

Cette conservation est une garantie de non-réécriture et **pas une validation des anciennes valeurs** : les trois organizer.name erronés restent actuellement publiés et attendent une autorisation métier. La suppression globale de ces anciennes valeurs ferait échouer les gardes de contenu tiers et de perte d’enrichissement ; ces gardes restent intactes. Aucun autre événement n’est régénéré ou modifié par ce lot.

### Contrôles structurés et portée

Event.name, startDate/endDate, Place.address, PostalAddress et les informations visibles ont été comparés. Le champ historique interne `departement` reçoit en réalité la région dans la normalisation publique ; son émission en `addressRegion` ne prouve donc pas un département. Ne pas convertir une région en département par simple renommage. Dates seules conservées comme dates seules : aucune heure ni fuseau n’est inventé. Le lieu précis peut être présent dans le JSON-LD sans être affiché dans le résumé visible : manque de détail, pas preuve d’un autre lieu.

Les trois URLs canoniques et les UUID sont conservés, même lorsque le slug contient l’ancienne ville ou un identifiant numérique. Les BreadcrumbList terminent sur ces mêmes URLs, sans collision de canonical. Aucun sitemap, archive ou lien n’est modifié. Les tests dans `scripts/test-progressive-event-generator.py`, déjà exécutés par la CI existante, vérifient la non-invention de l’organisateur, la préservation de tous les organisateurs publiés, le STOP sur une source incohérente et le maintien Event/Place/PostalAddress/Breadcrumb/dates/UUID/canonical. Les autres suites de publication restent nécessaires avant livraison.

**Autorisation métier distincte requise** : Brive (ville/région), Lorient (début/fin et adresse structurée), Senlis (périmètre de dates, lieu et nom éditorial), et enrichissement vérifié des trois organisateurs. Ni Supabase ni les manifests métier n’ont été modifiés. Aucun correctif de données ne doit être appliqué tant que cette autorisation et le parcours de protection approprié ne sont pas établis.
