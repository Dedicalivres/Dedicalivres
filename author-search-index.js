/*
  DÉDICALIVRES — Recherche par auteur présent
  Fichier : author-search-index.js

  Rôle :
  - ajoute un champ "Rechercher un auteur présent…" dans les filtres de l’agenda
  - charge les auteurs déclarés présents depuis Supabase
  - filtre les cartes déjà affichées par app.js sans modifier app.js
  - ajoute un petit badge "Auteur présent" sur les cartes concernées

  Important :
  - ce script doit être chargé APRÈS app.js dans index.html
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.error("Configuration Supabase manquante pour author-search-index.js");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const filters = document.querySelector(".filters");
  const eventsGrid = document.getElementById("events-grid");
  const resultsCount = document.getElementById("results-count");

  let authorPresences = [];
  let selectedAuthor = "";

  initAuthorSearch();

  async function initAuthorSearch() {
    if (!filters || !eventsGrid) return;

    createAuthorSearchField();
    await loadAuthorPresences();
    bindAuthorSearch();
    observeEventGrid();
    applyAuthorBadgesToCards();
  }

  function createAuthorSearchField() {
    if (document.getElementById("author-filter")) return;

    const input = document.createElement("input");
    input.id = "author-filter";
    input.type = "search";
    input.placeholder = "Rechercher un auteur présent…";
    input.setAttribute("list", "author-suggestions");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-label", "Rechercher un auteur présent");

    const datalist = document.createElement("datalist");
    datalist.id = "author-suggestions";

    const applyButton = document.getElementById("apply-filters");

    if (applyButton) {
      filters.insertBefore(input, applyButton);
    } else {
      filters.appendChild(input);
    }

    filters.appendChild(datalist);
  }

  async function loadAuthorPresences() {
    const { data, error } = await supabaseClient
      .from("event_authors_presence")
      .select("event_id, pseudo")
      .eq("validated", true)
      .order("pseudo", { ascending: true });

    if (error) {
      console.error("Erreur chargement auteurs pour recherche :", error);
      return;
    }

    authorPresences = Array.isArray(data) ? data : [];
    fillSuggestions();
  }

  function fillSuggestions() {
    const datalist = document.getElementById("author-suggestions");
    if (!datalist) return;

    const uniqueAuthors = [...new Set(
      authorPresences
        .map((item) => cleanText(item.pseudo))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "fr"));

    datalist.innerHTML = uniqueAuthors
      .map((pseudo) => `<option value="${escapeAttribute(pseudo)}"></option>`)
      .join("");
  }

  function bindAuthorSearch() {
    const input = document.getElementById("author-filter");
    if (!input) return;

    input.addEventListener("input", () => {
      selectedAuthor = normalize(input.value);
      applyAuthorFilterToCards();
    });

    document.getElementById("reset-filters")?.addEventListener("click", () => {
      input.value = "";
      selectedAuthor = "";
      setTimeout(() => {
        applyAuthorFilterToCards();
        applyAuthorBadgesToCards();
      }, 80);
    });
  }

  function observeEventGrid() {
    const observer = new MutationObserver(() => {
      applyAuthorBadgesToCards();
      applyAuthorFilterToCards();
    });

    observer.observe(eventsGrid, {
      childList: true,
      subtree: false
    });
  }

  function applyAuthorFilterToCards() {
    const cards = [...document.querySelectorAll(".event-card[data-event-id]")];
    if (!cards.length) return;

    if (!selectedAuthor || selectedAuthor.length < 2) {
      cards.forEach((card) => {
        card.hidden = false;
      });
      updateVisibleCount(cards.length);
      return;
    }

    const matchingEventIds = new Set(
      authorPresences
        .filter((item) => normalize(item.pseudo).includes(selectedAuthor))
        .map((item) => String(item.event_id))
    );

    let visibleCount = 0;

    cards.forEach((card) => {
      const eventId = String(card.dataset.eventId);
      const visible = matchingEventIds.has(eventId);

      card.hidden = !visible;

      if (visible) visibleCount++;
    });

    updateVisibleCount(visibleCount);
  }

  function applyAuthorBadgesToCards() {
    const eventIdsWithAuthors = new Set(
      authorPresences.map((item) => String(item.event_id))
    );

    document.querySelectorAll(".event-card[data-event-id]").forEach((card) => {
      const eventId = String(card.dataset.eventId);

      if (!eventIdsWithAuthors.has(eventId)) return;
      if (card.querySelector(".badge-author-present")) return;

      const tagContainer = card.querySelector(".card-tags");
      if (!tagContainer) return;

      const badge = document.createElement("span");
      badge.className = "badge badge-author-present";
      badge.textContent = "Auteur présent";

      tagContainer.appendChild(badge);
    });
  }

  function updateVisibleCount(count) {
    if (!resultsCount) return;

    resultsCount.textContent = `${count} événement${count > 1 ? "s" : ""} affiché${count > 1 ? "s" : ""}`;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .toLowerCase();
  }

  function escapeAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/`/g, "&#096;");
  }
})();
