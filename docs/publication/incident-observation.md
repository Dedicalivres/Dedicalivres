# Observation des incidents de publication

Ce diagnostic est strictement en lecture seule. Un signal `SUSPECT`, `ANOMALIE` ou
`UNKNOWN` impose une vérification humaine ; il n'autorise jamais une relance ou une
modification de Supabase. Le seuil de 45 minutes reste une proposition à valider
avant toute surveillance opérationnelle.

## Procédure humaine

1. Identifier la catégorie : `RUNNING`, `PENDING`, `FAILED`, `BLOCKED` ou erreur de lecture.
2. Vérifier les exécutions GitHub Actions et conserver leurs URL et horaires.
3. Rechercher si un commit de publication existe, sans conclure depuis le seul statut du job.
4. Vérifier que GitHub Pages a déployé exactement ce SHA.
5. Contrôler la fiche publique, sa canonical et le sitemap correspondant.
6. Comparer la source publique utilisée par le générateur et l'état Supabase en lecture seule.
7. Conserver les preuves dans un espace privé, sans clé, token, erreur brute, contact ou identifiant privé.
8. Demander une autorisation humaine explicite avant toute correction, relance ou écriture.

Ne jamais relancer aveuglément un workflow, réarmer un `RUNNING`, reprendre un
`FAILED` historique ou déclarer le système sain après une lecture incomplète.
