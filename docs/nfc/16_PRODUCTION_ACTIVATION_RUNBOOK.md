# NFC Analytics V1 — activation production contrôlée

## État avant intervention

- La production ne contient aucune table ni fonction `nfc_*`.
- Le cockpit V11 reste verrouillé par `adminV11NfcCockpitEnabled: false`.
- La migration à appliquer est
  `supabase/migrations/20260904142011_nfc_analytics_cockpit_v1.sql`.
- L'activation du front fera l'objet d'un lot et d'une validation séparés.

## Préconditions obligatoires

1. La branche applicative est validée et les tests du dépôt sont PASS.
2. La migration durcie et `supabase/tests/nfc_analytics_cockpit_v1_test.sql`
   ont été exécutés sur un environnement Supabase temporaire distinct.
3. L'environnement temporaire est ensuite supprimé ou mis en pause pour éviter
   un coût persistant.
4. Une sauvegarde de production récente est disponible.
5. La référence du projet est vérifiée une seconde fois juste avant l'opération.

## Application du schéma

1. Appliquer uniquement la migration NFC contrôlée.
2. Exécuter immédiatement le scénario SQL NFC dans une transaction annulée par
   `rollback`.
3. Vérifier les conseillers sécurité et performance Supabase.
4. Confirmer que les visiteurs n'ont aucun droit direct sur les trois tables ni
   sur les fonctions `private.nfc_*`.
5. Confirmer que seuls les deux RPC publics attendus sont appelables par les
   visiteurs.

Les conseillers signaleront volontairement les deux RPC publics comme fonctions
`SECURITY DEFINER` exécutables par les visiteurs. Cette exposition est attendue :
ce sont les deux seuls points d'entrée anonymes, leurs paramètres sont validés,
leurs effets sont bornés et les fonctions internes restent interdites. Toute autre
alerte NFC doit bloquer la suite.

Ne pas activer le cockpit V11 à cette étape.

## Recette fonctionnelle production

1. Créer un seul code test, inactif par défaut.
2. Vérifier qu'il ne se résout pas et n'enregistre aucun passage.
3. Le passer à `TESTED`, puis l'activer volontairement.
4. Effectuer un scan réel et vérifier le parcours et les compteurs admin.
5. Désactiver le code et confirmer qu'un nouveau scan est refusé.
6. Contrôler qu'aucune donnée personnelle, IP ou position précise n'est stockée.

## Activation du cockpit

Après validation explicite seulement, créer une nouvelle branche applicative qui
passe `adminV11NfcCockpitEnabled` à `true`. Exécuter les tests, ouvrir une PR et
attendre une nouvelle autorisation avant fusion.

## Rollback

Le rollback immédiat sans perte de données est :

```sql
update public.nfc_tags set active = false where active = true;
```

Puis remettre le verrou applicatif à `false`. La suppression des objets SQL est
interdite sans export et validation distincte.

## Contrôle des coûts

- Aucun environnement Supabase temporaire ne reste actif après recette.
- Le cockpit lit au maximum 5 000 événements récents.
- Les plafonds sont de 80 événements par session et 300 par code et par minute.
- Le volume est revu après 30 jours avant de définir une éventuelle rétention.
