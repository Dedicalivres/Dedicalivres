/* ================================================================
   Dedicalivres — Salle de dedicace en direct
   Coeur commun aux trois interfaces (visiteur / auteur / regie).

   Ce fichier expose un objet global LIVE qui offre exactement la
   meme surface en mode demonstration et en mode Supabase. Les pages
   n'appellent que LIVE.* : elles ignorent d'ou viennent les donnees.

     LIVE.mode        'demo' | 'supabase'
     LIVE.role        'visiteur' | 'auteur' | 'regie'
     LIVE.sessionId   identifiant de salle (parametre ?s=)
     LIVE.token       jeton d'acces        (parametre ?k=)
     LIVE.etat        { session, books, orders, messages, presence }
     LIVE.charger()   recharge LIVE.etat
     LIVE.souscrire(fn) rappelle fn a chaque changement
     LIVE.api.*       mutations (voir plus bas)

   Choix d'architecture : en temps reel, un evenement declenche un
   rechargement leger plutot qu'une application de delta. A l'echelle
   d'une salle c'est negligeable, et cela supprime toute une classe de
   bugs de synchronisation (evenement manque, ordre d'arrivee, ligne
   filtree par RLS a l'insertion puis visible a la mise a jour).
   ================================================================ */

(function () {
  'use strict';

  /* ============================================================
     1. Contexte : mode, role, parametres d'URL
     ============================================================ */

  const CFG = window.LIVE_CONFIG || {};
  const MODE = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) ? 'supabase' : 'demo';

  const params = new URLSearchParams(location.search);
  const ROLE = document.body.dataset.role || 'visiteur';

  const LIVE = {
    mode: MODE,
    role: ROLE,
    sessionId: params.get('s') || null,
    token: params.get('k') || null,
    etat: { session: null, books: [], orders: [], messages: [], presence: 0 },
    api: {},
  };
  window.LIVE = LIVE;

  /* ============================================================
     2. Helpers d'affichage
     ============================================================ */

  const esc = LIVE.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  const euro = LIVE.euro = function (cents) {
    return (cents / 100).toFixed(2).replace('.', ',') + ' €';
  };

  LIVE.livre = id => LIVE.etat.books.find(b => b.id === id);

  /* -- Images -------------------------------------------------------
     Une image vaut soit une vraie adresse https, soit une reference
     interne 'media:<uuid>' resolue depuis le cache. Le cache evite de
     retelecharger les couvertures a chaque evenement temps reel.
     ------------------------------------------------------------------ */
  const cacheImages = {};
  LIVE.cacheImages = cacheImages;

  LIVE.image = function (ref) {
    if (!ref) return null;
    if (ref.indexOf('media:') === 0) return cacheImages[ref.slice(6)] || null;
    return ref;
  };

  // Redimensionne et reencode avant envoi. Sans cela une photo de
  // telephone (4 Mo) partirait telle quelle et serait refusee par la base.
  //
  // On vise un POIDS, pas seulement une dimension : a dimension egale, une
  // photo tres detaillee pese plusieurs fois plus qu'une image lisse, et
  // un simple redimensionnement laissait passer des images hors limite.
  // On baisse donc la qualite, puis la taille, jusqu'a tenir dans le budget.
  const BUDGET_B64 = 380000;   // marge sous le plafond serveur (400 000)

  LIVE.preparerImage = function (fichier, maxPx) {
    return new Promise(function (resolu, rejete) {
      if (!fichier || !/^image\//.test(fichier.type)) {
        return rejete(new Error('Ce fichier n\'est pas une image'));
      }
      const lecteur = new FileReader();
      lecteur.onerror = () => rejete(new Error('Lecture du fichier impossible'));
      lecteur.onload = function () {
        const img = new Image();
        img.onerror = () => rejete(new Error('Image illisible'));
        img.onload = function () {
          const c = document.createElement('canvas');
          const ctx = c.getContext('2d');
          // WebP quand le navigateur sait l'ecrire, JPEG sinon.
          c.width = 1; c.height = 1;
          const supporteWebp = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
          const mime = supporteWebp ? 'image/webp' : 'image/jpeg';

          function encoder(px, q) {
            const ech = Math.min(1, px / Math.max(img.width, img.height));
            c.width = Math.max(1, Math.round(img.width * ech));
            c.height = Math.max(1, Math.round(img.height * ech));
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL(mime, q);
          }

          let px = maxPx, uri = null;
          // 4 paliers de qualite, puis on reduit la taille de 20 % et on
          // recommence. En pratique une photo normale sort au premier essai.
          for (let tour = 0; tour < 6; tour++) {
            for (const q of [0.82, 0.7, 0.6, 0.5]) {
              uri = encoder(px, q);
              if (uri.length - uri.indexOf(',') - 1 <= BUDGET_B64) {
                return resolu({
                  base64: uri.slice(uri.indexOf(',') + 1), mime: mime, apercu: uri,
                  largeur: c.width, hauteur: c.height,
                });
              }
            }
            px = Math.round(px * 0.8);
          }
          rejete(new Error('Image trop lourde même après compression — réduisez-la avant l\'envoi'));
        };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  };

  // Libelle d'un lot : "Brumes + Phare ×2"
  LIVE.lot = function (order, complet) {
    return (order.items || []).map(function (i) {
      const b = LIVE.livre(i.book);
      if (!b) return '?';
      const nom = complet ? b.titre : b.titre_court;
      return i.n > 1 ? nom + ' ×' + i.n : nom;
    }).join(' + ');
  };

  LIVE.couverture = function (b, extra) {
    extra = extra || '';
    const src = LIVE.image(b && b.couverture_url);
    return src
      ? 'background-image:url(' + esc(src) + ');background-size:cover;background-position:center;color:transparent;' + extra
      : extra;
  };

  let toastTimer;
  const toast = LIVE.toast = function (txt) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = txt;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  };

  /* ============================================================
     3. Mode demonstration — etat en memoire
     ============================================================ */

  const demo = {
    session: {
      id: 'demo', titre: 'Maëlle Kerbrat dédicace « Les Brumes de l\'Aber » en direct',
      sous_titre: 'Commandez sur la boutique de l\'autrice, envoyez votre pseudo — et suivez votre place dans la file : votre dédicace s\'écrira sous vos yeux.',
      auteur_nom: 'Maëlle Kerbrat', animateur_nom: 'JC', statut: 'live',
      video_id: null, banniere_url: null, port_cents: 300, auto_enchainement: true,
    },
    books: [
      { id: 'b1', titre: 'Les Brumes de l\'Aber',  titre_court: 'Brumes',  meta: 'Polar · 288 p.',        prix_cents: 1800, stock: 14, couleur: 'c1', couverture_url: null, lien_pret: false },
      { id: 'b2', titre: 'Marée Noire sur Molène', titre_court: 'Molène',  meta: 'Polar · 312 p.',        prix_cents: 1800, stock: 9,  couleur: 'c2', couverture_url: null, lien_pret: false },
      { id: 'b3', titre: 'Le Phare des Disparues', titre_court: 'Phare',   meta: 'Polar · 296 p.',        prix_cents: 1700, stock: 21, couleur: 'c3', couverture_url: null, lien_pret: false },
      { id: 'b4', titre: 'Coffret trilogie',       titre_court: 'Coffret', meta: '3 tomes + marque-page', prix_cents: 4900, stock: 5,  couleur: 'c4', couverture_url: null, lien_pret: false },
    ],
    orders: [
      { id: 'o1', pseudo: 'Julie', message: 'pour ma maman qui aime la mer', statut: 'att', position: 1, sms_envoye: true, items: [{ book: 'b1', n: 1 }], tel: '06 11 22 33 44', adresse: '12 rue des Abers', cp: '29200', ville: 'Brest' },
      { id: 'o2', pseudo: 'Bruno', message: '', statut: 'att', position: 2, sms_envoye: true, items: [{ book: 'b4', n: 1 }, { book: 'b1', n: 1 }], tel: '06 55 66 77 88', adresse: '4 venelle du Port', cp: '44000', ville: 'Nantes' },
      { id: 'o3', pseudo: 'M. Le Goff', message: 'que le phare veille sur tes lectures', statut: 'att', position: 3, sms_envoye: true, items: [{ book: 'b3', n: 2 }], tel: '06 99 88 77 66', adresse: '7 hent Ar Mor', cp: '29470', ville: 'Plougastel-Daoulas' },
    ],
    messages: [
      { id: 'm1', pseudo: 'JC', role: 'regie', texte: 'Bienvenue dans la salle ! Maëlle est en projection ✨', epingle: true, masque: false },
      { id: 'm2', pseudo: 'Sophie29', role: 'visiteur', texte: 'Bonsoir de Brest ! 👋', epingle: false, masque: false },
      { id: 'm3', pseudo: 'Maëlle Kerbrat', role: 'auteur', texte: 'Posez-moi tout ce que vous voulez pendant que je dédicace.', epingle: false, masque: false },
    ],
    seq: 4,
    presence: 47,
  };

  const abonnes = [];

  // Recharge AVANT de prevenir les abonnes. Sans ce rechargement, l'onglet
  // qui declenche l'action garde sa propre vue filtree, devenue perimee :
  // il verrait la mutation partout ailleurs sauf chez lui.
  function notifier() {
    sauverDemo();
    apiDemo.charger().then(function () {
      abonnes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    });
  }

  /* -- Partage du mode demo entre les onglets ---------------------
     Sans cela chaque interface aurait son propre etat en memoire et
     la file partagee — le coeur du projet — serait intestable. Avec
     ceci, les trois URLs ouvertes cote a cote sur le meme navigateur
     se comportent comme si elles parlaient a la meme base.
     Portee : un seul navigateur, une seule machine. Pour tester a
     plusieurs, il faut la vraie base Supabase.
     ---------------------------------------------------------------- */
  const CLE_DEMO = 'dedicalivres_salle_demo_v1';
  const canalDemo = ('BroadcastChannel' in window) ? new BroadcastChannel(CLE_DEMO) : null;
  let echoIgnore = false;

  function sauverDemo() {
    try {
      localStorage.setItem(CLE_DEMO, JSON.stringify({
        session: demo.session, books: demo.books, orders: demo.orders,
        messages: demo.messages, seq: demo.seq,
      }));
      echoIgnore = true;
      if (canalDemo) canalDemo.postMessage('maj');
      echoIgnore = false;
    } catch (e) { /* stockage indisponible : on reste en memoire */ }
  }

  function restaurerDemo() {
    try {
      const brut = localStorage.getItem(CLE_DEMO);
      if (!brut) return false;
      const d = JSON.parse(brut);
      demo.session = d.session; demo.books = d.books; demo.orders = d.orders;
      demo.messages = d.messages; demo.seq = d.seq;
      return true;
    } catch (e) { return false; }
  }

  LIVE.reinitialiserDemo = function () {
    try { localStorage.removeItem(CLE_DEMO); } catch (e) {}
    location.reload();
  };

  function demoTotal(items) {
    const s = items.reduce((t, i) => t + (LIVE.livre(i.book) || { prix_cents: 0 }).prix_cents * i.n, 0);
    return s + demo.session.port_cents;
  }
  const nid = p => p + (++demo.seq);

  let demoRestaure = false;

  const apiDemo = {
    async charger() {
      if (!demoRestaure) { restaurerDemo(); demoRestaure = true; }
      LIVE.etat.session = demo.session;
      LIVE.etat.books = demo.books;
      LIVE.etat.messages = demo.messages;
      // En mode demo l'autrice voit les coordonnees ; le visiteur ne voit
      // ni les commandes 'pay', ni aucune donnee personnelle : on reproduit
      // exactement le cloisonnement applique par les policies RLS.
      LIVE.etat.orders = demo.orders.map(function (o) {
        if (LIVE.role === 'auteur') return o;
        const c = Object.assign({}, o);
        delete c.tel; delete c.adresse; delete c.cp; delete c.ville;
        return c;
      }).filter(o => LIVE.role === 'auteur' || o.statut !== 'pay');
    },
    async passerCommande(d) {
      demo.orders.push({
        id: nid('o'), pseudo: d.pseudo, message: d.message, statut: 'pay',
        position: null, sms_envoye: false, items: d.items,
        total_cents: demoTotal(d.items),
        tel: d.tel, adresse: d.adresse, cp: d.cp, ville: d.ville,
      });
      notifier();
    },
    async envoyerMessage(pseudo, texte) {
      demo.messages.push({ id: nid('m'), pseudo, role: 'visiteur', texte, epingle: false, masque: false });
      notifier();
    },
    async marquerSms(id) {
      const o = demo.orders.find(x => x.id === id); if (o) o.sms_envoye = true; notifier();
    },
    async encaisser(id) {
      const o = demo.orders.find(x => x.id === id); if (!o) return;
      const manque = o.items.find(i => LIVE.livre(i.book).stock < i.n);
      if (manque) throw new Error('Stock insuffisant : ' + LIVE.livre(manque.book).titre_court);
      o.items.forEach(i => { LIVE.livre(i.book).stock -= i.n; });
      o.statut = 'att';
      o.position = Math.max(0, ...demo.orders.map(x => x.position || 0)) + 1;
      demo.messages.push({ id: nid('m'), pseudo: o.pseudo, role: 'systeme', texte: o.pseudo + ' rejoint la file', epingle: false, masque: false });
      notifier();
    },
    async ajouterDedicace(pseudo, message, book, qte) {
      const b = LIVE.livre(book);
      if (!b || b.stock < qte) throw new Error('Stock épuisé pour ce titre');
      b.stock -= qte;
      demo.orders.push({
        id: nid('o'), pseudo, message, statut: 'att', sms_envoye: true,
        position: Math.max(0, ...demo.orders.map(x => x.position || 0)) + 1,
        items: [{ book: book, n: qte }], total_cents: demoTotal([{ book: book, n: qte }]),
      });
      notifier();
    },
    async annuler(id) {
      const o = demo.orders.find(x => x.id === id); if (!o) return;
      if (o.statut === 'att' || o.statut === 'cours') o.items.forEach(i => { LIVE.livre(i.book).stock += i.n; });
      demo.orders = demo.orders.filter(x => x.id !== id);
      notifier();
    },
    async lancer(id) {
      if (demo.orders.some(x => x.statut === 'cours')) throw new Error('Une dédicace est déjà à l\'écran');
      const o = demo.orders.find(x => x.id === id); if (o) o.statut = 'cours';
      notifier();
    },
    async terminer(id) {
      const o = demo.orders.find(x => x.id === id); if (o) o.statut = 'fait';
      if (demo.session.auto_enchainement) {
        const n = demo.orders.filter(x => x.statut === 'att').sort((a, b) => a.position - b.position)[0];
        if (n) n.statut = 'cours';
      }
      notifier();
    },
    async reordonner(id, sens) {
      const att = demo.orders.filter(x => x.statut === 'att').sort((a, b) => a.position - b.position);
      const i = att.findIndex(x => x.id === id), j = sens === 'haut' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= att.length) return;
      const p = att[i].position; att[i].position = att[j].position; att[j].position = p;
      notifier();
    },
    async brancherVideo(v) { demo.session.video_id = v || null; notifier(); },
    async majStatut(st) { demo.session.statut = st; notifier(); },
    async basculerAuto() { demo.session.auto_enchainement = !demo.session.auto_enchainement; notifier(); return demo.session.auto_enchainement; },
    async majLivre(id, champs) { Object.assign(LIVE.livre(id) || {}, champs); notifier(); },
    async majBanniere(url) { demo.session.banniere_url = url || null; notifier(); },
    async televerserMedia(cible, base64, mime, livre) {
      const uri = 'data:' + mime + ';base64,' + base64;
      if (cible === 'banniere') demo.session.banniere_url = uri;
      else { const b = LIVE.livre(livre); if (b) b.couverture_url = uri; }
      notifier();
    },
    async moderer(id, action) {
      const m = demo.messages.find(x => x.id === id); if (!m) return;
      if (action === 'epingler') m.epingle = !m.epingle; else m.masque = !m.masque;
      notifier();
    },
    souscrire(fn) {
      abonnes.push(fn);

      // Un autre onglet a modifie la salle : on relit et on redessine.
      const venuDAilleurs = async function () {
        if (echoIgnore) return;
        restaurerDemo();
        await apiDemo.charger();
        fn();
      };
      if (canalDemo) canalDemo.onmessage = venuDAilleurs;
      addEventListener('storage', e => { if (e.key === CLE_DEMO) venuDAilleurs(); });

      setInterval(function () {
        demo.presence = Math.max(12, demo.presence + (Math.random() < 0.62 ? 1 : -1) * Math.ceil(Math.random() * 2));
        LIVE.etat.presence = demo.presence;
        fn();
      }, 2600);
    },
  };

  /* ============================================================
     4. Mode Supabase
     ============================================================ */

  let sb = null;

  function client() {
    if (sb) return sb;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Bibliothèque supabase-js absente de la page');
    }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    return sb;
  }

  // Toute RPC passe par ici : erreur remontee telle quelle a l'interface.
  async function rpc(nom, args) {
    const { data, error } = await client().rpc(nom, args);
    if (error) throw new Error(error.message || 'Opération refusée');
    return data;
  }

  const S = () => LIVE.sessionId;
  const K = () => LIVE.token;

  // Ne telecharge que les images encore absentes du cache : une couverture
  // est lue une seule fois, meme si la salle se rafraichit cent fois.
  async function chargerImages(refs) {
    const ids = (refs || [])
      .filter(r => r && r.indexOf('media:') === 0)
      .map(r => r.slice(6))
      .filter(id => !cacheImages[id]);
    if (!ids.length) return;
    const { data } = await client().from('live_medias').select('id,mime,donnees').in('id', ids);
    (data || []).forEach(m => { cacheImages[m.id] = 'data:' + m.mime + ';base64,' + m.donnees; });
  }

  const apiSupabase = {
    async charger() {
      const c = client();
      const [ses, bks, msg] = await Promise.all([
        c.from('live_sessions').select('*').eq('id', S()).maybeSingle(),
        c.from('live_books').select('*').eq('session_id', S()).order('position'),
        c.from('live_messages').select('*').eq('session_id', S()).order('cree_a').limit(200),
      ]);
      if (ses.error) throw new Error(ses.error.message);
      LIVE.etat.session = ses.data;
      LIVE.etat.books = bks.data || [];
      LIVE.etat.messages = msg.data || [];

      await chargerImages([ses.data && ses.data.banniere_url]
        .concat((bks.data || []).map(b => b.couverture_url)));

      if (LIVE.role === 'auteur') {
        // Seule voie d'acces aux coordonnees : RPC protegee par jeton.
        LIVE.etat.orders = (await rpc('live_console_auteur', { p_session: S(), p_token: K() })) || [];
      } else {
        const { data: ord } = await c.from('live_orders')
          .select('id,pseudo,message,statut,position,cree_a').eq('session_id', S());
        const ids = (ord || []).map(o => o.id);
        let items = [];
        if (ids.length) {
          const r = await c.from('live_order_items').select('order_id,book_id,quantite').in('order_id', ids);
          items = r.data || [];
        }
        LIVE.etat.orders = (ord || []).map(o => Object.assign({}, o, {
          items: items.filter(i => i.order_id === o.id).map(i => ({ book: i.book_id, n: i.quantite })),
        }));
      }
    },
    passerCommande: d => rpc('live_passer_commande', {
      p_session: S(), p_pseudo: d.pseudo, p_message: d.message,
      p_items: d.items, p_tel: d.tel, p_adresse: d.adresse, p_cp: d.cp, p_ville: d.ville,
    }),
    envoyerMessage: (pseudo, texte) => rpc('live_envoyer_message', { p_session: S(), p_pseudo: pseudo, p_texte: texte }),
    marquerSms:   id => rpc('live_marquer_sms',   { p_session: S(), p_token: K(), p_order: id }),
    encaisser:    id => rpc('live_encaisser',     { p_session: S(), p_token: K(), p_order: id }),
    annuler:      id => rpc('live_annuler_commande', { p_session: S(), p_token: K(), p_order: id }),
    lancer:       id => rpc('live_lancer',        { p_session: S(), p_token: K(), p_order: id }),
    terminer:     id => rpc('live_terminer',      { p_session: S(), p_token: K(), p_order: id }),
    reordonner: (id, sens) => rpc('live_reordonner', { p_session: S(), p_token: K(), p_order: id, p_sens: sens }),
    ajouterDedicace: (pseudo, message, book, qte) => rpc('live_ajouter_dedicace', {
      p_session: S(), p_token: K(), p_pseudo: pseudo, p_message: message, p_book: book, p_qte: qte }),
    brancherVideo: v => rpc('live_brancher_video', { p_session: S(), p_token: K(), p_video_id: v }),
    basculerAuto: () => rpc('live_basculer_auto',  { p_session: S(), p_token: K() }),
    majStatut: st => rpc('live_maj_statut',        { p_session: S(), p_token: K(), p_statut: st }),
    majBanniere: url => rpc('live_maj_banniere',   { p_session: S(), p_token: K(), p_url: url }),
    televerserMedia: (cible, base64, mime, livre) => rpc('live_televerser_media', {
      p_session: S(), p_token: K(), p_cible: cible,
      p_donnees: base64, p_mime: mime, p_livre: livre || null }),
    majLivre: (id, ch) => rpc('live_maj_livre', {
      p_session: S(), p_token: K(), p_book: id,
      p_prix_cents: ch.prix_cents ?? null, p_stock: ch.stock ?? null,
      p_couverture_url: ch.couverture_url ?? null, p_lien_pret: ch.lien_pret ?? null }),
    moderer: (id, action) => rpc('live_moderer', { p_session: S(), p_token: K(), p_message: id, p_action: action }),

    souscrire(fn) {
      const c = client();
      let enCours = false;
      const recharger = async function () {
        if (enCours) return;
        enCours = true;
        try { await LIVE.charger(); fn(); }
        catch (e) { console.error(e); }
        finally { enCours = false; }
      };
      const canal = c.channel('salle:' + S(), { config: { presence: { key: Math.random().toString(36).slice(2) } } });
      ['live_orders', 'live_books', 'live_messages'].forEach(function (t) {
        canal.on('postgres_changes',
          { event: '*', schema: 'public', table: t, filter: 'session_id=eq.' + S() }, recharger);
      });
      canal.on('postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions', filter: 'id=eq.' + S() }, recharger);
      canal.on('presence', { event: 'sync' }, function () {
        LIVE.etat.presence = Object.keys(canal.presenceState()).length;
        fn();
      });
      canal.subscribe(function (statut) {
        if (statut === 'SUBSCRIBED') canal.track({ arrive: Date.now() });
      });
      LIVE.canal = canal;
    },
  };

  /* ============================================================
     5. Surface unifiee
     ============================================================ */

  const impl = MODE === 'demo' ? apiDemo : apiSupabase;
  LIVE.charger = () => impl.charger();
  LIVE.souscrire = fn => impl.souscrire(fn);
  ['passerCommande', 'envoyerMessage', 'marquerSms', 'encaisser', 'ajouterDedicace',
   'annuler', 'lancer', 'terminer', 'reordonner', 'brancherVideo', 'basculerAuto', 'majStatut',
   'majLivre', 'majBanniere', 'televerserMedia', 'moderer'].forEach(function (n) {
    LIVE.api[n] = function () {
      return Promise.resolve(impl[n].apply(impl, arguments)).catch(function (e) {
        toast(e.message || 'Opération refusée');
        throw e;
      });
    };
  });

  // Demarrage commun aux trois pages.
  LIVE.demarrer = async function (rendre) {
    if (MODE === 'supabase' && !LIVE.sessionId) {
      toast('Aucune salle indiquée dans l\'adresse (?s=…)');
      return;
    }
    if (MODE === 'supabase' && LIVE.role !== 'visiteur' && !LIVE.token) {
      toast('Jeton d\'accès manquant dans l\'adresse (&k=…)');
      return;
    }
    try { await LIVE.charger(); } catch (e) { toast(e.message); console.error(e); }
    rendre();
    LIVE.souscrire(rendre);
    const b = document.getElementById('modeBadge');
    if (b) b.textContent = MODE === 'demo' ? 'DÉMO — données locales' : 'CONNECTÉ';
  };

  /* ============================================================
     6. Chat — composant partage (visiteur & regie)
     ============================================================ */

  LIVE.creerChat = function (slot, moderable) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden';
    el.innerHTML = '<div class="msgs" id="msgs"></div>' +
      '<div class="chat-input"><input id="chatInput" type="text" maxlength="240" ' +
      'placeholder="Écrire à la salle…" aria-label="Votre message">' +
      '<button class="send" id="chatSend">Envoyer</button></div>';
    el.classList.toggle('modmode', !!moderable);
    if (slot) slot.appendChild(el);

    const zone = el.querySelector('#msgs');
    const saisie = el.querySelector('#chatInput');

    function envoyer() {
      const t = saisie.value.trim();
      if (!t) return;
      let pseudo = sessionStorage.getItem('live_pseudo');
      if (!pseudo) {
        pseudo = LIVE.role === 'regie' ? (LIVE.etat.session?.animateur_nom || 'Régie') : 'Visiteur';
      }
      saisie.value = '';
      LIVE.api.envoyerMessage(pseudo, t).catch(() => {});
    }
    el.querySelector('#chatSend').onclick = envoyer;
    saisie.addEventListener('keydown', e => { if (e.key === 'Enter') envoyer(); });

    el.addEventListener('click', function (e) {
      const b = e.target.closest('[data-a]');
      if (!b || !moderable) return;
      LIVE.api.moderer(b.closest('.msg').dataset.id, b.dataset.a === 'pin' ? 'epingler' : 'masquer');
    });

    // Rendu : les messages masques disparaissent chez les visiteurs et
    // restent visibles, grises, cote regie.
    el.rendre = function () {
      const bas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 60;
      zone.innerHTML = '';
      LIVE.etat.messages.forEach(function (m) {
        if (m.masque && !moderable) return;
        if (m.role === 'systeme') {
          const s = document.createElement('div');
          s.className = 'sys order';
          s.textContent = '🖋️ ' + m.texte;
          zone.appendChild(s);
          return;
        }
        const d = document.createElement('div');
        d.className = 'msg' + (m.role === 'regie' ? ' host' : m.role === 'auteur' ? ' author' : '') +
          (m.epingle ? ' pinned' : '') + (m.masque ? ' hidden-msg' : '');
        d.dataset.id = m.id;
        d.innerHTML = '<span class="who">' + esc(m.pseudo) + '</span> ' +
          '<span class="txt">' + esc(m.texte) + '</span>' +
          '<div class="modbar"><button data-a="pin">◆ Épingler</button>' +
          '<button data-a="hide">✕ Masquer</button></div>';
        zone.appendChild(d);
      });
      if (bas) zone.scrollTop = zone.scrollHeight;
    };
    return el;
  };

  /* ============================================================
     7. Derive de lettres cyanotype (fond ambiant)
     ============================================================ */

  LIVE.pluie = function () {
    const rain = document.getElementById('rain');
    if (!rain) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { rain.remove(); return; }
    const ctx = rain.getContext('2d');
    const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÉÈÀÇÙ«»&·';
    const TROPES = [
      "ennemis puis amants", "l'élu malgré lui", "le mentor au passé trouble", "huis clos en pleine tempête",
      "le manuscrit disparu", "le détective désabusé", "la lettre jamais envoyée", "l'héritage maudit",
      "voyage initiatique", "le traître était un ami", "amour interdit", "la petite ville aux secrets",
      "le narrateur peu fiable", "la prophétie ambiguë", "retour au pays natal", "rivaux de toujours",
      "flash-back révélateur", "le crime parfait n'existe pas", "fausse identité", "le dernier chapitre change tout"];
    const fs = 14, rh = 32, cw = fs * 0.62;
    let rows = [], tropes = [];
    function size() {
      rain.width = innerWidth; rain.height = innerHeight;
      rows = Array.from({ length: Math.ceil(innerHeight / rh) }, (_, i) => ({
        y: i * rh + rh * 0.7, dir: i % 2 ? 1 : -1, sp: 0.25 + Math.random() * 0.45, off: Math.random() * 2000,
        txt: Array.from({ length: Math.ceil(innerWidth / cw) + 30 },
          () => Math.random() < 0.6 ? ' ' : CH[Math.floor(Math.random() * CH.length)]),
      }));
    }
    size(); addEventListener('resize', size);
    function spawn() {
      if (!rows.length) return;
      const r = rows[Math.floor(Math.random() * rows.length)];
      tropes.push({ y: r.y, dir: r.dir, sp: r.sp + 0.2, life: 0,
        x: 60 + Math.random() * Math.max(220, innerWidth - 460),
        txt: TROPES[Math.floor(Math.random() * TROPES.length)], amber: Math.random() < 0.3 });
      if (tropes.length > 4) tropes.shift();
    }
    setInterval(spawn, 4500); spawn();
    setInterval(function () {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, 0, rain.width, rain.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = fs + 'px "Chakra Petch", monospace';
      ctx.fillStyle = 'rgba(99,211,255,.13)';
      rows.forEach(function (r) {
        const W = r.txt.length * cw;
        r.off = (r.off + r.sp * r.dir + W) % W;
        for (let k = 0; k < 2; k++) {
          const i = Math.floor(Math.random() * r.txt.length);
          r.txt[i] = Math.random() < 0.6 ? ' ' : CH[Math.floor(Math.random() * CH.length)];
        }
        const s = r.txt.join('');
        ctx.fillText(s, -r.off, r.y);
        ctx.fillText(s, -r.off + W, r.y);
      });
      ctx.font = 'italic 600 15px Fraunces, Georgia, serif';
      tropes = tropes.filter(function (t) {
        t.life++; t.x += t.sp * t.dir;
        const a = t.life < 25 ? t.life / 25 : t.life > 130 ? Math.max(0, (170 - t.life) / 40) : 1;
        if (a <= 0 || t.x < -420 || t.x > innerWidth + 60) return false;
        ctx.shadowBlur = 12;
        ctx.shadowColor = t.amber ? 'rgba(255,180,84,.9)' : 'rgba(120,220,255,.9)';
        ctx.fillStyle = t.amber ? 'rgba(255,195,120,' + 0.85 * a + ')' : 'rgba(185,240,255,' + 0.8 * a + ')';
        ctx.fillText('« ' + t.txt + ' »', t.x, t.y);
        ctx.shadowBlur = 0;
        return true;
      });
    }, 80);
  };

})();
