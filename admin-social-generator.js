/* =========================================================
   DÉDICALIVRES — Générateur Instagram robuste V7.6.4
   - Injecte l'interface dans l'onglet Réseaux même si admin.html
     contient encore l'ancienne carte "Instagram IA".
========================================================= */
(function () {
  "use strict";

  const VERSION = "7.8.0-unified-visuals";
  const DEFAULT_EXPORT_WORKER_URL = "https://dedicalivres-daily-export.dedicalivres.workers.dev";
  const SOCIAL_BACKGROUND_URL = "assets/social-visual-background.jpg?v=2026-08-09";
  const SOCIAL_LOGO_URL = "assets/social-visual-logo.png?v=2026-08-09";
  const REGIONS = [
    "Auvergne-Rhône-Alpes",
    "Bourgogne-Franche-Comté",
    "Bretagne",
    "Centre-Val de Loire",
    "Corse",
    "Grand Est",
    "Hauts-de-France",
    "Île-de-France",
    "Normandie",
    "Nouvelle-Aquitaine",
    "Occitanie",
    "Pays de la Loire",
    "Provence-Alpes-Côte d’Azur"
  ];

  const REGION_HASHTAGS = {
    "Auvergne-Rhône-Alpes": ["#AuvergneRhoneAlpes", "#LivreAURA", "#LyonLecture"],
    "Bourgogne-Franche-Comté": ["#BourgogneFrancheComte", "#LivreBFC", "#LectureBourgogne"],
    "Bretagne": ["#Bretagne", "#LivreBretagne", "#LectureBretagne"],
    "Centre-Val de Loire": ["#CentreValDeLoire", "#LivreCentreValDeLoire", "#LectureCentre"],
    "Corse": ["#Corse", "#LivreCorse", "#LectureCorse"],
    "Grand Est": ["#GrandEst", "#LivreGrandEst", "#LectureGrandEst"],
    "Hauts-de-France": ["#HautsDeFrance", "#LivreHDF", "#LectureHautsDeFrance"],
    "Île-de-France": ["#IleDeFrance", "#ParisLivre", "#LectureParis"],
    "Normandie": ["#Normandie", "#LivreNormandie", "#LectureNormandie"],
    "Nouvelle-Aquitaine": ["#NouvelleAquitaine", "#LivreNouvelleAquitaine", "#LectureNA"],
    "Occitanie": ["#Occitanie", "#LivreOccitanie", "#LectureOccitanie"],
    "Pays de la Loire": ["#PaysDeLaLoire", "#LivrePaysDeLaLoire", "#LecturePDL"],
    "Provence-Alpes-Côte d’Azur": ["#PACA", "#ProvenceAlpesCoteDAzur", "#LivrePACA"]
  };

  const BASE_HASHTAGS = [
    "#dedicalivres",
    "#AgendaLitteraire",
    "#SalonDuLivre",
    "#Dedicace",
    "#FestivalDuLivre",
    "#Livres",
    "#Lecture",
    "#Auteurs"
  ];

  const TYPE_HASHTAGS = {
    Salon: ["#SalonDuLivre", "#RencontreLitteraire", "#Livre"],
    Festival: ["#FestivalDuLivre", "#FestivalLitteraire", "#SortieCulturelle"],
    "Dédicace": ["#Dedicace", "#Auteur", "#LivreDedicace"],
    Autre: ["#EvenementLitteraire", "#Culture", "#Lecture"]
  };

  let client = null;
  let events = [];
  let filteredEvents = [];
  let authorPresencesByEvent = new Map();
  let generatedVisuals = [];
  let logoImagePromise = null;
  let officialBrandingPromise = null;
  const selectedIds = new Set();

  const VISUAL_FORMATS = {
    story: {
      label: "Portrait / Story",
      width: 1080,
      height: 1920,
      suffix: "story"
    },
    square: {
      label: "Carré",
      width: 1080,
      height: 1080,
      suffix: "carre"
    },
    feed: {
      label: "Instagram réel 4:5",
      width: 1080,
      height: 1350,
      suffix: "instagram-4-5"
    },
    wide: {
      label: "Large",
      width: 1600,
      height: 900,
      suffix: "large"
    }
  };

  const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";

  ready(() => {
    waitForAdminAuthentication(initWhenReady);
  });

  window.addEventListener("dedicalivres:admin-authenticated", () => {
    waitForAdminAuthentication(initWhenReady);
  });

  function waitForAdminAuthentication(callback) {
    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED === true) {
      callback();
    }
  }

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  function initWhenReady() {
    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED !== true) return;
    if (window.DEDICALIVRES_SOCIAL_GENERATOR_VERSION) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const config = window.DEDICALIVRES_CONFIG;
      const tab = document.getElementById("tab-social");
      if (config && window.supabase && tab) {
        clearInterval(timer);
        client =
          (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
          window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

        if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
          window.DEDICALIVRES_SUPABASE_CLIENT = client;
        }

        injectInterface(tab);
        bindControls();
        loadEvents();
        window.DEDICALIVRES_SOCIAL_GENERATOR_VERSION = VERSION;
      }
      if (attempts > 40) {
        clearInterval(timer);
        console.warn("Générateur Instagram non initialisé : config Supabase ou onglet Réseaux introuvable.");
      }
    }, 150);
  }

  function injectInterface(tab) {
    tab.innerHTML = `
      <section class="social-generator-shell" data-social-generator-version="${VERSION}">
        <article class="social-card instagram-generator-card">
          <div class="social-card-head">
            <div>
              <h3>Générateur Instagram</h3>
              <p>
                Sélectionne des événements à venir, choisis un angle, puis copie une publication prête à adapter sur mobile ou PC.
              </p>
            </div>
            <span class="social-pill">V${VERSION}</span>
          </div>

          <div class="social-generator-workbench">
            <div class="social-compose-panel">
              <div class="social-generator-controls">
                <label>
                  <span>Mode</span>
                  <select id="social-post-mode">
                    <option value="central">Dédicalivres au centre</option>
                    <option value="regional">Focus régional</option>
                    <option value="multi">Multi-régions</option>
                    <option value="story">Story courte</option>
                    <option value="carousel">Carousel Instagram</option>
                  </select>
                </label>

                <label>
                  <span>Région</span>
                  <select id="social-region-filter">
                    <option value="">Toutes les régions</option>
                  </select>
                </label>

                <label>
                  <span>Type</span>
                  <select id="social-type-filter">
                    <option value="">Tous les types</option>
                    <option value="Salon">Salon</option>
                    <option value="Festival">Festival</option>
                    <option value="Dédicace">Dédicace</option>
                    <option value="Autre">Autre</option>
                  </select>
                </label>

                <label>
                  <span>Nombre</span>
                  <select id="social-max-events">
                    <option value="3">3 événements</option>
                    <option value="5" selected>5 événements</option>
                    <option value="8">8 événements</option>
                    <option value="12">12 événements</option>
                  </select>
                </label>
              </div>

              <input
                id="social-event-search"
                class="social-search-input"
                type="search"
                placeholder="Rechercher un événement, une ville, une région…"
              />

              <div class="social-generator-actions mobile-sticky-actions">
                <button id="social-generate-post" class="cyber-btn-primary" type="button">Générer</button>
                <button id="social-copy-post" class="cyber-btn-secondary" type="button">Copier</button>
                <button id="social-clear-selection" class="cyber-btn-danger" type="button">Effacer</button>
              </div>

              <div class="social-selection-tools" aria-label="Sélection rapide événements">
                <button id="social-select-visible" class="cyber-btn-secondary" type="button">Sélectionner les événements visibles</button>
                <button id="social-clear-visible" class="cyber-btn-secondary" type="button">Tout désélectionner</button>
              </div>

              <div class="social-selection-summary" id="social-selection-summary">
                Chargement des événements…
              </div>

              <div id="social-events-selector" class="social-events-selector">
                <p class="priority-empty">Chargement des événements à venir…</p>
              </div>
            </div>

            <div class="social-preview-panel">
              <label class="instagram-caption-wrap">
                <span>Texte généré</span>
                <small>5 hashtags maximum, choisis selon le sujet, le type et la région.</small>
                <textarea
                  id="instagram-caption"
                  rows="14"
                  placeholder="Choisis un mode, sélectionne quelques événements, puis clique sur Générer."
                ></textarea>
              </label>
            </div>
          </div>
        </article>

        <article class="social-card social-visual-generator-card">
          <div class="social-card-head">
            <div>
              <h3>Visuels sociaux automatiques</h3>
              <p>
                Génère des PNG homogènes à partir des événements sélectionnés ou actuellement filtrés :
                story, carré et large, prêts à publier.
              </p>
            </div>
            <span class="social-pill">PNG</span>
          </div>

          <div class="social-visual-controls">
            <label>
              <span>Catégorie</span>
              <select id="visual-category-filter">
                <option value="all">Tous</option>
                <option value="dedicaces">Dédicaces</option>
                <option value="salons-festivals">Salons / Festivals</option>
              </select>
            </label>

            <label>
              <span>Période</span>
              <select id="visual-period-filter">
                <option value="upcoming">À venir</option>
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
                <option value="custom">Dates personnalisées</option>
              </select>
            </label>

            <label class="visual-custom-date" hidden>
              <span>Du</span>
              <input id="visual-date-start" type="date" />
            </label>

            <label class="visual-custom-date" hidden>
              <span>Au</span>
              <input id="visual-date-end" type="date" />
            </label>
          </div>

          <fieldset class="social-visual-formats">
            <legend>Formats à générer</legend>
            <label><input type="checkbox" name="visual-format" value="story" checked /> Portrait / Story</label>
            <label><input type="checkbox" name="visual-format" value="feed" checked /> Instagram réel 4:5</label>
            <label><input type="checkbox" name="visual-format" value="square" checked /> Carré</label>
            <label><input type="checkbox" name="visual-format" value="wide" checked /> Large</label>
          </fieldset>

          <div class="social-generator-actions social-visual-actions">
            <button id="visual-generate" class="cyber-btn-primary" type="button">Générer les visuels</button>
            <button id="visual-download-zip" class="cyber-btn-secondary" type="button" disabled>Télécharger ZIP</button>
            <button id="visual-clear-preview" class="cyber-btn-danger" type="button">Effacer aperçus</button>
          </div>

          <p id="visual-generator-status" class="social-selection-summary" aria-live="polite">
            Les visuels utiliseront les événements sélectionnés, ou les événements visibles si aucune sélection manuelle n’est active.
          </p>

          <div id="visual-preview-grid" class="social-visual-preview-grid">
            <p class="priority-empty">Aucun visuel généré pour le moment.</p>
          </div>
        </article>

        <article class="social-card social-help-card">
          <details>
            <summary>Repères rapides pour choisir le bon mode</summary>
            <ul class="social-tips-list">
              <li><strong>Dédicalivres au centre</strong> : publication générale pour faire rayonner le site.</li>
              <li><strong>Focus régional</strong> : publication locale pour une région précise.</li>
              <li><strong>Multi-régions</strong> : sélection nationale regroupée par territoire.</li>
              <li><strong>Story courte</strong> : texte rapide à utiliser en story ou post bref.</li>
              <li><strong>Carousel</strong> : plan de slides + légende associée.</li>
            </ul>
          </details>
        </article>
      </section>
    `;
  }

  function bindControls() {
    populateRegionFilter();

    [
      "social-region-filter",
      "social-type-filter",
      "social-event-search",
      "social-max-events",
      "visual-category-filter",
      "visual-period-filter",
      "visual-date-start",
      "visual-date-end"
    ].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", applyFiltersAndRender);
      el?.addEventListener("change", applyFiltersAndRender);
    });

    document.getElementById("social-post-mode")?.addEventListener("change", generatePost);
    document.getElementById("social-generate-post")?.addEventListener("click", generatePost);
    document.getElementById("social-copy-post")?.addEventListener("click", copyPost);
    document.getElementById("social-clear-selection")?.addEventListener("click", clearSelection);
    document.getElementById("social-select-visible")?.addEventListener("click", selectVisibleEvents);
    document.getElementById("social-clear-visible")?.addEventListener("click", clearSelection);
    document.getElementById("visual-generate")?.addEventListener("click", generateVisuals);
    document.getElementById("visual-download-zip")?.addEventListener("click", downloadVisualZip);
    document.getElementById("visual-clear-preview")?.addEventListener("click", clearVisualPreview);
  }

  function populateRegionFilter() {
    const select = document.getElementById("social-region-filter");
    if (!select) return;

    REGIONS.forEach((region) => {
      const option = document.createElement("option");
      option.value = region;
      option.textContent = region;
      select.appendChild(option);
    });
  }

  async function loadEvents() {
    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED !== true) return;
    const selector = document.getElementById("social-events-selector");

    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await client
        .from("events")
        .select("id,title,type,country_code,city,region,start_date,end_date,featured,validated,rejected,image_url,website,price")
        .eq("validated", true)
        .eq("rejected", false)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("start_date", { ascending: true });

      if (error) throw error;
      events = (Array.isArray(data) ? data : []).sort(sortByDate);
      await loadAuthorPresences();
      applyFiltersAndRender();
    } catch (error) {
      console.error("Erreur chargement événements réseaux :", error);
      if (selector) selector.innerHTML = `<p class="priority-empty">Impossible de charger les événements.</p>`;
      updateSummary("Erreur de chargement des événements.");
    }
  }

  async function loadAuthorPresences() {
    authorPresencesByEvent = new Map();

    try {
      let response = await client
        .from("event_authors_presence")
        .select("event_id,pseudo,author_profile_url,website,participant_type,validated,rejected")
        .eq("validated", true)
        .or("rejected.is.null,rejected.eq.false");

      if (response.error) {
        response = await client
          .from("event_authors_presence")
          .select("event_id,pseudo,author_profile_url,website,validated,rejected")
          .eq("validated", true)
          .or("rejected.is.null,rejected.eq.false");
      }

      const { data, error } = response;
      if (error) throw error;

      (Array.isArray(data) ? data : []).forEach((row) => {
        if (row.participant_type === "publisher") return;
        const eventId = String(row.event_id || "");
        const pseudo = cleanText(row.pseudo);

        if (!eventId || !pseudo) return;

        if (!authorPresencesByEvent.has(eventId)) {
          authorPresencesByEvent.set(eventId, []);
        }

        const list = authorPresencesByEvent.get(eventId);
        if (!list.some((item) => normalize(item.pseudo) === normalize(pseudo))) {
          list.push({
            pseudo,
            url: row.author_profile_url || row.website || ""
          });
        }
      });
    } catch (error) {
      console.warn("Auteurs validés non chargés pour les visuels :", error);
      authorPresencesByEvent = new Map();
    }
  }

  function applyFiltersAndRender() {
    const max = Number(document.getElementById("social-max-events")?.value || 5);

    syncVisualCustomDates();

    filteredEvents = getFilteredEventPool()
      .slice(0, Math.max(1, max));

    selectedIds.forEach((id) => {
      if (!events.some((event) => String(event.id) === String(id))) {
        selectedIds.delete(id);
      }
    });

    renderSelector();
    updateSummary();
    updateVisualStatus();
  }

  function getFilteredEventPool() {
    const region = document.getElementById("social-region-filter")?.value || "";
    const type = document.getElementById("social-type-filter")?.value || "";
    const search = normalize(document.getElementById("social-event-search")?.value || "");
    const category = document.getElementById("visual-category-filter")?.value || "all";

    return events.filter((event) => {
      const haystack = normalize([event.title, event.city, event.region, event.type].join(" "));

      if (region && event.region !== region) return false;
      if (type && event.type !== type) return false;
      if (category !== "all" && !matchesVisualCategory(event, category)) return false;
      if (!matchesVisualPeriod(event)) return false;
      if (search && !haystack.includes(search)) return false;

      return true;
    });
  }

  function syncVisualCustomDates() {
    const period = document.getElementById("visual-period-filter")?.value || "upcoming";
    const showCustom = period === "custom";

    document.querySelectorAll(".visual-custom-date").forEach((label) => {
      label.hidden = !showCustom;
    });
  }

  function matchesVisualCategory(event, category) {
    const type = normalize(event.type);

    if (category === "dedicaces") return type.includes("dedicace");
    if (category === "salons-festivals") {
      return type.includes("salon") || type.includes("festival");
    }

    return true;
  }

  function matchesVisualPeriod(event) {
    const period = document.getElementById("visual-period-filter")?.value || "upcoming";
    const today = startOfDay(new Date());
    const eventStart = parseLocalDate(event.start_date);
    const eventEnd = parseLocalDate(event.end_date || event.start_date);

    if (!eventStart && !eventEnd) return period === "upcoming";

    const rangeStart = eventStart || eventEnd;
    const rangeEnd = eventEnd || eventStart;

    if (period === "upcoming") {
      return !rangeEnd || rangeEnd >= today;
    }

    if (period === "week") {
      const weekEnd = addDays(today, 6);
      return rangesOverlap(rangeStart, rangeEnd, today, weekEnd);
    }

    if (period === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return rangesOverlap(rangeStart, rangeEnd, monthStart, monthEnd);
    }

    if (period === "custom") {
      const customStart = parseLocalDate(document.getElementById("visual-date-start")?.value) || today;
      const customEnd = parseLocalDate(document.getElementById("visual-date-end")?.value) || customStart;
      return rangesOverlap(rangeStart, rangeEnd, customStart, customEnd);
    }

    return true;
  }

  function renderSelector() {
    const selector = document.getElementById("social-events-selector");
    if (!selector) return;

    if (!filteredEvents.length) {
      selector.innerHTML = `<p class="priority-empty">Aucun événement à venir avec ces filtres.</p>`;
      return;
    }

    selector.innerHTML = filteredEvents.map((event) => {
      const checked = selectedIds.has(String(event.id)) ? "checked" : "";
      return `
        <label class="social-event-choice">
          <input type="checkbox" value="${escapeAttribute(event.id)}" ${checked} />
          <span>
            <strong>${escapeHtml(event.title || "Sans titre")}</strong>
            <small>${escapeHtml(formatDateRange(event.start_date, event.end_date))} · ${escapeHtml([event.city, event.region].filter(Boolean).join(" — "))} · ${escapeHtml(event.type || "Événement")}</small>
          </span>
        </label>
      `;
    }).join("");

    selector.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) selectedIds.add(String(input.value));
        else selectedIds.delete(String(input.value));
        updateSummary();
        updateVisualStatus();
      });
    });
  }

  function getChosenEvents() {
    const selected = events.filter((event) => selectedIds.has(String(event.id)));
    return selected.length ? selected : filteredEvents;
  }

  function selectVisibleEvents() {
    filteredEvents.forEach((event) => {
      if (event?.id) selectedIds.add(String(event.id));
    });

    renderSelector();
    updateSummary();
    updateVisualStatus();
  }

  function getVisualChosenEvents() {
    const selected = events.filter((event) => selectedIds.has(String(event.id)));
    return selected.length ? selected : filteredEvents;
  }

  function updateSummary(customText) {
    const summary = document.getElementById("social-selection-summary");
    if (!summary) return;

    if (customText) {
      summary.textContent = customText;
      return;
    }

    const chosen = getChosenEvents();
    const selectedCount = selectedIds.size;

    summary.textContent = selectedCount
      ? `${selectedCount} événement${selectedCount > 1 ? "s" : ""} sélectionné${selectedCount > 1 ? "s" : ""}.`
      : `${chosen.length} prochain${chosen.length > 1 ? "s" : ""} événement${chosen.length > 1 ? "s" : ""} visible${chosen.length > 1 ? "s" : ""} utilisé${chosen.length > 1 ? "s" : ""} si tu génères maintenant.`;
  }

  function updateVisualStatus(message) {
    const status = document.getElementById("visual-generator-status");
    if (!status) return;

    if (message) {
      status.textContent = message;
      return;
    }

    const chosen = getVisualChosenEvents();
    const selectedCount = selectedIds.size;
    const formats = getSelectedVisualFormats();

    status.textContent = selectedCount
      ? `${selectedCount} événement${selectedCount > 1 ? "s" : ""} sélectionné${selectedCount > 1 ? "s" : ""} · ${formats.length} format${formats.length > 1 ? "s" : ""}.`
      : `${chosen.length} événement${chosen.length > 1 ? "s" : ""} visible${chosen.length > 1 ? "s" : ""} prêt${chosen.length > 1 ? "s" : ""} pour ${formats.length} format${formats.length > 1 ? "s" : ""}.`;
  }

  function generatePost() {
    const caption = document.getElementById("instagram-caption");
    if (!caption) return;

    const chosen = getChosenEvents();
    const mode = document.getElementById("social-post-mode")?.value || "central";

    if (!chosen.length) {
      caption.value = "Aucun événement disponible pour générer une publication.";
      return;
    }

    const renderers = {
      central: renderCentralPost,
      regional: renderRegionalPost,
      multi: renderMultiRegionPost,
      story: renderStoryPost,
      carousel: renderCarouselPost
    };

    caption.value = (renderers[mode] || renderers.central)(chosen);
    caption.focus();
  }

  function renderCentralPost(chosen) {
    return [
      "📚 Dédicalivres rassemble les rendez-vous littéraires partout en France.",
      "",
      "Salons du livre, dédicaces, festivals et rencontres d’auteurs : chaque événement partagé aide les lecteurs à découvrir de nouveaux lieux, de nouveaux auteurs et de nouvelles histoires.",
      "",
      "À découvrir prochainement :",
      renderBullets(chosen),
      "",
      "✨ Retrouvez l’agenda complet sur dedicalivres.fr",
      "",
      renderHashtags(chosen, { includeRegions: true, mode: "central" })
    ].join("\n");
  }

  function renderRegionalPost(chosen) {
    const region = document.getElementById("social-region-filter")?.value || mostCommonRegion(chosen) || "votre région";
    const sameRegion = chosen.filter((event) => !region || event.region === region);
    const list = sameRegion.length ? sameRegion : chosen;

    return [
      `📍 Cette semaine en ${region}`,
      "",
      "Les livres créent des rendez-vous près de chez vous : salons, dédicaces, festivals et rencontres entre auteurs et lecteurs.",
      "",
      "À découvrir :",
      renderBullets(list),
      "",
      "Dédicalivres relaie les événements littéraires partout en France, région par région.",
      "",
      renderHashtags(list, { includeRegions: true, mode: "regional" })
    ].join("\n");
  }

  function renderMultiRegionPost(chosen) {
    const groups = groupByRegion(chosen);
    const lines = [
      "📚 Les prochaines rencontres littéraires à suivre avec Dédicalivres",
      "",
      "Cette sélection traverse plusieurs régions, parce que les livres créent des rendez-vous partout en France.",
      ""
    ];

    Object.entries(groups).forEach(([region, items]) => {
      lines.push(`📍 ${region}`);
      lines.push(renderBullets(items));
      lines.push("");
    });

    lines.push("Retrouvez tous les événements sur dedicalivres.fr");
    lines.push("");
    lines.push(renderHashtags(chosen, { includeRegions: true, mode: "multi" }));
    return lines.join("\n");
  }

  function renderStoryPost(chosen) {
    return [
      "📚 Des rencontres littéraires à ne pas manquer !",
      "",
      "Salons, dédicaces et festivals : retrouvez les prochains événements sur Dédicalivres.fr",
      "",
      renderBullets(chosen.slice(0, 4)),
      "",
      renderHashtags(chosen, { includeRegions: false, mode: "story" })
    ].join("\n");
  }

  function renderCarouselPost(chosen) {
    const slides = ["Slide 1 — Les rendez-vous littéraires de la semaine"];
    chosen.slice(0, 8).forEach((event, index) => {
      slides.push(`Slide ${index + 2} — ${event.title || "Événement littéraire"} · ${formatDateRange(event.start_date, event.end_date)} · ${[event.city, event.region].filter(Boolean).join(" — ")}`);
    });
    slides.push(`Slide ${slides.length + 1} — Retrouvez l’agenda complet sur Dédicalivres.fr`);

    return [
      "📲 Structure carousel Instagram",
      "",
      slides.join("\n"),
      "",
      "Légende proposée :",
      "Dédicalivres rassemble les salons du livre, dédicaces, festivals et rencontres littéraires partout en France.",
      "",
      renderHashtags(chosen, { includeRegions: true, mode: "carousel" })
    ].join("\n");
  }

  function renderBullets(items) {
    return items.map((event) => {
      const place = [event.city, event.region].filter(Boolean).join(" — ");
      const date = formatDateRange(event.start_date, event.end_date);
      return `• ${event.title || "Événement littéraire"}${date ? ` — ${date}` : ""}${place ? ` — ${place}` : ""}`;
    }).join("\n");
  }

  function renderHashtags(items, options = {}) {
    const includeRegions = options.includeRegions !== false;
    const selectedRegion = document.getElementById("social-region-filter")?.value || "";
    const selectedType = document.getElementById("social-type-filter")?.value || "";
    const mode = options.mode || document.getElementById("social-post-mode")?.value || "central";
    const regions = unique(items.map((event) => event.region).filter(Boolean));
    const types = unique(items.map((event) => event.type).filter(Boolean));
    const tags = [];

    addWeighted(tags, "#dedicalivres", 120);
    addWeighted(tags, "#AgendaLitteraire", mode === "story" ? 74 : 95);

    if (selectedType) {
      (TYPE_HASHTAGS[selectedType] || [`#${slugifyHashtag(selectedType)}`]).forEach((tag, index) => {
        addWeighted(tags, tag, 92 - index * 16);
      });
    } else {
      types.slice(0, 2).forEach((type, typeIndex) => {
        (TYPE_HASHTAGS[type] || [`#${slugifyHashtag(type)}`]).forEach((tag, index) => {
          addWeighted(tags, tag, 82 - typeIndex * 12 - index * 9);
        });
      });
    }

    if (includeRegions) {
      const preferredRegions = selectedRegion ? [selectedRegion] : regions.slice(0, mode === "multi" ? 2 : 1);
      preferredRegions.forEach((region, regionIndex) => {
        (REGION_HASHTAGS[region] || [`#${slugifyHashtag(region)}`]).forEach((tag, index) => {
          addWeighted(tags, tag, 88 - regionIndex * 10 - index * 4);
        });
      });
    }

    if (mode === "regional") addWeighted(tags, "#SortieCulturelle", 68);
    if (mode === "multi") addWeighted(tags, "#FranceCulture", 70);
    if (mode === "story") addWeighted(tags, "#Lecture", 84);
    if (mode === "carousel") addWeighted(tags, "#Livres", 76);

    BASE_HASHTAGS.forEach((tag, index) => addWeighted(tags, tag, 64 - index * 3));

    return tags
      .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag, "fr"))
      .reduce((acc, item) => {
        const normalized = item.tag.toLowerCase();
        if (!acc.keys.has(normalized)) {
          acc.keys.add(normalized);
          acc.values.push(item.tag);
        }
        return acc;
      }, { keys: new Set(), values: [] })
      .values
      .slice(0, 5)
      .join(" ");
  }

  function addWeighted(tags, tag, score) {
    const clean = String(tag || "").trim();
    if (!clean || clean === "#") return;
    tags.push({ tag: clean, score });
  }

  async function copyPost() {
    const caption = document.getElementById("instagram-caption");
    if (!caption) return;

    if (!caption.value.trim()) generatePost();

    try {
      await navigator.clipboard.writeText(caption.value);
      showLocalNotice("Texte copié ✔");
    } catch {
      caption.select();
      document.execCommand("copy");
      showLocalNotice("Texte sélectionné / copié ✔");
    }
  }

  function clearSelection() {
    selectedIds.clear();
    document.getElementById("instagram-caption").value = "";
    renderSelector();
    updateSummary();
    updateVisualStatus();
  }

  async function generateVisuals() {
    const button = document.getElementById("visual-generate");
    const previewGrid = document.getElementById("visual-preview-grid");
    const formats = getSelectedVisualFormats();
    const chosen = getVisualChosenEvents();

    if (!previewGrid) return;

    if (!chosen.length) {
      updateVisualStatus("Aucun événement disponible avec ces filtres.");
      return;
    }

    if (!formats.length) {
      updateVisualStatus("Choisis au moins un format à générer.");
      return;
    }

    setButtonLoading(button, true, "Génération…");
    updateVisualStatus(`Génération de ${chosen.length * formats.length} visuel${chosen.length * formats.length > 1 ? "s" : ""}…`);
    previewGrid.innerHTML = `<p class="priority-empty">Composition des visuels en cours…</p>`;

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      generatedVisuals = [];

      for (const event of chosen) {
        const visualEvent = await prepareVisualEvent(event);

        for (const format of formats) {
          const canvas = await renderVisualByFormat(visualEvent, format);
          generatedVisuals.push({
            event: visualEvent,
            format,
            canvas,
            fileName: buildVisualFileName(visualEvent, format)
          });
        }
      }

      renderVisualPreview();
      updateVisualStatus(`${generatedVisuals.length} visuel${generatedVisuals.length > 1 ? "s" : ""} généré${generatedVisuals.length > 1 ? "s" : ""}.`);
    } catch (error) {
      console.error("Erreur génération visuels :", error);
      updateVisualStatus(error.message || "Impossible de générer les visuels.");
      previewGrid.innerHTML = `<p class="priority-empty">La génération a été interrompue.</p>`;
    } finally {
      setButtonLoading(button, false, "Générer les visuels");
      document.getElementById("visual-download-zip")?.toggleAttribute("disabled", !generatedVisuals.length);
    }
  }

  function getSelectedVisualFormats() {
    return Array.from(document.querySelectorAll('input[name="visual-format"]:checked'))
      .map((input) => input.value)
      .filter((value) => VISUAL_FORMATS[value]);
  }

  async function prepareVisualEvent(event) {
    const authors = authorPresencesByEvent.get(String(event.id)) || [];
    const imageUrl = resolveSocialImageUrl(event.image_url);
    const image = await loadSafeImage([
      imageUrl,
      resolveImageUrl(event.image_url)
    ]);

    return {
      id: event.id,
      title: cleanText(event.title) || "Événement littéraire",
      type: cleanText(event.type) || "Événement",
      city: cleanText(event.city),
      region: cleanText(event.region),
      country: countryNameFromCode(event.country_code),
      dateLabel: formatDateRange(event.start_date, event.end_date),
      price: cleanText(event.price),
      image,
      imageUrl,
      url: event.id ? `https://dedicalivres.fr/event.html?id=${encodeURIComponent(event.id)}` : "",
      authors: authors.map((author) => cleanText(author.pseudo)).filter(Boolean).slice(0, 3)
    };
  }

  async function renderVisualByFormat(event, format) {
    try {
      return await renderOfficialVisual(event, format);
    } catch (error) {
      console.warn("Maquette officielle indisponible, utilisation du rendu de secours :", error);
      if (format === "story") return renderStoryVisual(event);
      if (format === "feed") return renderFeedVisual(event);
      if (format === "square") return renderSquareVisual(event);
      return renderWideVisual(event);
    }
  }

  async function renderOfficialVisual(event, format) {
    const visualFormat = VISUAL_FORMATS[format] || VISUAL_FORMATS.feed;
    const canvas = createVisualCanvas(visualFormat);
    const ctx = canvas.getContext("2d");
    const branding = await loadOfficialBranding();
    const theme = getOfficialEventTheme(event.type);
    const layout = calculateOfficialLayout(event, canvas.width, canvas.height);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawOfficialVisualBackground(ctx, branding.background, canvas.width, canvas.height);

    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);

    const margin = Math.max(54, Math.round(canvas.width * .067));
    const headerY = Math.max(72, Math.min(112, Math.round(canvas.height * .06)));
    const brandFont = Math.max(20, Math.min(30, Math.round(canvas.width * .022)));
    const subFont = Math.max(15, Math.min(22, Math.round(canvas.width * .017)));

    ctx.fillStyle = "#ff6b35";
    ctx.font = `900 ${brandFont}px Inter, Arial, sans-serif`;
    ctx.fillText("DÉDICALIVRES", margin, headerY);
    ctx.fillStyle = "#3b176f";
    ctx.font = `800 ${subFont}px Inter, Arial, sans-serif`;
    ctx.fillText("ASSOCIATION · AGENDA LITTÉRAIRE FRANCOPHONE", margin, headerY + Math.round(subFont * 1.55));

    drawOfficialPill(ctx, getTypeBadge(event.type), margin, headerY + Math.round(subFont * 2.7), theme.primary, "#ffffff");
    drawOfficialImageFrame(ctx, event.image, event, layout.image, theme);
    drawOfficialPresentation(ctx, event, layout.presentation, theme, layout.mode);
    drawOfficialBrandSignature(ctx, branding.logo, theme, canvas.width, canvas.height);
    return canvas;
  }

  function calculateOfficialLayout(event, canvasWidth, canvasHeight) {
    const margin = Math.max(54, Math.round(canvasWidth * .067));
    const topSafe = Math.max(155, Math.round(canvasHeight * .159));
    const bottomSafe = Math.max(92, Math.round(canvasHeight * .152));
    const bounds = {
      x: margin,
      y: topSafe,
      width: canvasWidth - margin * 2,
      height: canvasHeight - topSafe - bottomSafe
    };
    const imageWidth = event.image?.naturalWidth || event.image?.width || 0;
    const imageHeight = event.image?.naturalHeight || event.image?.height || 0;
    const ratio = imageWidth && imageHeight ? imageWidth / imageHeight : 1.45;
    const canvasRatio = canvasWidth / canvasHeight;
    const titleLength = String(event.title || "").length;
    const placeLength = [event.city, event.region, event.country].filter(Boolean).join(" · ").length;
    const authorLength = event.authors?.join(", ").length || 0;
    const textNeed = 365
      + Math.min(180, Math.max(0, titleLength - 32) * 1.8)
      + Math.min(70, Math.max(0, String(event.dateLabel || "").length - 22) * 1.5)
      + Math.min(100, Math.max(0, placeLength - 28) * 1.7)
      + Math.min(90, authorLength * 1.2);

    if (canvasRatio >= 1.35) {
      const gap = Math.max(30, Math.round(canvasWidth * .035));
      const presentationWidth = Math.round(bounds.width * .42);
      const imageBoxWidth = bounds.width - presentationWidth - gap;
      const sharedHeight = Math.min(bounds.height, Math.max(420, Math.min(bounds.height, textNeed + 170)));
      const top = bounds.y + (bounds.height - sharedHeight) / 2;
      return {
        mode: "wide",
        presentation: { x: bounds.x, y: top, width: presentationWidth, height: sharedHeight },
        image: { x: bounds.x + presentationWidth + gap, y: top, width: imageBoxWidth, height: sharedHeight }
      };
    }

    if (ratio < .84) {
      const gap = 28;
      const maxImageWidth = Math.min(500, bounds.width - gap - 390);
      let imageBoxWidth = Math.max(285, Math.min(maxImageWidth, bounds.height * ratio));
      const imageBoxHeight = Math.min(bounds.height, imageBoxWidth / Math.max(ratio, .2));
      imageBoxWidth = Math.min(maxImageWidth, imageBoxHeight * ratio);
      const presentationWidth = bounds.width - imageBoxWidth - gap;
      const sharedHeight = Math.min(bounds.height, Math.max(imageBoxHeight, Math.min(820, textNeed + 160)));
      const top = bounds.y + (bounds.height - sharedHeight) / 2;
      return {
        mode: "portrait",
        image: { x: bounds.x, y: top + (sharedHeight - imageBoxHeight) / 2, width: imageBoxWidth, height: imageBoxHeight },
        presentation: { x: bounds.x + imageBoxWidth + gap, y: top, width: presentationWidth, height: sharedHeight }
      };
    }

    if (ratio <= 1.18) {
      const gap = 28;
      const imageBoxWidth = Math.min(555, bounds.width - gap - 350);
      const imageBoxHeight = Math.min(700, imageBoxWidth / Math.max(ratio, .2));
      const presentationWidth = bounds.width - imageBoxWidth - gap;
      const sharedHeight = Math.min(bounds.height, Math.max(imageBoxHeight, Math.min(780, textNeed + 170)));
      const top = bounds.y + (bounds.height - sharedHeight) / 2;
      return {
        mode: "balanced",
        image: { x: bounds.x, y: top + (sharedHeight - imageBoxHeight) / 2, width: imageBoxWidth, height: imageBoxHeight },
        presentation: { x: bounds.x + imageBoxWidth + gap, y: top, width: presentationWidth, height: sharedHeight }
      };
    }

    const gap = 26;
    const presentationHeight = Math.min(540, Math.max(430, textNeed));
    const imageMaxHeight = bounds.height - gap - presentationHeight;
    const naturalHeight = bounds.width / ratio;
    const imageBoxHeight = Math.min(imageMaxHeight, Math.max(350, naturalHeight));
    const imageBoxWidth = Math.min(bounds.width, imageBoxHeight * ratio);
    const totalHeight = imageBoxHeight + gap + presentationHeight;
    const top = bounds.y + (bounds.height - totalHeight) / 2;
    return {
      mode: "landscape",
      image: { x: bounds.x + (bounds.width - imageBoxWidth) / 2, y: top, width: imageBoxWidth, height: imageBoxHeight },
      presentation: { x: bounds.x, y: top + imageBoxHeight + gap, width: bounds.width, height: presentationHeight }
    };
  }

  function drawOfficialImageFrame(ctx, image, event, box, theme) {
    ctx.save();
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = theme.imageFill;
    roundedPath(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedPath(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.clip();
    if (image) {
      const inset = Math.max(12, Math.min(22, Math.round(Math.min(box.width, box.height) * .035)));
      drawOfficialImageContainRounded(
        ctx,
        image,
        box.x + inset,
        box.y + inset,
        box.width - inset * 2,
        box.height - inset * 2,
        Math.max(18, Math.round(34 - inset / 2)),
        theme
      );
    } else {
      drawOfficialImageFallback(ctx, event, box, theme);
    }
    ctx.restore();

    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 6;
    roundedPath(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.stroke();
  }

  function drawOfficialPresentation(ctx, event, box, theme, mode) {
    const compact = box.width < 430;
    const padding = compact ? 26 : 34;
    const innerX = box.x + padding;
    const innerWidth = box.width - padding * 2;
    const bottom = box.y + box.height - padding;

    ctx.save();
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    roundedPath(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = theme.secondary;
    ctx.lineWidth = 5;
    roundedPath(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.stroke();

    const badgeY = box.y + padding;
    drawOfficialPill(ctx, getTypeBadge(event.type), innerX, badgeY, theme.primary, "#ffffff", compact ? 17 : 19);

    const titleY = badgeY + (compact ? 72 : 80);
    const sourceHeight = compact ? 62 : 68;
    const sourceY = bottom - sourceHeight;
    const metaBottom = sourceY - 18;
    const place = [event.city, event.region, event.country].filter(Boolean).join(" · ");
    const authors = event.authors?.length ? `Ils ont indiqué leur présence sur Dédicalivres : ${event.authors.join(", ")}` : "";
    const textLayout = calculateOfficialTextLayout(ctx, {
      title: event.title || "Événement littéraire",
      date: event.dateLabel || "",
      place,
      authors,
      price: event.price || ""
    }, innerWidth, Math.max(120, metaBottom - titleY), compact, mode);
    let currentY = titleY;

    ctx.fillStyle = "#271c35";
    ctx.font = `700 ${textLayout.title.fontSize}px Georgia, serif`;
    drawOfficialWrappedLines(ctx, textLayout.title.lines, innerX, currentY, textLayout.title.lineHeight);
    currentY += textLayout.title.height + textLayout.gapTitle;

    ctx.fillStyle = theme.secondary;
    ctx.font = `900 ${textLayout.date.fontSize}px Inter, Arial, sans-serif`;
    drawOfficialWrappedLines(ctx, textLayout.date.lines, innerX, currentY, textLayout.date.lineHeight);
    currentY += textLayout.date.height + textLayout.gapMeta;

    if (textLayout.place.lines.length) {
      ctx.fillStyle = "#64586f";
      ctx.font = `700 ${textLayout.place.fontSize}px Inter, Arial, sans-serif`;
      drawOfficialWrappedLines(ctx, textLayout.place.lines, innerX, currentY, textLayout.place.lineHeight);
      currentY += textLayout.place.height + textLayout.gapMeta;
    }

    if (textLayout.authors.lines.length) {
      ctx.fillStyle = "#64586f";
      ctx.font = `700 ${textLayout.authors.fontSize}px Inter, Arial, sans-serif`;
      drawOfficialWrappedLines(ctx, textLayout.authors.lines, innerX, currentY, textLayout.authors.lineHeight);
      currentY += textLayout.authors.height + textLayout.gapMeta;
    }

    if (event.price) {
      drawOfficialPill(ctx, event.price, innerX, currentY - Math.round(textLayout.priceFont * .9), theme.pale, theme.secondary, textLayout.priceFont);
    }

    ctx.strokeStyle = theme.guide;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(innerX, sourceY);
    ctx.lineTo(innerX + innerWidth, sourceY);
    ctx.stroke();
    ctx.fillStyle = "#64586f";
    ctx.font = `700 ${compact ? 15 : 17}px Inter, Arial, sans-serif`;
    ctx.fillText("Fiche événement disponible sur", innerX, sourceY + (compact ? 24 : 28));
    ctx.fillStyle = theme.secondary;
    ctx.font = `900 ${compact ? 18 : 20}px Inter, Arial, sans-serif`;
    ctx.fillText("dedicalivres.fr", innerX, sourceY + (compact ? 50 : 56));
  }

  function calculateOfficialTextLayout(ctx, content, width, availableHeight, compact, mode) {
    const minimumScale = compact ? .46 : .52;
    let scale = 1;
    let result = null;
    while (scale >= minimumScale) {
      const titleFont = Math.max(compact ? 17 : 20, Math.round((compact ? 38 : 46) * scale));
      const dateFont = Math.max(compact ? 14 : 16, Math.round((compact ? 24 : 28) * scale));
      const placeFont = Math.max(compact ? 13 : 15, Math.round((compact ? 20 : 23) * scale));
      const authorFont = Math.max(13, placeFont - 1);
      const priceFont = Math.max(13, Math.round((compact ? 15 : 17) * scale));
      const gapTitle = Math.max(12, Math.round((compact ? 19 : 23) * scale));
      const gapMeta = Math.max(9, Math.round((compact ? 15 : 18) * scale));
      const title = measureOfficialCompleteText(ctx, content.title, width, titleFont, "700", "Georgia, serif", 1.12);
      const date = measureOfficialCompleteText(ctx, content.date, width, dateFont, "900", "Inter, Arial, sans-serif", 1.18);
      const place = measureOfficialCompleteText(ctx, content.place, width, placeFont, "700", "Inter, Arial, sans-serif", 1.2);
      const authors = measureOfficialCompleteText(ctx, content.authors, width, authorFont, "700", "Inter, Arial, sans-serif", 1.2);
      const blocks = [date, place, authors].filter((block) => block.lines.length).length;
      const totalHeight = title.height + gapTitle + date.height + place.height + authors.height
        + Math.max(0, blocks - 1) * gapMeta
        + (content.price ? gapMeta + priceFont + 26 : 0);
      result = { title, date, place, authors, priceFont, gapTitle, gapMeta, totalHeight, scale, mode };
      if (totalHeight <= availableHeight) return result;
      scale -= .04;
    }
    return result;
  }

  function measureOfficialCompleteText(ctx, text, width, fontSize, weight, family, lineHeightRatio) {
    const value = cleanText(text);
    if (!value) return { lines: [], height: 0, fontSize, lineHeight: 0 };
    ctx.font = `${weight} ${fontSize}px ${family}`;
    const lines = wrapOfficialLinesComplete(ctx, value, width);
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    return { lines, height: lines.length * lineHeight, fontSize, lineHeight };
  }

  function wrapOfficialLinesComplete(ctx, text, width) {
    const lines = [];
    let current = "";
    cleanText(text).split(/\s+/).filter(Boolean).forEach((word) => {
      const pieces = ctx.measureText(word).width > width ? breakOfficialLongToken(ctx, word, width) : [word];
      pieces.forEach((piece) => {
        const candidate = current ? `${current} ${piece}` : piece;
        if (current && ctx.measureText(candidate).width > width) {
          lines.push(current);
          current = piece;
        } else {
          current = candidate;
        }
      });
    });
    if (current) lines.push(current);
    return lines;
  }

  function breakOfficialLongToken(ctx, token, width) {
    const pieces = [];
    let current = "";
    Array.from(String(token || "")).forEach((character) => {
      const candidate = current + character;
      if (current && ctx.measureText(candidate).width > width) {
        pieces.push(current);
        current = character;
      } else {
        current = candidate;
      }
    });
    if (current) pieces.push(current);
    return pieces;
  }

  function drawOfficialWrappedLines(ctx, lines, x, y, lineHeight) {
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  }

  function drawOfficialPill(ctx, text, x, y, background, color, fontSize = 20) {
    ctx.save();
    ctx.font = `900 ${fontSize}px Inter, Arial, sans-serif`;
    const width = Math.min(360, ctx.measureText(text).width + 46);
    const height = fontSize + 26;
    ctx.fillStyle = background;
    roundedPath(ctx, x, y, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x + 23, y + fontSize + 8);
    ctx.restore();
  }

  function drawOfficialImageContainRounded(ctx, image, x, y, width, height, radius, theme) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;
    ctx.save();
    roundedPath(ctx, drawX, drawY, drawWidth, drawHeight, radius);
    ctx.clip();
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = theme.guide;
    ctx.lineWidth = 2;
    roundedPath(ctx, drawX, drawY, drawWidth, drawHeight, radius);
    ctx.stroke();
    ctx.restore();
  }

  function drawOfficialImageFallback(ctx, event, box, theme) {
    const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
    gradient.addColorStop(0, theme.secondary);
    gradient.addColorStop(1, theme.primary);
    ctx.fillStyle = gradient;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.font = `900 ${Math.min(250, Math.round(box.height * .42))}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText("D", box.x + box.width / 2, box.y + box.height * .62);
    ctx.textAlign = "left";
  }

  function drawOfficialVisualBackground(ctx, background, width, height) {
    ctx.fillStyle = "#fff8f2";
    ctx.fillRect(0, 0, width, height);
    if (!background) return;
    const sourceWidth = background.naturalWidth || background.width;
    const sourceHeight = background.naturalHeight || background.height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    ctx.drawImage(background, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  async function loadOfficialBranding() {
    if (!officialBrandingPromise) {
      officialBrandingPromise = Promise.all([
        loadSafeImage(SOCIAL_BACKGROUND_URL),
        loadSafeImage(SOCIAL_LOGO_URL)
      ]).then(([background, logo]) => ({
        background,
        logo: logo ? createOfficialTransparentLogo(logo) : null
      }));
    }
    return officialBrandingPromise;
  }

  function createOfficialTransparentLogo(image) {
    const source = document.createElement("canvas");
    source.width = image.naturalWidth || image.width;
    source.height = image.naturalHeight || image.height;
    const sourceCtx = source.getContext("2d", { willReadFrequently: true });
    sourceCtx.drawImage(image, 0, 0);
    const pixels = sourceCtx.getImageData(0, 0, source.width, source.height);
    const data = pixels.data;
    for (let index = 0; index < data.length; index += 4) {
      const minimum = Math.min(data[index], data[index + 1], data[index + 2]);
      if (minimum >= 246) data[index + 3] = 0;
      else if (minimum >= 228) data[index + 3] = Math.min(data[index + 3], Math.round(((246 - minimum) / 18) * 255));
    }
    sourceCtx.putImageData(pixels, 0, 0);
    return source;
  }

  function drawOfficialBrandSignature(ctx, logo, theme, width, height) {
    const footerTextY = height - Math.max(30, Math.round(height * .04));
    const logoMaxWidth = Math.min(180, Math.round(width * .16));
    const logoMaxHeight = Math.min(112, Math.round(height * .08));
    const logoY = footerTextY - logoMaxHeight - Math.max(18, Math.round(height * .015));
    if (logo?.width && logo?.height) {
      const scale = Math.min(logoMaxWidth / logo.width, logoMaxHeight / logo.height);
      const logoWidth = logo.width * scale;
      const logoHeight = logo.height * scale;
      ctx.drawImage(logo, (width - logoWidth) / 2, logoY, logoWidth, logoHeight);
    }
    ctx.fillStyle = theme.secondary;
    ctx.font = "900 17px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ASSOCIATION · DEDICALIVRES.FR", width / 2, footerTextY);
    ctx.textAlign = "left";
  }

  function getOfficialEventTheme(value) {
    const type = normalize(value);
    if (type.includes("dedicace")) return { primary: "#7137b6", secondary: "#43206f", pale: "#f0e7fa", imageFill: "rgba(113,55,182,.10)", guide: "rgba(113,55,182,.14)", shadow: "rgba(67,32,111,.22)" };
    if (type.includes("festival")) return { primary: "#f06a2f", secondary: "#a83d16", pale: "#fff0e8", imageFill: "rgba(240,106,47,.10)", guide: "rgba(240,106,47,.14)", shadow: "rgba(168,61,22,.22)" };
    if (type.includes("salon")) return { primary: "#2784c7", secondary: "#155580", pale: "#e7f4fc", imageFill: "rgba(39,132,199,.10)", guide: "rgba(39,132,199,.14)", shadow: "rgba(21,85,128,.22)" };
    return { primary: "#24936f", secondary: "#155e49", pale: "#e6f7f1", imageFill: "rgba(36,147,111,.10)", guide: "rgba(36,147,111,.14)", shadow: "rgba(21,94,73,.22)" };
  }

  async function renderStoryVisual(event) {
    const canvas = createVisualCanvas(VISUAL_FORMATS.story);
    const ctx = canvas.getContext("2d");

    drawBrandBackground(ctx, canvas.width, canvas.height, "story");
    await drawLogo(ctx, 76, 68, 174, 74);

    const imageFrame = { x: 618, y: 96, w: 348, h: 348, r: 78 };
    drawImageFrame(ctx, event, imageFrame, { badge: true });

    const card = { x: 78, y: 520, w: 924, h: 1006, r: 56 };
    drawTextCard(ctx, card, event, {
      format: "story",
      titleMax: 6,
      titleFont: 72,
      titleMin: 44,
      metaFont: 34,
      ctaFont: 31
    });

    drawDecorativeLine(ctx, 78, 1624, 924);
    return canvas;
  }

  async function renderFeedVisual(event) {
    const canvas = createVisualCanvas(VISUAL_FORMATS.feed);
    const ctx = canvas.getContext("2d");

    drawBrandBackground(ctx, canvas.width, canvas.height, "feed");
    await drawLogo(ctx, 76, 58, 210, 86);

    const imageFrame = { x: 94, y: 188, w: 892, h: 438, r: 50 };
    drawImageFrame(ctx, event, imageFrame, { badge: true });

    const card = { x: 94, y: 682, w: 892, h: 514, r: 50 };
    drawTextCard(ctx, card, event, {
      format: "feed",
      titleMax: 5,
      titleFont: 58,
      titleMin: 34,
      metaFont: 29,
      ctaFont: 26
    });

    return canvas;
  }

  async function renderSquareVisual(event) {
    const canvas = createVisualCanvas(VISUAL_FORMATS.square);
    const ctx = canvas.getContext("2d");

    drawBrandBackground(ctx, canvas.width, canvas.height, "square");
    await drawLogo(ctx, 402, 58, 276, 104);

    const imageFrame = { x: 104, y: 184, w: 872, h: 330, r: 46 };
    drawImageFrame(ctx, event, imageFrame, { badge: true });

    const card = { x: 104, y: 558, w: 872, h: 372, r: 44 };
    drawTextCard(ctx, card, event, {
      format: "square",
      titleMax: 4,
      titleFont: 50,
      titleMin: 32,
      metaFont: 26,
      ctaFont: 24
    });

    return canvas;
  }

  async function renderWideVisual(event) {
    const canvas = createVisualCanvas(VISUAL_FORMATS.wide);
    const ctx = canvas.getContext("2d");

    drawBrandBackground(ctx, canvas.width, canvas.height, "wide");
    await drawLogo(ctx, 76, 56, 218, 86);

    const card = { x: 76, y: 164, w: 686, h: 594, r: 44 };
    drawTextCard(ctx, card, event, {
      format: "wide",
      titleMax: 5,
      titleFont: 56,
      titleMin: 34,
      metaFont: 28,
      ctaFont: 25
    });

    const imageFrame = { x: 840, y: 128, w: 680, h: 592, r: 50 };
    drawImageFrame(ctx, event, imageFrame, { badge: true });

    return canvas;
  }

  function createVisualCanvas(format) {
    const canvas = document.createElement("canvas");
    canvas.width = format.width;
    canvas.height = format.height;
    return canvas;
  }

  function drawBrandBackground(ctx, width, height, variant) {
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#fff8f4");
    base.addColorStop(.48, "#fbf7ff");
    base.addColorStop(1, "#efe3fa");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = variant === "wide" ? .12 : .16;
    ctx.fillStyle = "#3a1c71";
    ctx.beginPath();
    ctx.ellipse(width * .88, height * .08, width * .34, height * .28, -.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = .18;
    ctx.strokeStyle = "#ff6b35";
    ctx.lineWidth = variant === "story" ? 5 : 4;
    ctx.setLineDash([18, 22]);
    ctx.beginPath();
    ctx.moveTo(width * .10, height * .18);
    ctx.bezierCurveTo(width * .32, height * .02, width * .48, height * .26, width * .70, height * .10);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = .09;
    ctx.strokeStyle = "#3a1c71";
    ctx.lineWidth = 2;
    for (let x = -80; x < width + 80; x += 92) {
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x + width * .28, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  async function drawLogo(ctx, x, y, w, h) {
    const logo = await loadLogoImage();

    if (!logo) {
      drawFallbackLogo(ctx, x, y, w, h);
      return;
    }

    const ratio = Math.min(w / logo.width, h / logo.height);
    const drawW = logo.width * ratio;
    const drawH = logo.height * ratio;
    ctx.drawImage(logo, x, y, drawW, drawH);
  }

  function drawFallbackLogo(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "#3a1c71";
    ctx.font = `900 ${Math.round(Math.min(h * .42, 34))}px Inter, sans-serif`;
    ctx.fillText("Dédicalivres", x, y + h * .58);
    ctx.restore();
  }

  function drawImageFrame(ctx, event, frame, options = {}) {
    ctx.save();
    roundedPath(ctx, frame.x, frame.y, frame.w, frame.h, frame.r);
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);

    if (event.image) {
      drawImageCover(ctx, event.image, frame.x, frame.y, frame.w, frame.h, {
        alpha: .23,
        blur: 18
      });
      drawImageContain(ctx, event.image, frame.x + 18, frame.y + 18, frame.w - 36, frame.h - 36);
    } else {
      drawFallbackVisual(ctx, frame, event);
    }

    ctx.restore();

    ctx.save();
    roundedPath(ctx, frame.x, frame.y, frame.w, frame.h, frame.r);
    ctx.strokeStyle = "rgba(58,28,113,.15)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    if (options.badge) {
      drawTypeBadge(ctx, getTypeBadge(event.type), frame.x + 24, frame.y + frame.h - 68, {
        dark: true,
        maxWidth: frame.w - 48
      });
    }
  }

  function drawFallbackVisual(ctx, frame, event) {
    const gradient = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.w, frame.y + frame.h);
    gradient.addColorStop(0, "#f5ecff");
    gradient.addColorStop(1, "#fff1e8");
    ctx.fillStyle = gradient;
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);

    ctx.save();
    ctx.globalAlpha = .18;
    ctx.fillStyle = "#3a1c71";
    ctx.beginPath();
    ctx.arc(frame.x + frame.w * .72, frame.y + frame.h * .18, Math.min(frame.w, frame.h) * .34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#3a1c71";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.max(30, Math.round(frame.w * .055))}px Inter, sans-serif`;
    wrapCanvasText(ctx, getTypeBadge(event.type), frame.x + frame.w / 2, frame.y + frame.h / 2, frame.w * .72, Math.round(frame.w * .06), 2);
  }

  function drawTextCard(ctx, card, event, options) {
    ctx.save();
    roundedPath(ctx, card.x, card.y, card.w, card.h, card.r);
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.shadowColor = "rgba(58,28,113,.16)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 18;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedPath(ctx, card.x, card.y, card.w, card.h, card.r);
    ctx.strokeStyle = "rgba(58,28,113,.11)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const padding = options.format === "story" ? 62 : options.format === "wide" ? 46 : 44;
    const x = card.x + padding;
    let y = card.y + padding;
    const maxWidth = card.w - padding * 2;

    drawTypeBadge(ctx, getTypeBadge(event.type), x, y, { dark: false, maxWidth });
    y += options.format === "story" ? 86 : 66;

    const titleResult = drawAdaptiveTitle(ctx, event.title, x, y, maxWidth, {
      maxLines: options.titleMax,
      fontSize: options.titleFont,
      minFontSize: options.titleMin,
      lineHeight: 1.08
    });

    y += titleResult.height + (options.format === "story" ? 46 : 28);

    const metaLines = [
      event.dateLabel ? `Date : ${event.dateLabel}` : "",
      formatPlace(event) ? `Lieu : ${formatPlace(event)}` : "",
      event.authors.length ? `Auteur${event.authors.length > 1 ? "s" : ""} : ${event.authors.join(", ")}` : ""
    ].filter(Boolean);

    ctx.fillStyle = "#5f536f";
    ctx.font = `800 ${options.metaFont}px Inter, sans-serif`;
    ctx.textBaseline = "top";

    metaLines.forEach((line) => {
      const used = wrapCanvasText(ctx, line, x, y, maxWidth, Math.round(options.metaFont * 1.42), 2);
      y += used + Math.round(options.metaFont * .48);
    });

    if (event.url) {
      const pillY = Math.min(card.y + card.h - (options.format === "story" ? 142 : 92), y + 18);
      drawCtaPill(ctx, "Fiche événement", x, pillY, options);
    }
  }

  function drawAdaptiveTitle(ctx, title, x, y, maxWidth, options) {
    let fontSize = options.fontSize;
    let lines = [];
    let lineHeight = 0;

    while (fontSize >= options.minFontSize) {
      ctx.font = `900 ${fontSize}px Georgia, "Playfair Display", serif`;
      lineHeight = Math.round(fontSize * options.lineHeight);
      lines = computeWrappedLines(ctx, title, maxWidth, 999);

      if (lines.length <= options.maxLines) break;
      fontSize -= 4;
    }

    ctx.fillStyle = "#2c1944";
    ctx.textBaseline = "top";
    ctx.font = `900 ${fontSize}px Georgia, "Playfair Display", serif`;

    lines = computeWrappedLines(ctx, title, maxWidth, options.maxLines);
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });

    return {
      fontSize,
      lines,
      height: lines.length * lineHeight
    };
  }

  function computeWrappedLines(ctx, text, maxWidth, maxLines) {
    const words = cleanText(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    words.forEach((word) => {
      const test = current ? `${current} ${word}` : word;

      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
        return;
      }

      if (current) lines.push(current);
      current = word;
    });

    if (current) lines.push(current);

    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      clipped[clipped.length - 1] = ellipsizeCanvasLine(ctx, clipped[clipped.length - 1] || "", maxWidth);
      return clipped.map((line) => fitCanvasLine(ctx, line, maxWidth));
    }

    return lines.map((line) => fitCanvasLine(ctx, line, maxWidth));
  }

  function fitCanvasLine(ctx, line, maxWidth) {
    if (ctx.measureText(line).width <= maxWidth) return line;
    return ellipsizeCanvasLine(ctx, line, maxWidth);
  }

  function ellipsizeCanvasLine(ctx, line, maxWidth) {
    let value = cleanText(line);

    while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
      const shorter = value.replace(/\s+\S+$/, "");

      if (shorter && shorter !== value) {
        value = shorter;
      } else {
        value = value.slice(0, -1);
      }
    }

    return `${value || line.slice(0, 1)}…`;
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
    const lines = computeWrappedLines(ctx, text, maxWidth, maxLines);
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });
    return lines.length * lineHeight;
  }

  function drawTypeBadge(ctx, label, x, y, options = {}) {
    const fontSize = options.dark ? 24 : 22;
    ctx.save();
    ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    const text = label.toUpperCase();
    const paddingX = options.dark ? 24 : 20;
    const width = Math.min((options.maxWidth || 420), ctx.measureText(text).width + paddingX * 2);
    const height = options.dark ? 44 : 40;

    roundedPath(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = options.dark ? "rgba(58,28,113,.82)" : "rgba(58,28,113,.10)";
    ctx.fill();

    ctx.fillStyle = options.dark ? "#ffffff" : "#3a1c71";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, x + paddingX, y + height / 2 + 1, width - paddingX * 2);
    ctx.restore();
  }

  function drawCtaPill(ctx, label, x, y, options) {
    ctx.save();
    ctx.font = `900 ${options.ctaFont}px Inter, sans-serif`;
    const width = Math.min(options.format === "wide" ? 260 : 320, ctx.measureText(label).width + 56);
    const height = options.format === "story" ? 74 : 56;

    roundedPath(ctx, x, y, width, height, height / 2);
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, "#ff6b35");
    gradient.addColorStop(1, "#ff8a57");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + width / 2, y + height / 2 + 1);
    ctx.restore();
  }

  function drawDecorativeLine(ctx, x, y, width) {
    ctx.save();
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, "rgba(255,107,53,.0)");
    gradient.addColorStop(.5, "rgba(58,28,113,.22)");
    gradient.addColorStop(1, "rgba(255,107,53,.0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, 3);
    ctx.restore();
  }

  function drawImageContain(ctx, image, x, y, w, h) {
    const ratio = Math.min(w / image.width, h / image.height);
    const drawW = image.width * ratio;
    const drawH = image.height * ratio;
    const drawX = x + (w - drawW) / 2;
    const drawY = y + (h - drawH) / 2;
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
  }

  function drawImageCover(ctx, image, x, y, w, h, options = {}) {
    const ratio = Math.max(w / image.width, h / image.height);
    const drawW = image.width * ratio;
    const drawH = image.height * ratio;
    const drawX = x + (w - drawW) / 2;
    const drawY = y + (h - drawH) / 2;

    ctx.save();
    ctx.globalAlpha = options.alpha ?? 1;
    if (options.blur) ctx.filter = `blur(${options.blur}px)`;
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  function roundedPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  async function loadLogoImage() {
    if (!logoImagePromise) {
      logoImagePromise = loadSafeImage("logo.png");
    }

    return logoImagePromise;
  }

  function loadSafeImage(sources) {
    return new Promise((resolve) => {
      const candidates = (Array.isArray(sources) ? sources : [sources])
        .map((source) => String(source || "").trim())
        .filter((source, index, list) => source && list.indexOf(source) === index);

      if (!candidates.length) {
        resolve(null);
        return;
      }

      let settled = false;
      let candidateIndex = 0;

      const tryNextCandidate = () => {
        if (settled) return;
        if (candidateIndex >= candidates.length) {
          settled = true;
          resolve(null);
          return;
        }

        const img = new Image();
        const source = candidates[candidateIndex++];
        const timeoutId = window.setTimeout(() => {
          img.onload = null;
          img.onerror = null;
          tryNextCandidate();
        }, 10000);

        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        img.onload = () => {
          if (settled) return;
          window.clearTimeout(timeoutId);
          settled = true;
          resolve(img);
        };
        img.onerror = () => {
          if (settled) return;
          window.clearTimeout(timeoutId);
          tryNextCandidate();
        };
        img.src = source;
      };

      tryNextCandidate();
    });
  }

  function renderVisualPreview() {
    const previewGrid = document.getElementById("visual-preview-grid");
    if (!previewGrid) return;

    if (!generatedVisuals.length) {
      previewGrid.innerHTML = `<p class="priority-empty">Aucun visuel généré pour le moment.</p>`;
      document.getElementById("visual-download-zip")?.setAttribute("disabled", "disabled");
      return;
    }

    previewGrid.innerHTML = generatedVisuals.map((visual, index) => {
      const format = VISUAL_FORMATS[visual.format];
      return `
        <article class="social-visual-preview-card">
          <div class="social-visual-preview-canvas" id="visual-preview-canvas-${index}"></div>
          <div class="social-visual-preview-meta">
            <strong>${escapeHtml(format.label)}</strong>
            <span>${escapeHtml(visual.event.title)}</span>
            <button class="cyber-btn-secondary" type="button" data-download-visual="${index}">Télécharger PNG</button>
          </div>
        </article>
      `;
    }).join("");

    generatedVisuals.forEach((visual, index) => {
      const slot = document.getElementById(`visual-preview-canvas-${index}`);
      if (!slot) return;
      const clone = document.createElement("canvas");
      clone.width = visual.canvas.width;
      clone.height = visual.canvas.height;
      clone.getContext("2d").drawImage(visual.canvas, 0, 0);
      slot.appendChild(clone);
    });

    previewGrid.querySelectorAll("[data-download-visual]").forEach((button) => {
      button.addEventListener("click", () => {
        downloadSingleVisual(Number(button.dataset.downloadVisual));
      });
    });

    document.getElementById("visual-download-zip")?.removeAttribute("disabled");
  }

  async function downloadSingleVisual(index) {
    const visual = generatedVisuals[index];
    if (!visual) return;

    const blob = await canvasToBlob(visual.canvas);
    downloadBlob(blob, visual.fileName);
  }

  async function downloadVisualZip() {
    if (!generatedVisuals.length) {
      updateVisualStatus("Aucun visuel à zipper.");
      return;
    }

    const button = document.getElementById("visual-download-zip");
    setButtonLoading(button, true, "ZIP…");

    try {
      const JSZip = await loadZipLibrary();
      const zip = new JSZip();

      for (const visual of generatedVisuals) {
        const blob = await canvasToBlob(visual.canvas);
        zip.file(visual.fileName, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      downloadBlob(content, `dedicalivres-visuels-${new Date().toISOString().slice(0, 10)}.zip`);
      updateVisualStatus("ZIP généré.");
    } catch (error) {
      console.error("Erreur ZIP visuels :", error);
      updateVisualStatus("Impossible de générer le ZIP. Les PNG individuels restent disponibles.");
    } finally {
      setButtonLoading(button, false, "Télécharger ZIP");
    }
  }

  function loadZipLibrary() {
    return new Promise((resolve, reject) => {
      if (window.JSZip) {
        resolve(window.JSZip);
        return;
      }

      const existing = document.querySelector(`script[src="${JSZIP_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.JSZip));
        existing.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = JSZIP_URL;
      script.async = true;
      script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error("JSZip non disponible."));
      script.onerror = () => reject(new Error("Chargement JSZip impossible."));
      document.body.appendChild(script);
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Export PNG impossible."));
      }, "image/png");
    });
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function clearVisualPreview() {
    generatedVisuals = [];
    const previewGrid = document.getElementById("visual-preview-grid");
    if (previewGrid) previewGrid.innerHTML = `<p class="priority-empty">Aucun visuel généré pour le moment.</p>`;
    document.getElementById("visual-download-zip")?.setAttribute("disabled", "disabled");
    updateVisualStatus();
  }

  function setButtonLoading(button, loading, text) {
    if (!button) return;
    button.disabled = loading;
    button.textContent = text;
  }

  function getTypeBadge(type) {
    const normalized = normalize(type);

    if (normalized.includes("salon") && normalized.includes("festival")) return "Salon / Festival";
    if (normalized.includes("dedicace")) return "Dédicace";
    if (normalized.includes("festival")) return "Festival";
    if (normalized.includes("salon")) return "Salon";

    return cleanText(type) || "Événement";
  }

  function formatPlace(event) {
    return [event.city, event.region].filter(Boolean).join(", ");
  }

  function resolveImageUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${window.DEDICALIVRES_CONFIG?.assetsBaseUrl || ""}${path}`;
  }

  function resolveSocialImageUrl(path) {
    const source = String(path || "").trim();
    if (!source) return "";
    if (/^(data:|blob:)/i.test(source)) return source;

    const config = window.DEDICALIVRES_CONFIG || {};
    const workerBase = String(config.exportsBaseUrl || DEFAULT_EXPORT_WORKER_URL)
      .replace(/\/exports\/?$/i, "")
      .replace(/\/+$/, "");
    const mediaBase = `${workerBase}/media`;
    const r2Base = String(config.r2PublicBaseUrl || "").replace(/\/+$/, "");
    const cleanSource = source.split(/[?#]/, 1)[0];

    if (source.startsWith(`${mediaBase}/`)) return source;
    if (/^(event-images|testimonial-images|author-portraits)\//i.test(cleanSource)) {
      return `${mediaBase}/${cleanSource.replace(/^\/+/, "")}`;
    }

    const absolute = resolveImageUrl(source);
    if (r2Base && absolute.startsWith(`${r2Base}/`)) {
      return `${mediaBase}/${absolute.slice(r2Base.length + 1)}`;
    }

    try {
      const url = new URL(absolute, window.location.href);
      if (url.origin === window.location.origin && window.location.protocol !== "file:") {
        return url.toString();
      }
      return `${mediaBase}/remote?url=${encodeURIComponent(url.toString())}`;
    } catch {
      return absolute;
    }
  }

  function countryNameFromCode(code) {
    const normalizedCode = String(code || "FR").trim().toUpperCase();
    if (window.DEDICALIVRES_GEO?.getCountryName) {
      return cleanText(window.DEDICALIVRES_GEO.getCountryName(normalizedCode));
    }
    return ({ FR: "France", BE: "Belgique", CH: "Suisse", LU: "Luxembourg" })[normalizedCode] || normalizedCode;
  }

  function buildVisualFileName(event, format) {
    const suffix = VISUAL_FORMATS[format]?.suffix || format;
    const slug = slugifyFileName(event.title || event.id || "evenement");
    return `dedicalivres-${suffix}-${slug}.png`;
  }

  function showLocalNotice(message) {
    const summary = document.getElementById("social-selection-summary");
    if (!summary) return;
    const previous = summary.textContent;
    summary.textContent = message;
    setTimeout(() => updateSummary(previous && previous !== message ? previous : undefined), 1600);
  }

  function groupByRegion(items) {
    return items.reduce((acc, event) => {
      const key = event.region || "France";
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
  }

  function mostCommonRegion(items) {
    const counts = {};
    items.forEach((event) => {
      if (!event.region) return;
      counts[event.region] = (counts[event.region] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  function sortByDate(a, b) {
    const aTime = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }

  function formatDateRange(start, end) {
    if (!start) return "Date à préciser";
    const s = formatDate(start);
    const e = end && end !== start ? formatDate(end) : "";
    return e ? `${s} → ${e}` : s;
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
    } catch {
      return value || "";
    }
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .toLowerCase()
      .trim();
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!match) {
      const fallback = new Date(value);
      return Number.isNaN(fallback.getTime()) ? null : startOfDay(fallback);
    }

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    if (!startA || !endA || !startB || !endB) return false;
    const aStart = startA <= endA ? startA : endA;
    const aEnd = endA >= startA ? endA : startA;
    const bStart = startB <= endB ? startB : endB;
    const bEnd = endB >= startB ? endB : startB;
    return aStart <= bEnd && aEnd >= bStart;
  }

  function slugifyHashtag(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  function slugifyFileName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "evenement";
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
