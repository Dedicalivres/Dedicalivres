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

**État après F2 :** la migration de coalescence est installée dans Supabase. Le
scénario PENDING `validation`/`edit`/`unpublish` puis DELETE est validé RED/GREEN
sur PostgreSQL Docker éphémère et dans la CI. Aucun DELETE réel n'a été testé en
production.

## Limite de preuve

Le test PostgreSQL importe le trigger réel avec un schéma réduit : il couvre le
chemin DELETE, pas une relecture complète de toutes les migrations Supabase ni
du worker. Les tests auteurs restent principalement statiques.

## Préparation temporaire SEO-GEO : inactive en production

`scripts/seo-geo-edit-guard.mjs` prépare uniquement les corrections Brive
(`83270534-e551-4562-8805-f10240a6007c`), Senlis
(`ec8ec360-b0c4-41ca-b400-87dd1ffde104`) et Lorient
(`eb6672b2-900f-4c6a-9021-ea84c5036769`). Il ne dispose d'aucun client Supabase,
appel HTTP métier, réservation, écriture de fichier ou commande EXECUTE.
Son inspection lit des captures fournies ; sa simulation retourne des objets en
mémoire. Les écritures des tests concernent uniquement une copie temporaire.

Les protections supprimées par #235 ne sont pas restaurées : aucun ancien job
Finistellaire, aucune liste permanente de PENDING exclus, aucun branchement dans
les workflows métier. Les 282 legacy, la sélection générale #234, la réservation
atomique et les gardes de diff demeurent inchangés. La CI de précontrôle exécute
uniquement les nouveaux tests hors ligne avec permissions `contents: read`.

### Contrat d'autorisation de simulation

`simulateAuthorizedEdits(manifest, approvedDigest, baseline, current, now)` refuse
toute autorisation absente ou incomplète. Le manifeste version 1 porte :

- `mode: simulation-only`, expiration UTC de moins de 24 heures et empreinte
  `baseline_sha256` de toute la capture initiale ;
- un à trois éléments `entries`, chacun lié à un UUID autorisable, un UUID de job
  exact, `reason: edit`, un canonical existant et des empreintes SHA-256 initiales
  de la fiche HTML et de la ligne source ;
- le patch métier exact, les seules zones de texte HTML autorisées, le JSON-LD
  attendu et les preuves officielles (URL HTTPS et empreinte de la capture).

L'empreinte d'approbation est fournie séparément : un `approved: true` incorporé
au manifeste ne suffit pas. Un humain doit vérifier les preuves et le contenu
avant de donner cette empreinte. Le vérificateur lie les preuves à cette revue ;
il n'en atteste pas automatiquement la véracité et ne les télécharge pas.
Les jobs synthétiques et empreintes de preuve des tests ne sont pas des
autorisations réelles. Aucun manifeste rempli ou actif n'est livré dans le dépôt.

La capture lie le SHA de base, le SHA de la dépendance #239, la date Europe/Paris,
la source entière fournie, la file PENDING/RUNNING entière, le catalogue, les
canoniques, le manifeste legacy, les 625 fiches du corpus de référence, les pages
racines et auteurs et les sitemaps. Le nombre de fiches vient de la carte, jamais
d'une constante de sélection. Tout changement invalide la prévisualisation.
Les sources et files sont comparées indépendamment de leur ordre de lecture.
Une source publiée incomplète est un STOP ; aucune fiche manquante n'est comblée
silencieusement et aucune validation non sélectionnée n'est ajoutée.

### Canoniques et enrichissements

Les trois chemins sont repris de la carte UUID → chemin existante après contrôle
de l'identité HTML, d'Event.url et du dernier élément du BreadcrumbList. Aucun
slug n'est recalculé d'après la ville ou la date. Une identité ambiguë provoque
STOP. Le rendu de simulation conserve le squelette publié et ne remplace que
les zones textuelles et feuilles JSON-LD explicitement permises et approuvées.
Les images, auteurs, liens HTML, scripts et autres métadonnées restent intacts.
Les descriptions non concernées sont conservées, à l'exception des deux segments
de dates Senlis expressément identifiés. Les coordonnées Brive ne sont jamais
inventées ni modifiées par ce mécanisme.

