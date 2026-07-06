# Retour arrière — Admin « Le Comptoir »

Le nouveau thème admin est une couche additive : aucun fichier
d'origine n'a été modifié (admin.js, admin.css, admin-cockpit.css
et tous les admin-*.js sont intacts).

## Pour revenir à l'ancien admin
Remplacer `admin.html` par le fichier `rollback/admin.html`
(l'original conservé ici), OU supprimer ces 2 lignes de admin.html :
  <link rel="stylesheet" href="admin-comptoir.css?v=comptoir-1" />
  <script src="admin-comptoir.js?v=comptoir-1" defer></script>

## Pour revenir en arrière côté site public
Les couches ludique/accessibilite se retirent de la même façon :
supprimer les lignes ludique-* et a11y-* des pages HTML.
