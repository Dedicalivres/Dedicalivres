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
