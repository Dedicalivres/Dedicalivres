/* =========================================================
   DÉDICALIVRES — Générateur Instagram robuste V7.6.2
   - Injecte l'interface dans l'onglet Réseaux même si admin.html
     contient encore l'ancienne carte "Instagram IA".
========================================================= */
(function () {
  "use strict";

  const VERSION = "7.6.2";
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

  let client = null;
  let events = [];
  let filteredEvents = [];
  const selectedIds = new Set();

  ready(initWhenReady);

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  function initWhenReady() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const config = window.DEDICALIVRES_CONFIG;
      const tab = document.getElementById("tab-social");
      if (config && window.supabase && tab) {
        clearInterval(timer);
        client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
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

          <div class="social-selection-summary" id="social-selection-summary">
            Chargement des événements…
          </div>

          <div id="social-events-selector" class="social-events-selector">
            <p class="priority-empty">Chargement des événements à venir…</p>
          </div>

          <label class="instagram-caption-wrap">
            <span>Texte généré</span>
            <textarea
              id="instagram-caption"
              rows="12"
              placeholder="Choisis un mode, sélectionne quelques événements, puis clique sur Générer."
            ></textarea>
          </label>
        </article>

        <article class="social-card social-help-card">
          <h3>Comment choisir le bon mode ?</h3>
          <ul class="social-tips-list">
            <li><strong>Dédicalivres au centre</strong> : publication générale pour faire rayonner le site.</li>
            <li><strong>Focus régional</strong> : publication locale pour une région précise.</li>
            <li><strong>Multi-régions</strong> : sélection nationale regroupée par territoire.</li>
            <li><strong>Story courte</strong> : texte rapide à utiliser en story ou post bref.</li>
            <li><strong>Carousel</strong> : plan de slides + légende associée.</li>
          </ul>
        </article>
      </section>
    `;
  }

  function bindControls() {
    populateRegionFilter();

    ["social-region-filter", "social-type-filter", "social-event-search", "social-max-events"].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", applyFiltersAndRender);
      el?.addEventListener("change", applyFiltersAndRender);
    });

    document.getElementById("social-post-mode")?.addEventListener("change", generatePost);
    document.getElementById("social-generate-post")?.addEventListener("click", generatePost);
    document.getElementById("social-copy-post")?.addEventListener("click", copyPost);
    document.getElementById("social-clear-selection")?.addEventListener("click", clearSelection);
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
    const selector = document.getElementById("social-events-selector");

    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await client
        .from("events")
        .select("id,title,type,city,region,start_date,end_date,featured,validated,rejected")
        .eq("validated", true)
        .eq("rejected", false)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("start_date", { ascending: true });

      if (error) throw error;
      events = (Array.isArray(data) ? data : []).sort(sortByDate);
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
    const max = Number(document.getElementById("social-max-events")?.value || 5);

    filteredEvents = events
      .filter((event) => {
        const haystack = normalize([event.title, event.city, event.region, event.type].join(" "));
        if (region && event.region !== region) return false;
        if (type && event.type !== type) return false;
        if (search && !haystack.includes(search)) return false;
        return true;
      })
      .slice(0, Math.max(1, max));

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
      renderHashtags(chosen, true)
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
      renderHashtags(list, true)
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
    lines.push(renderHashtags(chosen, true));
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
      renderHashtags(chosen, false)
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
      renderHashtags(chosen, true)
    ].join("\n");
  }

  function renderBullets(items) {
    return items.map((event) => {
      const place = [event.city, event.region].filter(Boolean).join(" — ");
      const date = formatDateRange(event.start_date, event.end_date);
      return `• ${event.title || "Événement littéraire"}${date ? ` — ${date}` : ""}${place ? ` — ${place}` : ""}`;
    }).join("\n");
  }

  function renderHashtags(items, includeRegions) {
    const tags = [...BASE_HASHTAGS];

    if (includeRegions) {
      unique(items.map((event) => event.region).filter(Boolean)).forEach((region) => {
        tags.push(...(REGION_HASHTAGS[region] || [`#${slugifyHashtag(region)}`]));
      });
    }

    return unique(tags).slice(0, 28).join(" ");
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
