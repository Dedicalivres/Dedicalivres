# Dédicalivres — Préparation d'un accès R2 sécurisé (07/11/2026)

## État : PRÉPARÉ, NON DÉPLOYÉ, AUCUN DROIT MODIFIÉ

**But :** accélérer le traitement des affiches reçues par conversation : contrôle → hébergement R2 → fiche candidate Supabase → validation éditoriale → publication ciblée.

**État actuel vérifié**
- `config.js` référence un Worker Cloudflare `dedicalivres-r2-upload` pour les images d'événements.
- `admin-event-image.js` lui envoie du multipart sans jeton. Les contrôles réels du Worker déjà déployé **ne sont pas vérifiés**, et son code source n'a pas été trouvé dans le dépôt. Ne pas conclure qu'il est public ou sécurisé.
- Le connecteur Supabase du chat sait lire le schéma et les données ; il **n'apporte pas de session administrateur navigateur**. Un dépôt d'image dans R2 n'écrit pas la fiche Supabase.
- `public.admin_users` expose via RLS seulement la ligne de l'utilisateur authentifié, ce qui permet au nouveau Worker de vérifier les droits avec le JWT de cette session, sans service-role.

## Contenu préparé

- `worker/r2-admin-ingest.mjs` : Worker **séparé et non publié**, endpoint `POST /upload` pour images brutes (pas de multipart) ; JWT utilisateur Supabase obligatoire ; validation `auth/v1/user` et `rest/v1/admin_users` sous le **même JWT** ; refus hors administration.
- `worker/wrangler.r2-admin-ingest.example.toml` : configuration modèle du nouveau Worker, binding R2, limiteur et CORS. `workers_dev=false`, aucune route publique définie.
- `admin-event-image.js` : adapter opt-in. Si `imageUploadAuthEnabled` est absent/faux, le code legacy ne change pas. Pour le nouveau Worker, transmettre seulement le JWT de la session admin, jamais une clé Supabase de service.
- `worker/test-r2-admin-ingest.mjs` : tests unitaires offline (droits, MIME/signatures, taille, CORS, refus, rate-limit, R2 et métadonnées).
- `worker/test-admin-event-image-opt-in.mjs` : 3 tests client du chemin legacy et du nouveau chemin sécurisé.
- `bernard-messias-affiche-sans-exif.jpg` : copie assainie **non hébergée**, préparée à partir de l'affiche officielle fournie.

## Contrôles à respecter

- Jetons uniquement transmis dans l'en-tête `Authorization`, jamais dans l'URL, les logs, les fichiers ou l'interface publique.
- Le JWT utilisateur n'est pas suffisant : l'appartenance à `admin_users` est contrôlée par les RLS existantes, indépendamment de l'affichage front.
- **Refus par défaut** si auth Supabase, R2, rate-limit, droits ou configuration sont indisponibles.
- Origines autorisées limitées à `https://dedicalivres.fr` et `https://www.dedicalivres.fr`; appel sans `Origin` possible pour CLI **avec JWT admin valide** uniquement.
- Dossier de sortie imposé `event-images/YYYY/MM/<UUID>.<extension>`, impossible de choisir une clé ou d'écraser un chemin client. PNG/JPEG/WEBP ; maximum 5 Mo ; types vérifiés par signature.
- Métadonnées EXIF/IPTC/commentaires retirées de JPEG, textes et EXIF retirés des PNG. WEBP avec EXIF/XMP refusés en attente d'un transcodeur fiable.
- Le bucket est public en lecture : ne jamais y placer de données privées, de documents d'identité ou de données soumises à confidentialité.
- Le Worker n'écrit **aucune donnée Supabase** et ne valide ni ne publie d'événement.

## Mise en service (autorisations distinctes nécessaires)

1. **Revue du code, des tests et des droits.** Prévoir une branche/PR séparée du pipeline de publication. Examiner le comportement du Worker R2 existant sans changer son fonctionnement.
2. Dans Cloudflare, créer un Worker isolé et lier le bucket **existant** `dedicalivres-images` à `UPLOAD_BUCKET`. Ne pas créer de nouveau bucket ni élargir les droits de lecture/écriture d'autres services.
3. Vérifier la clé publique Supabase (jamais `service_role`), les origines et un `namespace_id` de quota réellement libre ; conserver `workers_dev=false` tant que la recette n'est pas terminée. Activer une route limitée après approbation.
4. Exécuter les tests à nouveau, puis recette de bout en bout sur affiche non sensible avec session admin : échecs 401/403/413/415/422/429, succès 201, URL R2 et affichage, absence d'EXIF, aucune entrée Supabase créée par l'upload.
5. Une fois le Worker accepté, activer **dans une PR dédiée** les propriétés de `config.js` : `imageUploadAuthEnabled: true` et `imageUploadSecureEndpoint: "https://<endpoint-approuvé>/upload"`. Conserver rollback instantané en repassant le flag à `false` (attention : cela rétablit le Worker historique, dont la sécurité doit être examinée).
6. Faire l'intégration **métier** via la file `admin_watch_candidates` avec les permissions existantes, confirmation admin avant publication. Exiger image officielle + date/lieu/sources vérifiés ; gérer doublons et GPS douteux ; conserver les pièces justificatives.

## Limite spécifique à ChatGPT

La connexion GitHub/Supabase actuelle ne fournit **ni l'accès R2 autorisé ni un JWT administrateur Supabase utilisable en chat**. Ce Worker prépare le mécanisme sécurisé pour l'admin navigateur et un futur outil connecté ; il **ne rend pas les uploads R2 autonomes depuis ce chat à lui seul**. Cette étape demande un connecteur explicitement approuvé ou un workflow de navigation admin authentifié dans Work ; **ne pas stocker un jeton admin permanent dans les prompts, GitHub, ou la Library**.

## Vérifications effectuées dans le bac à sable isolé

- `node --test worker/test-r2-admin-ingest.mjs` : **15/15**.
- `node --test worker/test-admin-event-image-opt-in.mjs` : **3/3**.
- Affiche originale Bernard Messias : JPEG de 333355 octets, copie sans métadonnées de 322570 octets ; décodage vérifié, dimensions conservées (1240 × 1754). **Aucun transfert vers Cloudflare R2** effectué.

**Point de reprise B05 (Connexions) → B02 (Droits) → B04 (Orchestration) :** révision, déploiement isolé autorisé, recette, puis intégration via admin. Ne pas fusionner conceptuellement le Worker d'images avec la table d'événements ou la décision éditoriale.

**Références :** Cloudflare R2 Workers bindings, Rate Limiting API, Supabase Auth JWT, politique `SECURITY.md` du dépôt Dédicalivres.
