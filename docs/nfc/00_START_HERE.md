# Dédicalivres — NFC immersive foundation

Date : 2026-08-26  
Base auditée : `main` @ `3ba7a87a70ec40ef89b7771fc832d5b5668a07a0`  
Branche cible : `feature/nfc-immersive-foundation`

## Statut
- production non modifiée ;
- aucune migration Supabase exécutée ;
- aucun déploiement Vercel ;
- aucune puce programmée ;
- tentative de création de branche GitHub refusée : `403 Resource not accessible by integration`.

## Références
- V3 : référence visuelle la plus récente.
- V2 : référence de robustesse (navigation d'étapes, reduced-motion).

## Principes
1. Une puce publique contient uniquement une URL HTTPS permanente : `/nfc/?t=XXXXXXXX`.
2. Le token est opaque et résolu côté Dédicalivres.
3. Le sas NFC doit produire une première intention avant l'entrée sur le site.
4. Priorités : proximité, favoris, découverte, auteur/organisateur selon contexte.
5. Géolocalisation seulement après action explicite.
6. Tracking anonyme et parcimonieux.
7. Reload != nouveau scan logique.
8. Safari iPhone, réseau lent et reduced-motion sont des cas critiques.
9. Aucun merge ni déploiement sans validation explicite.
