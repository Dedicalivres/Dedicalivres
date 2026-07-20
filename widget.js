/* =========================================================
   DÉDICALIVRES — WIDGET PARTENAIRES v1
   Affichez l'agenda littéraire Dédicalivres sur votre site.

   Intégration minimale :
     <div data-dedicalivres></div>
     <script src="https://dedicalivres.fr/widget.js" defer></script>

   Options (attributs data- sur la div) :
     data-pays="FR|BE|LU|CH|MC"   filtrer par pays
     data-type="Salon|Festival|Dédicace|Autre"
     data-limit="8"               nombre d'événements affichés (1 à 12)
     data-jours="3"               fenêtre : aujourd'hui + N jours (défaut 3 = J à J+3).
       0 = pas de borne haute (tous les événements à venir). Quand une recherche
       par ville/département ou la géoloc est active, un pool plus large est chargé
       automatiquement pour que le tri par distance ait de la matière.
     data-theme="clair|soir"
     data-source="https://.../events.json"
       source JSON alternative (export R2) pour économiser Supabase.
     data-autour="1"             affiche un bouton "Autour de moi" : trie les
       événements par distance après géolocalisation (avec accord du visiteur).
     data-rayon="100"            (avec data-autour) ne garder que les événements
       à moins de N km. Vide = pas de limite, juste le tri par distance.
     data-recherche="1"          affiche un champ "Chercher une ville" : l'utilisateur
       tape une ville (France), le widget trie les événements par distance autour d'elle.
       Utilise l'API Adresse (api-adresse.data.gouv.fr), gratuite et sans clé.
     data-ville="Rennes"         (avec data-recherche) pré-remplit le champ ET lance
       la recherche automatiquement au chargement. Idéal pour un lien pré-configuré.

   Le widget s'affiche dans un Shadow DOM : ses styles
   n'interfèrent jamais avec ceux du site hôte.
========================================================= */
(function () {
  "use strict";

  var DEPARTEMENTS = [["01","Ain",46.1,5.35],["02","Aisne",49.56,3.55],["03","Allier",46.39,3.19],["04","Alpes-de-Haute-Provence",44.1,6.24],["05","Hautes-Alpes",44.66,6.35],["06","Alpes-Maritimes",43.94,7.17],["07","Ardèche",44.75,4.42],["08","Ardennes",49.69,4.55],["09","Ariège",42.96,1.52],["10","Aube",48.31,4.15],["11","Aude",43.06,2.55],["12","Aveyron",44.32,2.6],["13","Bouches-du-Rhône",43.54,5.1],["14","Calvados",49.1,-0.3],["15","Cantal",45.05,2.66],["16","Charente",45.7,0.2],["17","Charente-Maritime",45.75,-0.8],["18","Cher",47.1,2.5],["19","Corrèze",45.35,1.85],["2A","Corse-du-Sud",41.86,8.9],["2B","Haute-Corse",42.4,9.2],["21","Côte-d'Or",47.35,4.8],["22","Côtes-d'Armor",48.4,-2.85],["23","Creuse",46.05,2.0],["24","Dordogne",45.15,0.72],["25","Doubs",47.16,6.35],["26","Drôme",44.7,5.15],["27","Eure",49.1,1.0],["28","Eure-et-Loir",48.44,1.4],["29","Finistère",48.25,-4.05],["30","Gard",43.95,4.2],["31","Haute-Garonne",43.4,1.3],["32","Gers",43.65,0.55],["33","Gironde",44.85,-0.55],["34","Hérault",43.65,3.45],["35","Ille-et-Vilaine",48.15,-1.65],["36","Indre",46.8,1.55],["37","Indre-et-Loire",47.25,0.7],["38","Isère",45.25,5.6],["39","Jura",46.75,5.75],["40","Landes",43.95,-0.75],["41","Loir-et-Cher",47.6,1.35],["42","Loire",45.75,4.2],["43","Haute-Loire",45.1,3.85],["44","Loire-Atlantique",47.35,-1.6],["45","Loiret",47.9,2.3],["46","Lot",44.6,1.6],["47","Lot-et-Garonne",44.35,0.45],["48","Lozère",44.55,3.5],["49","Maine-et-Loire",47.4,-0.55],["50","Manche",49.05,-1.3],["51","Marne",48.95,4.35],["52","Haute-Marne",48.1,5.15],["53","Mayenne",48.25,-0.65],["54","Meurthe-et-Moselle",48.75,6.15],["55","Meuse",49.0,5.4],["56","Morbihan",47.85,-2.8],["57","Moselle",49.05,6.65],["58","Nièvre",47.1,3.55],["59","Nord",50.45,3.15],["60","Oise",49.4,2.4],["61","Orne",48.6,0.1],["62","Pas-de-Calais",50.5,2.35],["63","Puy-de-Dôme",45.75,3.15],["64","Pyrénées-Atlantiques",43.25,-0.85],["65","Hautes-Pyrénées",43.1,0.15],["66","Pyrénées-Orientales",42.6,2.55],["67","Bas-Rhin",48.65,7.55],["68","Haut-Rhin",47.9,7.25],["69","Rhône",45.75,4.6],["70","Haute-Saône",47.65,6.15],["71","Saône-et-Loire",46.65,4.55],["72","Sarthe",47.95,0.2],["73","Savoie",45.5,6.4],["74","Haute-Savoie",46.05,6.45],["75","Paris",48.86,2.35],["76","Seine-Maritime",49.65,1.0],["77","Seine-et-Marne",48.6,2.95],["78","Yvelines",48.8,1.9],["79","Deux-Sèvres",46.55,-0.35],["80","Somme",49.95,2.35],["81","Tarn",43.8,2.15],["82","Tarn-et-Garonne",44.05,1.3],["83","Var",43.45,6.2],["84","Vaucluse",44.05,5.15],["85","Vendée",46.65,-1.3],["86","Vienne",46.55,0.55],["87","Haute-Vienne",45.9,1.25],["88","Vosges",48.15,6.35],["89","Yonne",47.85,3.55],["90","Territoire de Belfort",47.63,6.85],["91","Essonne",48.53,2.25],["92","Hauts-de-Seine",48.85,2.24],["93","Seine-Saint-Denis",48.91,2.48],["94","Val-de-Marne",48.78,2.47],["95","Val-d'Oise",49.08,2.2],["971","Guadeloupe",16.24,-61.55],["972","Martinique",14.64,-61.02],["973","Guyane",4.0,-53.0],["974","La Réunion",-21.13,55.53],["976","Mayotte",-12.82,45.16]];


  var PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13' +
    's7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" ' +
    'fill="currentColor"/></svg>';

  var SITE = "https://dedicalivres.fr";
  var SUPA = "https://pwyetrqyiaxpzjrafpvb.supabase.co";
  var KEY = "sb_publishable_EfFj0D-4g3x0E3j0AofRRA_BHo98vvj";

  var MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
                "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var TYPE_COLORS = {
    "Salon": "#3a1c71", "Festival": "#ff6b35",
    "Dédicace": "#16803c", "Autre": "#2f6fed"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isoDate(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function isoToday() { return isoDate(new Date()); }
  function isoDansNJours(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  var STYLES = "\n" +
    ":host{all:initial}\n" +
    "*{box-sizing:border-box;margin:0;padding:0}\n" +
    ".w{font-family:Inter,system-ui,-apple-system,sans-serif;background:#fffdfc;" +
      "border:1px solid rgba(58,28,113,.14);border-radius:16px;overflow:hidden;" +
      "box-shadow:0 10px 30px rgba(58,28,113,.12);max-width:420px;color:#2a2438}\n" +
    ".w-head{display:flex;align-items:center;gap:9px;padding:13px 16px;" +
      "background:linear-gradient(135deg,#3a1c71,#5d34a5);color:#fff}\n" +
    ".w-head svg{flex:none}\n" +
    ".w-head b{font-size:.95rem;letter-spacing:.01em}\n" +
    ".w-list{list-style:none}\n" +
    ".w-item{display:flex;gap:12px;align-items:center;padding:11px 14px;" +
      "border-top:1px solid rgba(58,28,113,.08)}\n" +
    ".w-item:hover{background:rgba(58,28,113,.04)}\n" +
    ".w-geo{display:flex;align-items:center;gap:7px;width:100%;border:0;" +
      "background:rgba(58,28,113,.06);color:#3a1c71;font-family:inherit;" +
      "font-size:.82rem;font-weight:600;cursor:pointer;padding:9px 14px;" +
      "border-top:1px solid rgba(58,28,113,.08)}\n" +
    ".w-geo:hover{background:rgba(58,28,113,.11)}\n" +
    ".w-geo:disabled{opacity:.6;cursor:default}\n" +
    ".w .soir .w-geo,.w.soir .w-geo{background:rgba(255,255,255,.08);color:#e6dcf6}\n" +
    ".w-search{display:flex;gap:6px;padding:10px 12px;border-top:1px solid rgba(58,28,113,.08);background:#faf6ff}\n" +
    ".w-search input{flex:1;min-width:0;border:1px solid rgba(58,28,113,.2);border-radius:9px;" +
      "padding:8px 11px;font-family:inherit;font-size:.82rem;color:#2a2438;background:#fff}\n" +
    ".w-search input:focus{outline:none;border-color:#7a3fb8}\n" +
    ".w-search button{flex:none;border:0;border-radius:9px;background:#3a1c71;color:#fff;" +
      "font-family:inherit;font-weight:600;font-size:.82rem;padding:8px 13px;cursor:pointer}\n" +
    ".w-search button:disabled{opacity:.6;cursor:default}\n" +
    ".w-search-info{padding:4px 14px 8px;font-size:.74rem;color:#7a5eb0;background:#faf6ff}\n" +
    ".w-search-wrap{position:relative;flex:1;min-width:0}\n" +
    ".w-suggest{position:absolute;top:calc(100% + 3px);left:0;right:0;z-index:20;" +
      "background:#fff;border:1px solid rgba(58,28,113,.18);border-radius:10px;" +
      "box-shadow:0 8px 24px rgba(58,28,113,.16);max-height:210px;overflow-y:auto}\n" +
    ".w-suggest-item{padding:9px 12px;font-size:.82rem;cursor:pointer;display:flex;" +
      "align-items:center;gap:8px;border-bottom:1px solid rgba(58,28,113,.05)}\n" +
    ".w-suggest-item:last-child{border-bottom:0}\n" +
    ".w-suggest-item:hover,.w-suggest-item.active{background:#f3ecff}\n" +
    ".w-suggest-tag{font-size:.66rem;font-weight:700;padding:2px 6px;border-radius:5px;" +
      "background:#ece3ff;color:#6b3fb0;flex:none}\n" +
    ".w-suggest-tag.dep{background:#ffe6d6;color:#c2571f}\n" +
    ".soir .w-suggest{background:#2a1a45;border-color:rgba(237,225,252,.2)}\n" +
    ".soir .w-suggest-item{color:#e6dcf6;border-color:rgba(237,225,252,.08)}\n" +
    ".soir .w-suggest-item:hover,.soir .w-suggest-item.active{background:#3a2566}\n" +
    ".soir .w-search,.soir .w-search-info{background:#1c1030}\n" +
    ".soir .w-search input{background:#2a1a45;border-color:rgba(237,225,252,.2);color:#e6dcf6}\n" +
    ".soir .w-search-info{color:#c9b6e8}\n" +
    ".w-date{flex:none;width:44px;text-align:center;background:#ffe9df;" +
      "border-radius:10px;padding:6px 2px;color:#e95825}\n" +
    ".w-date b{display:block;font-size:1.05rem;line-height:1}\n" +
    ".w-date span{font-size:.62rem;font-weight:800;text-transform:uppercase}\n" +
    ".w-main{flex:1;min-width:0}\n" +
    ".w-title{display:block;font-weight:700;font-size:.86rem;color:#261148;" +
      "text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n" +
    ".w-title:hover{color:#e95825;text-decoration:underline}\n" +
    ".w-meta{font-size:.72rem;color:#6b6178;display:flex;align-items:center;gap:6px;margin-top:2px}\n" +
    ".w-chip{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}\n" +
    ".w-empty{padding:22px 16px;font-size:.82rem;color:#6b6178;text-align:center}\n" +
    ".w-foot{display:block;text-align:center;padding:10px;font-size:.74rem;font-weight:800;" +
      "color:#3a1c71;text-decoration:none;border-top:1px solid rgba(58,28,113,.08);background:#faf6ff}\n" +
    ".w-foot:hover{color:#e95825}\n" +
    /* thème soir */
    ".w.soir{background:#241143;border-color:rgba(237,225,252,.14);color:#e6dcf6}\n" +
    ".w.soir .w-item{border-color:rgba(237,225,252,.1)}\n" +
    ".w.soir .w-item:hover{background:rgba(237,225,252,.05)}\n" +
    ".w.soir .w-title{color:#f1eafb}\n" +
    ".w.soir .w-meta{color:#a99bc4}\n" +
    ".w.soir .w-date{background:#3a2566;color:#ffb28f}\n" +
    ".w.soir .w-empty{color:#a99bc4}\n" +
    ".w.soir .w-foot{background:#1c1030;color:#d9c9f5;border-color:rgba(237,225,252,.1)}\n";

  var LOGO =
    '<svg width="20" height="22" viewBox="0 0 40 44" aria-hidden="true">' +
    '<path d="M32 4 Q 18 8 12 20 Q 7 30 8 40 Q 10 32 16 26 L 13 25 Q 20 24 24 18 L 20 18 Q 28 14 32 4 Z" fill="#ff6b35"/></svg>';

  function fetchEvents(cfg, large) {
    if (cfg.source) {
      return fetch(cfg.source).then(function (r) { return r.json(); }).then(function (json) {
        var list = Array.isArray(json) ? json : (json.events || []);
        var today = isoToday();
        var borne = (!large && cfg.jours > 0) ? isoDansNJours(cfg.jours) : null;
        return list.filter(function (e) {
          if ((e.end_date || e.start_date) < today) return false;
          if (borne && String(e.start_date) > borne) return false;
          if (cfg.pays && e.country_code !== cfg.pays) return false;
          if (cfg.type && e.type !== cfg.type) return false;
          return true;
        }).sort(function (a, b) {
          return String(a.start_date).localeCompare(String(b.start_date));
        }).slice(0, large ? 200 : cfg.limit);
      });
    }
    // "large" (recherche/géoloc lancée) : pool complet à venir, SANS borne haute,
    // pour que le tri par distance trouve toujours du proche.
    // Sinon (accueil) : fenêtre J -> J+cfg.jours, liste courte de l'imminent.
    var poolLimit = large ? 200 : cfg.limit;
    var borneHaute = (!large && cfg.jours > 0)
      ? "&start_date=lte." + isoDansNJours(cfg.jours)
      : "";
    // inclure aussi les événements EN COURS (commencés avant aujourd'hui mais
    // pas encore terminés) : on borne sur end_date >= aujourd'hui.
    var url = SUPA + "/rest/v1/events" +
      "?select=id,title,type,city,region,country_code,start_date,end_date,lat,lng" +
      "&validated=eq.true&rejected=eq.false" +
      "&or=(start_date.gte." + isoToday() + ",end_date.gte." + isoToday() + ")" +
      borneHaute +
      "&order=start_date.asc&limit=" + poolLimit +
      (cfg.pays ? "&country_code=eq." + encodeURIComponent(cfg.pays) : "") +
      (cfg.type ? "&type=eq." + encodeURIComponent(cfg.type) : "");
    return fetch(url, {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY }
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function geocodeVille(ville) {
    // API Adresse (France) : gratuite, sans clé, officielle.
    var url = "https://api-adresse.data.gouv.fr/search/?type=municipality&limit=1&q=" +
      encodeURIComponent(ville);
    return fetch(url).then(function (r) { return r.json(); }).then(function (json) {
      var f = json && json.features && json.features[0];
      if (!f) return null;
      return {
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        label: f.properties.city || f.properties.name || ville,
        kind: "ville"
      };
    });
  }

  // Suggestions à la frappe : communes ET départements (via l'API Adresse).
  function chercherDepartements(q) {
    var n = q.trim().toLowerCase();
    if (!n) return [];
    // normaliser (sans accents) pour comparer les noms
    function sansAccent(x) {
      return x.normalize ? x.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : x;
    }
    var nn = sansAccent(n);
    return DEPARTEMENTS.filter(function (d) {
      var code = d[0].toLowerCase(), nom = sansAccent(d[1].toLowerCase());
      return code === nn || nom.indexOf(nn) === 0 || nom.indexOf(" " + nn) > -1;
    }).slice(0, 3).map(function (d) {
      return { lat: d[2], lng: d[3], label: d[1], sub: "D\u00e9partement " + d[0], kind: "departement" };
    });
  }

  function chercherSuggestions(q) {
    var base = "https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=5&q=" +
      encodeURIComponent(q);
    // deux requêtes : communes + centres de département (municipality couvre les 2
    // si on ne fixe pas le type, mais on force la présence de départements en doublant).
    return fetch(base + "&type=municipality").then(function (r) { return r.json(); })
      .then(function (json) {
        var out = (json.features || []).map(function (f) {
          return {
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            label: f.properties.city || f.properties.name,
            sub: (f.properties.context || ""),   // ex : "35, Ille-et-Vilaine, Bretagne"
            kind: "ville"
          };
        });
        // ajouter les départements correspondants en tête
        return chercherDepartements(q).concat(out);
      }).catch(function () { return chercherDepartements(q); });
  }

  function toRad(v) { return Number(v) * Math.PI / 180; }

  function distanceKm(la1, ln1, la2, ln2) {
    var R = 6371;
    var dLa = toRad(la2 - la1), dLn = toRad(ln2 - ln1);
    var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos(toRad(la1)) * Math.cos(toRad(la2)) *
      Math.sin(dLn / 2) * Math.sin(dLn / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function hasCoords(e) {
    return e.lat != null && e.lng != null && !isNaN(e.lat) && !isNaN(e.lng);
  }

  function rowHTML(e) {
    var d = new Date(String(e.start_date) + "T12:00:00");
    var color = TYPE_COLORS[e.type] || "#3a1c71";
    var href = SITE + "/event.html?id=" + encodeURIComponent(e.id);
    return '<li class="w-item">' +
      '<span class="w-date"><b>' + d.getDate() + "</b><span>" + MONTHS[d.getMonth()] + "</span></span>" +
      '<span class="w-main">' +
        '<a class="w-title" href="' + href + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" +
        '<span class="w-meta"><i class="w-chip" style="background:' + color + '"></i>' +
          esc([e.type, e.city].filter(Boolean).join(" \u00b7 ")) +
          (e.__dist != null ? ' \u00b7 <b>' + Math.round(e.__dist) + ' km</b>' : "") +
          "</span>" +
      "</span></li>";
  }

  function render(el) {
    var cfg = {
      pays: (el.dataset.pays || "").toUpperCase(),
      type: el.dataset.type || "",
      limit: Math.min(12, Math.max(1, parseInt(el.dataset.limit || "8", 10) || 8)),
      jours: el.dataset.jours != null ? Math.max(0, parseInt(el.dataset.jours, 10) || 0) : 3,
      theme: el.dataset.theme === "soir" ? "soir" : "clair",
      source: el.dataset.source || "",
      autour: el.dataset.autour === "1" || el.dataset.autour === "true",
      rayon: parseInt(el.dataset.rayon || "0", 10) || 0,
      recherche: el.dataset.recherche === "1" || el.dataset.recherche === "true",
      ville: (el.dataset.ville || "").trim()
    };
    var root = el.__ddl || (el.__ddl = el.attachShadow ? el.attachShadow({ mode: "open" }) : el);
    root.innerHTML = "<style>" + STYLES + "</style>" +
      '<div class="w ' + cfg.theme + '">' +
      '<div class="w-head">' + LOGO + "<b>Agenda D\u00e9dicalivres</b></div>" +
      '<ul class="w-list"><li class="w-empty">Chargement de l\u2019agenda\u2026</li></ul>' +
      '<a class="w-foot" href="' + SITE + '" target="_blank" rel="noopener">Voir tout l\u2019agenda \u2192 dedicalivres.fr</a>' +
      "</div>";
    var list = root.querySelector(".w-list");

    function paint(events) {
      var vus = events.slice(0, cfg.limit);  // le pool sert au tri, on n'affiche que cfg.limit
      list.innerHTML = vus.length
        ? vus.map(rowHTML).join("")
        : '<li class="w-empty">Aucun \u00e9v\u00e9nement \u00e0 venir pour ces crit\u00e8res.</li>';
    }

    fetchEvents(cfg, false).then(function (events) {
      paint(events);

      // --- Option "Autour de moi" ---
      if (!cfg.autour || !navigator.geolocation) return;
      // le bouton s'affiche dès que l'option est demandée : au clic, on rechargera
      // le pool complet, donc pas besoin que la liste courte ait déjà des coordonnées.

      var btn = root.querySelector(".w-geo");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "w-geo";
        btn.innerHTML = PIN + "<span>Autour de moi</span>";
        list.parentNode.insertBefore(btn, list.nextSibling);
      }
      btn.onclick = function () {
        btn.disabled = true;
        btn.querySelector("span").textContent = "Localisation\u2026";
        navigator.geolocation.getCurrentPosition(function (pos) {
          var la = pos.coords.latitude, ln = pos.coords.longitude;
          // élargir : recharger tout le à-venir pour trouver le plus proche
          fetchEvents(cfg, true).then(function (tous) {
            var pool = tous.filter(hasCoords);
            var near = pool.map(function (e) {
              var c = Object.create(e);
              c.__dist = distanceKm(la, ln, Number(e.lat), Number(e.lng));
              return c;
            }).filter(function (e) {
              return !cfg.rayon || e.__dist <= cfg.rayon;
            }).sort(function (a, b) { return a.__dist - b.__dist; });

            paint(near.length ? near : pool.slice(0));
            btn.disabled = false;
            btn.querySelector("span").textContent = near.length
              ? "Trié par distance"
              : (cfg.rayon ? "Rien \u00e0 moins de " + cfg.rayon + " km" : "Autour de moi");
          });
        }, function () {
          btn.disabled = false;
          btn.querySelector("span").textContent = "Localisation refus\u00e9e";
        }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
      };

      // --- Option "Chercher une ville ou un département" ---
      if (cfg.recherche) {
        {
          var box = document.createElement("div");
          box.className = "w-search";
          box.innerHTML =
            '<div class="w-search-wrap">' +
              '<input type="text" placeholder="Ville ou d\u00e9partement\u2026" ' +
              'autocomplete="off" aria-label="Chercher une ville ou un d\u00e9partement" />' +
            '</div>' +
            '<button type="button">Voir</button>';
          var info = document.createElement("div");
          info.className = "w-search-info";
          info.style.display = "none";
          var host = root.querySelector(".w-geo") || list;
          host.parentNode.insertBefore(box, host.nextSibling);
          box.parentNode.insertBefore(info, box.nextSibling);

          var wrap = box.querySelector(".w-search-wrap");
          var input = box.querySelector("input");
          var go = box.querySelector("button");
          var suggestBox = null;
          var choix = null;       // suggestion retenue {lat,lng,label}
          var debounce = null;
          var activeIx = -1;
          var current = [];

          function fermerSuggest() {
            if (suggestBox) { suggestBox.remove(); suggestBox = null; }
            activeIx = -1; current = [];
          }

          function afficherSuggest(items) {
            fermerSuggest();
            if (!items.length) return;
            current = items;
            suggestBox = document.createElement("div");
            suggestBox.className = "w-suggest";
            items.forEach(function (it, i) {
              var row = document.createElement("div");
              row.className = "w-suggest-item";
              var tag = it.kind === "departement" ? '<span class="w-suggest-tag dep">D\u00e9p.</span>'
                                                   : '<span class="w-suggest-tag">Ville</span>';
              row.innerHTML = tag + "<span>" + (it.label || "") +
                (it.sub ? ' <span style="opacity:.6">\u00b7 ' + it.sub + "</span>" : "") + "</span>";
              row.addEventListener("mousedown", function (ev) {
                ev.preventDefault();
                retenir(it);
              });
              suggestBox.appendChild(row);
            });
            wrap.appendChild(suggestBox);
          }

          function retenir(it) {
            choix = it;
            input.value = it.label;
            fermerSuggest();
            lancer();
          }

          function lancer() {
            var q = input.value.trim();
            if (q.length < 2) return;
            fermerSuggest();
            go.disabled = true; go.textContent = "\u2026";

            // si aucune suggestion retenue, on géocode le texte brut
            var loc = choix ? Promise.resolve(choix) : geocodeVille(q);
            Promise.resolve(loc).then(function (l) {
              if (!l) {
                info.style.display = "block";
                info.textContent = "Lieu introuvable. Essayez une orthographe proche.";
                go.disabled = false; go.textContent = "Voir";
                return;
              }
              // un département a un rayon large par défaut si aucun rayon n'est fixé
              var rayon = cfg.rayon || (l.kind === "departement" ? 60 : 0);
              // élargir : recharger tout le à-venir pour trouver du proche
              fetchEvents(cfg, true).then(function (tous) {
                var pool = tous.filter(hasCoords);
                var near = pool.map(function (e) {
                  var c = Object.create(e);
                  c.__dist = distanceKm(l.lat, l.lng, Number(e.lat), Number(e.lng));
                  return c;
                }).filter(function (e) {
                  return !rayon || e.__dist <= rayon;
                }).sort(function (a, b) { return a.__dist - b.__dist; });

                paint(near);
                info.style.display = "block";
                info.textContent = near.length
                  ? "\u00c9v\u00e9nements les plus proches de " + l.label
                  : "Rien " + (rayon ? "\u00e0 moins de " + rayon + " km de " : "autour de ") + l.label + ".";
                go.disabled = false; go.textContent = "Voir";
              });
            }).catch(function () {
              info.style.display = "block";
              info.textContent = "Recherche momentan\u00e9ment indisponible.";
              go.disabled = false; go.textContent = "Voir";
            });
          }

          // frappe : autocomplétion après 3 lettres, avec anti-rebond
          input.addEventListener("input", function () {
            choix = null;  // la frappe annule la sélection précédente
            var q = input.value.trim();
            if (debounce) clearTimeout(debounce);
            if (q.length < 3) { fermerSuggest(); return; }
            debounce = setTimeout(function () {
              chercherSuggestions(q).then(afficherSuggest);
            }, 220);
          });

          // navigation clavier dans les suggestions
          input.addEventListener("keydown", function (ev) {
            if (suggestBox && current.length) {
              if (ev.key === "ArrowDown") {
                ev.preventDefault();
                activeIx = (activeIx + 1) % current.length;
              } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                activeIx = (activeIx - 1 + current.length) % current.length;
              } else if (ev.key === "Enter") {
                ev.preventDefault();
                if (activeIx >= 0) { retenir(current[activeIx]); return; }
                lancer(); return;
              } else if (ev.key === "Escape") {
                fermerSuggest(); return;
              } else { return; }
              var rows = suggestBox.querySelectorAll(".w-suggest-item");
              rows.forEach(function (r, i) { r.classList.toggle("active", i === activeIx); });
              return;
            }
            if (ev.key === "Enter") { ev.preventDefault(); lancer(); }
          });

          input.addEventListener("blur", function () {
            setTimeout(fermerSuggest, 150);  // laisser le mousedown se déclencher
          });

          go.addEventListener("click", lancer);

          // lien pré-configuré : ville fournie -> on lance tout de suite
          if (cfg.ville) {
            input.value = cfg.ville;
            lancer();
          }
        }
      }
    }).catch(function () {
      list.innerHTML = '<li class="w-empty">Agenda momentan\u00e9ment indisponible.</li>';
    });
  }

  function init() {
    document.querySelectorAll("[data-dedicalivres]").forEach(render);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  /* API publique pour re-rendre dynamiquement (configurateur, SPA...) */
  window.DedicalivresWidget = { render: render, refresh: init };
})();
