# Contrôle de qualité textuelle des événements

## État de l’existant

- Le Quality Gate Admin V11 bloque une validation lorsque `title`, `start_date`, `city` ou `country_code` manquent. Les scores historiques de qualité contrôlent aussi image, coordonnées, description et site officiel.
- `validated` pilote la décision de publication, `rejected` le rejet et la dépublication, tandis que `verified` représente une vérification humaine distincte. Le contrôle textuel n’écrit aucun de ces statuts.
- `event-text-quality.js` est désormais l’unique détecteur de qualité textuelle utilisé par le filtre et le détail Admin V11, la compatibilité V10 et le scanner d’audit.
- Auto-Matte 7 possède un Quality Gate de complétude, provenance et conflits, ainsi qu’un ancien décodage récursif d’entités HTML documenté dans `HTML_ENTITY_DECODING_REPORT.txt`. Aucun détecteur partagé de mojibake n’a été trouvé. Auto-Matte n’est pas modifié par ce lot.

## Règles non destructrices

Le détecteur classe séparément le mojibake caractéristique, U+FFFD, les entités HTML littérales, le balisage HTML et les fins possiblement tronquées. Un caractère `Â` ou `Ã` isolé ne suffit jamais. Les mots français comme « Âme » et « Âge », les noms propres et les langues étrangères restent intacts.

Une alerte produit uniquement « Texte à contrôler » et les champs concernés. Elle ne modifie ni texte, ni validation, ni vérification humaine, ni publication.

## Point d’intégration futur Auto-Matte

Le contrôle doit intervenir après extraction/décodage et avant le Quality Gate :

`Auto-Matte → décodage extraction → contrôle textuel → Supabase → Quality Gate → validation humaine → publication statique`

Dans un lot Auto-Matte séparé, porter les mêmes règles et corpus de tests à la frontière de normalisation des extractions, sans réparation automatique. Les alertes doivent accompagner la proposition jusqu’à l’Admin ; elles ne doivent jamais provoquer seules un rejet ou une validation.

## Audit reproductible

`node scripts/audit-event-text-quality.mjs docs/audits/event-text-quality-YYYY-MM-DD.json`

Le scanner utilise uniquement la clé publique, filtre `validated=true` et `rejected=false`, pagine par ID, compare les fichiers statiques locaux et contrôle les pages canoniques servies. Son export exclut les coordonnées privées des proposants.
