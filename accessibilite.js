/* =========================================================
   DÉDICALIVRES — ACCESSIBILITÉ (script)
   Panneau à deux bascules :
   - Confort daltonien (palette Okabe-Ito)
   - Confort dyslexie (police et espacement adaptés)
   Le choix est mémorisé (localStorage) et s'applique
   sur toutes les pages qui incluent cette couche.
========================================================= */
(function () {
  "use strict";

  var KEY = "dedicalivres-a11y";
  var state = { daltonien: false, dyslexie: false, soir: false, ambiance: "aquarelle" };

  /* ---------- Lire et appliquer le choix mémorisé au plus tôt ---------- */
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    state.daltonien = Boolean(saved.daltonien);
    state.dyslexie = Boolean(saved.dyslexie);
    state.soir = Boolean(saved.soir);
    if (["aquarelle", "papier"].indexOf(saved.ambiance) !== -1) {
      state.ambiance = saved.ambiance;
    }
  } catch (e) { /* stockage indisponible : modes non mémorisés */ }
  applyState();

  function applyState() {
    var root = document.documentElement;
    root.classList.toggle("a11y-daltonien", state.daltonien);
    root.classList.toggle("a11y-dyslexie", state.dyslexie);
    root.classList.toggle("a11y-soir", state.soir);
    root.dataset.ambiance = state.ambiance;
    window.dispatchEvent(new CustomEvent("dedicalivres:ambiance", { detail: { ambiance: state.ambiance } }));
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- Construire le panneau ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    if (document.querySelector(".a11y-panel")) return;

    var panel = document.createElement("div");
    panel.className = "a11y-panel";
    panel.innerHTML =
      '<button type="button" class="a11y-toggle" aria-expanded="false" aria-controls="a11y-menu" ' +
      'aria-label="Options d\u2019accessibilit\u00e9 et d\u2019ambiance" title="Confort">' +
        /* pictogramme accessibilité universelle */
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<circle cx="12" cy="4.4" r="2.1"/>' +
        '<path d="M12 7.2c-2.8 0-5.2-.5-6.9-1l-.5 1.9c1.5.5 3.4.9 5.4 1v3.2l-2.5 7.2 1.9.7 2.3-6.4h.6l2.3 6.4 1.9-.7-2.5-7.2V9.1c2-.1 3.9-.5 5.4-1l-.5-1.9c-1.7.5-4.1 1-6.9 1z"/>' +
        '</svg>' +
      '</button>' +
      '<div class="a11y-menu" id="a11y-menu" role="group" aria-label="Modes de confort visuel">' +
        '<h2>Confort &amp; ambiance</h2>' +
        '<p>Ces r\u00e9glages s\u2019appliquent \u00e0 tout le site et sont m\u00e9moris\u00e9s pour vos prochaines visites.</p>' +
        '<button type="button" class="a11y-option" data-mode="daltonien" aria-pressed="false">' +
          '<span class="a11y-ico" aria-hidden="true">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<circle cx="12" cy="12" r="3.2"/>' +
            '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/></svg>' +
          '</span>' +
          '<span><strong>Confort daltonien</strong>' +
          '<small>Palette adapt\u00e9e, types d\u2019\u00e9v\u00e9nements distinguables sans la couleur d\u2019origine.</small></span>' +
          '<span class="a11y-state" aria-hidden="true"></span>' +
        '</button>' +
        '<button type="button" class="a11y-option" data-mode="dyslexie" aria-pressed="false">' +
          '<span class="a11y-ico" aria-hidden="true">Aa</span>' +
          '<span><strong>Confort dyslexie</strong>' +
          '<small>Police d\u00e9di\u00e9e, espacement \u00e9largi, textes immobiles et non justifi\u00e9s.</small></span>' +
          '<span class="a11y-state" aria-hidden="true"></span>' +
        '</button>' +
        '<button type="button" class="a11y-option" data-mode="soir" aria-pressed="false">' +
          '<span class="a11y-ico" aria-hidden="true">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">' +
            '<path d="M20.4 15.3A8.6 8.6 0 0 1 8.7 3.6a.7.7 0 0 0-.9-.9 10 10 0 1 0 13.5 13.5.7.7 0 0 0-.9-.9z"/></svg>' +
          '</span>' +
          '<span><strong>Mode soir</strong>' +
          '<small>Papier encre, texte cr\u00e8me : lecture reposante en faible lumi\u00e8re.</small></span>' +
          '<span class="a11y-state" aria-hidden="true"></span>' +
        '</button>' +
        '<p class="a11y-group-label" id="a11y-ambiance-label">Ambiance de fond</p>' +
        '<div class="a11y-chips" role="group" aria-labelledby="a11y-ambiance-label">' +
          '<button type="button" class="a11y-chip" data-ambiance="aquarelle" aria-pressed="false">Aquarelle</button>' +
          '<button type="button" class="a11y-chip" data-ambiance="papier" aria-pressed="false">Papier \u00e0 lettres</button>' +
        '</div>' +
      '</div>' +
      '<span class="a11y-live" role="status" aria-live="polite"></span>';

    document.body.appendChild(panel);

    /* Entr\u00e9e \u00ab Confort \u00bb dans le menu du header ; le bouton
       flottant ne sert que de repli si le header est absent. */
    var nav = document.querySelector(".header nav");
    if (nav) {
      panel.classList.add("a11y-panel--nav");
      var navBtn = document.createElement("button");
      navBtn.type = "button";
      navBtn.className = "a11y-nav-btn";
      navBtn.setAttribute("aria-expanded", "false");
      navBtn.setAttribute("aria-controls", "a11y-menu");
      navBtn.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<circle cx="12" cy="4.4" r="2.1"/>' +
        '<path d="M12 7.2c-2.8 0-5.2-.5-6.9-1l-.5 1.9c1.5.5 3.4.9 5.4 1v3.2l-2.5 7.2 1.9.7 2.3-6.4h.6l2.3 6.4 1.9-.7-2.5-7.2V9.1c2-.1 3.9-.5 5.4-1l-.5-1.9c-1.7.5-4.1 1-6.9 1z"/></svg>' +
        '<span>Confort</span>';
      var submit = nav.querySelector(".nav-submit-link");
      nav.insertBefore(navBtn, submit || null);
      navBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        flip();
        navBtn.setAttribute("aria-expanded", panel.classList.contains("is-open") ? "true" : "false");
      });
    }


    var toggle = panel.querySelector(".a11y-toggle");
    var menu = panel.querySelector(".a11y-menu");
    var live = panel.querySelector(".a11y-live");
    var options = panel.querySelectorAll(".a11y-option");

    var chips = panel.querySelectorAll(".a11y-chip");
    function refreshButtons() {
      options.forEach(function (btn) {
        var mode = btn.dataset.mode;
        btn.setAttribute("aria-pressed", state[mode] ? "true" : "false");
      });
      chips.forEach(function (chip) {
        chip.setAttribute("aria-pressed", chip.dataset.ambiance === state.ambiance ? "true" : "false");
      });
    }
    refreshButtons();

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.ambiance = chip.dataset.ambiance;
        applyState();
        save();
        refreshButtons();
        live.textContent = "Ambiance " + chip.textContent + " activ\u00e9e";
      });
    });

    /* Ouverture / fermeture du panneau */
    function setOpen(open) {
      panel.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");

    }
    function flip() { setOpen(!panel.classList.contains("is-open")); }
    toggle.addEventListener("click", flip);

    document.addEventListener("click", function (e) {
      if (!panel.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });

    /* Bascules */
    options.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.dataset.mode;
        state[mode] = !state[mode];
        applyState();
        save();
        refreshButtons();
        var labels = {
          daltonien: "Confort daltonien",
          dyslexie: "Confort dyslexie",
          soir: "Mode soir"
        };
        live.textContent = labels[mode] + (state[mode] ? " activ\u00e9" : " d\u00e9sactiv\u00e9");
      });
    });
  });

  /* =========================================================
     SECTION « CONFORT & AMBIANCE » — vitrine avec aperçus
     Injectée au-dessus du footer sur toutes les pages.
     Partage le même état mémorisé que le panneau du menu.
  ========================================================= */
  document.addEventListener("DOMContentLoaded", function () {
    var footer = document.querySelector(".site-footer") || document.querySelector("footer");
    if (!footer || document.querySelector(".a11y-showcase")) return;

    var sec = document.createElement("section");
    sec.className = "a11y-showcase";
    sec.setAttribute("aria-label", "Confort de lecture et ambiance");
    sec.innerHTML =
      '<div class="a11y-showcase-head">' +
        '<h2>Un site confortable pour chaque lecteur</h2>' +
        '<p>Choisissez votre confort : le r\u00e9glage s\u2019applique imm\u00e9diatement, ' +
        'partout sur le site, et sera retenu pour vos prochaines visites.</p>' +
      '</div>' +
      '<div class="a11y-showcase-grid">' +

        '<button type="button" class="a11y-card" data-mode="daltonien" aria-pressed="false">' +
          '<span class="a11y-card-preview" aria-hidden="true">' +
            '<i style="background:#0072B2"></i><i style="background:#E69F00"></i>' +
            '<i style="background:#CC79A7"></i><i style="background:#009E73"></i>' +
          '</span>' +
          '<strong>Confort daltonien</strong>' +
          '<small>Palette Okabe-Ito : les types d\u2019\u00e9v\u00e9nements restent distinguables dans toutes les formes de daltonisme.</small>' +
          '<span class="a11y-card-state"></span>' +
        '</button>' +

        '<button type="button" class="a11y-card" data-mode="dyslexie" aria-pressed="false">' +
          '<span class="a11y-card-preview a11y-prev-dys" aria-hidden="true">Aa Bb Cc</span>' +
          '<strong>Confort dyslexie</strong>' +
          '<small>Police d\u00e9di\u00e9e, lettres espac\u00e9es, textes immobiles et jamais justifi\u00e9s.</small>' +
          '<span class="a11y-card-state"></span>' +
        '</button>' +

        '<button type="button" class="a11y-card" data-mode="soir" aria-pressed="false">' +
          '<span class="a11y-card-preview a11y-prev-soir" aria-hidden="true"><b></b><i></i><i></i></span>' +
          '<strong>Mode soir</strong>' +
          '<small>Papier encre et texte cr\u00e8me pour lire sans \u00e9blouir, \u00e0 la lampe de chevet.</small>' +
          '<span class="a11y-card-state"></span>' +
        '</button>' +

        '<div class="a11y-card a11y-card--amb">' +
          '<strong>Ambiance de fond</strong>' +
          '<div class="a11y-amb-choices">' +
            '<button type="button" class="a11y-amb" data-ambiance="aquarelle" aria-pressed="false">' +
              '<span class="a11y-card-preview a11y-prev-aqua" aria-hidden="true"></span>Aquarelle</button>' +
            '<button type="button" class="a11y-amb" data-ambiance="papier" aria-pressed="false">' +
              '<span class="a11y-card-preview a11y-prev-papier" aria-hidden="true"></span>Papier \u00e0 lettres</button>' +
          '</div>' +
        '</div>' +

      '</div>';
    footer.parentNode.insertBefore(sec, footer);

    function refreshShowcase() {
      sec.querySelectorAll(".a11y-card[data-mode]").forEach(function (c) {
        var on = state[c.dataset.mode];
        c.setAttribute("aria-pressed", on ? "true" : "false");
        c.querySelector(".a11y-card-state").textContent = on ? "Activ\u00e9 \u2713" : "Activer";
      });
      sec.querySelectorAll(".a11y-amb").forEach(function (b) {
        b.setAttribute("aria-pressed", b.dataset.ambiance === state.ambiance ? "true" : "false");
      });
    }
    refreshShowcase();
    /* applyState d\u00e9clenche cet \u00e9v\u00e9nement \u00e0 chaque changement, d'o\u00f9 qu'il vienne */
    window.addEventListener("dedicalivres:ambiance", refreshShowcase);

    function syncPanel() {
      document.querySelectorAll(".a11y-option[data-mode]").forEach(function (btn) {
        btn.setAttribute("aria-pressed", state[btn.dataset.mode] ? "true" : "false");
      });
      document.querySelectorAll(".a11y-chip[data-ambiance]").forEach(function (chip) {
        chip.setAttribute("aria-pressed", chip.dataset.ambiance === state.ambiance ? "true" : "false");
      });
    }

    sec.addEventListener("click", function (e) {
      var mode = e.target.closest(".a11y-card[data-mode]");
      var amb = e.target.closest(".a11y-amb");
      if (mode) { state[mode.dataset.mode] = !state[mode.dataset.mode]; }
      else if (amb) { state.ambiance = amb.dataset.ambiance; }
      else return;
      applyState(); save(); refreshShowcase(); syncPanel();
    });
  });

})();
