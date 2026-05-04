/*
  DÉDICALIVRES — Recherche + affichage auteurs présents sur les cartes
  Fichier : author-search-index.js

  À charger APRÈS app.js dans index.html :
  <script src="author-search-index.js"></script>

  Ce module :
  - ajoute le filtre "Rechercher un auteur présent…"
  - charge les auteurs déclarés présents depuis Supabase
  - filtre les cartes par auteur
  - ajoute sur chaque carte concernée :
      badge "Auteur présent"
      ligne publique "👤 Auteurs présents : ..."
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

    applyAuthorsToCards();
    applyAuthorFilterToCards();
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
      .select("event_id, pseudo, website")
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
        applyAuthorsToCards();
        applyAuthorFilterToCards();
      }, 80);
    });
  }

  function observeEventGrid() {
    const observer = new MutationObserver(() => {
      applyAuthorsToCards();
      applyAuthorFilterToCards();
    });

    observer.observe(eventsGrid, {
      childList: true,
      subtree: false
    });
  }

  /*
    Ajoute le badge + la ligne "Auteurs présents" sur chaque carte événement.
    Le script ne modifie pas app.js : il enrichit le HTML généré après coup.
  */
  function applyAuthorsToCards() {
    const authorsByEventId = groupAuthorsByEventId();

    document.querySelectorAll(".event-card[data-event-id]").forEach((card) => {
      const eventId = String(card.dataset.eventId);
      const authors = authorsByEventId.get(eventId) || [];

      if (!authors.length) {
        removeAuthorInfo(card);
        return;
      }

      addAuthorBadge(card);
      addAuthorLine(card, authors);
    });
  }

  function addAuthorBadge(card) {
    if (card.querySelector(".badge-author-present")) return;

    const tagContainer = card.querySelector(".card-tags");
    if (!tagContainer) return;

    const badge = document.createElement("span");
    badge.className = "badge badge-author-present";
    badge.textContent = "Auteur présent";

    tagContainer.appendChild(badge);
  }

  function addAuthorLine(card, authors) {
    const meta = card.querySelector(".card-meta");
    if (!meta) return;

    let line = card.querySelector(".card-authors-present");

    if (!line) {
      line = document.createElement("span");
      line.className = "card-authors-present";
      meta.appendChild(line);
    }

    const maxShown = 3;
    const shownAuthors = authors.slice(0, maxShown);
    const remainingCount = authors.length - shownAuthors.length;

    const authorsHtml = shownAuthors
      .map((author) => {
        const pseudo = escapeHtml(author.pseudo);

        if (author.website) {
          return `<a href="${escapeAttribute(author.website)}" target="_blank" rel="noopener noreferrer">${pseudo}</a>`;
        }

        return `<strong>${pseudo}</strong>`;
      })
      .join(", ");

    line.innerHTML = `👤 <strong>Auteurs présents :</strong> ${authorsHtml}${remainingCount > 0 ? ` +${remainingCount}` : ""}`;
  }

  function removeAuthorInfo(card) {
    card.querySelector(".badge-author-present")?.remove();
    card.querySelector(".card-authors-present")?.remove();
  }

  function groupAuthorsByEventId() {
    const map = new Map();

    authorPresences.forEach((item) => {
      const eventId = String(item.event_id || "");
      const pseudo = cleanText(item.pseudo);
      const website = normalizeWebsite(item.website);

      if (!eventId || !pseudo) return;

      if (!map.has(eventId)) map.set(eventId, []);

      const list = map.get(eventId);

      const alreadyExists = list.some((author) => normalize(author.pseudo) === normalize(pseudo));
      if (alreadyExists) return;

      list.push({ pseudo, website });
    });

    return map;
  }

  /*
    Filtre auteur fiable :
    - rien saisi ou moins de 2 caractères => reset
    - recherche souple includes() à partir de 2 caractères
    - si l’utilisateur choisit une suggestion exacte, le résultat sera naturellement précis
  */
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

    if (visibleCount === 0) {
      updateVisibleCount(0, "Aucun événement trouvé pour cet auteur");
      return;
    }

    updateVisibleCount(visibleCount);
  }

  function updateVisibleCount(count, customText) {
    if (!resultsCount) return;

    if (customText) {
      resultsCount.textContent = customText;
      return;
    }

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

  function normalizeWebsite(value) {
    const raw = cleanText(value);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
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
