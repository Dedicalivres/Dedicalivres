# Sauvegarde Supabase avant durcissement

Objectif: pouvoir revenir en arriere avant d'executer `SUPABASE_SECURITY_HARDENING.sql`.

## Ce qu'il faut sauvegarder

1. Base Postgres Supabase:
   - schema;
   - donnees;
   - roles;
   - policies RLS;
   - fonctions;
   - tables Auth et Storage metadata.

2. Storage:
   - les backups base de donnees ne contiennent pas les fichiers Storage eux-memes;
   - audit du 2026-05-25: les buckets `event-images` et `testimonial-images` ne contiennent que `.emptyFolderPlaceholder`, donc aucun fichier image Supabase important n'a ete trouve.

3. Fichiers du site:
   - garder une copie du dossier projet actuel avant de deployer.

## Methode recommandee

### 1. Backup Dashboard Supabase

Dans Supabase:

1. Ouvre le projet `pwyetrqyiaxpzjrafpvb`.
2. Va dans `Database Backups`.
3. Verifie le type de backup:
   - `Scheduled backups` si backups logiques disponibles;
   - `Point in time` si PITR est actif.
4. Note la date et l'heure du dernier backup disponible.
5. Si un backup logique est telechargeable, telecharge-le et garde-le hors du dossier du site.

Important: Supabase indique que les backups Database ne restaurent pas les objets Storage supprimes apres coup. Storage doit etre sauvegarde a part s'il contient de vrais fichiers.

### 2. Export SQL local

Pre-requis sur Mac:

- Supabase CLI;
- Docker Desktop lance;
- `psql` utile pour tester une restauration.

Les outils n'etaient pas detectes dans cette session au moment de la verification.

Quand ils sont installes, lance:

```bash
./scripts/backup-supabase.sh
```

Le script demande la connection string Supabase au lancement et cree un dossier:

```text
~/SupabaseBackups/dedicalivres/YYYY-MM-DD_HH-MM-SS/
```

Il genere:

- `roles.sql`
- `schema.sql`
- `data.sql`
- `metadata.txt`
- `checksums.sha256`

## Ou trouver la connection string

Dans Supabase Dashboard:

1. Ouvre le projet.
2. Clique `Connect`.
3. Choisis la connection string Postgres.
4. Prends de preference le `Session pooler`.
5. Remplace `[YOUR-PASSWORD]` par le mot de passe database.

Ne colle pas cette connection string dans un fichier du projet.

## Verification minimum apres backup

Dans le dossier de backup:

```bash
ls -lh
cat checksums.sha256
```

Les fichiers `roles.sql`, `schema.sql` et `data.sql` doivent exister. `data.sql` doit normalement etre le plus gros.

## Retour arriere

Pour un retour arriere complet, preferer d'abord la restauration Dashboard Supabase si elle est disponible.

Les fichiers SQL locaux servent de deuxieme filet de securite et peuvent etre restaures vers un nouveau projet Supabase ou une base de test avant toute restauration definitive.

Sources officielles:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
