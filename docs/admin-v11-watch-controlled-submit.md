# V11 — ouverture contrôlée des soumissions Veille

## État livré

Le verrou historique n’est plus codé en dur. Il dépend de
`adminV11WatchSubmissionEnabled`, conservé à `false` dans `config.js`.
La fusion de ce lot ne suffit donc pas à autoriser une écriture.

## Résultat de l'audit bout en bout

L'ouverture reste bloquée. Le parcours actuel effectue deux requêtes séparées :

1. insertion dans `public.events` ;
2. mise à jour du candidat avec le statut `submitted` et l'identifiant créé.

Si la seconde requête échoue après la réussite de la première, l'événement existe
mais le candidat reste `ready` en base. L'erreur de persistance est actuellement
absorbée par le repli local : l'interface peut même annoncer que la soumission est
créée et considérer localement le candidat comme `submitted`. Le test ciblé
reproduit cette rupture. La recherche de doublons réduit le risque d'une seconde
création, mais ne remplace pas une transaction serveur et ne garantit pas le
rattachement du candidat.

Le drapeau `adminV11WatchSubmissionEnabled` doit donc rester à `false`.

## Contrat serveur minimal requis avant ouverture

Une migration dédiée devra fournir une fonction transactionnelle unique qui :

- exige une session authentifiée et `private.is_admin()` ;
- verrouille le candidat concerné et exige son état `ready` ;
- revalide côté serveur les champs obligatoires ;
- refuse un candidat déjà rattaché à un événement ;
- crée l'événement avec tous les indicateurs de publication à `false` ;
- rattache l'identifiant créé et passe le candidat à `submitted` dans la même transaction ;
- renvoie l'identifiant créé ;
- n'accorde l'exécution qu'au rôle `authenticated` et garde `anon`/`public` révoqués.

Cette migration n'est ni écrite ni appliquée dans ce lot d'audit.

Quand le drapeau est désactivé, le bridge intercepte et désactive les boutons.
Quand il sera explicitement activé, le parcours existant imposera :

- authentification administrateur et politique RLS admin ;
- fiche candidate persistée et champs obligatoires complets ;
- écran d’aperçu avant envoi ;
- avertissement et seconde validation en cas de doublon probable ;
- recherche d’un doublon existant avant insertion ;
- verrou anti-double clic en mémoire ;
- création en attente, jamais validée ou publiée automatiquement ;
- rattachement de l’identifiant créé au workflow de Veille.

## Recette obligatoire avant activation

1. Tester avec un candidat complet sans doublon.
2. Vérifier qu’un double clic ne crée qu’un événement.
3. Tester un doublon certain puis un doublon probable.
4. Simuler une erreur Supabase et vérifier la possibilité de réessayer.
5. Vérifier que l’événement créé reste `validated=false`, `rejected=false` et `featured=false`.
6. Tester une session non admin et une session expirée.

## Rollback

Remettre `adminV11WatchSubmissionEnabled` à `false` arrête immédiatement le
chemin d’écriture dans la V11. Aucun schéma ni aucune donnée ne sont supprimés.
