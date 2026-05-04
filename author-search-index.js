/*
  DÉDICALIVRES — Filtre auteur + affichage auteurs sur cartes
  Version V4 avec liens vers fiches auteurs publiques
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

  init();

  async function init() {
    if (!filters || !eventsGrid) return;

    createAuthorSearchField();
    await loadAuthorPresences();
    bindAuthorSearch();
    observeGrid();

    applyAuthorsToCards();
    filterCardsByAuthor();
  }

  function createAuthorSearchField() {
    if (document.getElementById("author-filter")) return;

    const input = document.createElement("input");
    input.id = "author-filter";
    input.type = "search";
    input.placeholder = "Rechercher un auteur présent…";
    input.setAttribute("list", "author-suggestions");
    input.setAttribute("autocomplete", "off");

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
      .select("event_id, pseudo, website, author_slug, author_id, validated")
      .eq("validated", true);

    if (error) {
      console.error("Erreur chargement auteurs :", error);
      return;
    }

    authorPresences = Array.isArray(data) ? data : [];
    fillSuggestions();
  }

  function fillSuggestions() {
    const datalist = document.getElementById("author-suggestions");
    if (!datalist) return;

    const authors = [...new Set(
      authorPresences
        .map((item) => clean(item.pseudo))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "fr"));

    datalist.innerHTML = authors
      .map((author) => `<option value="${escapeAttribute(author)}"></option>`)
      .join("");
  }

  function bindAuthorSearch() {
    const input = document.getElementById("author-filter");
    if (!input) return;

    const run = () => {
      selectedAuthor = normalize(input.value);
      filterCardsByAuthor();
    };

    input.addEventListener("input", run);
    input.addEventListener("change", run);
    input.addEventListener("keyup", run);

    document.getElementById("apply-filters")?.addEventListener("click", () => {
      setTimeout(() => {
        applyAuthorsToCards();
        run();
      }, 150);
    });

    document.getElementById("reset-filters")?.addEventListener("click", () => {
      input.value = "";
      selectedAuthor = "";

      setTimeout(() => {
        showAllCards();
        applyAuthorsToCards();
      }, 150);
    });
  }

  function observeGrid() {
    const observer = new MutationObserver(() => {
      applyAuthorsToCards();
      filterCardsByAuthor();
    });

    observer.observe(eventsGrid, {
      childList: true,
      subtree: false
    });
  }

  function filterCardsByAuthor() {
    const cards = Array.from(document.querySelectorAll(".event-card[data-event-id]"));

    if (!cards.length) return;

    if (!selectedAuthor || selectedAuthor.length < 2) {
      showAllCards();
      return;
    }

    const matchingEventIds = new Set(
      authorPresences
        .filter((author) => normalize(author.pseudo).includes(selectedAuthor))
        .map((author) => String(author.event_id))
    );

    let visibleCount = 0;

    cards.forEach((card) => {
      const eventId = String(card.dataset.eventId);
      const shouldShow = matchingEventIds.has(eventId);

      card.style.display = shouldShow ? "" : "none";

      if (shouldShow) visibleCount++;
    });

    if (resultsCount) {
      resultsCount.textContent =
        visibleCount === 0
          ? "Aucun événement trouvé pour cet auteur"
          : `${visibleCount} événement${visibleCount > 1 ? "s" : ""} affiché${visibleCount > 1 ? "s" : ""}`;
    }
  }

  function showAllCards() {
    const cards = Array.from(document.querySelectorAll(".event-card[data-event-id]"));

    cards.forEach((card) => {
      card.style.display = "";
    });

    if (resultsCount) {
      resultsCount.textContent = `${cards.length} événement${cards.length > 1 ? "s" : ""} affiché${cards.length > 1 ? "s" : ""}`;
    }
  }

  function applyAuthorsToCards() {
    const authorsByEvent = new Map();

    authorPresences.forEach((author) => {
      const eventId = String(author.event_id || "");
      const pseudo = clean(author.pseudo);
      const website = normalizeWebsite(author.website);
      const slug = clean(author.author_slug);

      if (!eventId || !pseudo) return;

      if (!authorsByEvent.has(eventId)) {
        authorsByEvent.set(eventId, []);
      }

      const list = authorsByEvent.get(eventId);

      if (!list.some((item) => normalize(item.pseudo) === normalize(pseudo))) {
        list.push({ pseudo, website, slug });
      }
    });

    document.querySelectorAll(".event-card[data-event-id]").forEach((card) => {
      const eventId = String(card.dataset.eventId);
      const authors = authorsByEvent.get(eventId) || [];

      card.querySelector(".badge-author-present")?.remove();
      card.querySelector(".card-authors-present")?.remove();

      if (!authors.length) return;

      addBadge(card);
      addAuthorsLine(card, authors);
    });
  }

  function addBadge(card) {
    const tags = card.querySelector(".card-tags");
    if (!tags) return;

    const badge = document.createElement("span");
    badge.className = "badge badge-author-present";
    badge.textContent = "Auteur présent";

    tags.appendChild(badge);
  }

  function addAuthorsLine(card, authors) {
    const meta = card.querySelector(".card-meta");
    if (!meta) return;

    const line = document.createElement("span");
    line.className = "card-authors-present";

    const authorLinks = authors.slice(0, 3).map((author) => {
      const pseudo = escapeHtml(author.pseudo);

      if (author.slug) {
        return `<a href="author.html?slug=${encodeURIComponent(author.slug)}">${pseudo}</a>`;
      }

      if (author.website) {
        return `<a href="${escapeAttribute(author.website)}" target="_blank" rel="noopener noreferrer">${pseudo}</a>`;
      }

      return `<strong>${pseudo}</strong>`;
    });

    const remaining = authors.length > 3 ? ` +${authors.length - 3}` : "";

    line.innerHTML = `👤 <strong>Auteurs présents :</strong> ${authorLinks.join(", ")}${remaining}`;

    meta.appendChild(line);
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .toLowerCase();
  }

  function normalizeWebsite(value) {
    const raw = clean(value);
    if (!raw) return "";
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
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
