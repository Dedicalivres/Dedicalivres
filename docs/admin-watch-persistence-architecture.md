# Architecture de persistance durable — Veille / Sources / Event Watch

Statut : spécification d’architecture pour les Packs 5B et suivants.

Date de l’audit : 2026-08-28.

Ce document ne constitue ni une migration, ni une autorisation d’écriture en production.

## 1. État actuel

### 1.1 Inventaire technique

| Emplacement | Données observées | Durée actuelle |
|---|---|---|
| Mémoire JavaScript | `lastResults`, éditions de candidats, `lastPagination`, `watchOffset`, filtres, `lastWatchAnalysisAt`, `eventWatchAlerts`, catégorie et filtre Event Watch, disponibilité du bridge, caches doublons | Onglet/session |
| `localStorage` | `dedicalivres_admin_watch_workflow_v2` : état et `updatedAt` par clé candidat | Navigateur/appareil |
| `localStorage` | `dedicalivres_admin_watch_productive_sources_v1` : URL, titre, compteurs/métriques, contexte du dernier lot, `analysesCount`, `firstSeenAt`, `lastSeenAt` | Navigateur/appareil |
| `localStorage` | `dedicalivres_admin_event_watch_workflow_v1` : état et `updatedAt` par clé alerte | Navigateur/appareil |
| `localStorage` | `dedicalivres_admin_watch_history_v1` : source, titre, date, ville, type et `handledAt` | Navigateur/appareil |
| `localStorage` | `automatte_event_watch_endpoint` | Configuration strictement locale |
| Supabase existant | Authentification, registre `admin_users`, helper `private.is_admin()`, table publique `events`; lecture de doublons et insertion humaine d’un événement en attente | Serveur |
| Worker Veille | Résultats candidats complets et pagination | Réponse transitoire |
| Moteur local Event Watch | Alertes, anciennes/nouvelles valeurs, preuve, source et métadonnées de détection | Moteur/SQLite local, hors Admin |

Le pont V11 expose l’état d’authentification à l’Admin et maintient `window.V11_WATCH_WRITE_GUARD = true`. Il bloque actuellement les boutons de soumission Veille dans l’interface V11. Le futur stockage de workflow ne doit ni lever ce verrou, ni devenir un chemin de publication.

### 1.2 Données dérivées aujourd’hui

Ne sont pas des sources de vérité :

- état initial candidat `ready` ou `review`, dérivé de la complétude ;
- qualité candidat, qualité image et signal de doublon probable ;
- taux de complétude, d’image et de doublon d’une source ;
- score et badge de rendement ;
- priorité Event Watch ;
- compteurs et top sources du cockpit ;
- dernière activité, calculée comme le maximum de timestamps existants ;
- état de disponibilité du bridge local.

### 1.3 Limites constatées

- Un état traité sur un appareil reste inconnu des autres appareils.
- Les clés locales empêchent le retraitement sur un seul navigateur, pas globalement.
- Les décisions n’identifient pas l’admin qui les a prises.
- Le reset local supprime l’unique trace de plusieurs décisions.
- Les métriques de sources stockées actuellement sont principalement un état du dernier calcul ; seul `analysesCount` est explicitement cumulé.
- Les alertes Event Watch sont relisibles seulement lorsque le moteur local est joignable.
- Une introspection en lecture seule de la production Supabase le 2026-08-28 confirme que `public.events.id` est de type `uuid`, non nullable, avec `gen_random_uuid()` comme valeur par défaut. L’ancien `live-schema.sql` mentionnant un `bigint` est donc obsolète pour ce point.

## 2. Classification des données

### 2.1 Doit devenir durable côté serveur

| Domaine | Données | Justification |
|---|---|---|
| Candidat Veille | UUID serveur, clé d’identité immuable, URL canonique si disponible, titre/date/ville minimaux | Retrouver le même candidat entre analyses et appareils sans conserver tout le payload Worker |
| Candidat Veille | État courant, date et admin de la décision, version de concurrence | Continuité et audit humain |
| Candidat Veille | Référence vers l’événement doublon et/ou soumis, si connue | Ne pas répéter une soumission ou une revue de doublon |
| Source | URL canonique, première/dernière observation, nombre d’analyses, compteurs cumulés connus | Partager l’intelligence de source et éviter sa perte |
| Alerte Event Watch | Identité moteur ou fallback déterministe, événement lié, type, ancien/nouveau, source/preuve, `detected_at` | Rendre l’alerte et son contexte consultables sans dépendre du Mac |
| Alerte Event Watch | État humain, date de décision, admin et version | Continuité multi-appareil et traçabilité |
| Audit | Transitions d’état append-only | Répondre à « qui a décidé quoi, quand ? » |

