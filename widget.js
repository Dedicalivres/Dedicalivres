/* =========================================================
   DÉDICALIVRES — WIDGET PARTENAIRES v1
   Affichez l'agenda littéraire Dédicalivres sur votre site.

   Intégration minimale :
     <div data-dedicalivres></div>
     <script src="https://dedicalivres.fr/widget.js" defer></script>

   Options (attributs data- sur la div) :
     data-pays="FR|BE|LU|CH|MC"   filtrer par pays
     data-type="Salon|Festival|Dédicace|Autre"
     data-limit="5"               nombre d'événements (1 à 12)
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

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
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

  function fetchEvents(cfg) {
    if (cfg.source) {
      return fetch(cfg.source).then(function (r) { return r.json(); }).then(function (json) {
        var list = Array.isArray(json) ? json : (json.events || []);
        var today = isoToday();
        return list.filter(function (e) {
          if ((e.end_date || e.start_date) < today) return false;
          if (cfg.pays && e.country_code !== cfg.pays) return false;
          if (cfg.type && e.type !== cfg.type) return false;
          return true;
        }).sort(function (a, b) {
          return String(a.start_date).localeCompare(String(b.start_date));
        }).slice(0, cfg.limit);
      });
    }
    var url = SUPA + "/rest/v1/events" +
      "?select=id,title,type,city,region,country_code,start_date,end_date,lat,lng" +
      "&validated=eq.true&rejected=eq.false" +
      "&start_date=gte." + isoToday() +
      "&order=start_date.asc&limit=" + cfg.limit +
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
        label: f.properties.city || f.properties.name || ville
      };
    });
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
      limit: Math.min(12, Math.max(1, parseInt(el.dataset.limit || "5", 10) || 5)),
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
      list.innerHTML = events.length
        ? events.map(rowHTML).join("")
        : '<li class="w-empty">Aucun \u00e9v\u00e9nement \u00e0 venir pour ces crit\u00e8res.</li>';
    }

    fetchEvents(cfg).then(function (events) {
      paint(events);

      // --- Option "Autour de moi" ---
      if (!cfg.autour || !navigator.geolocation) return;
      var geoCandidates = events.filter(hasCoords);
      if (!geoCandidates.length) return;  // aucune coordonnée : on n'affiche pas le bouton

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
          var near = geoCandidates.map(function (e) {
            var c = Object.create(e);
            c.__dist = distanceKm(la, ln, Number(e.lat), Number(e.lng));
            return c;
          }).filter(function (e) {
            return !cfg.rayon || e.__dist <= cfg.rayon;
          }).sort(function (a, b) { return a.__dist - b.__dist; });

          paint(near.length ? near
            : geoCandidates.slice(0));  // rien dans le rayon : on garde la liste
          btn.disabled = false;
          btn.querySelector("span").textContent = near.length
            ? "Trié par distance"
            : (cfg.rayon ? "Rien \u00e0 moins de " + cfg.rayon + " km" : "Autour de moi");
        }, function () {
          btn.disabled = false;
          btn.querySelector("span").textContent = "Localisation refus\u00e9e";
        }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
      };

      // --- Option "Chercher une ville" ---
      if (cfg.recherche) {
        var geoList = events.filter(hasCoords);
        if (geoList.length) {
          var box = document.createElement("div");
          box.className = "w-search";
          box.innerHTML = '<input type="text" placeholder="Chercher une ville\u2026" ' +
            'aria-label="Chercher une ville" />' +
            '<button type="button">Voir</button>';
          var info = document.createElement("div");
          info.className = "w-search-info";
          info.style.display = "none";
          var host = root.querySelector(".w-geo") || list;
          host.parentNode.insertBefore(box, host.nextSibling);
          box.parentNode.insertBefore(info, box.nextSibling);

          var input = box.querySelector("input");
          var go = box.querySelector("button");

          var lancer = function () {
            var ville = input.value.trim();
            if (ville.length < 2) return;
            go.disabled = true; go.textContent = "\u2026";
            geocodeVille(ville).then(function (loc) {
              if (!loc) {
                info.style.display = "block";
                info.textContent = "Ville introuvable. Essayez une orthographe proche.";
                go.disabled = false; go.textContent = "Voir";
                return;
              }
              var near = geoList.map(function (e) {
                var c = Object.create(e);
                c.__dist = distanceKm(loc.lat, loc.lng, Number(e.lat), Number(e.lng));
                return c;
              }).filter(function (e) {
                return !cfg.rayon || e.__dist <= cfg.rayon;
              }).sort(function (a, b) { return a.__dist - b.__dist; });

              paint(near);
              info.style.display = "block";
              info.textContent = near.length
                ? "\u00c9v\u00e9nements les plus proches de " + loc.label
                : "Rien " + (cfg.rayon ? "\u00e0 moins de " + cfg.rayon + " km de " : "autour de ") + loc.label + ".";
              go.disabled = false; go.textContent = "Voir";
            }).catch(function () {
              info.style.display = "block";
              info.textContent = "Recherche momentan\u00e9ment indisponible.";
              go.disabled = false; go.textContent = "Voir";
            });
          };
          go.addEventListener("click", lancer);
          input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") { ev.preventDefault(); lancer(); }
          });

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
