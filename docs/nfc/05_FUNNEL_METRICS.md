# NFC Terrain — métriques

## Funnel
1. **Scans** : sessions distinctes avec `nfc_open` ; ne pas appeler cela visiteurs uniques.
2. **Engagés** : scène mission ou suivante, intention ou CTA.
3. **Intention** : `nfc_intent_select`.
4. **Entrées Dédicalivres** : `nfc_site_arrival`, plus fiable que le clic de sortie.
5. **Activation** : première action utile sur le site.

## Indicateurs support
- Attraction = scans / période d'exposition
- Engagement = engagés / scans
- Passage = arrivées site / scans
- Activation = activations / scans

Comparer par support, campagne, événement, partenaire, lieu contextuel et variante CTA.