### 2.2 Pourrait devenir durable plus tard

- payload candidat de revue plus complet : description, image, auteurs, lieu détaillé ;
- notes de revue, affectation à un admin, date de prise en charge ;
- historique détaillé de chaque exécution d’une source ;
- statut actif/inactif et fréquence recommandée d’une source ;
- motifs structurés d’écartement ou de confirmation ;
- alertes techniques d’ingestion et statistiques de latence ;
- aliases d’identité dédiés si les faux doublons de candidats deviennent significatifs.

Ces éléments ne doivent être ajoutés qu’après un besoin d’interface et une politique de rétention explicites.

### 2.3 Doit rester local

- filtre courant, catégorie, sélection, position de scroll et état d’ouverture UI ;
- pagination et offset Worker ;
- endpoint loopback Auto-Matte/Event Watch ;
- disponibilité du bridge et dernier résultat de health check ;
- caches de requêtes doublon ;
- données de preview non confirmées et presse-papiers ;
- payload Worker complet tant qu’il n’existe pas de contrat de conservation.

### 2.4 Doit rester dérivable et non stocké

- compteurs du cockpit ;
- top trois sources ;
- score/badge de rendement et qualité de source ;
- taux calculés depuis les compteurs ;
- priorité d’une alerte Event Watch ;
- statut `ready` initial tant qu’aucune ligne candidat n’est admise côté serveur ;
- dernière activité ;
- libellés français d’état.

Le statut de doublon **certain** et le lien vers l’événement correspondant doivent toutefois être durables une fois confirmés. Le score ou les raisons de rapprochement restent recalculables.

### Vérification production effectuée le 2026-08-28

Introspection Supabase en lecture seule :

- `public.events.id` : `uuid`, `NOT NULL`, défaut `gen_random_uuid()` ;
- `public.admin_users.user_id` : `uuid` ;
- `private.is_admin()` : présente, retourne `boolean`, `SECURITY DEFINER` ;
- extension `pgcrypto` : présente ;
- aucune migration ni écriture n’a été exécutée pendant cette vérification.

## 3. Modèle recommandé

Le modèle minimal recommandé contient quatre tables privées à l’Admin dans le schéma `public`, protégées par RLS :

1. `admin_watch_candidates` : identité minimale et état courant d’un candidat ;
2. `admin_watch_sources` : registre agrégé des sources ;
3. `admin_event_watch_alerts` : copie normalisée des alertes utiles à la revue ;
4. `admin_watch_transitions` : journal append-only commun aux deux workflows.

Ce choix conserve des colonnes typées pour les champs interrogés, évite de stocker les payloads complets et limite l’historique à une seule table. Le journal commun utilise deux clés étrangères nullables avec une contrainte imposant qu’exactement une cible soit renseignée ; il ne s’agit donc pas d’une référence polymorphe non contrôlée.

### 3.1 Préconditions du Pack 5B

Avant de produire du SQL :

1. `public.events.id` est confirmé en production comme `uuid`, non nullable, avec `gen_random_uuid()` ;
2. `private.is_admin()` est confirmé présent, retourne `boolean` et est `SECURITY DEFINER` ;
3. relever/resserrer explicitement les privilèges nécessaires aux nouvelles tables plutôt que d’hériter implicitement des grants existants ;
4. `pgcrypto` est confirmé disponible en production ;
5. décider si les tables restent dans `public` avec RLS ou dans un schéma API dédié. Le frontend Supabase actuel rend `public` + RLS le chemin le moins disruptif.

## 4. Tables proposées

Le type réel de `public.events.id` ayant été vérifié en production, toutes les références événement ci-dessous utilisent désormais explicitement le type PostgreSQL `uuid`.

### 4.1 `admin_watch_candidates`

Rôle : conserver une empreinte minimale du candidat et son workflow, sans archiver la réponse Worker complète.