Les cibles structurées ne déduisent pas l'organisateur de la ville. Senlis reste
un programme multisite du 29 septembre au 4 octobre ; son salon public se tient
à Saint-Pierre les 3–4 octobre. Son adresse unique n'est pas attribuée au
programme entier. Lorient conserve le Palais des congrès et l'adresse normalisée.
Les anciens `organizer.url` non prouvés peuvent être retirés du JSON-LD dans la
cible approuvée ; les liens visibles et Event.url sont conservés.

### Inspection et preuve locale

```sh
node scripts/seo-geo-edit-guard.mjs inspect /chemin/source.json /chemin/file.json SHA_PR239
node scripts/test-seo-geo-edit-guard.mjs
```

La source est un tableau public complet, la file un tableau PENDING/RUNNING
(ou une capture contenant `queue`). Ne jamais fournir de jeton de dispatch ni
de secret. L'inspection ne contacte pas le serveur et n'est pas une autorisation ;
les captures doivent être relues au moment d'un futur contrôle. Un manque dans
la source ou un RUNNING produit STOP et un code de sortie 2.

Les tests simulent les corrections sur le corpus publié, puis utilisent les
générateurs existants dans une copie temporaire, à date constante. Ils calculent
la liste complète des HTML modifiés et vérifient l'idempotence, les archives, les
sitemaps et les autres fichiers. Cette preuve sur fixtures n'est pas une
projection validée des données Supabase actuelles.

### STOP actuel et étapes restantes avant toute écriture

Au relevé du 19 octobre 2026 : 12 PENDING, aucun RUNNING ; aucune autorisation de
job pour les trois cibles. La source publique contient 634 lignes, contre 625
canoniques : dix lignes publiques non publiées sont exclues ; le canonical
`3c20bba7-b05e-4400-ab7c-6e97e84f91c3` manque dans cette source et est visé par un
PENDING `unpublish`. Les anciennes prévisualisations sont invalides. Aucune
dépublication tierce n'est autorisée dans ce lot. Les coordonnées Brive restent
un point de cohérence à résoudre avec une preuve, sans géocodage inventé.

La PR #239 est une dépendance fonctionnelle de la future livraison générée. Cette
préparation ne la modifie pas et ne la fusionne pas ; son SHA devra être revérifié.
La simulation reste possible avant fusion car elle n'appelle pas son nouveau
comportement de génération. Un passage ultérieur en production nécessitera une
revue distincte du raccordement aux gardes Node/Python/workflow : le manifeste
ci-dessus ne lève actuellement aucune protection de ces parcours.

Avant toute écriture : résoudre ou isoler explicitement la divergence de source,
relever à nouveau source, associations auteurs, file et SHA, revoir le diff exact,
puis obtenir l'autorisation métier et de ses effets de mise en file/dispatch.
Une autre autorisation sera nécessaire pour les jobs précis créés à ce moment,
avec PREVIEW/EXECUTE existants et réservation atomique inchangée. Aucun balayage
de tous les PENDING. `PUBLICATION_AUTOMATION_ENABLED=false` doit rester inchangé.
Ce drapeau ne bloque pas à lui seul les effets des triggers Supabase d'édition.

### Retrait complet après usage autorisé

Révoquer et retirer les éventuels manifestes externes et leurs empreintes
d'approbation ; ne pas les réutiliser après expiration, modification ou succès.
Supprimer le module temporaire, son test, l'étape CI correspondante et cette
section. Vérifier l'absence de toute référence au module et relancer les suites
de publication ciblée, sélection manuelle, legacy, archives et workflow. Aucun
changement de fiche publique ou de données n'est requis pour retirer ce mécanisme.
