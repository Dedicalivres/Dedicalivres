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

   Le widget s'affiche dans un Shadow DOM : ses styles
   n'interfèrent jamais avec ceux du site hôte.
========================================================= */
(function () {
  "use strict";

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
      "?select=id,title,type,city,region,country_code,start_date,end_date" +
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

  function rowHTML(e) {
    var d = new Date(String(e.start_date) + "T12:00:00");
    var color = TYPE_COLORS[e.type] || "#3a1c71";
    var href = SITE + "/event.html?id=" + encodeURIComponent(e.id);
    return '<li class="w-item">' +
      '<span class="w-date"><b>' + d.getDate() + "</b><span>" + MONTHS[d.getMonth()] + "</span></span>" +
      '<span class="w-main">' +
        '<a class="w-title" href="' + href + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" +
        '<span class="w-meta"><i class="w-chip" style="background:' + color + '"></i>' +
          esc([e.type, e.city].filter(Boolean).join(" \u00b7 ")) + "</span>" +
      "</span></li>";
  }

  function render(el) {
    var cfg = {
      pays: (el.dataset.pays || "").toUpperCase(),
      type: el.dataset.type || "",
      limit: Math.min(12, Math.max(1, parseInt(el.dataset.limit || "5", 10) || 5)),
      theme: el.dataset.theme === "soir" ? "soir" : "clair",
      source: el.dataset.source || ""
    };
    var root = el.__ddl || (el.__ddl = el.attachShadow ? el.attachShadow({ mode: "open" }) : el);
    root.innerHTML = "<style>" + STYLES + "</style>" +
      '<div class="w ' + cfg.theme + '">' +
      '<div class="w-head">' + LOGO + "<b>Agenda D\u00e9dicalivres</b></div>" +
      '<ul class="w-list"><li class="w-empty">Chargement de l\u2019agenda\u2026</li></ul>' +
      '<a class="w-foot" href="' + SITE + '" target="_blank" rel="noopener">Voir tout l\u2019agenda \u2192 dedicalivres.fr</a>' +
      "</div>";
    var list = root.querySelector(".w-list");

    fetchEvents(cfg).then(function (events) {
      list.innerHTML = events.length
        ? events.map(rowHTML).join("")
        : '<li class="w-empty">Aucun \u00e9v\u00e9nement \u00e0 venir pour ces crit\u00e8res.</li>';
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
