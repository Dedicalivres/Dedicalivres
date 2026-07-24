# Nettoyage de la racine — à faire avant tout

Le module a été déposé à plat : dix de ses fichiers sont actuellement à la racine
du dépôt, donc **servis en ligne** sur dedicalivres.fr.

Rien n'est cassé — aucun de ces fichiers n'a écrasé quoi que ce soit, vérification
faite sur les 571 commits et 1323 fichiers de l'historique. Mais ils n'ont rien à
faire là, et deux d'entre eux posent un problème concret (voir plus bas).

---

## 1. Supprimer ces dix fichiers de la racine

```
salle.html
auteur.html
regie.html
live-salle.css
live-core.js
live-config.js
live-schema.sql
live-seed.sql
live-schema-rollback.sql
README-salle-live.md
```

Dans GitHub Desktop : supprimez-les dans le Finder, ils apparaîtront en *Deleted*
dans l'onglet Changes. Committez, poussez.

`live-config.js` disparaît définitivement : le module lit désormais votre `config.js`.

---

## 2. Puis déposer la nouvelle arborescence

```
dedicaces-live/          <- dossier à créer, tel quel
  salle.html
  auteur.html
  regie.html
  live-salle.css
  live-core.js

supabase/                <- dossier à créer, tel quel
  live-schema.sql
  live-seed.sql
  live-schema-rollback.sql

README-salle-live.md     <- à la racine, ou dans docs/ si vous préférez
```

**Vérifiez que le dossier `dedicaces-live/` existe bien après le dépôt.** C'est le
seul point de vigilance : si les fichiers se retrouvent encore à plat, `auteur.html`
et `regie.html` reviendront à la racine.

---

## 3. Ajouter deux lignes à robots.txt

À placer avec les autres `Disallow`, avant la ligne `Sitemap:` :

```
Disallow: /dedicaces-live/
Disallow: /supabase/
```

Les trois pages portent déjà `noindex, nofollow` dans leur `<head>`. Le `Disallow`
est une seconde barrière : il évite qu'un moteur ne suive un lien vers la console
autrice si l'adresse fuitait quelque part.

---

## Pourquoi ce n'est pas seulement cosmétique

**Votre contrôle qualité se serait trompé.** `scripts/check-project.mjs` liste les
`*.html` de la racine et signale ceux absents du sitemap, en excluant une liste
blanche (`admin.html`, `snippet.html`, `event.html`, `author.html`…). Mes trois
pages n'y figurent pas : le script vous aurait donc réclamé d'ajouter `auteur.html`
et `regie.html` au sitemap — exactement l'inverse de ce qu'il faut faire pour des
consoles protégées par jeton.

Le script ne lit que la racine, sans récursion. Une fois le module dans son dossier,
le problème disparaît de lui-même, sans toucher à votre liste blanche.

**Les fichiers SQL sont téléchargeables.** À la racine, `live-schema.sql` est servi
sur `dedicalivres.fr/live-schema.sql`. Il ne contient aucun identifiant — les jetons
sont générés à l'exécution — mais il expose le modèle de sécurité et le nom des
tables. Le `Disallow` ci-dessus et le déplacement dans `supabase/` suffisent.
Note au passage : votre `SUPABASE_SECURITY_HARDENING.sql` est dans le même cas
depuis un moment, à la racine et sans `Disallow`. À traiter séparément.

---

## Un point sans rapport, mais qui mérite un commit

Votre refonte d'en-tête n'est pas versionnée. `git status` donne `index.html`
modifié, comme `admin.html`, `agenda-litteraire.html`, `auteurs-auto-edites.html`,
`auteurs-independants.html` et l'image de marque. Le dernier commit remonte au
18/07 (« css rename 2/2 »).

C'est ce travail non commité qui a rendu la restauration de `index.html` plus
délicate qu'elle n'aurait dû l'être. Un commit avant de reprendre le module vous
évitera de revivre la même chose.
