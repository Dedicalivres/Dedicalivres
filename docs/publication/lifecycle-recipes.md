# Recettes isolées du cycle de publication

Ces recettes utilisent uniquement des fixtures temporaires, des mocks réseau et
des lectures statiques. Elles ne se connectent pas à Supabase et ne rejouent
aucune migration.

| Scénario | État | Preuve |
| --- | --- | --- |
| T01 modification simple | EXISTANT | Projection ciblée, canonical et refus des modifications tierces. |
| T02 changement de slug | EXISTANT | Ancien chemin retiré uniquement après génération d'un remplacement canonical valide. |
| T03 dépublication | EXISTANT | Retrait ciblé, manifest et sitemap contrôlés. |
| T04 suppression définitive | EXISTANT | `target_event_id` durable, `event_id` nul et canonical obligatoire avant retrait. |
| T05 événement jamais publié | EXISTANT | Absence de canonical traitée par un `BLOCKED` contrôlé. |
| T06 décisions successives | CORRIGÉ — migration F2 installée | Le précontrôle refuse les doublons historiques sans les modifier ; le trigger BEFORE DELETE retire seulement le PENDING courant puis le trigger existant crée le DELETE unique. RED/GREEN PostgreSQL validé en CI. |
| T07 présence ajoutée | EXISTANT (preuve statique) | INSERT public met en file l'événement public et consolide un PENDING sans doublon. |
| T08 présence retirée | EXISTANT (preuve statique) | DELETE public rafraîchit seulement l'ancien événement. |
| T09 présence transférée | EXISTANT (preuve statique) | UPDATE compare état, événement et auteur puis couvre ancien et nouvel événement. |
| T10 présence non publique | EXISTANT (preuve statique) | Validation, rejet, archive, auteur et événement public sont filtrés ; la RLS exclut les archives. |
| T11 concurrence | EXISTANT | Divergence source, verrou atomique, RUNNING existant et sélection périmée provoquent un STOP. |
| T12 legacy et fichiers tiers | EXISTANT | 282 legacy, suppressions ciblées, tiers inchangés et seuil de 250 fichiers. |
| T13 cohérence globale | EXISTANT | Canonical, sitemap, catalogue, index et pages territoriales contrôlés. |
| T14 lastmod auteur ciblé | CONTRÔLÉ | Seule une page auteur significativement modifiée actualise son entrée XML, à la date de publication Europe/Paris. |

**État après F2 :** la migration de coalescence est installée dans Supabase. Le
scénario PENDING `validation`/`edit`/`unpublish` puis DELETE est validé RED/GREEN
sur PostgreSQL Docker éphémère et dans la CI. Aucun DELETE réel n'a été testé en
production.

## Lastmod auteur lors d'une publication ciblée

`build-author-pages.mjs` compare les HTML existants aux rendus avant écriture.
En mode ciblé, un changement significatif actualise uniquement le lastmod de
la fiche concernée dans le sitemap existant ; une fiche inchangée garde sa date
et ses octets. La date est `PUBLICATION_REFERENCE_DATE` lorsqu'elle est fournie
par la projection, sinon le jour courant Europe/Paris. Le classement des
présences utilise ce même jour. Une capture de données ou `published_at` ne
remplace pas la date d'une véritable modification de contenu.

Le helper réutilise le contrôle XML du rafraîchissement d'index. Il refuse les
URL absentes, inconnues ou dupliquées et les lastmod ambigus avant toute écriture
des pages. Les URL, leur ordre et les autres métadonnées sont conservés. Un
changement du registre ou de l'index des auteurs en publication ciblée provoque
STOP. Les créations ordinaires en mode non ciblé conservent le parcours existant.
Tests : `node scripts/test-author-sitemap-lastmod.mjs`.

Pour le retrait du doublon Beg-Meil, aucune page alias ni règle de redirection
n'est prévue : après une dépublication ultérieurement autorisée, l'ancienne URL
devrait répondre 404 sur GitHub Pages, à vérifier après déploiement. La fiche
du même salon conservée garde son canonical. Cette recette n'autorise aucune
publication, réservation ou modification de statut.

