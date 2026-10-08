# Pages territoriales SEO/GEO

État consolidé au 8 octobre 2026. La référence Git déployée est le merge commit `6b71a3b4609b89036ffde13d34a84935eae3d4fe`. Le workflow GitHub Pages `37824157391` a réussi sur ce SHA ; cela prouve le déploiement du commit, pas son indexation ni un gain SEO/GEO.

## État des lots

| Lot | État | Périmètre / suite |
| --- | --- | --- |
| RÉG-01 — Référentiel et fiabilité | Réalisé pour l'existant | Inventaire des 5 pays / 55 subdivisions du référentiel existant, pages, catalogue public, doublons et collisions. Anomalies remontées en admin, sans bloquer les annonces publiées. |
| RÉG-02 — Pages pilotes | Réalisé et déployé | Bretagne et Wallonie ont été validées, puis intégrées au générateur territorial partagé. HTML initial, compteurs, archives, navigation et données structurées sont déployés. |
| RÉG-03 — Explorer les territoires | Partiel | Navigation pays → régions et pages crawlables livrées. La recherche pays/territoire/ville et le répertoire complet avec compteurs restent à réaliser. |
| RÉG-04 — Favoris et calendrier | À faire | Parcours existant conservé via la fiche. Aucun nouveau stockage ni suivi territorial. |
| RÉG-05 — Généralisation contrôlée | Réalisé pour le corpus autorisé | 5 pages pays et 16 pages régionales, sitemap territorial 21/21, JSON-LD aligné sur le snapshot et 20 pages ville crawlables sans JavaScript. Toute nouvelle ouverture reste explicite et factuelle. |
| RÉG-06 — Mesure | À faire | Aucune collecte ni résultat SEO/GEO annoncé. |

## Lots P0 consolidés

| Lot | État | Preuve principale |
| --- | --- | --- |
| P0.1 — Synchronisation du sitemap territorial | Terminé | 21/21 canonicals territoriaux, `lastmod` déterministe issu de `catalogue-public.json.capturedAt`. |
| P0.2 — Fusion du sitemap territorial | Terminé | Merge commit `b7c9f48e0ee1576c297240c6e7e1f1e24e63c901`. |
| P0.3 — Données structurées territoriales | Terminé | `dateModified` aligné sur le snapshot ; breadcrumbs régionaux sans URL `.html`. |
| P0.4 — Fusion des données structurées | Terminé | Merge commit `d30293a418978f8928c8da9d1ff1f12df0066dc6`. |
| P0.5 — Aperçus statiques des pages ville | Terminé | 20/20 pages ville crawlables sans JavaScript, 37 liens événement canoniques. |
| P0.6 — Fusion des aperçus ville | Terminé | Merge commit `6b71a3b4609b89036ffde13d34a84935eae3d4fe`. |

Limites de preuve : les validations couvrent le dépôt, les tests ciblés et le workflow de déploiement. Une recette HTTP publique complète sur le SHA courant et la mesure d’indexation restent nécessaires.

## RÉG-01 — Référentiel et fiabilité

- Inventorier les pays, territoires et pages déjà disponibles.
- Respecter les découpages propres aux pays : régions, cantons, provinces, etc.
- Définir des identifiants territoriaux stables, distincts des libellés affichés.
- Ne jamais attribuer arbitrairement un pays ou un territoire inconnu.
- Vérifier les doublons et les collisions d'identifiants événement avant de construire les liens.
- Réutiliser les règles publiques de validation et de visibilité des événements.

## RÉG-02 — Pages pilotes

- Préparer une région française et un territoire hors France disposant de données suffisamment fiables.
- Réutiliser leurs URL existantes lorsqu'elles existent.
- Afficher le territoire et son pays, la date réelle de création (ou son absence de preuve), la date réelle d'actualisation du catalogue, le total et sa ventilation.
- Présenter les événements à venir chronologiquement ; les archives par année, de la plus récente à la plus ancienne.
- Pour chaque événement : date, titre, ville, lieu si connu et lien Dédicalivres.
- Définir le traitement des événements en cours, sans date ou annulés.
- Produire listes, compteurs et liens dans le HTML initial ; pagination accessible si nécessaire.
- Ajouter canonical, métadonnées et navigation pays → territoire → événement ; assurer une lecture mobile.

## RÉG-03 — Explorer les territoires