| Colonne | Type PostgreSQL | Null | Défaut / contrainte |
|---|---|---:|---|
| `id` | `uuid` | non | PK, `gen_random_uuid()` |
| `identity_key` | `text` | non | UNIQUE, immuable, format versionné |
| `match_fingerprint` | `text` | oui | index non unique, recalculable pour rapprochement |
| `origin_url` | `text` | oui | URL reçue ; nullable pour certains imports legacy |
| `canonical_origin_url` | `text` | oui | URL sans tracking/fragment |
| `source_id` | `uuid` | oui | FK `admin_watch_sources(id)`, `ON DELETE SET NULL` |
| `title` | `text` | oui | snapshot minimal de revue |
| `start_date` | `date` | oui | snapshot minimal de revue |
| `city` | `text` | oui | snapshot minimal de revue |
| `workflow_status` | `text` | non | `review`; CHECK `ready, review, duplicate, submitted, handled, rejected` |
| `duplicate_event_id` | `uuid` | oui | FK `events(id)`, `ON DELETE SET NULL` |
| `submitted_event_id` | `uuid` | oui | FK `events(id)`, `ON DELETE SET NULL` |
| `first_seen_at` | `timestamptz` | non | `now()` |
| `last_seen_at` | `timestamptz` | non | `now()` |
| `status_updated_at` | `timestamptz` | non | `now()`, piloté par trigger |
| `status_updated_by` | `uuid` | oui | FK `auth.users(id)`, `ON DELETE SET NULL`, piloté par trigger |
| `created_at` | `timestamptz` | non | `now()` |
| `updated_at` | `timestamptz` | non | `now()`, piloté par trigger |
| `version` | `bigint` | non | `1`, CHECK `version > 0`, incrémenté à chaque UPDATE |

Index nécessaires : UNIQUE sur `identity_key`, index sur `(workflow_status, status_updated_at desc)`, `last_seen_at desc`, `source_id`, `duplicate_event_id`, `submitted_event_id` et `status_updated_by`. PostgreSQL n’indexe pas automatiquement les clés étrangères.

Ne pas ajouter de contrainte imposant que `duplicate_event_id` soit nul hors état `duplicate` : conserver le lien reste utile si l’état devient ensuite `handled`.

### 4.2 `admin_watch_sources`

Rôle : conserver une agrégation partagée, pas le détail de chaque run.

| Colonne | Type PostgreSQL | Null | Défaut / contrainte |
|---|---|---:|---|
| `id` | `uuid` | non | PK, `gen_random_uuid()` |
| `canonical_url` | `text` | non | URL normalisée |
| `url_hash` | `text` | non | UNIQUE, `source:v1:sha256(canonical_url)` |
| `source_url` | `text` | non | URL d’affichage la plus récente |
| `title` | `text` | oui | libellé/domaine |
| `first_seen_at` | `timestamptz` | non | `now()` |
| `last_seen_at` | `timestamptz` | non | `now()` |
| `analyses_count` | `bigint` | non | `0`, CHECK `>= 0` |
| `metrics_since` | `timestamptz` | oui | début connu de couverture des agrégats |
| `observed_count` | `bigint` | oui | CHECK `>= 0` |
| `complete_count` | `bigint` | oui | CHECK `>= 0` |
| `review_count` | `bigint` | oui | CHECK `>= 0` |
| `rejected_count` | `bigint` | oui | CHECK `>= 0` |
| `duplicate_certain_count` | `bigint` | oui | CHECK `>= 0` |
| `duplicate_probable_count` | `bigint` | oui | CHECK `>= 0` |
| `with_image_count` | `bigint` | oui | CHECK `>= 0` |
| `without_image_count` | `bigint` | oui | CHECK `>= 0` |
| `is_active` | `boolean` | non | `true` |
| `created_at` | `timestamptz` | non | `now()` |
| `updated_at` | `timestamptz` | non | `now()` |
| `version` | `bigint` | non | `1`, CHECK `version > 0` |

Les compteurs sont nullables afin de distinguer « inconnu dans un ancien objet partiel » de zéro. Les taux, rendement et qualité ne sont pas des colonnes. Index : UNIQUE `url_hash`, `(is_active, last_seen_at desc)` et `last_seen_at desc`. L’upsert doit aussi comparer `canonical_url` en cas de conflit de hash, même si une collision SHA-256 est extrêmement improbable.

