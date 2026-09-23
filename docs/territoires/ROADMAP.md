# Pages territoriales SEO/GEO

Lot local du 22–23 septembre 2026. Aucun déploiement, aucune fusion, aucune écriture distante.

## État des lots

| Lot | État | Périmètre / suite |
| --- | --- | --- |
| RÉG-01 — Référentiel et fiabilité | Réalisé pour l'existant | Inventaire des 5 pays / 55 subdivisions du référentiel existant, pages, catalogue public, doublons et collisions. Anomalies remontées en admin, sans bloquer les annonces publiées. |
| RÉG-02 — Pages pilotes | Réalisé localement | Bretagne et Wallonie ; catalogue public complet, HTML initial, actualisation à l’ouverture, compteurs, archives et navigation. Pas de déploiement ; contrôles éditoriaux indicatifs, annulation réelle non renseignée. |
| RÉG-03 — Explorer les territoires | À faire | Seule une entrée HTML vers les deux pilotes est livrée. Recherche et répertoire complet différés. |
| RÉG-04 — Favoris et calendrier | À faire | Parcours existant conservé via la fiche. Aucun nouveau stockage ni suivi territorial. |
| RÉG-05 — Généralisation contrôlée | À faire | Aucune génération massive, aucun sitemap modifié. |
| RÉG-06 — Mesure | À faire | Aucune collecte ni résultat SEO/GEO annoncé. |

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

## Contraintes et arrêt

Réutiliser les pages et fonctions existantes, sans deuxième architecture. Préserver le checkout utilisateur. Ne toucher ni à la V2 immersive ni au schéma de données. Aucun nouveau compte, collecte, suivi utilisateur ou synchronisation implicite. Arrêt après les deux pilotes et leur validation locale, sans généralisation, fusion ni publication.

## Ajustement demandé le 23 septembre

La publication décide de la visibilité. Les alertes de qualité ne retirent ni ne corrigent les annonces : elles apparaissent dans le panneau admin existant. La correction de Mons au 26–27 septembre est reprise et résout l’alerte. Les valeurs observées et sources initiales sont conservées. Actualisation du catalogue public à l’ouverture des pilotes, bouton d’actualisation et maintien des dernières données en cas d’erreur. Le HTML sans JavaScript reste daté de sa génération.

## Généralisation ciblée demandée le 23 septembre 2026

Le nouvel objectif remplace l'arrêt aux deux pilotes : cinq pages pays et seize pages régionales, à partir de la capture publique existante. France : les treize régions du référentiel ; Belgique : Wallonie ; Suisse : Vaud et Fribourg. Les autres subdivisions sans données ne reçoivent pas de nouvelle page. Luxembourg conserve sa page pays existante sans subdivision artificielle. Le catalogue pays reprend aussi les annonces dont le rattachement régional est inconnu.

Annuaire partagé dans `scripts/territorial-directory.mjs`, avec les textes éditoriaux précédents et les liens des visuels vérifiés dans `images-r2.json`. Les futures ouvertures de territoires doivent être ajoutées explicitement à cet annuaire selon les données disponibles. Nouvelle-Aquitaine utilise la variante 2 ; les deux originaux restent en R2.

Recette préalable : Bretagne, Wallonie, Vaud, mobile/desktop, avec/sans JavaScript. Puis génération des 21 pages et contrôle du maillage. `node scripts/build-territorial-pages.mjs --sample` permet de générer les cinq parents et ces trois régions ; sans option, uniquement les 21 pages territoriales. Aucun parcours du répertoire `evenement/` : le diagnostic historique de collisions est conservé depuis l'audit précédent. Sitemap inchangé, aucun mécanisme territorial existant ne le met à jour.

Images absentes : France, Belgique, Suisse (pays), Occitanie. En-tête texte sans image cassée. Aucune nouvelle image, mutation Supabase ou Worker. Publication de ce nouveau lot non effectuée à ce stade.
