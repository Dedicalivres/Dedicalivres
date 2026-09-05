# Accueil — feuille de route pour corriger les proportions du logo mobile

## Objectif

Rétablir les proportions natives du logo principal de la page d’accueil sur
mobile, sans modifier l’Admin V11, la navigation, le contenu du hero, les modes
d’accessibilité, les animations ou l’affichage ordinateur.

## Diagnostic vérifié

- `assets/brand/logo-3d-clair.webp` mesure 820 × 687 px et n’est pas déformé à la source.
- Sur les écrans de 680 px ou moins, `ludique.css` limite l’image à
  `max-height: 140px` avec `width: auto`.
- `accessibilite.css`, chargé après `ludique.css`, réimpose une largeur avec une
  règle plus spécifique sur `.association-hero-brand .brand-logo`.
- La combinaison largeur imposée + hauteur plafonnée peut afficher le logo
  autour de 350 × 140 px et l’écraser verticalement.
- Le préchargement vise `logo-association-3d.webp`, alors que le premier logo
  réellement affiché est `logo-3d-clair.webp`.
- Le logo sombre mesure 1536 × 1024 px, tandis que ses attributs HTML annoncent
  820 × 687 px. Ce point peut produire un décalage de mise en page, mais n’est
  pas la cause principale observée en mode clair.

## Périmètre autorisé

- règles CSS de `.association-hero-brand` et `.brand-logo` sur la page d’accueil ;
- attributs intrinsèques `width` et `height` des deux variantes du logo ;
- préchargement du logo principal ;
- test ciblé et documentation de recette.

## Hors périmètre

- Admin V11 et Supabase ;
- remplacement ou régénération graphique du logo ;
- dimensions du logo d’en-tête ;
- navigation, textes, cartes, agenda et formulaires ;
- refonte générale du hero ou des modes d’accessibilité.

## Lot 1 — état de référence

1. Créer une branche dédiée depuis `main`.
2. Capturer l’état actuel aux largeurs 320, 360, 390, 430, 680, 768 et 1440 px.
3. Mesurer avec JavaScript la largeur et la hauteur rendues du logo clair.
4. Calculer le rapport largeur/hauteur rendu et le comparer au rapport natif
   `820 / 687`, avec une tolérance maximale de 1 %.
5. Vérifier séparément les modes clair, soir et mouvement réduit.

Le constat doit échouer uniquement sur les largeurs réellement affectées. Il ne
faut pas modifier le code avant d’avoir conservé ces mesures de référence.

## Lot 2 — correctif minimal

Dans la règle mobile finale, appliquer une seule stratégie dimensionnelle :

```css
@media (max-width: 680px) {
  .association-hero-brand .brand-logo {
    width: min(78vw, 350px);
    height: auto;
    max-height: none;
    object-fit: contain;
  }
}
```

La règle doit être placée dans la feuille chargée en dernier ou remplacer la
règle conflictuelle existante. Ne pas ajouter une succession de `!important`.

En complément dans le même lot :

- précharger `logo-3d-clair.webp`, réellement affiché au premier rendu ;
- conserver les dimensions intrinsèques 820 × 687 pour le logo clair ;
- déclarer 1536 × 1024 pour le logo sombre, ou produire ultérieurement deux
  fichiers partageant exactement le même canevas ;
- renouveler les versions de cache des seules ressources modifiées.

## Lot 3 — tests de non-régression

### Automatisés

- les deux logos conservent `height: auto` ;
- aucune règle mobile ne combine une largeur forcée avec `max-height: 140px` ;
- le rapport rendu reste dans une tolérance de 1 % du rapport natif ;
- aucun débordement horizontal de la page entre 320 et 680 px ;
- le logo clair et le logo sombre ne sont jamais visibles simultanément ;
- le HTML conserve des dimensions intrinsèques exactes ;
- le préchargement correspond à l’image claire réellement utilisée ;
- la suite `npm run check` reste entièrement PASS.

### Visuels

| Surface | Contrôle attendu |
|---|---|
| iPhone 320–430 px | logo non écrasé, centré, sans débordement |
| Android 360–430 px | mêmes proportions et espace cohérent avant le texte |
| Tablette 768 px | rendu inchangé hors règle mobile |
| Ordinateur 1440 px | rendu strictement inchangé |
| Mode soir | variante sombre proportionnée et sans saut de mise en page |
| Mouvement réduit | proportions identiques, animation seulement désactivée |

Une capture avant/après doit être jointe à la PR pour au moins 390 px et 1440 px.

## Critères d’acceptation

- aucune déformation perceptible du logo sur mobile ;
- écart du rapport d’aspect inférieur ou égal à 1 % ;
- aucune régression ordinateur, tablette ou mode soir ;
- aucune modification hors périmètre sans justification ;
- tests ciblés et `npm run check` PASS ;
- validation visuelle humaine avant fusion ;
- aucun déploiement ou merge automatique.

## Rollback

Le rollback consiste à revert le commit unique du correctif sur une branche
dédiée, puis à ouvrir une PR. Aucun schéma, aucune donnée et aucune configuration
Supabase ne sont concernés. Les fichiers graphiques originaux doivent rester
inchangés afin que le retour soit immédiat et sans perte.

## Ordre recommandé

1. Fusionner cette feuille de route documentaire.
2. Préparer le correctif CSS et le test ciblé dans une nouvelle branche.
3. Exécuter les contrôles automatisés et produire les captures avant/après.
4. Faire valider visuellement le mobile par l’utilisateur.
5. Fusionner seulement après cette validation explicite.
