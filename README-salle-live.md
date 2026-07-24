# Salle de dédicace en direct — Dédicalivres

Module autonome, préfixé `live_` partout. Il ne touche à aucune table ni à aucun fichier
du site existant. S'il n'est pas retenu, un seul script suffit à l'effacer entièrement.

---

## 1. Mise en route

> **À lire d'abord si le module a déjà été déposé : `NETTOYAGE-RACINE.md`.**

### Déploiement

Copiez les dossiers `dedicaces-live/` et `supabase/` tels quels à la racine du dépôt.

> **Aucun fichier de ce module ne s'appelle `index.html`.** C'est délibéré : une page nommée
> ainsi écrase la page d'accueil du site si le dossier n'est pas conservé lors du dépôt.
> La page visiteur s'appelle donc `salle.html`. Ne la renommez pas.

Les trois adresses :

| Interface | Adresse |
|---|---|
| Visiteur | `dedicalivres.fr/dedicaces-live/salle.html` |
| Autrice  | `dedicalivres.fr/dedicaces-live/auteur.html` |
| Régie    | `dedicalivres.fr/dedicaces-live/regie.html` |

### Aucune configuration à renseigner

Le module lit `config.js` du site et réutilise `getDedicalivresSupabaseClient()` :
même instance, même clé, aucun réglage propre. Il n'y a plus de fichier de configuration
du module.

- `config.js` chargé → **mode réel**, connecté à la base.
- `config.js` absent, ou adresse en `?demo=1` → **mode démonstration** : état local,
  données d'exemple, aucun réseau.

Le mode démonstration se synchronise **entre les onglets d'une même machine** : ouvrez les
trois adresses côte à côte avec `?demo=1` et jouez le parcours complet. Les liens de
passage d'une interface à l'autre conservent le paramètre. Le bandeau affiche
« DÉMO — données locales ».

### Mise en service de la base

1. Dans le SQL Editor de Supabase, exécuter `supabase/live-schema.sql`.
2. Puis `supabase/live-seed.sql`. Il crée une salle de test et **affiche les trois adresses
   avec leurs jetons dans le panneau de messages**. C'est le seul moment où les jetons
   apparaissent dans un résultat ; copiez-les. (En cas d'oubli, la requête de rappel est
   en commentaire à la fin du fichier.)

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

Bannière et couvertures se chargent depuis l'appareil. Le navigateur les compresse
(fond blanc, JPEG qualité 0.82, comme `testimonials.js`) puis les dépose sur **votre
Worker Cloudflare vers R2** — le même que les témoignages, dans un dossier `salle-live`
distinct. Seule l'URL renvoyée est stockée en base.

Bannière réduite à 1600 px, couvertures à 800 px. Un champ « adresse d'image » reste
disponible pour pointer vers un fichier déjà en ligne.

Aucune image n'est stockée en base : pas de plafond de poids, diffusion par CDN, et une
seule façon de téléverser dans tout le site.

> Le format reste le JPEG, par prudence : c'est ce que votre Worker reçoit déjà des
> témoignages, et je n'ai pas pu vérifier qu'il accepte le WebP. Si c'est le cas, passer
> en WebP gagnerait 25 à 30 % de poids — un mot et je fais la bascule.

---

## 5. Rattachement à l'agenda

`live_sessions.event_id` pointe sur `public.events(id)` — un entier, conformément à vos
pages générées (`.../evenement/<slug>-1099.html`).

Le lien est facultatif : une salle peut vivre sans événement d'agenda, et la suppression
d'un événement détache la salle (`on delete set null`) au lieu de la détruire. Un
identifiant inexistant est refusé par la base.

Pour rattacher une salle à un événement, passer son identifiant en cinquième argument de
`live_creer_session(...)`.

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

supabase/
  live-schema.sql            migration complète (tables, RLS, RPC, Realtime)
  live-seed.sql              salle de test + affichage des jetons
  live-schema-rollback.sql   effacement intégral du module

README-salle-live.md   cette notice
NETTOYAGE-RACINE.md    à lire si le module a déjà été déposé à plat
```

Six tables, toutes préfixées `live_`. Le CSS d'origine n'a pas été modifié en place :
la seule addition est un bloc commenté en fin de fichier, supprimable sans effet de bord.

---

## 7. Vérifications effectuées

Migration exécutée sur un PostgreSQL 16 réel, avec les rôles Supabase reconstitués
(`anon` disposant des mêmes droits qu'en production, la RLS faisant seule le filtrage)
et une table `events` reproduisant la vôtre. Les trois interfaces jouées sous Chromium,
en poste et en mobile.

- Parcours complet à trois interfaces : 21 vérifications, aucune erreur JavaScript
- Garde-fous base : double encaissement, survente, double affichage, double « Réalisée »
- Lectures interdites : jetons et coordonnées renvoient zéro ligne à `anon`
- Clé étrangère : rattachement valide accepté, événement inexistant refusé,
  suppression d'un événement détache la salle sans la perdre
- Upload R2 : requête interceptée et vérifiée — POST multipart, champs `file` et
  `folder`, dossier `salle-live`, JPEG, URL de réponse exploitée
- Trois modes de démarrage : `config.js` présent, `?demo=1`, `config.js` absent
- Navigation croisée entre les trois interfaces, sans 404
- Injection HTML dans le chat : neutralisée
- Mobile : aucun débordement horizontal
- Retour arrière : ne laisse aucune table `live_`, et `events` reste intacte

Quatre défauts trouvés et corrigés au fil des tests : des révocations de droits
inopérantes (`REVOKE ... FROM anon` ne retire rien tant que `PUBLIC` conserve le droit),
un double encaissement qui décrémentait le stock deux fois, un enchaînement automatique
qui pouvait sauter un tour de file, et une signature de fonction restée en `text` après
le passage de `event_id` en `bigint`.
