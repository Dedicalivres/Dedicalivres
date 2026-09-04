# V11 — ouverture contrôlée des soumissions Veille

## État livré

Le verrou historique n’est plus codé en dur. Il dépend de
`adminV11WatchSubmissionEnabled`, activé après installation et validation du RPC
transactionnel en production le 4 septembre 2026.

Quand le drapeau est désactivé, le bridge intercepte et désactive les boutons.
Quand il est activé, le parcours impose :

- authentification administrateur et politique RLS admin ;
- fiche candidate persistée et champs obligatoires complets ;
- écran d’aperçu avant envoi ;
- avertissement et seconde validation en cas de doublon probable ;
- recherche d’un doublon existant avant insertion ;
- verrou anti-double clic en mémoire ;
- création en attente, jamais validée ou publiée automatiquement ;
- rattachement de l’identifiant créé au workflow de Veille.

## Recette validée avant activation

1. Tester avec un candidat complet sans doublon.
2. Vérifier qu’un double clic ne crée qu’un événement.
3. Tester un doublon certain puis un doublon probable.
4. Simuler une erreur Supabase et vérifier la possibilité de réessayer.
5. Vérifier que l’événement créé reste `validated=false`, `rejected=false` et `featured=false`.
6. Tester une session non admin et une session expirée.

La recette SQL transactionnelle a été exécutée en production avec rollback :
aucun candidat ni événement fictif n’a été conservé. Le RPC est interdit à
`anon` et exécutable par `authenticated`, puis protégé par `private.is_admin()`.

## Rollback

Remettre `adminV11WatchSubmissionEnabled` à `false` arrête immédiatement le
chemin d’écriture dans la V11. Aucun schéma ni aucune donnée ne sont supprimés.
