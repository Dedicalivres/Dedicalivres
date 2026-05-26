 # Dedicalivres

Site statique pour repertorier les salons du livre, festivals litteraires, dedicaces, temoignages et presences d'auteurs.

## Architecture

- Front public: HTML, CSS, JavaScript natif.
- Base de donnees: Supabase, avec acces public limite par Row Level Security.
- Admin: `admin.html` + `admin.js`, protege par Supabase Auth et par les policies SQL.
- Images: Cloudflare R2 via Worker d'upload, avec fallback possible vers Supabase Storage.
- Exports: Cloudflare Worker `dedicalivres-daily-export.js`, publie les fichiers dans R2.

## Fichiers importants

- `index.html`: page d'accueil et agenda principal.
- `app.js`: logique publique de l'agenda, filtres, carte, soumission, favoris.
- `event.html` / `event.js`: fiche evenement publique.
- `author.html` / `author.js`: fiche auteur publique.
- `admin.html` / `admin.js`: tableau de bord editorial.
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
