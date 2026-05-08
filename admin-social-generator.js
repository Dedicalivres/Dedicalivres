/* =========================================================
   DÉDICALIVRES — Générateur Instagram multi-modes V7.6.1b
   Fichier isolé : ne modifie pas admin.js
========================================================= */
(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.warn("Générateur Instagram désactivé : configuration Supabase manquante.");
    return;
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

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

  let events = [];
  let filteredEvents = [];
  const selectedIds = new Set();

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(initSocialGenerator, 250);
  });

  function initSocialGenerator() {
    const selector = document.getElementById("social-events-selector");
    const caption = document.getElementById("instagram-caption");

    if (!selector || !caption) {
      return;
    }

    populateRegionFilter();
    bindControls();
    loadEvents();
  }

  function bindControls() {
    ["social-region-filter", "social-type-filter", "social-event-search", "social-max-events"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", applyFiltersAndRender);
      document.getElementById(id)?.addEventListener("change", applyFiltersAndRender);
    });

    document.getElementById("social-post-mode")?.addEventListener("change", generatePost);
    document.getElementById("social-generate-post")?.addEventListener("click", generatePost);
    document.getElementById("social-copy-post")?.addEventListener("click", copyPost);
    document.getElementById("social-clear-selection")?.addEventListener("click", clearSelection);
  }

  function populateRegionFilter() {
    const select = document.getElementById("social-region-filter");
    if (!select || select.options.length > 1) return;

    REGIONS.forEach((region) => {
      const option = document.createElement("option");
      option.value = region;
      option.textContent = region;
      select.appendChild(option);
    });
  }

  async function loadEvents() {
    const selector = document.getElementById("social-events-selector");
    if (selector) {
      selector.innerHTML = `<p class="priority-empty">Chargement des événements à venir…</p>`;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await client
      .from("events")
      .select("id,title,type,city,region,start_date,end_date,featured,validated,rejected")
      .eq("validated", true)
      .eq("rejected", false)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("start_date", { ascending: true });

    if (error) {
      console.error("Erreur chargement événements réseaux :", error);
      if (selector) selector.innerHTML = `<p class="priority-empty">Impossible de charger les événements.</p>`;
      return;
    }

    events = (Array.isArray(data) ? data : []).sort(sortByDate);
    applyFiltersAndRender();
  }

  function applyFiltersAndRender() {
    const region = document.getElementById("social-region-filter")?.value || "";
    const type = document.getElementById("social-type-filter")?.value || "";
    const search = normalize(document.getElementById("social-event-search")?.value || "");
    const max = Number(document.getElementById("social-max-events")?.value || 5);

    filteredEvents = events.filter((event) => {
      const haystack = normalize([event.title, event.city, event.region, event.type].join(" "));
      if (region && event.region !== region) return false;
      if (type && event.type !== type) return false;
      if (search && !haystack.includes(search)) return false;
      return true;
    }).slice(0, Math.max(1, max));

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

  function updateSummary() {
    const summary = document.getElementById("social-selection-summary");
    if (!summary) return;

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

    const text = {
      central: renderCentralPost,
      regional: renderRegionalPost,
      multi: renderMultiRegionPost,
      story: renderStoryPost,
      carousel: renderCarouselPost
    }[mode](chosen);

    caption.value = text;
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
      "Les rencontres autour du livre vivent aussi près de chez vous : salons, dédicaces, festivals et moments d’échange entre auteurs et lecteurs.",
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
    const grouped = groupByRegion(chosen);
    const parts = [
      "📚 Les prochaines rencontres littéraires à suivre avec Dédicalivres",
      "",
      "Cette sélection traverse plusieurs régions, parce que les livres créent des rendez-vous partout en France.",
      ""
    ];

    Object.entries(grouped).forEach(([region, list]) => {
      parts.push(`📍 ${region}`);
      parts.push(renderBullets(list));
      parts.push("");
    });

    parts.push("Retrouvez tous les événements sur dedicalivres.fr");
    parts.push("");
    parts.push(renderHashtags(chosen, true));

    return parts.join("\n").trim();
  }

  function renderStoryPost(chosen) {
    return [
      "📚 Des rencontres littéraires à ne pas manquer !",
      "",
      renderBullets(chosen.slice(0, 5)),
      "",
      "Agenda complet sur dedicalivres.fr",
      "",
      renderHashtags(chosen, false)
    ].join("\n");
  }

  function renderCarouselPost(chosen) {
    const slides = [
      "🎠 Structure carousel Instagram",
      "",
      "Slide 1 — Les rendez-vous littéraires à venir avec Dédicalivres"
    ];

    chosen.slice(0, 8).forEach((event, index) => {
      slides.push(`Slide ${index + 2} — ${event.title || "Événement littéraire"}`);
      slides.push(`${formatDateRange(event.start_date, event.end_date)} · ${[event.city, event.region].filter(Boolean).join(" — ")}`);
    });

    slides.push(`Slide ${Math.min(chosen.length, 8) + 2} — Retrouvez l’agenda complet sur dedicalivres.fr`);
    slides.push("");
    slides.push("Légende proposée :");
    slides.push(renderCentralPost(chosen));

    return slides.join("\n");
  }

  function renderBullets(list) {
    return list.map((event) => {
      const date = formatDateRange(event.start_date, event.end_date);
      const place = [event.city, event.region].filter(Boolean).join(" — ");
      return `• ${event.title || "Événement littéraire"}${date ? ` — ${date}` : ""}${place ? ` — ${place}` : ""}`;
    }).join("\n");
  }

  function renderHashtags(list, includeRegions) {
    const tags = [...BASE_HASHTAGS];

    if (includeRegions) {
      const regions = [...new Set(list.map((event) => event.region).filter(Boolean))];
      regions.forEach((region) => {
        const regionalTags = REGION_HASHTAGS[region] || [`#${slugTag(region)}`];
        regionalTags.forEach((tag) => tags.push(tag));
      });
    }

    return [...new Set(tags)].slice(0, 28).join(" ");
  }

  async function copyPost() {
    const caption = document.getElementById("instagram-caption");
    if (!caption || !caption.value.trim()) {
      generatePost();
    }

    try {
      await navigator.clipboard.writeText(caption.value);
      flashSummary("Texte copié. Tu peux le coller dans Instagram.");
    } catch {
      caption.select();
      document.execCommand("copy");
      flashSummary("Texte sélectionné et copié si le navigateur l’autorise.");
    }
  }

  function clearSelection() {
    selectedIds.clear();
    document.getElementById("instagram-caption").value = "";
    renderSelector();
    updateSummary();
  }

  function flashSummary(message) {
    const summary = document.getElementById("social-selection-summary");
    if (!summary) return;
    const previous = summary.textContent;
    summary.textContent = message;
    setTimeout(() => {
      updateSummary();
      if (!summary.textContent) summary.textContent = previous;
    }, 2200);
  }

  function sortByDate(a, b) {
    const dateA = new Date(a.start_date || "2999-12-31").getTime();
    const dateB = new Date(b.start_date || "2999-12-31").getTime();
    return dateA - dateB;
  }

  function groupByRegion(list) {
    return list.reduce((acc, event) => {
      const key = event.region || "France";
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
  }

  function mostCommonRegion(list) {
    const counts = list.reduce((acc, event) => {
      if (!event.region) return acc;
      acc[event.region] = (acc[event.region] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = endDate && endDate !== startDate ? formatDate(endDate) : "";
    return end ? `${start} → ${end}` : start;
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(new Date(value));
    } catch {
      return value;
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

  function slugTag(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "").replace(/^./, (c) => c.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