Le dernier offset, les filtres pays/type et la pagination restent locaux. `last_seen_at` représente la dernière analyse utile. Si un futur besoin exige l’explication run par run, une table séparée sera ajoutée, sans surcharger cette première migration.

### 4.3 `admin_event_watch_alerts`

Rôle : conserver une copie compacte de l’alerte détectée et la décision humaine. Cette table ne modifie jamais `events`.

| Colonne | Type PostgreSQL | Null | Défaut / contrainte |
|---|---|---:|---|
| `id` | `uuid` | non | PK, `gen_random_uuid()` |
| `identity_key` | `text` | non | UNIQUE, immuable, format versionné |
| `engine_origin` | `text` | non | `automatte-local` |
| `engine_alert_id` | `text` | oui | identifiant réellement fourni par le moteur |
| `event_id` | `uuid` | oui | FK `events(id)`, `ON DELETE SET NULL` |
| `field` | `text` | non | type de changement réel |
| `field_label` | `text` | oui | libellé reçu |
| `event_title` | `text` | oui | snapshot d’affichage |
| `event_date` | `date` | oui | snapshot d’affichage |
| `event_city` | `text` | oui | snapshot d’affichage |
| `old_value` | `jsonb` | oui | valeur typée reçue |
| `new_value` | `jsonb` | oui | valeur typée reçue |
| `source_url` | `text` | oui | URL validée/canonique |
| `proof` | `jsonb` | oui | preuve structurée, sans HTML brut |
| `detected_at` | `timestamptz` | non | horodatage moteur |
| `confidence` | `numeric(5,4)` | oui | normalisé entre 0 et 1, CHECK |
| `status_label` | `text` | oui | libellé moteur informatif |
| `workflow_status` | `text` | non | `review`; CHECK `review, confirmed, ignored, handled` |
| `status_updated_at` | `timestamptz` | non | `now()`, piloté par trigger |
| `status_updated_by` | `uuid` | oui | FK `auth.users(id)`, `ON DELETE SET NULL` |
| `created_at` | `timestamptz` | non | `now()` |
| `updated_at` | `timestamptz` | non | `now()` |
| `version` | `bigint` | non | `1`, incrémenté à chaque UPDATE |

Contraintes/index : UNIQUE `identity_key`; UNIQUE partiel `(engine_origin, engine_alert_id)` lorsque l’ID moteur n’est pas nul ; index `(workflow_status, detected_at desc)`, `event_id`, `field`, `detected_at desc` et `status_updated_by`.

### 4.4 `admin_watch_transitions`

Rôle : audit append-only des décisions candidates et Event Watch.

| Colonne | Type PostgreSQL | Null | Défaut / contrainte |
|---|---|---:|---|
| `id` | `bigint generated always as identity` | non | PK |
| `candidate_id` | `uuid` | oui | FK `admin_watch_candidates(id)`, `ON DELETE RESTRICT` |
| `event_watch_alert_id` | `uuid` | oui | FK `admin_event_watch_alerts(id)`, `ON DELETE RESTRICT` |
| `from_status` | `text` | oui | nul seulement à la création initiale/import |
| `to_status` | `text` | non | état réellement appliqué |
| `changed_at` | `timestamptz` | non | `now()` |
| `changed_by` | `uuid` | oui | FK `auth.users(id)`, `ON DELETE SET NULL` |
| `change_source` | `text` | non | `admin-ui`; CHECK `admin-ui, legacy-import, system` |
| `reason` | `text` | oui | motif humain court, futur |
| `metadata` | `jsonb` | non | `{}`, objet uniquement, sans payload complet |

Une CHECK impose exactement une cible : `(candidate_id IS NOT NULL) <> (event_watch_alert_id IS NOT NULL)`. Deux CHECK supplémentaires limitent `from_status`/`to_status` au vocabulaire de la cible renseignée. Index : `(candidate_id, changed_at desc)`, `(event_watch_alert_id, changed_at desc)`, `changed_by` et `changed_at desc`.

Aucun `updated_at` : une transition ne se modifie pas. Pas de DELETE applicatif.

## 5. Identifiants stables

### 5.1 Normalisation commune des URL

