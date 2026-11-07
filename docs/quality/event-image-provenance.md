# Dédicalivres — Qualité des images événementielles (audit en lecture seule)

**Objectif** : détecter les illustrations de stock et les visuels douteux avant de les réintroduire, sans supprimer une véritable affiche partagée entre plusieurs séances.

## Règles

- `STOCK_IMAGE` : URL de banque d'images connue. C'est une alerte éditoriale forte, pas un DELETE automatique.
- `SHARED_IMAGE_REVIEW` : même image pour plusieurs fiches. Vérifier qu'elle n'est pas l'affiche de programme commune. Ex. Fnac Melun, dédicaces du salon du Mée-sur-Seine, les 7 et 8 novembre 2026.
- `BATCH_PROVENANCE_REVIEW` : lots historiques `booking_with_emilie` ou Calmann-Lévy 2026 dont l'image n'est pas hébergée par le site indiqué. **L'appartenance au lot ne démontre pas que le visuel est générique**.
- `MISSING_IMAGE` : URL absente. Ne pas réinsérer un visuel générique pour satisfaire la complétude.
- `INVALID_IMAGE_URL` : URL non HTTP(S), à corriger.

**Aucune absence d'alerte ne prouve les droits de diffusion**, ni l'authenticité d'un visuel. La provenance doit être conservée séparément (organisateur, URL officielle, autorisation explicite ou kit de diffusion, contrôle humain).

## Fonctionnement

- Lectures GET uniquement de l'API publique Supabase avec la clé publique déjà présente dans `config.js` ; aucune clé `service_role`.
- Fiches publiées uniquement (`validated=true`, `rejected=false`). Paramètre optionnel `--from=AAAA-MM-JJ`.
- Les photographies de stock sont comparées sans les paramètres de taille/cadrage ; les URL de transformation dynamiques de type `.php?image=` conservent leurs paramètres.
- Rapport JSON conservé dans un artefact GitHub Actions (14 jours) ; **aucune mutation Supabase, R2 ou GitHub Pages**. Pas d'arrêt de publication sur de simples soupçons.

## Exécution

```bash
node scripts/test-event-image-provenance.mjs
node scripts/audit-event-images-readonly.mjs --from=2026-11-07 --json
```

Le workflow planifié les mercredis et samedis ne fonctionnera qu'après fusion de la PR ; sa création en brouillon ne l'active pas. La prochaine étape séparée sera l'intégration des signalements dans la file qualité du cockpit V11, avec revue humaine avant toute mise à jour des fiches.
