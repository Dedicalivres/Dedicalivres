/* =========================================================
   DÉDICALIVRES — Générateur Instagram robuste V7.9.1
   - Injecte l'interface dans l'onglet Réseaux même si admin.html
     contient encore l'ancienne carte "Instagram IA".
========================================================= */
(function () {
  "use strict";

  const VERSION = "7.9.1-brand-format-outline";
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
  const selectedIds = new Set();
  const fallbackObjectUrls = [];

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
        <article class="social-card social-publication-hub">
          <div class="social-card-head">
            <div>
              <h3>Publication</h3>
              <p>Prépare ici les textes et extrais un groupe d’événements validés dans un dossier prêt pour Instagram.</p>
            </div>
          </div>
          <div class="social-generator-actions">
            <button id="social-open-events" class="cyber-btn-primary" type="button">Choisir un événement</button>
            <button id="social-open-exports" class="cyber-btn-secondary" type="button">Bibliothèque d’exports</button>
          </div>
        </article>

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
                  <span>Format visuel</span>
                  <select id="social-visual-format">
                    <option value="post" selected>Post carré</option>
                    <option value="story">Story verticale</option>
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
                    <option value="all">Tous les événements</option>
                  </select>
                </label>

                <label>
                  <span>Date de début</span>
                  <input id="social-date-start" type="date" />
                </label>

                <label>
                  <span>Date de fin</span>
                  <input id="social-date-end" type="date" />
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
                <button id="social-select-all" class="cyber-btn-secondary" type="button">Tout sélectionner</button>
                <button id="social-extract-group" class="cyber-btn-primary" type="button">Extraire le groupe</button>
                <button id="social-clear-selection" class="cyber-btn-danger" type="button">Effacer</button>
              </div>

              <div class="social-selection-summary" id="social-selection-summary">
                Chargement des événements…
              </div>

              <div class="social-extraction-status" id="social-extraction-status" role="status" aria-live="polite"></div>

              <div class="social-extraction-downloads" id="social-extraction-downloads"></div>

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
    setDefaultExtractionDates();

    ["social-region-filter", "social-type-filter", "social-event-search", "social-max-events", "social-date-start", "social-date-end"].forEach((id) => {
      const el = document.getElementById(id);
      if (id === "social-date-start" || id === "social-date-end") {
        el?.addEventListener("change", loadEvents);
      } else {
        el?.addEventListener("input", applyFiltersAndRender);
        el?.addEventListener("change", applyFiltersAndRender);
      }
    });

    document.getElementById("social-post-mode")?.addEventListener("change", generatePost);
    document.getElementById("social-generate-post")?.addEventListener("click", generatePost);
    document.getElementById("social-copy-post")?.addEventListener("click", copyPost);
    document.getElementById("social-select-all")?.addEventListener("click", selectAllVisible);
    document.getElementById("social-extract-group")?.addEventListener("click", extractGroup);
    document.getElementById("social-clear-selection")?.addEventListener("click", clearSelection);
    document.getElementById("social-open-events")?.addEventListener("click", () => {
      document.querySelector('.admin-tab[data-tab="events"]')?.click();
    });
    document.getElementById("social-open-exports")?.addEventListener("click", () => {
      document.querySelector('.admin-tab[data-tab="exports"]')?.click();
    });
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

  function setDefaultExtractionDates() {
    const start = document.getElementById("social-date-start");
    const end = document.getElementById("social-date-end");
    if (!start || !end) return;
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    start.value = today.toISOString().slice(0, 10);
    end.value = future.toISOString().slice(0, 10);
  }

  async function loadEvents() {
    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED !== true) return;
    const selector = document.getElementById("social-events-selector");
    const dateStart = document.getElementById("social-date-start")?.value || new Date().toISOString().slice(0, 10);
    const dateEnd = document.getElementById("social-date-end")?.value || "";

    if (dateStart && dateEnd && dateStart > dateEnd) {
      if (selector) selector.innerHTML = `<p class="priority-empty">La date de début doit précéder la date de fin.</p>`;
      updateSummary("Période invalide.");
      return;
    }

    if (selector) selector.innerHTML = `<p class="priority-empty">Chargement des événements à venir…</p>`;
    updateSummary("Chargement des événements…");

    try {
      const { data, error } = await client
        .from("events")
        .select("id,title,type,city,region,start_date,end_date,description,price,image_url,featured,validated,rejected")
        .eq("validated", true)
        .or("rejected.eq.false,rejected.is.null")
        .gte("start_date", dateStart)
        .lte("start_date", dateEnd || "9999-12-31")
        .limit(500)
        .order("start_date", { ascending: true });

      if (error) throw error;
      events = (Array.isArray(data) ? data : []).map(repairEventText).sort(sortByDate);
      applyFiltersAndRender();
    } catch (error) {
      console.error("Erreur chargement événements réseaux :", error);
      if (selector) selector.innerHTML = `<p class="priority-empty">Impossible de charger les événements.</p>`;
      updateSummary("Erreur de chargement des événements.");
    }
  }

  function applyFiltersAndRender() {
    const region = document.getElementById("social-region-filter")?.value || "";
    const type = document.getElementById("social-type-filter")?.value || "";
    const search = normalize(document.getElementById("social-event-search")?.value || "");
    const maxValue = document.getElementById("social-max-events")?.value || "5";
    const max = maxValue === "all" ? Infinity : Number(maxValue);
    const dateStart = document.getElementById("social-date-start")?.value || "";
    const dateEnd = document.getElementById("social-date-end")?.value || "";

    filteredEvents = events
      .filter((event) => {
        const haystack = normalize([event.title, event.city, event.region, event.type].join(" "));
        if (region && event.region !== region) return false;
        if (type && event.type !== type) return false;
        if (search && !haystack.includes(search)) return false;
        const eventStart = event.start_date || "";
        const eventEnd = event.end_date || eventStart;
        if (dateStart && (!eventEnd || eventEnd < dateStart)) return false;
        if (dateEnd && (!eventStart || eventStart > dateEnd)) return false;
        return true;
      })
      .slice(0, Number.isFinite(max) ? Math.max(1, max) : undefined);

    renderSelector();
    updateSummary();
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
      });
    });
  }

  function getChosenEvents() {
    const selected = filteredEvents.filter((event) => selectedIds.has(String(event.id)));
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
    const selectedRegion = options.region || document.getElementById("social-region-filter")?.value || "";
    const selectedType = options.type || document.getElementById("social-type-filter")?.value || "";
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

  function selectAllVisible() {
    if (!filteredEvents.length) {
      showLocalNotice("Aucun événement dans cette période.");
      return;
    }

    const allSelected = filteredEvents.every((event) => selectedIds.has(String(event.id)));
    filteredEvents.forEach((event) => {
      if (allSelected) selectedIds.delete(String(event.id));
      else selectedIds.add(String(event.id));
    });
    renderSelector();
    updateSummary();
  }

  function clearSelection() {
    selectedIds.clear();
    document.getElementById("instagram-caption").value = "";
    renderSelector();
    updateSummary();
  }

  async function extractGroup() {
    const status = document.getElementById("social-extraction-status");
    const button = document.getElementById("social-extract-group");
    const chosen = getChosenEvents();
    const dateStart = document.getElementById("social-date-start")?.value || "";
    const dateEnd = document.getElementById("social-date-end")?.value || "";
    const visualFormat = getSelectedVisualFormat();

    if (!chosen.length) {
      showLocalNotice("Aucun événement à extraire.");
      return;
    }
    if (dateStart && dateEnd && dateStart > dateEnd) {
      showLocalNotice("La date de début doit précéder la date de fin.");
      return;
    }

    if (button) button.disabled = true;
    if (status) status.textContent = `Préparation de ${chosen.length} événement${chosen.length > 1 ? "s" : ""}…`;

    try {
      const globalText = buildGroupPostText(chosen, dateStart, dateEnd);
      const zipFiles = [{
        path: "texte-global.txt",
        blob: new Blob([globalText], { type: "text/plain;charset=utf-8" })
      }];

      for (let index = 0; index < chosen.length; index += 1) {
        const event = chosen[index];
        if (status) status.textContent = `Visuels ${index + 1}/${chosen.length} : ${event.title || "Événement"}`;
        const slides = await renderEventSlides(event);
        const folderName = `${String(index + 1).padStart(2, "0")}-${slugifyFileName(event.title || "evenement")}`;

        slides.forEach((blob, slideIndex) => {
          zipFiles.push({
            path: `${folderName}/slide-${slideIndex + 1}.png`,
            blob
          });
        });
      }

      const manifest = [
        "Extraction Instagram Dédicalivres",
        `Période : ${dateStart || "sans début"} → ${dateEnd || "sans fin"}`,
        `Format : ${visualFormat.label} (${visualFormat.width}×${visualFormat.height})`,
        `Événements : ${chosen.length}`,
        "",
        ...chosen.map((event, index) => `${String(index + 1).padStart(2, "0")} — ${event.title || "Événement"} — ${event.start_date || "date à préciser"}`)
      ].join("\n");

      zipFiles.push({
        path: "manifest.txt",
        blob: new Blob([manifest], { type: "text/plain;charset=utf-8" })
      });

      const zipBlob = await createZipBlob(zipFiles);
      const zipName = buildZipName(dateStart, dateEnd);
      renderZipDownload(zipBlob, zipName);
      if (status) status.textContent = `ZIP prêt : ${zipName}`;
      showLocalNotice("Extraction Instagram terminée ✔");
    } catch (error) {
      console.error("Extraction Instagram impossible", error);
      if (status) status.textContent = `Extraction interrompue : ${error.message || error}`;
      showLocalNotice("Erreur pendant l’extraction.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function buildGroupPostText(chosen, dateStart, dateEnd) {
    const mode = document.getElementById("social-post-mode")?.value || "central";
    const period = dateStart || dateEnd
      ? `Du ${formatDate(dateStart || chosen[0]?.start_date)} au ${formatDate(dateEnd || chosen[chosen.length - 1]?.start_date)}`
      : "Les prochains rendez-vous littéraires";
    const globalText = [
      "📚 Dédicalivres — rendez-vous littéraires",
      "",
      period,
      "",
      "À découvrir :",
      renderBullets(chosen),
      "",
      "Retrouvez l’agenda complet sur dedicalivres.fr",
      "",
      renderHashtags(chosen, { includeRegions: true, mode })
    ].join("\n");

    const individualComments = chosen
      .map((event, index) => buildIndividualPostComment(event, index, mode))
      .join("\n\n");

    return [
      globalText,
      "",
      "",
      "============================================================",
      "COMMENTAIRES INDIVIDUELS — UN PAR ÉVÉNEMENT / JEU DE 3 SLIDES",
      "============================================================",
      "",
      individualComments
    ].join("\n");
  }

  function buildIndividualPostComment(event, index, mode) {
    const title = event.title || "Événement littéraire";
    const type = event.type || "Événement littéraire";
    const region = event.region || document.getElementById("social-region-filter")?.value || "France";
    const place = [event.city, event.region].filter(Boolean).join(" · ") || region;
    const date = formatDateRange(event.start_date, event.end_date);
    const description = String(event.description || "").replace(/\s+/g, " ").trim();
    const modeIntro = {
      central: "📚 Un nouveau rendez-vous littéraire à découvrir avec Dédicalivres.",
      regional: `📍 Un rendez-vous littéraire à découvrir en ${region}.`,
      multi: `🗺️ La sélection Dédicalivres fait étape en ${region}.`,
      story: "✨ Un rendez-vous littéraire à ne pas manquer.",
      carousel: "📲 À découvrir dans ce carousel Dédicalivres."
    }[mode] || "📚 Un nouveau rendez-vous littéraire à découvrir avec Dédicalivres.";

    const lines = [
      `--- COMMENTAIRE ${String(index + 1).padStart(2, "0")} — ${title} — SLIDES 1 À 3 ---`,
      "",
      modeIntro,
      "",
      `📖 ${title}`,
      `🏷️ ${type}`,
      date ? `📅 ${date}` : "",
      place ? `📍 ${place}` : ""
    ];

    if (description) {
      lines.push("", description.slice(0, 420) + (description.length > 420 ? "…" : ""));
    }

    lines.push(
      "",
      "🔎 Fiche événement disponible sur dedicalivres.fr",
      "",
      renderHashtags([event], {
        includeRegions: true,
        mode,
        region: event.region || region,
        type: event.type || type
      })
    );

    return lines.filter((line, lineIndex) => line || (lineIndex > 0 && lines[lineIndex - 1])).join("\n");
  }

  async function renderEventSlides(event) {
    const visualFormat = getSelectedVisualFormat();
    const [image, background] = await Promise.all([
      loadCanvasImage(event.image_url),
      loadSocialBackground(visualFormat)
    ]);
    const slides = [];
    for (let slide = 1; slide <= 3; slide += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = visualFormat.width;
      canvas.height = visualFormat.height;
      drawEventSlide(canvas, event, image, slide, background, visualFormat);
      try {
        slides.push(await canvasToBlob(canvas));
      } catch {
        const fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.width = visualFormat.width;
        fallbackCanvas.height = visualFormat.height;
        drawEventSlide(fallbackCanvas, event, null, slide, background, visualFormat);
        slides.push(await canvasToBlob(fallbackCanvas));
      }
    }
    return slides;
  }

  function drawEventSlide(canvas, event, image, slide, background, visualFormat) {
    const ctx = canvas.getContext("2d");
    const theme = getAdaptiveTheme(event.type);
    const layout = calculateAdaptiveLayout(ctx, event, image);

    drawVisualBackground(ctx, theme, background, visualFormat);
    const contentScale = Math.min(canvas.width / 1080, canvas.height / 1350);
    ctx.save();
    ctx.translate(
      (canvas.width - 1080 * contentScale) / 2,
      (canvas.height - 1350 * contentScale) / 2
    );
    ctx.scale(contentScale, contentScale);
    ctx.fillStyle = theme.primary;
    ctx.fillRect(0, 0, 18, 1350);
    ctx.fillRect(1062, 0, 18, 1350);

    ctx.fillStyle = "#ff6b35";
    ctx.font = "900 24px Arial, sans-serif";
    ctx.fillText("DÉDICALIVRES", 72, 82);
    ctx.fillStyle = theme.secondary;
    ctx.font = "900 20px Arial, sans-serif";
    ctx.fillText(`SLIDE ${slide} / 3`, 820, 82);
    drawPillCanvas(ctx, event.type || "Événement littéraire", 72, 150, theme.primary, "#ffffff");

    if (slide === 3) {
      drawAdaptiveImageFrame(ctx, image, event, { x: 190, y: 215, width: 700, height: 500 }, theme);
      drawAdaptiveCta(ctx, event, theme);
    } else {
      drawAdaptiveImageFrame(ctx, image, event, layout.image, theme);
      drawAdaptivePresentation(ctx, event, layout.presentation, theme, layout.mode, slide === 2);
    }

    ctx.fillStyle = theme.primary;
    ctx.font = "900 23px Arial, sans-serif";
    ctx.textAlign = "right";
    drawOutlinedText(ctx, "Le livre nous rassemble", 1008, 1265, theme.primary, "rgba(255,255,255,.94)", 4);
    ctx.textAlign = "left";
    ctx.fillStyle = "#6c6278";
    ctx.font = "700 18px Arial, sans-serif";
    drawOutlinedText(ctx, "Informations vérifiées avant publication", 72, 1308, "#6c6278", "rgba(255,255,255,.92)", 3);
    ctx.restore();
  }

  function drawVisualBackground(ctx, theme, background, visualFormat) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    if (background) {
      drawImageCover(ctx, background, 0, 0, width, height, false);
      return;
    }

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#fff9f6");
    gradient.addColorStop(.48, theme.pale);
    gradient.addColorStop(1, "#eee3f5");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

  }

  function calculateAdaptiveLayout(ctx, event, image) {
    const bounds = { x: 72, y: 215, width: 936, height: 930 };
    const ratio = image?.naturalWidth && image?.naturalHeight ? image.naturalWidth / image.naturalHeight : 1.45;
    const titleLength = String(event.title || "").length;
    const textNeed = 320 + Math.min(120, Math.max(0, titleLength - 45) * 1.35);

    if (ratio < .84) {
      const gap = 28;
      const maxImageWidth = Math.min(500, bounds.width - gap - 390);
      const imageWidth = Math.max(285, Math.min(maxImageWidth, bounds.height * ratio));
      const imageHeight = Math.min(bounds.height, imageWidth / Math.max(ratio, .2));
      const presentationWidth = bounds.width - imageWidth - gap;
      const sharedHeight = Math.min(bounds.height, Math.max(imageHeight, Math.min(820, textNeed + 160)));
      const top = bounds.y + (bounds.height - sharedHeight) / 2;
      return {
        mode: "portrait",
        image: { x: bounds.x, y: top + (sharedHeight - imageHeight) / 2, width: imageWidth, height: imageHeight },
        presentation: { x: bounds.x + imageWidth + gap, y: top, width: presentationWidth, height: sharedHeight }
      };
    }

    if (ratio <= 1.18) {
      const gap = 28;
      const imageWidth = Math.min(555, bounds.width - gap - 350);
      const imageHeight = Math.min(700, imageWidth / Math.max(ratio, .2));
      const presentationWidth = bounds.width - imageWidth - gap;
      const sharedHeight = Math.min(bounds.height, Math.max(imageHeight, Math.min(780, textNeed + 170)));
      const top = bounds.y + (bounds.height - sharedHeight) / 2;
      return {
        mode: "balanced",
        image: { x: bounds.x, y: top + (sharedHeight - imageHeight) / 2, width: imageWidth, height: imageHeight },
        presentation: { x: bounds.x + imageWidth + gap, y: top, width: presentationWidth, height: sharedHeight }
      };
    }

    const gap = 26;
    const presentationHeight = Math.min(470, Math.max(420, textNeed));
    const imageMaxHeight = bounds.height - gap - presentationHeight;
    const imageHeight = Math.min(imageMaxHeight, Math.max(350, bounds.width / ratio));
    const imageWidth = Math.min(bounds.width, imageHeight * ratio);
    const totalHeight = imageHeight + gap + presentationHeight;
    const top = bounds.y + (bounds.height - totalHeight) / 2;
    return {
      mode: "landscape",
      image: { x: bounds.x + (bounds.width - imageWidth) / 2, y: top, width: imageWidth, height: imageHeight },
      presentation: { x: bounds.x, y: top + imageHeight + gap, width: bounds.width, height: presentationHeight }
    };
  }

  function drawAdaptiveImageFrame(ctx, image, event, box, theme) {
    ctx.save();
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = theme.pale;
    roundedRectCanvas(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedRectCanvas(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.clip();
    ctx.fillStyle = theme.pale;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    if (image) {
      drawImageCover(ctx, image, box.x, box.y, box.width, box.height, true);
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.fillRect(box.x, box.y, box.width, box.height);
      const inset = Math.max(12, Math.min(22, Math.round(Math.min(box.width, box.height) * .035)));
      drawImageContain(ctx, image, box.x + inset, box.y + inset, box.width - inset * 2, box.height - inset * 2);
    } else {
      drawImageFallback(ctx, event, box.x, box.y, box.width, box.height, theme);
    }
    ctx.restore();
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 6;
    roundedRectCanvas(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.stroke();
  }

  function drawAdaptivePresentation(ctx, event, box, theme, mode, detailed) {
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
    roundedRectCanvas(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = theme.secondary;
    ctx.lineWidth = 5;
    roundedRectCanvas(ctx, box.x, box.y, box.width, box.height, 34);
    ctx.stroke();

    drawPillCanvas(ctx, event.type || "Événement", innerX, box.y + padding + 28, theme.primary, "#fff");
    const titleY = box.y + padding + 112;
    const titleMaxLines = mode === "landscape" ? 3 : 5;
    const title = drawAdaptiveTitle(ctx, event.title || "Événement littéraire", innerX, titleY, innerWidth, titleMaxLines, compact ? 40 : 48, compact ? 27 : 31);
    let currentY = titleY + title.height + (compact ? 18 : 24);
    const metaBottom = bottom - 90;
    ctx.fillStyle = theme.secondary;
    ctx.font = `900 ${compact ? 24 : 29}px Arial, sans-serif`;
    if (currentY <= metaBottom) {
      drawSingleLineEllipsis(ctx, formatDateRange(event.start_date, event.end_date), innerX, currentY, innerWidth);
      currentY += (compact ? 24 : 29) + 23;
    }
    const place = [event.city, event.region].filter(Boolean).join(" · ");
    if (place && currentY <= metaBottom) {
      ctx.fillStyle = "#64586f";
      ctx.font = `700 ${compact ? 20 : 24}px Arial, sans-serif`;
      drawSingleLineEllipsis(ctx, place, innerX, currentY, innerWidth);
      currentY += (compact ? 20 : 24) + 18;
    }
    if (detailed && event.description && currentY <= metaBottom) {
      ctx.fillStyle = "#64586f";
      ctx.font = `700 ${compact ? 17 : 20}px Arial, sans-serif`;
      drawVisualWrappedText(ctx, event.description, innerX, currentY, innerWidth, 3, compact ? 21 : 25);
    }
    ctx.fillStyle = theme.secondary;
    roundedRectCanvas(ctx, innerX, bottom - 66, Math.min(innerWidth, compact ? innerWidth : 390), 66, 20);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${compact ? 21 : 25}px Arial, sans-serif`;
    ctx.fillText("Fiche événement", innerX + (compact ? 24 : 32), bottom - 23);
  }

  function drawAdaptiveCta(ctx, event, theme) {
    ctx.textAlign = "center";
    ctx.fillStyle = theme.secondary;
    ctx.font = "900 46px Georgia, serif";
    drawOutlinedText(ctx, "Le livre nous rassemble", 540, 850, theme.secondary, "rgba(255,255,255,.88)", 5);
    ctx.fillStyle = "#64586f";
    ctx.font = "700 30px Arial, sans-serif";
    drawOutlinedText(ctx, "Retrouvez cet événement sur", 540, 940, "#64586f", "rgba(255,255,255,.86)", 3);
    ctx.fillStyle = theme.primary;
    ctx.font = "900 38px Arial, sans-serif";
    drawOutlinedText(ctx, "dedicalivres.fr", 540, 1000, theme.primary, "rgba(255,255,255,.9)", 4);
    ctx.textAlign = "left";
  }

  function drawImageCover(ctx, image, x, y, width, height, blurred) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.save();
    if (blurred) ctx.filter = "blur(28px) saturate(.82)";
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function drawImageContain(ctx, image, x, y, width, height) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  function drawImageFallback(ctx, event, x, y, width, height, theme) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, theme.secondary);
    gradient.addColorStop(1, theme.primary);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.font = `900 ${Math.min(250, Math.round(height * .42))}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText("D", x + width / 2, y + height * .62);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.min(32, Math.max(18, Math.round(width * .055)))}px Arial, sans-serif`;
    drawSingleLineEllipsis(ctx, event.type || "Événement littéraire", x + 32, y + height - 36, width - 64);
  }

  function drawAdaptiveTitle(ctx, text, x, y, width, maxLines, maxFont, minFont) {
    let fontSize = maxFont;
    let lines = [];
    while (fontSize >= minFont) {
      ctx.font = `700 ${fontSize}px Georgia, serif`;
      lines = wrapCanvasLines(ctx, text, width);
      if (lines.length <= maxLines) break;
      fontSize -= 2;
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = ellipsizeCanvas(ctx, lines[maxLines - 1], width);
    }
    ctx.fillStyle = "#271c35";
    const lineHeight = Math.round(fontSize * 1.12);
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
    return { height: Math.max(lineHeight, lines.length * lineHeight) };
  }

  function drawVisualWrappedText(ctx, text, x, y, width, maxLines, lineHeight) {
    wrapCanvasLines(ctx, text, width).slice(0, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  }

  function wrapCanvasLines(ctx, text, width) {
    const lines = [];
    let line = "";
    String(text || "").trim().split(/\s+/).forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function ellipsizeCanvas(ctx, text, width) {
    let value = String(text || "");
    while (value.length > 1 && ctx.measureText(`${value}…`).width > width) value = value.slice(0, -1);
    return `${value}…`;
  }

  function drawSingleLineEllipsis(ctx, text, x, y, width) {
    ctx.fillText(ellipsizeCanvas(ctx, text, width), x, y);
  }

  function drawOutlinedText(ctx, text, x, y, fill, outline, lineWidth) {
    ctx.save();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function getAdaptiveTheme(type) {
    const value = normalize(type);
    if (value.includes("dedicace")) return { primary: "#7137b6", secondary: "#43206f", pale: "#f0e7fa", guide: "rgba(113,55,182,.14)", shadow: "rgba(67,32,111,.22)" };
    if (value.includes("festival")) return { primary: "#f06a2f", secondary: "#a83d16", pale: "#fff0e8", guide: "rgba(240,106,47,.14)", shadow: "rgba(168,61,22,.22)" };
    if (value.includes("salon")) return { primary: "#2784c7", secondary: "#155580", pale: "#e7f4fc", guide: "rgba(39,132,199,.14)", shadow: "rgba(21,85,128,.22)" };
    return { primary: "#24936f", secondary: "#155e49", pale: "#e6f7f1", guide: "rgba(36,147,111,.14)", shadow: "rgba(21,94,73,.22)" };
  }

  function drawCanvasImage(ctx, image, event, theme, x, y, width, height) {
    ctx.save();
    roundedRectCanvas(ctx, x, y, width, height, 34);
    ctx.clip();
    if (image) {
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.fillRect(x, y, width, height);
    } else {
      const fallback = ctx.createLinearGradient(x, y, x + width, y + height);
      fallback.addColorStop(0, theme.secondary);
      fallback.addColorStop(1, theme.primary);
      ctx.fillStyle = fallback;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.font = "900 220px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("D", x + width / 2, y + height / 2 + 75);
      ctx.textAlign = "left";
    }
    ctx.restore();
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 6;
    roundedRectCanvas(ctx, x, y, width, height, 34);
    ctx.stroke();
  }

  function drawTextBlock(ctx, text, x, y, width, fontSize, color, maxLines) {
    ctx.fillStyle = color;
    ctx.font = `700 ${fontSize}px Georgia, serif`;
    const lines = [];
    let line = "";
    String(text || "").split(/\s+/).forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((value, index) => ctx.fillText(value, x, y + index * Math.round(fontSize * 1.15)));
  }

  function drawPillCanvas(ctx, text, x, y, background, color) {
    ctx.font = "900 22px Arial, sans-serif";
    const width = Math.min(430, ctx.measureText(text).width + 48);
    ctx.fillStyle = background;
    roundedRectCanvas(ctx, x, y - 36, width, 58, 29);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x + 24, y);
  }

  function roundedRectCanvas(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function eventTheme(type) {
    const value = normalize(type);
    if (value.includes("dedicace")) return { primary: "#7137b6", secondary: "#43206f", pale: "#f0e7fa" };
    if (value.includes("festival")) return { primary: "#f06a2f", secondary: "#a83d16", pale: "#fff0e8" };
    if (value.includes("salon")) return { primary: "#2784c7", secondary: "#155580", pale: "#e7f4fc" };
    return { primary: "#24936f", secondary: "#155e49", pale: "#e6f7f1" };
  }

  function loadCanvasImage(source) {
    const url = safeHttpUrl(source);
    if (!url) return Promise.resolve(null);

    const proxyBase = window.DEDICALIVRES_CONFIG?.imageProxyBaseUrl || "";
    const proxyUrl = proxyBase ? `${proxyBase}${encodeURIComponent(url)}` : "";
    return loadCanvasImageCandidate(url).then((image) => image || (proxyUrl ? loadCanvasImageCandidate(proxyUrl) : null));
  }

  const socialBackgroundPromises = new Map();

  function getSelectedVisualFormat() {
    const brand = window.DEDICALIVRES_INSTAGRAM_BRAND;
    const requested = document.getElementById("social-visual-format")?.value
      || (document.getElementById("social-post-mode")?.value === "story" ? "story" : "post");
    return brand?.formats?.[requested] || brand?.formats?.post || {
      label: "Post carré",
      width: 2048,
      height: 2048,
      background: "instagram-background-post.jpg",
      suffix: "post"
    };
  }

  function loadSocialBackground(format) {
    const source = format?.background || "";
    if (!source) return Promise.resolve(null);
    if (!socialBackgroundPromises.has(source)) {
      socialBackgroundPromises.set(source, loadCanvasImageCandidate(source));
    }
    return socialBackgroundPromises.get(source);
  }

  function loadCanvasImageCandidate(source) {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.referrerPolicy = "no-referrer";
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      image.onload = () => {
        try {
          const probe = document.createElement("canvas");
          probe.width = 2;
          probe.height = 2;
          const context = probe.getContext("2d");
          context.drawImage(image, 0, 0, 2, 2);
          context.getImageData(0, 0, 1, 1);
          finish(image);
        } catch {
          finish(null);
        }
      };
      image.onerror = () => finish(null);
      image.src = source;
      window.setTimeout(() => finish(null), 6000);
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG impossible")), "image/png"));
  }

  async function writeTextFile(directory, name, text) {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function writeBinaryFile(directory, name, blob) {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function renderZipDownload(blob, name) {
    const container = document.getElementById("social-extraction-downloads");
    if (!container) return;
    container.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = "ZIP Instagram prêt";
    container.appendChild(title);

    const note = document.createElement("p");
    note.textContent = "Le ZIP conserve un sous-dossier par événement avec ses trois slides, le texte global et le manifeste.";
    container.appendChild(note);

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.textContent = `Télécharger ${name}`;
    link.className = "cyber-btn-primary social-download-all";
    container.appendChild(link);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  function buildZipName(dateStart, dateEnd) {
    const mode = document.getElementById("social-post-mode")?.value || "central";
    const region = document.getElementById("social-region-filter")?.value || "";
    const type = document.getElementById("social-type-filter")?.value || "";
    const format = getSelectedVisualFormat().suffix;
    const criteria = [mode, type, region].filter(Boolean).map(slugifyFileName).join("-");
    return `instagram-${format}-${criteria || "tous-evenements"}-${dateStart || "sans-date"}-${dateEnd || "sans-date"}.zip`;
  }

  async function createZipBlob(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.path);
      const data = new Uint8Array(await file.blob.arrayBuffer());
      const crc = crc32(data);
      const localHeader = new Uint8Array(30 + nameBytes.length + data.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localHeader.set(nameBytes, 30);
      localHeader.set(data, 30 + nameBytes.length);
      localParts.push(localHeader);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);
      offset += localHeader.length;
    }

    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function repairEventText(event) {
    const repaired = { ...event };
    ["title", "type", "city", "region", "description", "price"].forEach((field) => {
      repaired[field] = repairMojibake(event?.[field]);
    });
    return repaired;
  }

  function repairMojibake(value) {
    const text = String(value ?? "");
    if (!/[ÃÂâ�]/.test(text)) return value ?? "";

    try {
      const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff);
      const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return repaired.includes("�") ? text : repaired;
    } catch {
      return text;
    }
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function slugifyFileName(value) {
    return String(value || "evenement")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 70) || "evenement";
  }

  function pause(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
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

  function slugifyHashtag(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "");
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