Définir une fonction pure, versionnée et testée :

- schéma et hôte en minuscules ;
- suppression du fragment ;
- suppression des ports par défaut ;
- normalisation du slash final ;
- suppression des paramètres de tracking connus (`utm_*`, `fbclid`, `gclid`, etc.) ;
- tri des paramètres sémantiques restants ;
- aucune résolution réseau ni suivi de redirection pendant le calcul.

Conserver l’URL reçue pour affichage et l’URL canonique pour l’identité.

### 5.2 Candidat Veille

- PK : UUID serveur, seule référence relationnelle durable.
- Clé d’idempotence : `candidate:v1:sha256(...)`.
- Si le Worker fournit plus tard un identifiant source stable, le préférer.
- Fallback initial : URL canonique + titre normalisé + date ISO + ville normalisée.
- `identity_key` reste immuable après création ; `match_fingerprint` peut évoluer.

Pour résister aux changements de titre/date : rechercher d’abord l’`identity_key`, puis un candidat unique portant la même URL canonique et des champs proches. Si la page est réutilisée pour une nouvelle édition, ne pas fusionner automatiquement : créer un nouvel UUID et laisser le contrôle doublon signaler le rapprochement. Les aliases ne deviennent nécessaires que si les mesures montrent des doublons résiduels.

Les clés locales existantes sont importées sous un namespace `legacy-watch-v2:` et hashées ; jamais d’index de tableau.

### 5.3 Source

- PK : UUID serveur.
- UNIQUE : hash versionné de l’URL canonique ; l’URL elle-même reste stockée et comparée.
- Une redirection permanente connue pourra mettre à jour l’URL d’affichage, mais pas silencieusement fusionner deux sources sans contrôle.

### 5.4 Alerte Event Watch

- PK : UUID serveur.
- Priorité d’identité : `(engine_origin, engine_alert_id)` si l’ID moteur existe.
- Fallback : `event-watch:v1:sha256(event_id | field | old_value normalisée | new_value normalisée | source canonique | detected_at)`.

Le fallback rend la réimportation d’une même détection idempotente, tout en conservant comme alertes distinctes deux détections identiques survenues à des dates différentes.

## 6. État courant et historique

### Option A — état courant seulement

Colonnes `workflow_status`, `status_updated_at`, `status_updated_by` sur les tables principales.

Avantages : trois tables seulement, lectures simples, faible volume.

Inconvénients : perte des transitions, impossible d’expliquer une décision remplacée, audit et rollback faibles.

### Option B — état courant + journal append-only

État courant sur la ligne principale pour les files et compteurs, plus `admin_watch_transitions` pour l’audit.

Avantages : lecture rapide et historique fiable ; coût faible car seules les transitions sont journalisées ; diagnostic des imports et conflits.

Inconvénients : quatrième table et nécessité de garantir l’atomicité.

### Recommandation

Choisir l’option B. L’audit humain est un objectif explicite et le volume de transitions sera très inférieur au volume des résultats Worker.

Le changement d’état et l’insertion de transition doivent être atomiques. Le Pack 5B devra préparer un trigger privé partagé qui :

1. compare l’ancien et le nouvel état ;
2. force `status_updated_at = now()` et `status_updated_by = auth.uid()` ;
3. incrémente `version` ;
4. insère la transition si l’état change.

La fonction de trigger ne doit pas être exposée comme RPC. Pour pouvoir écrire le journal sans grant client, elle peut être `SECURITY DEFINER` dans le schéma `private`, avec `search_path` vide, noms pleinement qualifiés, vérification explicite de `private.is_admin()` et `EXECUTE` révoqué à `PUBLIC`, `anon` et `authenticated`. Elle reste attachée uniquement aux triggers des deux tables. Les clients ne reçoivent aucun droit direct INSERT/UPDATE/DELETE sur le journal.

## 7. Authentification, privilèges et RLS

### 7.1 Mécanisme existant à réutiliser

Le dépôt utilise Supabase Auth côté Admin, `public.admin_users(user_id)` et `private.is_admin()` basé sur `auth.uid()`. C’est la source d’autorisation à conserver. Le booléen JavaScript `DEDICALIVRES_ADMIN_AUTHENTICATED` protège l’UI, mais ne constitue pas une autorisation base de données.

### 7.2 Matrice recommandée