## Limite de preuve

Le test PostgreSQL importe le trigger réel avec un schéma réduit : il couvre le
chemin DELETE, pas une relecture complète de toutes les migrations Supabase ni
du worker. Les tests auteurs restent principalement statiques.

## Lorient test — retrait durable et autorisation unique

La seule identité admissible est `eb6672b2-900f-4c6a-9021-ea84c5036769`,
canonical historique `evenement/salon-du-livre-jeunesse-du-pays-de-lorient-lorient-3441.html`.
Le registre `event-retirements.json` conserve la décision de retrait du test.
Le manifeste historique reste à 282 entrées : 281 fiches actives protégées et
une identité retirée, sans suppression de données Supabase ou d'historique.

Le registre bloque les validations/éditions/suppressions de cette identité,
CANARY, le rendu du générateur Python et sa restauration legacy après retrait.
Le navigateur filtre aussi cette identité des agendas/cartes/recherches et de
la fiche dynamique. L'API doit néanmoins être rendue privée : un filtre client
n'est pas une protection de confidentialité.

Les autres UUID, canoniques et règles legacy ne bénéficient d'aucune exception.
Une autorisation est requise pour le seul unpublish Lorient. Par défaut elle
est absente, y compris dans le workflow ; rien n'est activé par ce correctif.
L'ancien edit `80a4506a-357e-4df0-a5ac-5fe4ce27535f` reste BLOCKED.

### Preuve locale, aucune opération distante

```sh
node scripts/test-lorient-test-retirement.mjs
node scripts/test-retired-test-policy.mjs
PUBLICATION_REFERENCE_DATE=AAAA-MM-JJ node scripts/preview-lorient-test-retirement.mjs /chemin/source.json /chemin/audit.json /chemin/nouvel-apercu
```

Remplacer AAAA-MM-JJ par une date ISO valide, explicite, non antérieure à
l'audit publié. Cette date de classement ne change pas capturedAt. Le futur
manifeste approuvé inclut reference_date et n'est utilisable que le même jour
Europe/Paris ; toute date d'environnement différente ou changement de jour
impose STOP. Les lastmod suivent uniquement les pages réellement modifiées.

L'aperçu réutilise le catalogue Git figé et les générateurs existants, dans une
nouvelle copie. Il conserve explicitement les versions publiques Brive/Grenoble/Imaginambulles,
consigne leurs différences Supabase, exclut les validations non publiées et
refuse tout écart inconnu. Il produit la partition legacy, le patch et la liste
exacte des fichiers. Une sortie existante est refusée. Aucun appel HTTP n'est
fait par cet outil d'aperçu.

### Production future : seulement après validation humaine

1. Faire revoir le code et le patch, puis autoriser séparément sa livraison.
   Recontrôler main, catalogue, canoniques, empreintes, source et file ; conserver
   l'automatisation et CANARY désactivés. Tout changement invalide les preuves.
2. Après autorisation d'écriture distincte, administrateur authentifié : appeler
   le parcours existant `reject_event_with_reason` avec l'UUID Lorient et le motif
   « Fiche de test, retrait public, données et historique conservés ». Il met
   `validated=false`, `rejected=true`, sans DELETE. Vérifier ligne/associations
   privées et absence de réponse anonyme (RLS), sans modifier Brive/Grenoble/Imaginambulles.
3. Lire le nouveau job unpublish créé par le trigger : PENDING, zéro tentative,
   batch/commit null. Ne pas transformer ni réactiver le job edit BLOCKED. Les
   huit autres PENDING doivent rester identiques, aucun RUNNING.
4. Sur la copie de main exacte, avec les identifiants de lecture privée déjà
   configurés sans affichage de clé, préparer uniquement un brouillon et une
   projection hors réseau métier d'écriture :

   ```sh
   PUBLICATION_REFERENCE_DATE=AAAA-MM-JJ node scripts/prepare-lorient-retirement-authorization.mjs NOUVEAU_JOB_UUID DECISION_UUID /chemin/brouillon.json /chemin/nouvel-apercu
   ```

   Ce script n'émet que des GET et n'approuve rien. Il lie le brouillon au job,
   à la base Git, au canonical, aux empreintes page/catalogue/source/file/donnée
   privée et aux paramètres immuables du job. Il conserve `DRAFT_NOT_APPROVED`.
   Il refuse une source encore publique, un écart tiers nouveau ou une référence
   publiée différente. Les preuves privées complètes ne sont pas exportées.
