# Handoff fonctionnel — proximité et favoris

## Proximité
Le site actuel possède déjà un bouton **Me localiser** et un rayon par défaut de **25 km**.

Architecture proposée :
1. dans Le Passage, l'utilisateur touche **Voir autour de moi** ;
2. seulement alors, `navigator.geolocation` est demandé ;
3. lat/lng peut être conservé **uniquement dans `sessionStorage`** pour la continuité fonctionnelle ;
4. la position précise n'est jamais envoyée dans les analytics NFC ;
5. le site réutilise ce contexte pour centrer/filtrer la carte et garde le rayon modifiable 10/25/50/100 km.

Ainsi, pas de deuxième demande inutile de permission et pas de stockage serveur de GPS précis.

## Favoris
Le site actuel stocke les IDs d'événements dans `localStorage` sous `dedicalivres_favorites` et possède une section `#saved-events`.

Pour un nouveau visiteur :
- CTA **Créer ma sélection** → agenda ;
- micro-coach unique : « Touchez ♡ pour garder une rencontre » ;
- première sauvegarde = `nfc_activation:favorite_added`.

Pour un visiteur ayant déjà des favoris :
- CTA possible **Retrouver mes événements** → `#saved-events`.

## Présence auteur
Une fiche événement validée charge le formulaire de présence sur `event.html?id=<EVENT_ID>`.
Le hash `#authors-presence-section` permet de faire défiler directement vers le bloc de présence.

Destination contextuelle possible :
`/event.html?id=<EVENT_ID>#authors-presence-section`