| Opération | `anon` | `authenticated` non admin | Admin vérifié par `private.is_admin()` | `service_role` |
|---|---:|---:|---:|---:|
| SELECT tables principales | refus | refus RLS | autorisé | serveur seulement |
| INSERT tables principales | refus | refus RLS | autorisé dans les Packs d’écriture | ingestion serveur future seulement |
| UPDATE tables principales | refus | refus RLS | autorisé avec concurrence/version | serveur futur contrôlé |
| DELETE tables principales | refus | refus | refus applicatif | maintenance exceptionnelle hors frontend |
| SELECT journal | refus | refus | autorisé | serveur seulement |
| INSERT/UPDATE/DELETE journal | refus | refus | pas de droit direct ; trigger uniquement | maintenance contrôlée |

Règles :

- RLS activée sur les quatre tables ;
- `REVOKE ALL` pour `anon` et aucun policy public ;
- grants explicites minimaux à `authenticated` ;
- policies séparées SELECT/INSERT/UPDATE avec `TO authenticated` et `(select private.is_admin())`, afin d’évaluer le helper une seule fois par requête ;
- aucun policy DELETE et aucun grant DELETE ;
- aucun `USING (true)` ou `WITH CHECK (true)` pour une écriture ;
- `status_updated_by` forcé en base, pas accepté depuis le navigateur ;
- index sur les colonnes de files et sur les références utilisées dans les policies/requêtes ;
- tests pgTAP allow/deny pour `anon`, authentifié non admin et admin.

`service_role` n’est requis ni pour le navigateur Admin, ni pour le bridge local. Il contourne RLS et ne doit jamais être embarqué dans un fichier frontend ou une configuration Auto-Matte. Une future ingestion machine devra utiliser une fonction serveur étroite avec secret serveur et contrat d’écriture limité.

