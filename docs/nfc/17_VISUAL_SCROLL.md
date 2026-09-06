# NFC — illustrations et fondu au scroll

Les cinq visuels du prototype `nfc-mobile-rebuild/public/assets` sont intégrés dans l’ordre Contact, Le livre, Rencontres, Proximité, Le passage. Les PNG originaux restent dans ce prototype ; seuls les exports WebP de qualité 85 sont publiés (environ 815 Ko au total, dimensions préservées).

Les identifiants des scènes, intentions, routes et le script métier `nfc.js` sont conservés. Les textes et boutons sont en HTML. `visual-scroll.js` ajoute une couche décorative : fondu entre images pendant la fin de chaque scène et zoom limité de 0,97 à 1, sans recadrage. Il utilise un seul rendu par frame demandée, sans bloquer le défilement tactile.

Sans JavaScript, si la première image échoue ou si le mouvement réduit est activé, les illustrations restent dans leurs sections. Le changement de préférence en cours de visite est pris en charge. Si une image suivante tarde à charger, la dernière image disponible reste visible. Les éléments internes des illustrations ne sont pas animés séparément.

## Vérification

- `npm run check` : tests existants et vérification de présence/budget des cinq images.
- `npm run test:local` : non-régression favoris et formulaires.
- `PLAYWRIGHT_MODULE=/chemin/playwright/index.mjs BROWSER=chromium node scripts/test-nfc-visual-scroll.mjs`, puis `BROWSER=webkit` et `BROWSER=firefox`.
- Tests locaux avec réseau intercepté : fondu mesuré, images entières, absence de débordement sur mobile/paysage/desktop, intention organisateur et stockage, mouvement réduit, image absente, fallback sans JavaScript.
- Captures produites dans `/tmp/dedicalivres-nfc-visual-recipe` et revues visuellement. WebKit simulé ne remplace pas un iPhone physique.

## Publication et rollback

Lot visuel indépendant, sans migration ni changement des formulaires/favoris. Publier par PR après validation des tests. Revenir en arrière par revert de la PR ; les PNG du prototype restent disponibles.
