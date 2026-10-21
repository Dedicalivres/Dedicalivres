 # Dedicalivres

Site statique pour repertorier les salons du livre, festivals litteraires, dedicaces, temoignages et presences d'auteurs.

## Architecture

- Front public: HTML, CSS, JavaScript natif.
- Base de donnees: Supabase, avec acces public limite par Row Level Security.
- Point d’entrée admin actif: `admin.html`, protégé par Supabase Auth et par les policies SQL.
- Source V11 de référence: `admin-v11.html` et ses modules ; la bascule contrôlée copie cette source vers le point d’entrée actif.
- Images: Cloudflare R2 via Worker d'upload, avec fallback possible vers Supabase Storage.
- Exports: Cloudflare Worker `dedicalivres-daily-export.js`, publie les fichiers dans R2.

## Fichiers importants

- `index.html`: page d'accueil et agenda principal.
- `app.js`: logique publique de l'agenda, filtres, carte, soumission, favoris.
- `event.html` / `event.js`: fiche evenement publique.
- `author.html` / `author.js`: aperçu auteur interne, authentifié et non indexé.
- `author-backoffice.js`: calcul local de préparation `AUTEUR_PRÊT`.
- `admin.html`: point d’entrée de l’interface administrateur active.
- `admin-v11.html` / `admin-shell.js`: source V11 de référence, activée uniquement par une bascule contrôlée avec rollback validé.
- `dedicalivres-daily-export.js`: Worker d'exports.
- `SUPABASE_SECURITY_HARDENING.sql`: policies RLS recommandees.
- `_headers`: en-tetes de securite pour hebergement type Netlify/Cloudflare Pages compatible.
- `sitemap.xml`: plan de site public.

## Verification locale

```bash
npm run check
```

Le script verifie notamment:

- la syntaxe JavaScript;
- la presence du CSS principal;
- la coherence minimale du sitemap;
- les fichiers de securite attendus.

## Deploiement

1. Deployer les fichiers statiques sur l'hebergeur.
2. Verifier que `style.css` est bien present en minuscules.
3. Appliquer les policies SQL dans Supabase apres les avoir relues.
4. Ajouter l'utilisateur admin dans `public.admin_users`.
5. Deployer le Worker d'export depuis `worker/`.
6. Ajouter les secrets Worker avec Wrangler:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put EXPORT_SECRET
```

## Securite

Ne jamais mettre de cle `service_role` dans le front. La cle publique Supabase peut etre exposee, mais toutes les autorisations doivent etre imposees par RLS.

Les endpoints publics de soumission doivent rester limites: evenements en attente seulement, temoignages en attente seulement, tracking en insertion seule, aucune lecture publique de donnees personnelles.

## Pages territoriales SEO/GEO — pilotes locaux

Roadmap, qualification des données et reproduction : [docs/territoires/README.md](docs/territoires/README.md). Deux pilotes seulement, sans publication ni généralisation.

## Reprise unique du retrait du test Lorient

Le run [39630801864](https://github.com/Dedicalivres/Dedicalivres/actions/runs/39630801864), sur `cf60fa52c834070e08e31838c8e6bceb630bb889`, a échoué avec le code 13 au recontrôle de source : validation du périmètre réussie, commit/push, demande de build et vérification de déploiement ignorés, remise en file réussie. Le batch échoué est `20d544e5-3249-4289-b30d-258f38ab5041`. Ces preuves bornent l'exception de reprise ; elles ne permettent aucun autre rejeu.

Après intégration du correctif et autorisation humaine distincte :

1. Revérifier main propre, date Europe/Paris, source, donnée privée et file. Seul `0cc69430-9f31-4dab-b701-2061683e6b4c` est autorisable en PENDING/1, sans batch ni commit, avec l'erreur exacte du batch ci-dessus. Aucun autre RUNNING ; les neuf autres PENDING et l'ancien edit BLOCKED restent intacts.
2. Avec les lectures privées configurées, exécuter `scripts/prepare-lorient-retirement-authorization.mjs JOB NOUVEL_UUID_DECISION NOUVEAU_BROUILLON NOUVEL_APERCU`, avec `PUBLICATION_REFERENCE_DATE` au jour Paris courant. Le brouillon reste DRAFT_NOT_APPROVED ; il scelle le job complet PENDING/1 et un nouveau batch. L'ancienne décision `eb41538d-c93d-4492-a2aa-0b38e2106b6c` et l'ancien manifeste sont refusés.
3. Faire approuver le nouveau manifeste humainement, puis lancer une **nouvelle PREVIEW GitHub** du seul job exact. Revoir le retrait 633→632, les 281 autres legacy et toutes les fiches tierces inchangées. Utiliser exclusivement l'empreinte produite par cette PREVIEW, jamais l'ancienne.
4. Un futur EXECUTE exige sa propre autorisation humaine. La réservation atomique existante ne peut accepter que le job scellé PENDING/1 et le nouveau batch du manifeste ; la génération exige RUNNING/2 dans ce batch. Toute troisième tentative, variation de source, donnée privée ou file impose STOP. Aucun retry automatique.

Cette procédure n'autorise ni réservation ni publication. Aucune écriture Supabase ni migration n'est requise pour livrer le correctif. CANARY et publication générale restent désactivés. Si l'état est incertain, ne pas remettre les compteurs à zéro et ne pas restaurer artificiellement un ancien manifeste.