Références officielles consultées : [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Securing your API](https://supabase.com/docs/guides/api/securing-your-api), [Securing your data](https://supabase.com/docs/guides/database/secure-data).

## 8. Migration progressive depuis `localStorage`

### Phase 1 — lecture serveur avec fallback local

- Déployer tables/RLS, puis un repository JS en lecture seule derrière un feature flag.
- Lire le serveur lorsque la session admin et RLS l’autorisent.
- En cas de table vide/indisponible, conserver exactement les lecteurs locaux actuels.
- Ne faire aucun dual-write implicite.

### Phase 2 — import explicitement contrôlé

- Ajouter une action Admin « Prévisualiser l’import local ».
- Parser séparément workflow candidat v2, sources v1, workflow Event Watch v1 et ancien historique.
- Afficher lignes nouvelles, identiques, conflits et entrées illisibles avant confirmation.
- L’import est une action humaine authentifiée, jamais automatique au chargement.
- Upsert sur les clés uniques ; une relance produit le même résultat.

Règles de conflit :

1. si le serveur n’a pas la clé, créer la ligne ;
2. si état et timestamp sont identiques, ne rien faire ;
3. une ligne serveur fermée (`duplicate/submitted/handled/rejected` ou `confirmed/ignored/handled`) ne doit jamais être rouverte par un état local actif ;
4. entre deux décisions fermées, prendre la plus récente seulement si les deux timestamps sont valides et journaliser `legacy-import` ; sinon conserver le serveur et signaler le conflit ;
5. une ancienne entrée sans timestamp ne remplace jamais une décision serveur ;
6. les métriques absentes restent NULL, pas zéro.

### Phase 3 — serveur source de vérité

- Activer les écritures serveur une famille à la fois.
- Relire la ligne et sa `version` avant toute décision.
- Le localStorage devient cache de secours en lecture, jamais arbitre de conflit.
- Mesurer les écarts pendant une période d’observation.

### Phase 4 — retrait ou cache local

- Après validation, arrêter l’écriture dans les trois clés métier historiques.
- Conserver éventuellement un cache versionné, invalidable et non autoritatif.
- Ne supprimer les anciennes clés qu’après export/confirmation explicite de l’admin.

### Rollback

- Feature flag pour revenir au repository local sans supprimer les données serveur.
- Ne jamais rollbacker par suppression automatique des lignes importées.
- Conserver un rapport d’import et les transitions `legacy-import`.
- Si un pack d’écriture échoue, couper ce writer, garder les lectures et corriger dans un pack séparé.

## 9. Synchronisation multi-appareil

Approche recommandée : verrou optimiste simple, pas de verrou de prise en charge dans la première version.

- Chaque ligne possède `version` et `updated_at`.
- Une mise à jour envoie l’ID, l’état demandé et la version lue.
- L’UPDATE cible `id = ? AND version = ?`.
- Le trigger incrémente la version.
- Zéro ligne modifiée signifie conflit : recharger et demander une nouvelle décision humaine.
- Ne pas appliquer de last-write-wins silencieux aux workflows.

Cette approche empêche un iPhone de réouvrir ou écraser sans avertissement une décision prise sur Mac. Un rafraîchissement après écriture suffit initialement ; Realtime est possible plus tard, mais non requis pour la cohérence.

Pour les compteurs cumulés de sources, utiliser ultérieurement une opération atomique d’enregistrement de run. Ne pas lire-modifier-écrire les totaux dans deux requêtes navigateur, afin d’éviter une perte d’incrément.

## 10. Event Watch local et serveur

### Options évaluées

1. **Décisions seulement** : faible volume, mais une autre machine ne peut ni comprendre ni revoir l’alerte ; historique inutilisable si le Mac est éteint.
2. **Alertes seulement** : contexte partagé, mais les décisions restent divergentes.
3. **Alertes normalisées + décisions** : répond à la continuité et à l’audit avec un volume maîtrisé.

### Recommandation

Choisir l’option 3.

- Lors du chargement/rafraîchissement Event Watch déjà déclenché par un admin, upserter à terme la copie compacte des alertes, puis lire le workflow serveur.
- Ne pas ajouter polling, automatisation ou écriture vers le moteur local.
- Ne pas stocker HTML complet, captures de page ou payload non borné.
- Conserver `old_value`, `new_value` et `proof` en JSONB borné/validé.
- La disponibilité « Disponible/Indisponible » reste locale et non persistée.
- Si le Mac est éteint, les alertes déjà copiées restent consultables ; aucune nouvelle détection n’apparaît avant le retour du moteur. C’est une limitation explicite, pas une raison d’exposer `service_role` au bridge.

Une ingestion autonome éventuelle constitue un chantier séparé avec authentification machine, quotas, rétention et observabilité.

## 11. Sources productives

### A. Table agrégée unique

Peu de volume, lecture cockpit directe, migration simple. Ne donne pas le détail de chaque analyse.

### B. Sources + table de runs

Audit analytique complet et calculs reproductibles, mais croissance continue, politique de rétention et logique d’agrégation supplémentaires.

### C. Dernier état seulement

Proche du localStorage actuel, mais perd l’historique quantitatif et rend `analysesCount` peu fiable.

### Recommandation

Choisir A pour le premier cycle serveur : une table agrégée avec compteurs cumulés et `metrics_since`. Les objets legacy sont importés comme baseline connue, sans prétendre reconstruire les runs absents. Ajouter une table de runs seulement si une décision produit nécessite réellement des tendances par analyse.

Le rendement et la qualité restent calculés avec les fonctions existantes depuis les compteurs. Ils ne doivent pas être persistés.

## 12. Données à ne pas persister

- résultats Worker complets et `adminText` temporaire ;
- pagination, offset, page courante et filtre actif ;
- caches `duplicateCheckCache` et `duplicateSignalCache` ;
- score de rapprochement doublon non confirmé ;
- score qualité candidat et état image ;
- taux, rendement et badge de source ;
- compteurs et top sources du cockpit ;
- priorité Event Watch ;
- disponibilité ou URL du bridge local ;
- état de scroll, panneau ouvert, bouton sélectionné ;
- résultat d’un health check ;
- preuve HTML brute, captures ou pages sources intégrales ;
- token Supabase, JWT, mot de passe ou clé `service_role`.

## 13. Risques

| Niveau | Risque | Réduction recommandée |
|---|---|---|
| Résolu | Ancien schéma local contradictoire sur `events.id` | Production vérifiée : `public.events.id` est `uuid`; ne pas utiliser l’ancien `bigint` |
| Critique | RLS ou grants trop permissifs exposant les workflows admin | RLS + REVOKE anon + policies `private.is_admin()` + tests allow/deny |
| Critique | Clé `service_role` exposée au navigateur/bridge | Interdiction explicite ; backend étroit uniquement si futur besoin |
| Critique | Écriture workflow contournant le write guard et devenant publication | Séparer strictement workflow et table `events`; aucun trigger métier vers `events` |
| Important | Deux admins écrasent une décision | `version` + concurrence optimiste + relecture sur conflit |
| Important | Doublons dus aux URL trackées ou titres/dates modifiés | canonicalisation versionnée, UUID serveur, stratégie de rapprochement prudente |
| Important | Import local écrase une décision serveur | serveur fermé prioritaire, timestamps valides, dry-run et audit `legacy-import` |
| Important | Métriques legacy prises à tort pour un cumul complet | NULL pour inconnu, `metrics_since`, documentation baseline |
| Important | Gonflement via payloads Worker/HTML ou runs | schéma minimal, JSONB borné, pas de runs initialement, rétention future |
| Important | Divergence entre moteur local et copie serveur | identité idempotente, timestamps moteur, affichage de la fraîcheur |
| Important | Dépendance au Mac/bridge pour les nouvelles alertes | accepter la limite ; futur ingest autonome séparé et sécurisé |
| Faible | Compteurs cockpit momentanément périmés | recalcul à la lecture/rafraîchissement, pas de compteur stocké |
| Faible | Anciennes entrées partielles | parseurs tolérants, champs nullables, rapport d’import |

## 14. Découpage recommandé des Packs 5B+

### Pack 5B — schéma, RLS et tests uniquement

- utiliser `uuid` pour les références vers `events(id)`, conformément au schéma production vérifié ;
- migration des quatre tables, contraintes, index et triggers d’audit ;
- grants minimaux et policies admin ;
- tests pgTAP positifs/négatifs ;
- aucune modification Admin.

Rollback : migration inverse préparée et testée sur environnement non production ; aucune donnée métier encore écrite.

### Pack 5C — repository de lecture et fallback local

- fonctions JS de lecture serveur ;
- feature flag ;
- fallback local inchangé ;
- compteurs/cockpit alimentés en lecture seulement.

Rollback : désactiver le flag.

### Pack 5D — workflow candidat contrôlé

- upsert minimal des candidats ;
- transitions humaines avec version optimiste ;
- références doublon/soumission ;
- maintien intégral du write guard et de la validation humaine.

Rollback : désactiver le writer, conserver lecture et localStorage.

### Pack 5E — sources agrégées

- enregistrement atomique d’un run ;
- agrégats serveur ;
- réutilisation des calculs rendement/qualité ;
- aucun stockage des scores dérivés.

Rollback : revenir aux sources locales sans supprimer les agrégats.

### Pack 5F — import localStorage explicite

- dry-run, rapport de conflits, confirmation humaine ;
- import idempotent des workflows, sources et historique ;
- transitions `legacy-import` ;
- aucun effacement automatique des clés locales.

Rollback : désactiver les lectures serveur ou corriger par import compensatoire audité.

### Pack 5G — persistance Event Watch

- copie normalisée lors du chargement manuel existant ;
- workflow serveur versionné ;
- aucune écriture vers `events`, Auto-Matte, SQLite ou le bridge ;
- tests Mac disponible/indisponible et multi-appareil.

Rollback : lecture locale Event Watch, conservation des copies serveur.

### Pack 5H — bascule source de vérité et rétention

- serveur autoritatif par domaine après période d’observation ;
- localStorage réduit à un cache non autoritatif ;
- politique de conservation et outils d’audit/export ;
- décision séparée sur une éventuelle ingestion Event Watch autonome.

## 15. Recommandation finale

Faire persister les **identités minimales**, les **états humains**, leurs **acteurs/timestamps**, les **références vers les événements** et les **agrégats de sources**. Conserver côté serveur une copie compacte des alertes Event Watch avec leur décision. Garder local ou recalculer tout ce qui relève de l’UI, du cache, de la pagination, de la disponibilité du moteur et des scores.

La prochaine étape n’est pas une modification de l’Admin : c’est un Pack 5B limité à la vérification du schéma réel, à une migration versionnée, aux RLS/grants et aux tests de sécurité. Aucun code de publication ou d’automatisation ne doit être introduit avec cette persistance.
