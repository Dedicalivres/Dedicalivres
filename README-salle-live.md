# Salle de dédicace en direct — Dédicalivres

Module autonome, préfixé `live_` partout. Il ne touche à aucune table ni à aucun fichier
du site existant. S'il n'est pas retenu, un seul script suffit à l'effacer entièrement.

---

## 1. Mise en route

### Sans rien déployer (mode démonstration)

Copiez le dossier `dedicaces-live/` à la racine du dépôt et poussez avec GitHub Desktop.

> **Aucun fichier de ce module ne s'appelle `index.html`.** C'est délibéré : une page nommée
> ainsi écrase la page d'accueil du site si le dossier n'est pas conservé lors du dépôt.
> La page visiteur s'appelle donc `salle.html`. Ne la renommez pas.

Les trois adresses fonctionnent immédiatement, sans base de données :

| Interface | Adresse |
|---|---|
| Visiteur | `dedicalivres.fr/dedicaces-live/salle.html` |
| Autrice  | `dedicalivres.fr/dedicaces-live/auteur.html` |
| Régie    | `dedicalivres.fr/dedicaces-live/regie.html` |

L'état vit dans le navigateur et se synchronise **entre les onglets d'une même machine** :
ouvrez les trois côte à côte et jouez le parcours complet. Le bandeau supérieur affiche
« DÉMO — données locales ».

Portée : un navigateur, une machine. Pour tester à plusieurs, passez à l'étape suivante.

### Avec la base (mode réel)

1. Dans le SQL Editor de Supabase, exécuter `supabase/live-schema.sql`.
2. Puis `supabase/live-seed.sql`. Il crée une salle de test et **affiche les trois adresses
   avec leurs jetons dans le panneau de messages**. C'est le seul moment où les jetons
   apparaissent dans un résultat ; copiez-les. (En cas d'oubli, la requête de rappel est
   en commentaire à la fin du fichier.)
3. Renseigner les deux valeurs dans `dedicaces-live/live-config.js`.

Le basculement est total : aucune autre modification de code. Les pages ignorent dans quel
mode elles tournent.

**Aucun lien depuis le menu.** Les trois pages portent `noindex, nofollow` et ne sont
atteignables que par leur adresse. En mode démonstration seulement, des liens relient les
trois interfaces pour faciliter le test — ils disparaissent en mode réel.

---

## 2. Comment tient la sécurité

Le principe est unique et tient en une phrase : **aucune table n'accepte d'écriture directe.**

RLS est actif sur les sept tables, et il n'existe **aucune** politique `INSERT`, `UPDATE`
ou `DELETE`. Toutes les écritures passent par des fonctions `SECURITY DEFINER` qui valident
leurs arguments et, pour les actions réservées, le jeton. La clé publique du site ne permet
donc rien d'autre que ce que ces fonctions autorisent explicitement.

Deux tables n'ont **aucune politique du tout**, donc sont invisibles depuis la clé publique
même si le droit `SELECT` est accordé :

- `live_session_secrets` — les jetons d'accès autrice et régie ;
- `live_order_contacts` — téléphones et adresses d'expédition.

Les coordonnées ne sont donc lisibles que par une seule voie : `live_console_auteur()`,
protégée par le jeton. Elles ne transitent jamais par le canal temps réel. La minimisation
RGPD est une propriété de l'architecture, pas une promesse.

### Les jetons

Le modèle est celui de votre YouTube Live non répertorié : la confidentialité vient de
l'adresse non devinable. Un jeton de 36 caractères hexadécimaux.

Les deux rôles sont cloisonnés : le jeton régie ne permet pas d'encaisser, le jeton autrice
ne permet pas de modérer le chat.

> **Ne partagez jamais l'adresse de la console autrice ni celle de la régie.**
> Un jeton perdu ou diffusé se régénère depuis le dashboard Supabase.

---

## 3. Ce qui est garanti côté base

Ces règles ne dépendent pas du JavaScript : elles tiennent même si quelqu'un appelle
l'API directement.

- **Le total est recalculé côté serveur.** Le prix annoncé par le navigateur n'est jamais cru.
- **Pas de survente.** Le stock est décrémenté dans la transaction d'encaissement, avec
  verrou de ligne : deux commandes simultanées sur le dernier exemplaire sont sérialisées.
- **Pas de double encaissement.** Un second appel sur la même commande est refusé, sans
  toucher au stock.