5. Relire le diff complet, les 281 empreintes et les écarts connus. Si tout est
   approuvé humainement, changer explicitement le champ approval en
   `APPROVED_SINGLE_UNPUBLISH` dans une copie du brouillon. Expiration générée à
   une heure ; le validateur refuse toute autorisation dépassant 24 heures.
   Ni la génération du brouillon ni les fixtures de tests ne valent approbation.
6. Workflow manuel existant, PREVIEW uniquement, sélectionner le nouveau job
   seul et renseigner `lorient_retirement_authorization` avec ce JSON approuvé.
   Relire l'empreinte PREVIEW. Si source, queue, statut, base ou manifeste change,
   STOP et refaire les preuves. Aucun autre job n'entre dans le lot.
7. Seulement après une nouvelle autorisation EXECUTE explicite : utiliser ce
   même manifeste, le seul job, l'empreinte PREVIEW et la confirmation EXECUTE.
   Les contrôles relisent les preuves avant la réservation atomique. Le batch
   unique RUNNING/tentative 1 est ensuite contrôlé ; aucun rejeu ni deuxième
   tentative n'est permis par ce manifeste.
8. La génération Lorient utilise le catalogue publié figé, ne régénère aucune
   fiche tierce et applique seulement le diff local validé. Source publique,
   donnée privée et autres jobs sont relus avant application et avant/après
   publication. Les autres parcours gardent leurs protections habituelles.
9. Après déploiement autorisé, vérifier l'ancienne URL (404, aucun Event),
   `event.html?id=...`, index, cartes, recherches, canoniques, archives, auteurs
   et sitemaps avec une session anonyme. Contrôler aussi les caches/CDN, l'état
   terminal du seul job et la conservation du registre. Une projection locale
   ne prouve pas un déploiement ni la disparition immédiate des moteurs tiers.

### STOP et retour arrière

STOP : identité ambiguë, manifeste absent/incomplet/expiré, autre lot, ancien
job, raison différente, tentative déjà consommée, RUNNING tiers, modification
source/file/base/donnée privée, nouveau décalage métier, diff hors périmètre,
fiche tierce modifiée ou empreinte différente. Un échec peut laisser le job en
PENDING avec tentative déjà consommée : ne jamais le relancer aveuglément.

Garder le test privé et l'historique, l'ancien job BLOCKED et les autres jobs
intacts. Ne restaurer aucune ancienne base ou ancien catalogue global. Préparer
une correction limitée et revue si un contrôle post-déploiement échoue.

Le retrait est réversible uniquement par une nouvelle décision versionnée :
passer l'unique entrée à `released` et fournir `release.decision`,
`release.approved_at` et `release.reason`. Une levée non documentée est refusée.
Cette levée n'est pas un ordre de republier : les données privées, le job
historique et les protections legacy restent en place. Toute restauration
publique exige une mission et une autorisation séparées, un diff revu et les
contrôles normaux ; aucun rollback automatique ne doit remettre le test en ligne.

Reprise SITE-LORIENT-TEST-DEPUBLISH-03 : la modification Imaginambulles
(Puilboreau vers Rochefort-en-Terre) est explicitement relevée et liée au job
edit a1754681-aa19-4c60-a271-b9955fb1d66e. Elle reste hors de la publication
Lorient. Le catalogue Git publié conserve Puilboreau ; la source Supabase
conserve Rochefort-en-Terre. Les empreintes source/file sont renouvelées après
lecture ; toute nouvelle variation invalide encore cet aperçu. Le label
« Soumission publique » décrit la provenance initiale, pas l’interface ayant
réalisé cette édition, qui n’est pas déterminable avec les preuves présentes.
