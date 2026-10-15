# Rapprochement Auto-Matte / Dédicalivres (E5-D2A)

Ce lot ne lit que les identifiants Supabase et la base SQLite locale. Il ne
modifie ni `events`, ni `private.event_provenance`, ni les jobs. Une origine
`AUTO_MATTE_CONFIRMED` est une provenance **observée**, jamais une attestation
humaine ou une preuve `DIRECT_VERIFIED` admissible au CANARY.

## Entrée et exécution

Exporter par un canal administrateur **en lecture seule** les deux listes
distinctes : `SELECT id FROM public.events ORDER BY id` et
`SELECT event_id FROM public.event_submission_contacts ORDER BY event_id`.
Ne pas exporter les noms, contacts, coordonnées ou fiches complètes. Former un
fichier local JSON `{"event_ids":["uuid",...],"direct_event_ids":["uuid",...]}`.
Le fichier doit rester hors du dépôt et ne contient aucun secret d'accès.

```sh
python3 scripts/reconcile-automatte-provenance.py \
  --sqlite /chemin/vers/veille.sqlite3 \
  --supabase-ids /chemin/local/ids.json \
  --output-dir /chemin/local/rapport
python3 scripts/test-reconcile-automatte-provenance.py
```

La base est ouverte avec `mode=ro&immutable=1` et `PRAGMA query_only=ON`.
Exécuter sur un cliché SQLite stable : le mode immutable ignore tout WAL actif.
Comparer les dates et l'origine des deux clichés avant d'interpréter les
comptes. Une base inaccessible, un schéma incomplet, un UUID d'entrée invalide
ou dupliqué arrêtent l'exécution.

## Décision déterministe

`dedicalivres_submissions.remote_uuid` doit égaler exactement `events.id`,
pointer vers une unique fiche `evenements.id` existante, sans second UUID
pour cette fiche. Au moins une ligne du journal doit porter un POST HTTP 201
avec statut `accepted_pending` ou `validated_remote`. Les doublons de lignes
du même couple UUID/fiche ne constituent pas un conflit. Une soumission directe
connue est toujours exclue. UUID absent, référence manquante, statut sans trace
d'acceptation ou contradiction sont consignés dans `review.json`, jamais
promus par similarité de titre, ville ou date.

`summary.json` contient les comptes ; `manifest.json` contient uniquement les
liens confirmés, la référence locale et les contrôles booléens ; `review.json`
contient les cas à revoir et leurs motifs. Aucun nom, contact ni justification
privée n'est lu par le script. Le manifeste prépare uniquement une assertion
future `state=OBSERVED`, `observed_channel=AUTO_MATTE`, sans `attested_origin`.
L'insertion éventuelle dans `private.event_provenance` relève d'une autre
mission et d'une décision humaine.

Le rapport local E5-D2A du 15 octobre 2026 a utilisé 700 UUID `events`, 19
UUID de soumission directe et le fichier Auto-Matte `runtime/veille.sqlite3`
dont la dernière modification visible date du 22 septembre 2026. Le cliché
SQLite peut donc être ancien ; les nombres ne prouvent pas l'état actuel d'un
autre runtime Auto-Matte. Les manifestes réels restent locaux, hors Git.
