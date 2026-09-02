# Feuille de route maître — NFC Dédicalivres

## Lot 0 — Fondation / récupération
Créer une branche dédiée, importer V3 sans altération, archiver V2, snapshot et rollback.

## Lot 1 — Robustesse mobile
Extraire les base64, optimiser les assets, limiter blur/filter au scroll, no-JS fallback, vrai `prefers-reduced-motion`, Safari iPhone.

## Lot 2 — Le Passage
Porte → Rencontre → Dédicalivres → Proximité → Intention → Passage vers le site.

## Lot 3 — Contexte NFC
URL `/nfc/?t=XXXXXXXX`, token inconnu/inactif géré, contexte support/campagne/événement/partenaire/CTA résolu côté serveur.

## Lot 4 — Tracking test
`nfc_open`, `nfc_scene_view`, `nfc_progress`, `nfc_intent_select`, `nfc_cta_impression`, `nfc_cta_click`, `nfc_enter_site`, `nfc_site_arrival`, `nfc_activation`, `nfc_error`.

## Lot 5 — Supabase
Tables `nfc_tags`, `nfc_sessions`, `nfc_events`, RLS, RPC/Edge Function whitelistée. Migration revue avant exécution.

## Lot 6 — Handoff site
`sessionStorage` même origine, arrivée site confirmée, première action utile attribuée : favori, proximité, événement, soumission, présence auteur.

## Lot 7 — Cockpit NFC Terrain
Scans → Engagés → Intention → Entrées site → Activations. Filtres période/support/puce/campagne/événement/partenaire.

## Lot 8 — Parc de puces
À programmer → programmée → testée → installée → déplacée → inactive/perdue.

## Lot 9 — Validation / PR
Safari iPhone prioritaire, Android, desktop, réseau lent, JS lent, reduced-motion, refresh, token invalide. Aucun merge sans validation explicite.
