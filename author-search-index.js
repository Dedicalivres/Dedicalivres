/*
  DÉDICALIVRES — Filtre auteur + affichage auteurs sur cartes
  Version V6 avec boutons auteurs + halo
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.error("Configuration Supabase manquante pour author-search-index.js");
    return;
  }

  const supabaseClient =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = supabaseClient;
  }

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
    input.placeholder = "Rechercher un auteur signalé…";
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
    let response = await supabaseClient
      .from("event_authors_presence")
      .select("event_id, pseudo, website, author_profile_url, author_slug, author_id, author_portrait_url, participant_type, organization_name, validated, rejected")
      .eq("validated", true)
      .or("rejected.is.null,rejected.eq.false");

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabaseClient
        .from("event_authors_presence")
        .select("event_id, pseudo, website, validated")
        .eq("validated", true);
    }

    if (response.error) {
      console.error("Erreur chargement auteurs :", response.error);
      return;
    }

    authorPresences = (Array.isArray(response.data) ? response.data : []).map((row) => ({
      ...row,
      participant_type: ["author", "artist_author", "hybrid", "publisher"].includes(row.participant_type)
        ? row.participant_type
        : "author"
    }));
    fillSuggestions();
  }

  function fillSuggestions() {
    const datalist = document.getElementById("author-suggestions");
    if (!datalist) return;

    const authors = [...new Set(
      authorPresences
        .filter((item) => item.participant_type !== "publisher")
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
        .filter((author) => author.participant_type !== "publisher")
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
    const participantsByEvent = new Map();

    authorPresences.forEach((participant) => {
      const eventId = String(participant.event_id || "");
      const name = clean(participant.participant_type === "publisher" ? participant.organization_name || participant.pseudo : participant.pseudo);

      if (!eventId || !name) return;

      if (!participantsByEvent.has(eventId)) {
        participantsByEvent.set(eventId, []);
      }

      const list = participantsByEvent.get(eventId);

      if (!list.some((item) => normalize(item.name) === normalize(name) && item.type === participant.participant_type)) {
        list.push({ name, type: participant.participant_type });
      }
    });

    document.querySelectorAll(".event-card[data-event-id]").forEach((card) => {
      const eventId = String(card.dataset.eventId);
      const participants = participantsByEvent.get(eventId) || [];

      card.querySelector(".badge-author-present")?.remove();
      card.querySelector(".card-authors-present")?.remove();

      if (!participants.length) return;

      addBadge(card, participants.length);
      addParticipantsLine(card, participants.length);
    });
  }

  function addBadge(card, count) {
    const tags = card.querySelector(".card-tags");
    if (!tags) return;

    const badge = document.createElement("span");
    badge.className = "badge badge-author-present";
    badge.textContent = `${count} présence${count > 1 ? "s" : ""} déclarée${count > 1 ? "s" : ""}`;

    tags.appendChild(badge);
  }

  function addParticipantsLine(card, count) {
    const meta = card.querySelector(".card-meta");
    if (!meta) return;

    const line = document.createElement("span");
    line.className = "card-authors-present";

    line.innerHTML = `
      <span class="card-authors-label">👥 <strong>${count} participant${count > 1 ? "s se sont signalés" : " s’est signalé"}</strong></span>
    `;

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

  function resolveImageUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${config.assetsBaseUrl || ""}${path}`;
  }

  function getAuthorInitials(value) {
    const words = clean(value)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    const initials = words.map((word) => word[0]).join("").toUpperCase();
    return initials || "A";
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || error?.details || "").toLowerCase();
    return ["42703", "PGRST204"].includes(code) || (
      message.includes("column") &&
      (message.includes("does not exist") || message.includes("schema cache"))
    );
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
