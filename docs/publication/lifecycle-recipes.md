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
| T06 décisions successives | MANQUANT — DÉFAUT CONFIRMÉ STATIQUEMENT | Un PENDING `edit` ou `validation` peut survivre au DELETE avec `event_id = NULL`, puis coexister avec le nouveau PENDING `delete` pour le même `target_event_id`. Le RPC refuse alors le lot comme sélection périmée. |
| T07 présence ajoutée | EXISTANT (preuve statique) | INSERT public met en file l'événement public et consolide un PENDING sans doublon. |
| T08 présence retirée | EXISTANT (preuve statique) | DELETE public rafraîchit seulement l'ancien événement. |
| T09 présence transférée | EXISTANT (preuve statique) | UPDATE compare état, événement et auteur puis couvre ancien et nouvel événement. |
| T10 présence non publique | EXISTANT (preuve statique) | Validation, rejet, archive, auteur et événement public sont filtrés ; la RLS exclut les archives. |
| T11 concurrence | EXISTANT | Divergence source, verrou atomique, RUNNING existant et sélection périmée provoquent un STOP. |
| T12 legacy et fichiers tiers | EXISTANT | 282 legacy, suppressions ciblées, tiers inchangés et seuil de 250 fichiers. |
| T13 cohérence globale | EXISTANT | Canonical, sitemap, catalogue, index et pages territoriales contrôlés. |

**MANQUANT après ce lot :** la succession PENDING `edit/validation` puis DELETE
n'est pas gérée par le moteur actuel. Le worker sélectionne les deux lignes ; le
RPC n'en considère qu'une conforme à l'absence de l'événement et annule toute la
réservation avec `PUBLICATION_BATCH_STALE_SELECTION`.

**NON TESTABLE dans ce lot :** l'exécution réelle des triggers PostgreSQL.

## Limite de preuve

`SQL RUNTIME : NON TESTÉ`. Les fonctions et triggers PostgreSQL sont vérifiés
statiquement, car les migrations contiennent des données historiques et ne
doivent jamais être rejouées. Une validation runtime future devra utiliser une
base PostgreSQL éphémère construite sans exécuter ces blocs d'insertion.

Le correctif moteur devra rendre atomique la substitution du PENDING obsolète
par le DELETE, ou garantir une unicité/coalescence par `target_event_id` avant la
sélection. Il devra préserver l'historique et être livré dans un lot séparé avec
une migration dédiée et une recette PostgreSQL isolée.
