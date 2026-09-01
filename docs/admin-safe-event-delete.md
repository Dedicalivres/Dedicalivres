# Suppression sécurisée d’un événement

## Relations auditées

L’admin effectue uniquement des lectures de comptage avant une suppression.

| Relation | Comportement retenu |
| --- | --- |
| `event_authors_presence.event_id` | Blocage si une présence existe ou si le contrôle échoue. Une présence auteur est une donnée éditoriale importante. |
| `event_visits.event_id` | Blocage si une visite existe ou si le contrôle échoue. Aucune règle `ON DELETE` fiable n’est définie dans les fichiers de schéma du dépôt. |
| `admin_watch_candidates.duplicate_event_id` | Avertissement. La migration de persistance définit `ON DELETE SET NULL`. |
| `admin_watch_candidates.submitted_event_id` | Avertissement. La migration de persistance définit `ON DELETE SET NULL`. |
| `admin_event_watch_alerts.event_id` | Avertissement. La migration de persistance définit `ON DELETE SET NULL`. |
| `live_sessions.event_id` | Avertissement. `live-schema.sql` définit `ON DELETE SET NULL`; une session reste en place sans événement. |
| Inscriptions | Données portées par la ligne `events`; elles disparaissent avec la fiche et sont signalées avant confirmation. |
| Favoris | Stockés dans le navigateur (`dedicalivres_favorites`), sans table serveur ni FK identifiée. Ils ne sont pas dénombrables globalement. |
| Témoignages | Le schéma utilisé par l’admin expose `event_title`, sans `event_id` ni FK identifiée. Aucun rattachement fiable ne peut être contrôlé. |
| Historique Veille | Les liens directs sont couverts par les candidats et alertes ci-dessus. Les transitions référencent leur parent, pas directement `events.id`. |

La suppression ne nettoie jamais manuellement une table liée. Une dépendance critique
inconnue ou non contrôlable bloque l’action ; une contrainte serveur peut encore refuser
le `DELETE`, et cette erreur est affichée sans fermer l’éditeur.

## Journalisation

Le journal local existant `dedicalivres_admin_action_log_v1` est réutilisé. L’entrée
contient l’ID, le titre, la date, la raison et l’ID de session admin disponible.
Il ne s’agit pas d’un audit serveur durable : aucune table d’audit de suppression
d’événement n’existe dans le périmètre audité, et aucune migration n’est ajoutée par ce lot.

## Recette en lecture seule — doublon Nathalie Cabrol

Les pages SEO du dépôt confirment deux fiches pour le même lieu et la même date :

- `3774` — **Entretien et séance de dédicaces avec Nathalie Cabrol**, Amboise,
  5 septembre 2026, adresse `2 Rue du Clos Lucé` ; la description précise 14 h 30,
  la salle Renaissance, la durée, la séance de dédicace et la réservation ;
- `4041` — **Rencontre et séance de dédicaces avec l’autrice Nathalie Cabrol**,
  Amboise, 5 septembre 2026, même adresse ; la description est moins opérationnelle.

Recommandation éditoriale, sous réserve du précontrôle serveur : conserver `3774` et
envisager la suppression de `4041`. Aucun `DELETE` n’est exécuté par cette recette.

1. Dans Admin V11, rechercher « Nathalie Cabrol » puis ouvrir successivement les fiches
   `3774` et `4041` afin de confirmer titre, ville, date, type et statut.
2. Sur chaque fiche, ouvrir **Modifier**, choisir la raison **Doublon**, puis saisir dans
   la précision l’ID de l’autre fiche.
3. Cliquer **Supprimer cet événement** uniquement pour afficher l’impact. Relever les
   présences auteurs, visites, liens Veille, alertes et sessions live.
4. Si un blocage apparaît sur `4041`, annuler et traiter la relation dans un chantier
   séparé. Ne pas tenter de contourner le blocage.
5. Si `4041` est supprimable, comparer une dernière fois les deux résumés et vérifier
   que l’écran final affiche bien l’ID `4041` et la précision « conserver 3774 ».
6. Pour une recette sans écriture, cliquer **Annuler** et ne jamais saisir/valider
   `SUPPRIMER`.

Les fichiers SEO indiquent l’identité et la complétude éditoriale, mais ne constituent
pas une preuve de l’état courant des relations Supabase. Le précontrôle authentifié de
l’admin reste obligatoire avant toute décision réelle.
