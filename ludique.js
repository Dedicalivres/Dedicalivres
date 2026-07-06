/* =========================================================
   DÉDICALIVRES — COUCHE LUDIQUE v2 « symbolique livresque »
   Remplace ludique.js v1.
   Retirés : émojis flottants + parallaxe, tilt 3D, confettis,
             traînée de curseur.
   Compatible app.js / mascot-guide.js / ui-effects-v6.js.

   Options (facultatif, dans config.js) :
     window.DEDICALIVRES_CONFIG.ludique = {
       floatingPages: true,  // n°10 pages volantes (bannière)
       bookLoader: true,     // n°7 feuilletage (chargements)
       stamp: true,          // n°8 tampon ex-libris (favoris)
       highlighter: true,    // n°9 surligneur (compteur)
       inkReveal: true,      // n°12 encre qui révèle (sections)
       tickerCountries: true, // ruban pays cliquable
       tickerEvents: true     // ruban événements à 8 jours
     };
========================================================= */
(function () {
  "use strict";

  var cfg = (window.DEDICALIVRES_CONFIG && window.DEDICALIVRES_CONFIG.ludique) || {};
  function opt(name) { return cfg[name] !== false; }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =========================================================
     AMBIANCES DE FOND
     Aquarelle d'encre sur toutes les pages.
     Option : ambianceTemoignages: "papier" dans config.js pour
     remettre le papier à lettres sur la page Témoignages.
  ========================================================= */
  function injectAmbiance() {
    if (!opt("ambiance")) return;
    renderAmbiance(currentAmbiance());
    window.addEventListener("dedicalivres:ambiance", function (e) {
      renderAmbiance((e.detail && e.detail.ambiance) || currentAmbiance());
    });
  }

  function currentAmbiance() {
    var k = document.documentElement.dataset.ambiance;
    if (["aquarelle", "papier"].indexOf(k) !== -1) return k;
    if (cfg.ambianceTemoignages === "papier" &&
        document.body.classList.contains("testimonials-page")) return "papier";
    return "aquarelle";
  }

  function renderAmbiance(kind) {
    var amb = document.querySelector(".lud-ambiance");
    if (!amb) {
      amb = document.createElement("div");
      amb.setAttribute("aria-hidden", "true");
      document.body.prepend(amb);
    }
    if (kind === "papier") {
      amb.className = "lud-ambiance lud-ambiance--papier";
      amb.innerHTML =
        '<div class="lud-lignes"></div>' +
        '<div class="lud-marge"></div>' +
        '<div class="lud-spirale"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
    } else {
      amb.className = "lud-ambiance";
      amb.innerHTML =
        '<div class="lud-nappe lud-nappe-1"></div>' +
        '<div class="lud-nappe lud-nappe-2"></div>' +
        '<div class="lud-nappe lud-nappe-3"></div>' +
        '<div class="lud-grain"></div>';
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    injectAmbiance();        // fonds immersifs (3 ambiances)
    injectFloatingPages();   // n°10
    injectInkSignature();    // n°5
    injectTicker();          // rubans pays + événements à 8 jours
    setupInkReveal();        // n°12
    setupRise();             // pages intérieures
    setupBookLoaders();      // n°7
    setupStamp();            // n°8
    setupHighlighter();      // n°9
    setupFavoriteCorner();   // n°3 persistant
    setupBackTop();
    setupCalendarStagger();
    setupPageRain();         // easter egg
    injectWidgetLink();      // lien partenaires dans le footer
  }

  /* =========================================================
     N°10 — PAGES VOLANTES : feuillets, livre, plume en SVG
     Dérive lente, sans parallaxe souris.
  ========================================================= */
  var SVG_SHEET =
    '<svg width="{w}" height="{h}" viewBox="0 0 42 52">' +
    '<path d="M4 6 Q 14 2 24 5 L 38 8 Q 36 28 38 46 Q 24 50 10 47 L 4 44 Q 6 24 4 6 Z" ' +
    'fill="#fffdf8" stroke="rgba(58,28,113,.4)" stroke-width="1.6"/>' +
    '<path d="M12 16 h18 M12 23 h14 M12 30 h17 M12 37 h11" ' +
    'stroke="rgba(58,28,113,.28)" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var SVG_BOOK =
    '<svg width="{w}" height="{h}" viewBox="0 0 46 40">' +
    '<path d="M23 8 Q 12 2 3 6 L 3 32 Q 12 28 23 34 Q 34 28 43 32 L 43 6 Q 34 2 23 8 Z" ' +
    'fill="#fffdf8" stroke="rgba(58,28,113,.4)" stroke-width="1.6"/>' +
    '<path d="M23 8 V 34" stroke="rgba(58,28,113,.32)" stroke-width="1.4"/></svg>';
  var SVG_QUILL =
    '<svg width="{w}" height="{h}" viewBox="0 0 40 44">' +
    '<path d="M32 4 Q 18 8 12 20 Q 7 30 8 40 Q 10 32 16 26 L 13 25 Q 20 24 24 18 L 20 18 Q 28 14 32 4 Z" ' +
    'fill="rgba(255,107,53,.65)" stroke="rgba(233,88,37,.75)" stroke-width="1.4"/></svg>';

  function injectFloatingPages() {
    if (!opt("floatingPages") || reduceMotion) return;

    /* bannière d'accueil : composition complète */
    var hero = document.querySelector(".association-hero-backdrop");
    if (hero) placeFloats(hero, [
      { svg: SVG_SHEET, w: 38, h: 46, top: "12%", left: "6%",  s: 1,   d: "0s"  },
      { svg: SVG_BOOK,  w: 44, h: 38, top: "18%", right: "7%", s: .95, d: "-4s" },
      { svg: SVG_QUILL, w: 34, h: 38, bottom: "26%", left: "11%", s: .85, d: "-7s" },
      { svg: SVG_SHEET, w: 30, h: 38, bottom: "20%", right: "13%", s: .8, d: "-2s" },
      { svg: SVG_BOOK,  w: 34, h: 30, top: "8%",  left: "46%", s: .7, d: "-9s" }
    ]);

    /* heros des pages intérieures : composition allégée dans les coins */
    var seoHero = document.querySelector(".seo-hero");
    if (seoHero) placeFloats(seoHero, [
      { svg: SVG_SHEET, w: 34, h: 42, top: "14%", left: "5%",  s: .9, d: "0s"  },
      { svg: SVG_QUILL, w: 30, h: 34, top: "22%", right: "6%", s: .8, d: "-5s" },
      { svg: SVG_BOOK,  w: 36, h: 32, bottom: "16%", right: "12%", s: .7, d: "-8s" }
    ]);
  }

  function placeFloats(target, items) {
    if (target.querySelector(".lud-floatpage")) return;
    var cs = getComputedStyle(target);
    if (cs.position === "static") target.style.position = "relative";
    items.forEach(function (it) {
      var s = document.createElement("span");
      s.className = "lud-floatpage";
      s.setAttribute("aria-hidden", "true");
      s.innerHTML = it.svg.replace("{w}", it.w).replace("{h}", it.h);
      if (it.top) s.style.top = it.top;
      if (it.bottom) s.style.bottom = it.bottom;
      if (it.left) s.style.left = it.left;
      if (it.right) s.style.right = it.right;
      s.style.setProperty("--s", it.s);
      s.style.animationDelay = it.d;
      target.appendChild(s);
    });
  }

  /* =========================================================
     RÉVÉLATION EN CASCADE des blocs des pages intérieures
     (sections SEO, cartes de témoignages, formulaire)
  ========================================================= */
  function setupRise() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;

    var singles = document.querySelectorAll(
      ".seo-text-block, .regional-map-section, .testimonial-form-card"
    );
    var grids = document.querySelectorAll(".testimonials-grid");
    var targets = [];

    singles.forEach(function (el) { targets.push(el); });
    grids.forEach(function (grid) {
      Array.prototype.forEach.call(grid.children, function (child, i) {
        child.style.setProperty("--lud-rise-delay", (i % 6) * 90 + "ms");
        targets.push(child);
      });
    });
    if (!targets.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("lud-visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08 });

    targets.forEach(function (t) {
      t.classList.add("lud-rise");
      io.observe(t);
    });
  }

  /* =========================================================
     N°5 — LA PLUME QUI SOULIGNE
     Ne souligne que les mots-clés « rencontres » et « visibles »,
     passés en orange ; le trait épouse la largeur du mot.
  ========================================================= */
  function injectInkSignature() {
    var strong = document.querySelector(".association-hero-copy > strong");
    if (!strong || strong.querySelector(".lud-ink-word")) return;

    var delay = 1.0;
    ["rencontres", "visibles"].forEach(function (word) {
      var re = new RegExp("(" + word + ")", "i");
      if (!re.test(strong.innerHTML)) return;
      strong.innerHTML = strong.innerHTML.replace(re,
        '<span class="lud-ink-word">$1' +
        '<svg class="lud-ink-underline" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">' +
        '<path pathLength="100" style="animation-delay:' + delay + 's" d="M3 10 Q 25 2 50 8 T 97 7"/>' +
        "</svg></span>");
      delay += 0.7;
    });
  }

  /* =========================================================
     RUBAN N°1 — LES PAYS, désormais cliquables
     Chaque pays mène à son agenda.
  ========================================================= */
  var COUNTRY_LINKS = [
    ["France", "index.html?country=FR#agenda"],
    ["Belgique", "evenements-litteraires-belgique.html"],
    ["Luxembourg", "evenements-litteraires-luxembourg.html"],
    ["Suisse", "evenements-litteraires-suisse.html"],
    ["Monaco", "evenements-litteraires-monaco.html"]
  ];

  function tickerTrack(itemsHTML) {
    return '<div class="lud-ticker-track"><span>' + itemsHTML + "</span><span>" + itemsHTML + "</span></div>";
  }

  function injectTicker() {
    if (!opt("tickerCountries")) return;
    var hero = document.querySelector(".association-hero");
    if (!hero || document.querySelector(".lud-ticker")) return;

    var items = COUNTRY_LINKS.map(function (c) {
      return '<a href="' + c[1] + '">' + c[0] + "</a><em>✦</em>";
    }).join("") +
    '<a href="#agenda">Salons</a><em>✦</em>' +
    '<a href="#agenda">Festivals</a><em>✦</em>' +
    '<a href="#agenda">Dédicaces</a><em>✦</em>';

    var ticker = document.createElement("nav");
    ticker.className = "lud-ticker";
    ticker.setAttribute("aria-label", "Agendas littéraires par pays");
    ticker.innerHTML = tickerTrack(items);
    hero.insertAdjacentElement("afterend", ticker);

    injectEventsTicker(ticker);
  }

  /* =========================================================
     RUBAN N°2 — LES ÉVÉNEMENTS À 8 JOURS, cliquables
     type / département / nom -> event.html?id=…
     Données réelles via le client Supabase exposé par app.js.
  ========================================================= */
  function injectEventsTicker(afterEl) {
    if (!opt("tickerEvents")) return;

    /* app.js charge Supabase en différé : on attend le client (10 s max) */
    var tries = 0;
    (function waitClient() {
      var client = window.DEDICALIVRES_SUPABASE_CLIENT;
      if (client) { fetchUpcoming(client, afterEl); return; }
      if (++tries > 50) return; /* pas de client : pas de ruban, sans erreur */
      setTimeout(waitClient, 200);
    

  /* ---------- Lien « Widget pour votre site » dans le footer ---------- */
  function injectWidgetLink() {
    var nav = document.querySelector(".site-footer-nav");
    if (!nav || nav.querySelector('a[href*="widget-partenaires"]')) return;
    var a = document.createElement("a");
    a.href = "widget-partenaires.html";
    a.textContent = "\ud83e\udde9 Widget pour votre site";
    nav.appendChild(a);
  }
})();
  }

  function isoDate(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function fetchUpcoming(client, afterEl) {
    var today = new Date();
    var horizon = new Date();
    horizon.setDate(horizon.getDate() + 8);

    client
      .from("events")
      .select("id,title,type,region,city,country_code,start_date,end_date")
      .eq("validated", true)
      .eq("rejected", false)
      .lte("start_date", isoDate(horizon))
      .gte("start_date", isoDate(today))
      .order("start_date", { ascending: true })
      .limit(14)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return;
        renderEventsTicker(res.data, afterEl);
      })
      .catch(function () { /* silencieux : le ruban est un bonus */ });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderEventsTicker(events, afterEl) {
    if (document.querySelector(".lud-ticker-events")) return;

    var items = events.map(function (ev) {
      var dep = ev.region || ev.city || "";
      return '<a href="event.html?id=' + encodeURIComponent(ev.id) + '">' +
        '<span class="lud-tk-type">' + escapeHtml(ev.type || "Événement") + '</span>' +
        (dep ? '<span class="lud-tk-dep">' + escapeHtml(dep) + '</span>' : '') +
        escapeHtml(ev.title || "") +
        "</a><em>✦</em>";
    }).join("");

    var ticker = document.createElement("nav");
    ticker.className = "lud-ticker lud-ticker-events";
    ticker.setAttribute("aria-label", "Événements des 8 prochains jours");
    ticker.innerHTML = tickerTrack(
      '<a href="#agenda" style="font-style:italic">Sous 8 jours :</a><em>✦</em>' + items
    );
    afterEl.insertAdjacentElement("afterend", ticker);
  }

  /* =========================================================
     N°12 — L'ENCRE QUI RÉVÈLE : le voile violet se résorbe
     à l'entrée de chaque section dans l'écran.
  ========================================================= */
  function setupInkReveal() {
    if (!opt("inkReveal") || reduceMotion || !("IntersectionObserver" in window)) return;
    var targets = document.querySelectorAll(
      ".home-magazine-card, .agenda-calendar-panel, .agenda-map-panel-block, " +
      ".saved-events-section, .past-events-section, .site-footer-card"
    );
    if (!targets.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("lud-visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (t) {
      t.classList.add("lud-inkreveal");
      io.observe(t);
    });
  }

  /* =========================================================
     N°7 — LE FEUILLETAGE : remplace les « Chargement… »
  ========================================================= */
  function loaderHTML(label) {
    return '<span class="lud-loader" role="status" aria-label="Chargement">' +
      '<span class="lud-loader-book" aria-hidden="true">' +
      '<i class="lb-l"></i><i class="lb-r"></i><i class="lb-f"></i><i class="lb-b"></i>' +
      '</span><span class="lud-loader-txt">' + label + '</span></span>';
  }

  function setupBookLoaders() {
    if (!opt("bookLoader")) return;
    ["results-count", "past-events-count"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && /Chargement/i.test(el.textContent)) {
        el.innerHTML = loaderHTML("Chargement");
      }
    });
  }

  /* =========================================================
     N°8 — LE TAMPON EX-LIBRIS : s'abat sur la carte
     mise en favori (remplace les confettis).
  ========================================================= */
  function setupStamp() {
    if (!opt("stamp")) return;
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-favorite-id]");
      if (!btn) return;
      var wasActive = btn.classList.contains("is-active");
      var inSavedList = Boolean(btn.closest("#favorites-list"));
      if (wasActive || inSavedList) return;
      if (reduceMotion) return;

      var card = btn.closest(".event-card");
      var r = (card || btn).getBoundingClientRect();
      var stamp = document.createElement("div");
      stamp.className = "lud-stamp";
      stamp.setAttribute("aria-hidden", "true");
      stamp.innerHTML = 'Ex-libris<b>Favori</b>Dédicalivres';
      stamp.style.left = (r.left + r.width / 2) + "px";
      stamp.style.top = (r.top + Math.min(r.height / 2, 130)) + "px";
      document.body.appendChild(stamp);
      setTimeout(function () { stamp.remove(); }, 950);
    }, true);
  }

  /* n°3 : coin corné persistant sur les cartes en favori */
  function refreshFavoriteCorners() {
    document.querySelectorAll(".event-card").forEach(function (card) {
      var btn = card.querySelector("[data-favorite-id]");
      card.classList.toggle("lud-favorited", Boolean(btn && btn.classList.contains("is-active")));
    });
  }
  function setupFavoriteCorner() {
    refreshFavoriteCorners();
    window.addEventListener("dedicalivres:cards-rendered", refreshFavoriteCorners);
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-favorite-id]")) setTimeout(refreshFavoriteCorners, 60);
    });
  }

  /* =========================================================
     N°9 — LE SURLIGNEUR : balaie les nombres du compteur
     de résultats à chaque mise à jour.
  ========================================================= */
  function setupHighlighter() {
    if (!opt("highlighter") || !("MutationObserver" in window)) return;
    var el = document.getElementById("results-count");
    if (!el) return;
    var busy = false;
    var mo = new MutationObserver(function () {
      if (busy) return;
      var txt = el.textContent;
      if (!txt || /Chargement/i.test(txt) || el.querySelector(".lud-hl")) return;
      var html = el.innerHTML.replace(/(\d[\d\s]*)/, '<span class="lud-hl">$1</span>');
      if (html === el.innerHTML) return;
      busy = true;
      el.innerHTML = html;
      requestAnimationFrame(function () {
        el.querySelectorAll(".lud-hl").forEach(function (h) { h.classList.add("lud-sweep"); });
        busy = false;
      });
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
  }




  /* ---------- Bouton retour en haut (conservé) ---------- */
  function setupBackTop() {
    if (document.getElementById("lud-back-top")) return;
    var btn = document.createElement("button");
    btn.id = "lud-back-top";
    btn.type = "button";
    btn.setAttribute("aria-label", "Retour en haut de page");
    btn.textContent = "↑";
    document.body.appendChild(btn);
    window.addEventListener("scroll", function () {
      btn.classList.toggle("lud-show", window.scrollY > 600);
    }, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- Cascade du calendrier (conservée) ---------- */
  function staggerCalendar() {
    if (reduceMotion) return;
    document.querySelectorAll(".agenda-calendar-day").forEach(function (d, i) {
      d.style.setProperty("--lud-delay", (i * 12) + "ms");
    });
  }
  function setupCalendarStagger() {
    var grid = document.getElementById("agenda-calendar-grid");
    if (!grid) return;
    staggerCalendar();
    if (!("MutationObserver" in window)) return;
    new MutationObserver(staggerCalendar).observe(grid, { childList: true });
  }
  /* =========================================================
     EASTER EGG — triple-clic sur le logo : pluie de pages
  ========================================================= */
  function setupPageRain() {
    var logo = document.querySelector(".header .logo") ||
               document.querySelector('.header a[href*="index"]');
    if (!logo) return;
    var target = logo.closest("a") || logo;
    var clicks = 0, timer = null, raining = false;

    target.addEventListener("click", function (e) {
      /* le logo est un lien : sur la page d'accueil (sa propre destination),
         on intercepte les clics pour pouvoir les compter ; ailleurs, il
         garde son r\u00f4le normal et l'easter egg vit sur l'accueil. */
      var here = location.pathname.split("/").pop() || "index.html";
      var dest = (target.getAttribute("href") || "index.html").split("#")[0].split("?")[0] || "index.html";
      var samePage = dest === here;
      if (!samePage) return; /* navigation normale */

      e.preventDefault();
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(function () { clicks = 0; }, 900);
      if (clicks >= 3) {
        clicks = 0;
        pageRain();
      }
    });

    function pageRain() {
      if (raining || reduceMotion) return;
      raining = true;
      var count = 26;
      for (var i = 0; i < count; i++) {
        var p = document.createElement("span");
        p.className = "lud-pagefall";
        p.setAttribute("aria-hidden", "true");
        var size = 18 + Math.random() * 22;
        p.innerHTML = SVG_SHEET.replace("{w}", size).replace("{h}", size * 1.2);
        p.style.left = Math.random() * 100 + "vw";
        p.style.setProperty("--fx", (Math.random() * 120 - 60) + "px");
        p.style.setProperty("--fr", (Math.random() * 640 - 320) + "deg");
        p.style.animationDuration = (1.4 + Math.random() * 1.4) + "s";
        p.style.animationDelay = (Math.random() * 0.5) + "s";
        document.body.appendChild(p);
        (function (node) {
          setTimeout(function () { node.remove(); }, 3600);
        })(p);
      }
      setTimeout(function () { raining = false; }, 3600);
    }
  }
})();