- **Une seule dédicace à l'écran**, garantie par un index unique partiel — pas par un
  bouton désactivé.
- **La file n'avance que d'un cran.** Un double « Réalisée » n'enchaîne pas deux fois.
- **Le statut « encaissé » n'est pas posable par le client.** Il n'existe que via la
  fonction réservée à l'autrice.
- **Les commandes non encaissées sont invisibles du public.** Elles n'entrent dans la file
  qu'au paiement confirmé.
- **Purge RGPD** par `live_purger_contacts()`, à programmer en tâche planifiée (pg_cron)
  ou à lancer à la main. Délai par défaut : 30 jours après la commande.

---

## 4. Les images

Bannière et couvertures se chargent depuis l'appareil, comme dans la maquette. Le navigateur
les **redimensionne et les réencode en WebP avant l'envoi**, en visant un poids plutôt qu'une
dimension : une photo très détaillée est compressée davantage qu'une image lisse. Une photo
de téléphone de 11 Mo redescend automatiquement sous la limite.

Un champ « adresse d'image » reste disponible pour pointer vers un fichier déjà en ligne.

Les images sont stockées en base (`live_medias`), **volontairement hors du canal temps réel** :
une couverture pèse une centaine de kilo-octets, la diffuser à chaque spectateur à chaque
modification saturerait le canal. Elles sont lues une fois puis mises en cache par le client.

> **Pourquoi pas Supabase Storage** : sans authentification, ouvrir l'écriture dans un bucket
> revient à offrir un dépôt de fichiers anonyme à tout internet. La voie propre — une Edge
> Function délivrant une URL signée après contrôle du jeton — impose le CLI Supabase, donc un
> outil de plus hors du flux GitHub Desktop. À reconsidérer le jour où un vrai compte autrice
> existera.

---

## 5. Reste à faire

**Rattachement à l'agenda.** `live_sessions.event_id` est pour l'instant un texte libre.
Le `ALTER TABLE` qui pose la vraie clé étrangère est prêt, en commentaire, en section 7 de
`live-schema.sql` : deux identifiants à remplacer le jour où le nom de la table événements
et de sa clé primaire sont connus. Aucune donnée n'est perdue entre-temps.

**Ajout au menu.** Rien à prévoir de particulier : les trois pages sont autonomes, ajouter
l'entrée visiteur au menu se fera d'une ligne, comme pour n'importe quelle page.

---

## 6. Fichiers

```
dedicaces-live/
  salle.html         interface visiteur (publique)
  auteur.html        console autrice   (?s=<salle>&k=<jeton>)
  regie.html         régie             (?s=<salle>&k=<jeton>)
  live-salle.css     feuille commune, extraite de la maquette sans retouche
                     + un bloc ajouté en fin de fichier, commenté et réversible
  live-core.js       couche de données, temps réel, chat, images
  live-config.js     les deux valeurs Supabase à renseigner

supabase/
  live-schema.sql            migration complète (tables, RLS, RPC, Realtime)
  live-seed.sql              salle de test + affichage des jetons
  live-schema-rollback.sql   effacement intégral du module
```

Le CSS d'origine n'a pas été modifié en place. La seule addition est un bloc commenté en fin
de fichier, supprimable sans effet de bord.

---

## 7. Vérifications effectuées

Migration exécutée sur un PostgreSQL 16 réel, avec les rôles Supabase reconstitués
(`anon` disposant des mêmes droits qu'en production, la RLS faisant seule le filtrage).
Les trois interfaces jouées sous Chromium, en poste et en mobile.

- Parcours complet à trois interfaces : 18 vérifications, aucune erreur JavaScript
- Garde-fous base : double encaissement, survente, double affichage, double « Réalisée »
- Lectures interdites : jetons et coordonnées renvoient zéro ligne à `anon`
- Téléversement : jeton exigé, rôle régie refusé, formats et poids contrôlés,
  ancienne image supprimée au remplacement, images effacées avec la salle
- Injection HTML dans le chat : neutralisée
- Mobile : aucun débordement horizontal sur les trois pages
- Retour arrière : ne laisse aucune table

Trois défauts ont été trouvés et corrigés en cours de route : des révocations de droits
inopérantes (`REVOKE ... FROM anon` ne retire rien tant que `PUBLIC` conserve le droit),
un double encaissement qui décrémentait le stock deux fois, et un enchaînement automatique
qui pouvait sauter un tour de file.
