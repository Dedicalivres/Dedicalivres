# NFC Analytics & Cockpit V1 — exploitation et rollback

## Périmètre

- Un code opaque par support NFC, inactif par défaut.
- Collecte minimisée et dédupliquée : aucune IP, géolocalisation ou empreinte navigateur.
- Cockpit administrateur sur 30 jours : scans, engagement, arrivées et activations.
- Filtres 7/30/90 jours, support, campagne, partenaire, événement et puce.
- Parc de puces : à programmer, programmée, testée, installée, déplacée, inactive ou perdue.
- Tables invisibles au public ; seules deux fonctions publiques validées sont appelables.

## Déploiement contrôlé

1. Sauvegarder la base et relever le nombre de lignes des trois tables.
2. Appliquer la migration en staging puis exécuter le scénario SQL RLS/RPC.
3. Déployer le front seulement après validation du schéma.
4. Créer un code test inactif, vérifier son refus, puis l’activer et effectuer un scan réel.
5. Contrôler le cockpit avant toute création en série.

La procédure détaillée de staging et ses critères de sortie sont décrits dans
`docs/nfc/15_STAGING_VALIDATION_RUNBOOK.md`. Le scénario SQL reproductible est
`supabase/tests/nfc_analytics_cockpit_v1_test.sql`.

## Rollback sans perte de données

Le rollback recommandé est fonctionnel : désactiver tous les codes avec
`update public.nfc_tags set active = false where active = true;`, puis remettre
le front au commit précédent. Les événements sont conservés pour audit et la
collecte cesse immédiatement car les RPC refusent les codes inactifs.

La suppression physique des tables n’est pas automatisée. Elle ne doit être
faite qu’après export et validation explicite, dans l’ordre `nfc_events`,
`nfc_sessions`, `nfc_tags`, avec suppression préalable des quatre fonctions.

## Maîtrise des coûts

- 80 événements maximum par session.
- 300 événements maximum par code et par minute.
- Déduplication `(session, événement, clé)`.
- Lecture admin limitée aux 5 000 événements les plus récents sur 30 jours.
- Revue recommandée après un mois pour fixer une politique de rétention selon le volume réel.
