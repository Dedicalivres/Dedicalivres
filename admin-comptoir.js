/* =========================================================
   DÉDICALIVRES — ADMIN « LE COMPTOIR » (script additif)
   À charger APRÈS admin.js. Ne modifie aucun fichier existant.
   1. Réactive les aperçus d'images (désormais servies via R2)
   2. Compteurs de travail en attente sur les onglets
   3. Onglets réordonnés par fréquence d'usage
   4. Bouton flottant « Poster un événement »
   Rollback : retirer les 2 lignes comptoir de admin.html.
========================================================= */
(function () {
  "use strict";

  /* ---------- 1. Vignettes : on enveloppe renderEventCard ---------- */
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function enableThumbs() {
    if (typeof window.renderEventCard !== "function") return false;
    var orig = window.renderEventCard;
    if (orig.__comptoir) return true;

    window.renderEventCard = function (event) {
      var html = orig(event);
      if (event && event.image_url) {
        html = html.replace(
          /<div class="event-admin-thumb-placeholder"[^>]*>[\s\S]*?<\/div>/,
          '<div class="cpt-thumb"><img src="' + esc(event.image_url) +
          '" alt="" loading="lazy" decoding="async"></div>'
        );
      }
      return html;
    };
    window.renderEventCard.__comptoir = true;
    return true;
  }
  /* admin.js est chargé avant nous : l'enveloppe se pose avant le premier rendu */
  if (!enableThumbs()) {
    var tries = 0;
    var t = setInterval(function () {
      if (enableThumbs() || ++tries > 40) clearInterval(t);
    }, 250);
  }

  document.addEventListener("DOMContentLoaded", function () {

    /* ---------- 2. Onglets réordonnés par fréquence d'usage ---------- */
    var ORDER = ["moderation", "events", "overview", "premium", "social",
                 "exports", "quality", "watch", "stats", "settings"];
    var tabsBar = document.querySelector(".admin-tabs");
    if (tabsBar) {
      ORDER.forEach(function (name) {
        var btn = tabsBar.querySelector('.admin-tab[data-tab="' + name + '"]');
        if (btn) tabsBar.appendChild(btn);
      });
    }

    /* =========================================================
       ESPACE « AUJOURD'HUI » — file d'attente unifiée
       Réutilise les globaux d'admin.js : supabaseClient,
       ensureAdminSession, validateEvent, rejectEvent, showToast.
    ========================================================= */
    setupComptoirTab(tabsBar);


    /* ---------- 3. Compteurs de travail en attente ---------- */
    function countItems(panelId) {
      var panel = document.getElementById(panelId);
      if (!panel) return 0;
      /* cartes ou lignes visibles dans le panneau */
      var items = panel.querySelectorAll("article, .event-card, tbody tr, li[data-id]");
      var n = 0;
      items.forEach(function (el) {
        if (el.offsetParent !== null) n++;
      });
      return n;
    }

    function badge(tabName, n) {
      var tab = document.querySelector('.admin-tab[data-tab="' + tabName + '"]');
      if (!tab) return;
      var b = tab.querySelector(".cpt-badge");
      if (n > 0) {
        if (!b) {
          b = document.createElement("span");
          b.className = "cpt-badge";
          tab.appendChild(b);
        }
        b.textContent = n > 99 ? "99+" : String(n);
      } else if (b) {
        b.remove();
      }
    }

    function refreshBadges() {
      badge("moderation", countItems("tab-moderation"));
    }
    refreshBadges();
    ["tab-moderation"].forEach(function (id) {
      var panel = document.getElementById(id);
      if (panel && "MutationObserver" in window) {
        new MutationObserver(refreshBadges).observe(panel, { childList: true, subtree: true });
      }
    });

    /* ---------- 4. Bouton flottant « Poster un événement » ---------- */
    if (!document.getElementById("cpt-fab")) {
      var fab = document.createElement("button");
      fab.id = "cpt-fab";
      fab.type = "button";
      fab.innerHTML = "✒️ <span>Poster un événement</span>";
      fab.addEventListener("click", function () {
        var tab = document.querySelector('.admin-tab[data-tab="events"]');
        if (tab) tab.click();
        window.scrollTo({ top: 0, behavior: "smooth" });
        /* focus sur le premier champ utile du panneau événements */
        setTimeout(function () {
          var panel = document.getElementById("tab-events");
          var field = panel && panel.querySelector("input, select, textarea, button");
          if (field) field.focus();
        }, 350);
      });
      document.body.appendChild(fab);
    }
  });

  /* ---------- L'espace Aujourd'hui ---------- */
  function setupComptoirTab(tabsBar) {
    if (!tabsBar || document.getElementById("tab-comptoir")) return;
    var panelHost = document.querySelector(".admin-tab-panel");
    if (!panelHost || typeof window.supabaseClient === "undefined") return;

    /* l'onglet, placé en tête */
    var tab = document.createElement("button");
    tab.type = "button";
    tab.className = "admin-tab";
    tab.dataset.tab = "comptoir";
    tab.textContent = "Aujourd'hui";
    tabsBar.insertBefore(tab, tabsBar.firstChild);

    /* le panneau, calqué sur la convention existante */
    var panel = document.createElement("section");
    panel.className = "admin-tab-panel";
    panel.id = "tab-comptoir";
    panel.innerHTML =
      '<div class="cpt-stats" id="cpt-stats"></div>' +
      '<div class="cpt-inbox-bar">' +
        '<h3>File d\u2019attente unifi\u00e9e</h3>' +
        '<button type="button" class="cyber-btn-secondary" id="cpt-refresh">Actualiser</button>' +
      '</div>' +
      '<div class="cpt-inbox" id="cpt-inbox"><div class="cpt-empty">Chargement\u2026</div></div>';
    panelHost.parentNode.insertBefore(panel, panelHost);

    /* bascule d'onglet : on rejoue la convention active/panel */
    function activate() {
      document.querySelectorAll(".admin-tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".admin-tab-panel").forEach(function (p) { p.classList.remove("active"); });
      tab.classList.add("active");
      panel.classList.add("active");
      loadComptoir();
    }
    tab.addEventListener("click", activate);
    /* si un autre onglet est cliqué, admin.js gère ses panneaux ;
       on retire le n\u00f4tre par s\u00e9curit\u00e9 */
    tabsBar.addEventListener("click", function (e) {
      var other = e.target.closest(".admin-tab");
      if (other && other !== tab) {
        tab.classList.remove("active");
        panel.classList.remove("active");
      }
    }, true);

    document.getElementById("cpt-refresh").addEventListener("click", loadComptoir);
    panel.addEventListener("click", onQueueAction);
  }

  function relTime(iso) {
    if (!iso) return "";
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return "il y a " + Math.max(1, Math.round(s / 60)) + " min";
    if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
    return "il y a " + Math.round(s / 86400) + " j";
  }

  var queueCache = [];

  function loadComptoir() {
    var inbox = document.getElementById("cpt-inbox");
    var stats = document.getElementById("cpt-stats");
    if (!inbox) return;

    var sb = window.supabaseClient;
    var qEvents = sb.from("events")
      .select("id,title,type,city,region,start_date,image_url,created_at")
      .eq("validated", false).eq("rejected", false)
      .order("created_at", { ascending: false }).limit(60);
    var qTem = sb.from("testimonials")
      .select("id,pseudo,event_title,image_url,validated,rejected,created_at")
      .eq("validated", false).eq("rejected", false)
      .order("created_at", { ascending: false }).limit(60);
    var qAut = sb.from("event_authors_presence")
      .select("id,pseudo,website,validated,rejected,created_at,events(title,city)")
      .eq("validated", false).eq("rejected", false)
      .order("created_at", { ascending: false }).limit(60);

    Promise.all([qEvents, qTem, qAut]).then(function (res) {
      var items = [];
      (res[0].data || []).forEach(function (e) {
        items.push({ kind: "event", id: e.id, title: e.title,
          meta: [e.type, e.city, e.start_date].filter(Boolean).join(" \u00b7 "),
          img: e.image_url, at: e.created_at });
      });
      (res[1].data || []).forEach(function (t) {
        items.push({ kind: "temoignage", id: t.id, title: t.pseudo || "T\u00e9moignage",
          meta: t.event_title || "", img: t.image_url, at: t.created_at });
      });
      (res[2].data || []).forEach(function (a) {
        var ev = a.events || {};
        items.push({ kind: "author", id: a.id, title: a.pseudo || "Auteur",
          meta: [ev.title, ev.city].filter(Boolean).join(" \u00b7 ") || a.website || "",
          img: null, at: a.created_at });
      });
      items.sort(function (x, y) { return String(y.at).localeCompare(String(x.at)); });
      queueCache = items;
      renderQueue(items,
        (res[0].data || []).length,
        (res[2].data || []).length,
        (res[1].data || []).length,
        res.some(function (r) { return r.error; }));
    }).catch(function () {
      inbox.innerHTML = '<div class="cpt-empty">Impossible de charger la file. Session expir\u00e9e ?</div>';
    });

    if (stats) {
      /* total publi\u00e9s (l\u00e9ger : count only) */
      sb.from("events").select("id", { count: "exact", head: true })
        .eq("validated", true).eq("rejected", false)
        .then(function (r) {
          var el = document.getElementById("cpt-stat-pub");
          if (el && typeof r.count === "number") el.textContent = r.count;
        });
    }
  }

  var KIND_LABEL = { event: "\u00c9v\u00e9nement", author: "Auteur", temoignage: "T\u00e9moignage" };
  var KIND_TAB = { event: "moderation", author: "moderation", temoignage: "moderation" };

  function renderQueue(items, nEv, nAut, nTem, hadError) {
    var stats = document.getElementById("cpt-stats");
    if (stats) {
      stats.innerHTML =
        '<div class="cpt-stat' + (nEv ? " is-hot" : "") + '"><b>' + nEv + '</b><span>\u00c9v\u00e9nements en attente</span></div>' +
        '<div class="cpt-stat' + (nAut ? " is-hot" : "") + '"><b>' + nAut + '</b><span>Auteurs en attente</span></div>' +
        '<div class="cpt-stat' + (nTem ? " is-hot" : "") + '"><b>' + nTem + '</b><span>T\u00e9moignages en attente</span></div>' +
        '<div class="cpt-stat"><b id="cpt-stat-pub">\u2013</b><span>\u00c9v\u00e9nements publi\u00e9s</span></div>';
    }
    var inbox = document.getElementById("cpt-inbox");
    if (!inbox) return;
    if (!items.length) {
      inbox.innerHTML = '<div class="cpt-empty"><b>\u2713</b>' +
        (hadError ? "File partiellement charg\u00e9e \u2014 une source n\u2019a pas r\u00e9pondu."
                  : "Rien en attente. Tout est \u00e0 jour !") + "</div>";
      return;
    }
    inbox.innerHTML = items.map(function (it) {
      return '<div class="cpt-row" data-kind="' + it.kind + '" data-id="' + it.id + '">' +
        '<span class="cpt-kind cpt-kind--' + it.kind + '">' + KIND_LABEL[it.kind] + '</span>' +
        (it.img ? '<span class="cpt-thumb"><img src="' + esc(it.img) + '" alt="" loading="lazy"></span>' : "") +
        '<span class="cpt-row-main">' +
          '<span class="cpt-row-title">' + esc(it.title) + '</span>' +
          '<span class="cpt-row-meta">' + esc(it.meta) + '</span>' +
        '</span>' +
        '<span class="cpt-row-age">' + relTime(it.at) + '</span>' +
        '<span class="cpt-row-actions">' +
          '<button type="button" class="cpt-act cpt-act--ok" data-act="ok">\u2713 Valider</button>' +
          '<button type="button" class="cpt-act cpt-act--no" data-act="no">\u2715</button>' +
          '<button type="button" class="cpt-act cpt-act--open" data-act="open">Ouvrir</button>' +
        '</span></div>';
    }).join("");
  }

  function onQueueAction(e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var row = btn.closest(".cpt-row");
    var kind = row.dataset.kind, id = row.dataset.id, act = btn.dataset.act;

    if (act === "open") {
      var tab = document.querySelector('.admin-tab[data-tab="' + (KIND_TAB[kind] || "moderation") + '"]');
      if (tab) tab.click();
      return;
    }
    if (act === "no" && !window.confirm("Rejeter cet \u00e9l\u00e9ment ?")) return;

    row.style.opacity = ".45";

    if (kind === "event" && typeof window.validateEvent === "function" && typeof window.rejectEvent === "function") {
      /* on r\u00e9utilise la logique compl\u00e8te d'admin.js (session, toast, refresh) */
      (act === "ok" ? window.validateEvent(id) : window.rejectEvent(id));
      setTimeout(loadComptoir, 900);
      return;
    }

    /* t\u00e9moignages & auteurs : m\u00eame motif de mise \u00e0 jour que leurs modules */
    var table = kind === "temoignage" ? "testimonials" : "event_authors_presence";
    var payload = act === "ok" ? { validated: true, rejected: false }
                               : { validated: false, rejected: true };
    var doUpdate = function () {
      window.supabaseClient.from(table).update(payload).eq("id", id).then(function (r) {
        if (typeof window.showToast === "function") {
          window.showToast(r.error ? "Erreur" : (act === "ok" ? "Valid\u00e9" : "Rejet\u00e9"));
        }
        loadComptoir();
      });
    };
    if (typeof window.ensureAdminSession === "function") {
      Promise.resolve(window.ensureAdminSession()).then(function (ok) { if (ok) doUpdate(); else row.style.opacity = "1"; });
    } else doUpdate();
  }

})();