- Entrée « Explorer les territoires » ; recherche pays, territoire ou ville.
- Liste des pays puis territoires avec compteurs et liens HTML indépendants du JavaScript.
- Pas de génération massive de pages vides ou quasi identiques ; carte interactive ultérieure.

## RÉG-04 — Favoris et calendrier

- Réutiliser stockage et boutons favoris existants sans casser les données locales.
- « Suivre ce territoire » sur cet appareil, sans promesse de notification automatique.
- « Voir et ajouter à mon agenda » : fiche puis choix explicite du calendrier ; réutiliser l'export existant.
- Ne pas prétendre inscrire silencieusement un événement ni garantir les rappels.
- Tester dates, fuseaux horaires, plusieurs jours et absence de doublons lors d'un nouvel import.

## RÉG-05 — Généralisation contrôlée

- Étendre aux seuls territoires fiables, préserver les URL existantes.
- Actualiser les sitemaps avec des dates sincères ; vérifier les ressources publiques nécessaires aux robots.

## RÉG-06 — Mesure

- Vérifier indexation et performances avec les outils disponibles.
- Aucun chiffre de trafic ou gain SEO/GEO inventé, aucune collecte sans demande explicite.

## Contraintes permanentes

Réutiliser les pages et fonctions existantes, sans deuxième architecture. Préserver le checkout utilisateur. Ne toucher ni à la V2 immersive ni au schéma de données. Aucun nouveau compte, collecte, suivi utilisateur ou synchronisation implicite. Les ouvertures de territoires restent explicites ; aucune page vide ou quasi identique ne doit être générée automatiquement.

## Ajustement demandé le 23 septembre

La publication décide de la visibilité. Les alertes de qualité ne retirent ni ne corrigent les annonces : elles apparaissent dans le panneau admin existant. La correction de Mons au 26–27 septembre est reprise et résout l’alerte. Les valeurs observées et sources initiales sont conservées. Actualisation du catalogue public à l’ouverture des pilotes, bouton d’actualisation et maintien des dernières données en cas d’erreur. Le HTML sans JavaScript reste daté de sa génération.

## Généralisation ciblée demandée le 23 septembre 2026

Le nouvel objectif remplace l'arrêt aux deux pilotes : cinq pages pays et seize pages régionales, à partir de la capture publique existante. France : les treize régions du référentiel ; Belgique : Wallonie ; Suisse : Vaud et Fribourg. Les autres subdivisions sans données ne reçoivent pas de nouvelle page. Luxembourg conserve sa page pays existante sans subdivision artificielle. Le catalogue pays reprend aussi les annonces dont le rattachement régional est inconnu.

Annuaire partagé dans `scripts/territorial-directory.mjs`, avec les textes éditoriaux précédents et les liens des visuels vérifiés dans `images-r2.json`. Les futures ouvertures de territoires doivent être ajoutées explicitement à cet annuaire selon les données disponibles. Nouvelle-Aquitaine utilise la variante 2 ; les deux originaux restent en R2.

La recette de généralisation cible Bretagne, Wallonie et Vaud, mobile/desktop, avec/sans JavaScript. Les validations visuelles historiques établissent Bretagne et Wallonie ; une nouvelle recette publique des trois pages sur le SHA courant reste à faire. `node scripts/build-territorial-pages.mjs --sample` permet de générer les cinq parents et ces trois régions ; sans option, les 21 pages territoriales. Aucun parcours du répertoire `evenement/` : le diagnostic historique de collisions est conservé depuis l'audit précédent. Depuis P0.1, le générateur synchronise de manière ciblée les 21 entrées territoriales de `sitemap.xml` sans réécrire les entrées historiques.

Images absentes : France, Belgique, Suisse (pays), Occitanie. En-tête texte sans image cassée. Aucune nouvelle image, mutation Supabase ou Worker n’a été nécessaire pour les lots P0.1 à P0.6.

## Prochaines étapes

1. Réaliser une recette HTTP publique bornée sur le SHA courant : 21 pages territoriales, 20 pages ville, canonicals, JSON-LD, sitemaps et HTML initial sans JavaScript.
2. Laisser une fenêtre d’indexation, puis mesurer dans Google Search Console et Bing Webmaster Tools sans inventer de gain.
3. Décider séparément du traitement des pages ville actuellement vides (Avignon, Dijon et Nice) à partir des données d’indexation et du catalogue réel.
4. Cadrer RÉG-04 dans un lot distinct si le suivi local d’un territoire et le parcours calendrier deviennent prioritaires.
