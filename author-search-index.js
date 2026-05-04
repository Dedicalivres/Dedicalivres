/*
  DÉDICALIVRES — Recherche + affichage auteurs présents sur les cartes
  VERSION STABLE CLEAN
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !window.supabase) {
    console.error("Config Supabase manquante");
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
    await loadAuthors();

    bindSearch();
    observeGrid();

    applyAuthorsToCards();
  }

  function createAuthorSearchField() {
    if (document.getElementById("author-filter")) return;

    const input = document.createElement("input");
    input.id = "author-filter";
    input.placeholder = "Rechercher un auteur présent…";
    input.setAttribute("list", "author-suggestions");

    const datalist = document.createElement("datalist");
    datalist.id = "author-suggestions";

    const applyBtn = document.getElementById("apply-filters");

    if (applyBtn) filters.insertBefore(input, applyBtn);
    else filters.appendChild(input);

    filters.appendChild(datalist);
  }

  async function loadAuthors() {
    const { data, error } = await supabaseClient
      .from("event_authors_presence")
      .select("event_id, pseudo, website");

    if (error) {
      console.error(error);
      return;
    }

    authorPresences = data || [];
    fillSuggestions();
  }

  function fillSuggestions() {
    const list = document.getElementById("author-suggestions");
    if (!list) return;

    const uniques = [...new Set(authorPresences.map(a => a.pseudo))];

    list.innerHTML = uniques
      .map(a => `<option value="${a}"></option>`)
      .join("");
  }

  function bindSearch() {
    const input = document.getElementById("author-filter");
    if (!input) return;

    const run = () => {
      selectedAuthor = normalize(input.value);
      filterCards();
    };

    input.addEventListener("input", run);
    input.addEventListener("change", run);
    input.addEventListener("keyup", run);

    document.getElementById("apply-filters")?.addEventListener("click", () => {
      setTimeout(run, 100);
    });

    document.getElementById("reset-filters")?.addEventListener("click", () => {
      input.value = "";
      selectedAuthor = "";

      setTimeout(() => {
        showAll();
        applyAuthorsToCards();
      }, 100);
    });
  }

  function observeGrid() {
    new MutationObserver(() => {
      applyAuthorsToCards();
      filterCards();
    }).observe(eventsGrid, { childList: true });
  }

  function filterCards() {
    const cards = [...document.querySelectorAll(".event-card[data-event-id]")];

    if (!selectedAuthor || selectedAuthor.length < 2) {
      showAll();
      return;
    }

    const ids = new Set(
      authorPresences
        .filter(a => normalize(a.pseudo).includes(selectedAuthor))
        .map(a => String(a.event_id))
    );

    let count = 0;

    cards.forEach(card => {
      const visible = ids.has(card.dataset.eventId);
      card.hidden = !visible;
      if (visible) count++;
    });

    resultsCount.textContent =
      count === 0
        ? "Aucun événement trouvé pour cet auteur"
        : `${count} événement(s) affiché(s)`;
  }

  function showAll() {
    const cards = document.querySelectorAll(".event-card");
    cards.forEach(c => (c.hidden = false));

    resultsCount.textContent = `${cards.length} événement(s) affiché(s)`;
  }

  function applyAuthorsToCards() {
    const map = new Map();

    authorPresences.forEach(a => {
      if (!map.has(a.event_id)) map.set(a.event_id, []);
      map.get(a.event_id).push(a);
    });

    document.querySelectorAll(".event-card").forEach(card => {
      const id = card.dataset.eventId;
      const authors = map.get(id) || [];

      if (!authors.length) return;

      addBadge(card);
      addLine(card, authors);
    });
  }

  function addBadge(card) {
    if (card.querySelector(".badge-author")) return;

    const tag = card.querySelector(".card-tags");
    if (!tag) return;

    const el = document.createElement("span");
    el.className = "badge badge-author";
    el.textContent = "Auteur présent";

    tag.appendChild(el);
  }

  function addLine(card, authors) {
    const meta = card.querySelector(".card-meta");
    if (!meta) return;

    if (card.querySelector(".authors-line")) return;

    const el = document.createElement("span");
    el.className = "authors-line";

    el.innerHTML =
      "👤 " +
      authors
        .map(a => `<a href="${a.website}" target="_blank">${a.pseudo}</a>`)
        .join(", ");

    meta.appendChild(el);
  }

  function normalize(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }
})();
