# Extraction directe depuis l’admin

## Mise en service unique

1. Ouvrir le Worker Cloudflare `dedicalivres-daily-export`.
2. Remplacer son code par `dedicalivres-daily-export.js`.
3. Conserver les secrets existants :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EXPORT_SECRET`
4. Conserver le binding R2 existant `EXPORTS_BUCKET`.
5. Ajouter ou vérifier la variable :
   - `ALLOWED_ADMIN_ORIGINS=https://dedicalivres.fr,https://www.dedicalivres.fr,https://xn--ddicalivres-bbb.fr`
6. Publier la nouvelle version du Worker.
7. Mettre en ligne les trois fichiers admin modifiés :
   - `admin.html`
   - `admin.js`
   - `admin.css`

Aucun nouveau secret ne doit être ajouté au site public.

## Utilisation quotidienne

1. Se connecter à l’admin Dédicalivres.
2. Ouvrir l’onglet **Exports**.
3. Déplier **Nouvelle extraction**.
4. Choisir :
   - la catégorie ;
   - le pays ;
   - le territoire si nécessaire ;
   - la période rapide ou les dates personnalisées ;
   - les formats JSON, CSV et/ou Publications.
5. Cliquer sur **Générer l’extraction**.
6. Ouvrir les boutons rouges créés sous le formulaire.

Les fichiers sont rangés dans R2 sous `exports/manual/` avec un dossier unique par extraction.

## Sécurité

- L’admin transmet uniquement sa session Supabase.
- Le Worker vérifie cette session auprès de Supabase.
- Le Worker vérifie ensuite que l’utilisateur figure dans `public.admin_users`.
- La clé `service_role` reste exclusivement dans les secrets Cloudflare.
- Aucune règle RLS n’est modifiée.
