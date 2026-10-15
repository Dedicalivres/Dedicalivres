# E5-D2B — préparation d'une provenance Auto-Matte observée

Ce lot prépare un import futur ; il n'applique aucune migration et n'insère
rien dans Supabase. Une observation `AUTO_MATTE` reste distincte d'une
attestation humaine et n'autorise ni CANARY, ni publication.

## Source et manifeste

Le lanceur Auto-Matte V7 pointe vers `release-v7/veille.sqlite3`, lien vers
`runtime/veille.sqlite3`. Vérifier à nouveau ce chemin au moment d'un futur
import. Une transaction de lecture SQLite en `mode=ro`, sans `immutable=1`
sur la source, fige un cliché cohérent incluant un éventuel WAL actif. Seuls
`evenements.id` et cinq champs techniques de `dedicalivres_submissions` sont
matérialisés dans le fichier local : aucune table complète ni champ personnel
n'est recopié. Le cliché minimal est vérifié par `PRAGMA integrity_check`,
puis la réconciliation E5-D2A est exécutée **sur lui**, non sur la base
originale.

```sh
python3 scripts/snapshot-automatte-sqlite.py \
  --source /chemin/Auto-Matte/release-v7/veille.sqlite3 \
  --output /chemin/local/veille-snapshot.sqlite3 \
  --metadata /chemin/local/sqlite-source-metadata.json
python3 scripts/reconcile-automatte-provenance.py \
  --sqlite /chemin/local/veille-snapshot.sqlite3 \
  --supabase-ids /chemin/local/supabase-ids.json \
  --output-dir /chemin/local/reconciliation
```

L'export Supabase est strictement en lecture seule : UUID `events.id` et UUID
`event_submission_contacts.event_id`, sans nom ni contact. Horodater l'export,
vérifier les comptes et conserver les fichiers **hors Git**. Enregistrer les
SHA-256 du cliché, de l'export et du manifeste. Le manifeste E5-D2A est
déterministe pour des entrées identiques ; une ancienne liste de 107 liens
ne doit jamais être réutilisée sans nouveau rapprochement.

## Dry-run isolé

Le générateur ne retient du manifeste que `event_id` et
`auto_matte_reference`. Il construit une fixture SQL pour PostgreSQL Docker,
en transaction terminée par `ROLLBACK`, et appelle la fonction avec
`p_execute=false`. Il ne produit **aucune commande d'import production**.

```sh
python3 scripts/build-automatte-dry-run-fixture.py \
  --ids /chemin/local/supabase-ids.json \
  --manifest /chemin/local/reconciliation/manifest.json \
  --output /chemin/local/isolated-dry-run.sql
AUTOMATTE_DRY_RUN_SQL=/chemin/local/isolated-dry-run.sql \
  bash scripts/test-automatte-provenance-import.sh
```

La fixture simule une table de provenance initialement vide. Son nombre
« admissible » n'est **pas** une preuve de l'état réel de Supabase. Les
migrations E5-C et E5-D0 ne sont pas installées en production à la date de
ce lot. Un dry-run production de `private.event_provenance` est donc impossible
maintenant ; ne pas le présenter comme validé.

## Contrat d'import futur — autorisation distincte requise

La migration additive D2B crée deux index uniques partiels et une fonction
privée `private.prepare_auto_matte_observed_import`. Elle ne contient aucun
backfill. La fonction est `SECURITY INVOKER`, sans droit EXECUTE pour `PUBLIC`,
`anon`, `authenticated` ou `service_role`. Une session SQL `postgres` doit
fournir le manifeste, les ensembles complets d'UUID exportés et le SHA-256
du manifeste. Le mode `p_execute=false` ne fait que lire et compter :
`eligible`, `already_present`, `conflicts`, `excluded`, `blocked`.

Pour une exécution **dans une mission ultérieure uniquement**, recontrôler le
chemin Auto-Matte, le WAL, les trois hash et les ensembles d'UUID ; vérifier
l'installation préalable de E5-C/D0 ; obtenir un dry-run réel sur l'état
Supabase ; exiger zéro conflit, exclusion et blocage, puis une validation
humaine distincte. `p_execute=true` verrouille dans un ordre fixe les tables
`events`, `event_submission_contacts`, `event_provenance`, recompare les
ensembles complets d'UUID et insère atomiquement les seuls liens admissibles.
Les observations identiques sont comptées comme déjà présentes. Une
référence différente, une soumission directe ou une attestation préexistante
bloque le lot. Un échec annule toute la transaction ; une réexécution est
idempotente. Rien ne modifie `events`, les preuves CANARY ou les jobs.

Les UUID seuls détectent une suppression, un ajout ou une nouvelle soumission
directe depuis l'export, **pas** une modification non identitaire du contenu
d'un événement. Cette limite est acceptable uniquement si la décision future
porte sur le lien technique UUID ; toute autre exigence de fraîcheur doit
faire l'objet d'un nouveau contrôle autorisé. Un changement du cliché
Auto-Matte impose un nouvel export et un nouveau manifeste.

## Relevé local du 15 octobre 2026

Le fichier canonique SQLite est en journal `DELETE`, sans WAL au relevé ;
dernière soumission interne le 22 septembre à 15:39:47 et dernier événement
daté du 22 septembre. Le service n'était pas actif lors du contrôle. Son
ancienneté est une limite de fraîcheur métier, même si le chemin du runtime,
le schéma, l'intégrité et le cliché sont confirmés. Export Supabase : 701
événements, 20 soumissions directes. Rapprochement : 107 confirmés, 5 à
revoir, 569 inconnus. Le dry-run PostgreSQL **isolé** avec provenance vide
simulée trouve 107 admissibles ; cela n'autorise aucun import réel.
