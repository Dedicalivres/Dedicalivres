/* =========================================================
   DÉDICALIVRES — ADMIN V10.0
   Correctif robuste modération auteurs admin

   Objectif :
   - Corriger le module chargé dynamiquement après connexion admin.
   - Afficher les demandes auteurs même si DOMContentLoaded est déjà passé.
   - Gérer les présences directes : pseudo / website.
   - Gérer les présences liées : author_id -> authors.
========================================================= */

(function () {
  "use strict";

  const VERSION = "10.0";
  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.warn("Admin auteurs robuste désactivé : configuration Supabase manquante.");
    return;
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  let rows = [];
  let eventMap = new Map();
  let authorMap = new Map();
  let currentStatus = "pending";
  let currentSearch = "";
  let initialized = false;

  bootAuthorRequestsModule();

  function bootAuthorRequestsModule() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => waitForDashboard());
    } else {
      waitForDashboard();
    }

    window.addEventListener("dedicalivres:admin-authenticated", () => {
      waitForDashboard();
    });

    window.addEventListener("dedicalivres:admin-dashboard-refreshed", () => {
      if (initialized) loadAuthorRequests();
      else waitForDashboard();
    });
  }

  function waitForDashboard(attempt = 0) {
    const moderationPanel = document.getElementById("tab-moderation");

    if (moderationPanel && window.DEDICALIVRES_ADMIN_AUTHENTICATED === true) {
      initPanel(moderationPanel);
      return;
    }

    if (attempt < 40) {
      setTimeout(() => waitForDashboard(attempt + 1), 200);
    }
  }

  function initPanel(moderationPanel) {
    ensureCounterElements();

    if (document.getElementById("author-requests-robust-panel")) {
      initialized = true;
      loadAuthorRequests();
      return;
    }

    const panel = document.createElement("section");
    panel.id = "author-requests-robust-panel";
    panel.className = "admin-panel author-requests-robust-panel";

    panel.innerHTML = `
      <div class="section-head">
        <h3>MODÉRATION AUTEURS</h3>
        <span id="author-requests-robust-count">Chargement…</span>
      </div>

      <div class="author-requests-tools">
        <input
          id="author-requests-robust-search"
          type="search"
          placeholder="Rechercher auteur, événement, ville…"
        />

        <select id="author-requests-robust-status">
          <option value="pending">En attente</option>
          <option value="validated">Validées</option>
          <option value="all">Toutes</option>
        </select>

        <button id="author-requests-robust-refresh" class="cyber-btn-secondary" type="button">
          Rafraîchir
        </button>

        <span class="badge pending" id="author-requests-robust-version">V${VERSION}</span>
      </div>

      <div id="author-requests-robust-list" class="author-requests-list">
        <article class="event-card">Chargement des demandes auteurs…</article>
      </div>

      <p class="author-requests-debug" id="author-requests-robust-debug">
        Chargement robuste : présences auteurs puis événements/auteurs liés séparément.
      </p>
    `;

    const firstAdminPanel = moderationPanel.querySelector(".admin-panel");
    if (firstAdminPanel) {
      moderationPanel.insertBefore(panel, firstAdminPanel);
    } else {
      moderationPanel.appendChild(panel);
    }

    document
      .getElementById("author-requests-robust-refresh")
      ?.addEventListener("click", loadAuthorRequests);

    document
      .getElementById("author-requests-robust-search")
      ?.addEventListener("input", (event) => {
        currentSearch = normalize(event.target.value || "");
        renderAuthorRequests();
      });

    document
      .getElementById("author-requests-robust-status")
      ?.addEventListener("change", (event) => {
        currentStatus = event.target.value || "pending";
        renderAuthorRequests();
      });

    initialized = true;
    loadAuthorRequests();
  }

  function ensureCounterElements() {
    const adminTab = document.querySelector('.admin-tab[data-tab="moderation"]');

    if (adminTab && !document.getElementById("author-requests-tab-badge")) {
      const badge = document.createElement("span");
      badge.id = "author-requests-tab-badge";
      badge.className = "admin-tab-badge";
      badge.hidden = true;
      badge.textContent = "0";
      adminTab.appendChild(badge);
    }

    const statsGrid = document.querySelector("#tab-overview .stats-grid");

    if (statsGrid && !document.getElementById("stats-author-requests")) {
      const card = document.createElement("article");
      card.id = "stat-card-author-requests";
      card.className = "stat-card glow-red stat-card-author-requests";
      card.innerHTML = `
        <span class="stat-label">DEMANDES AUTEURS</span>
        <strong id="stats-author-requests">0</strong>
      `;

      const pendingCard = document.getElementById("stats-pending")?.closest(".stat-card");

      if (pendingCard?.nextSibling) {
        statsGrid.insertBefore(card, pendingCard.nextSibling);
      } else {
        statsGrid.appendChild(card);
      }
    }
  }

  async function loadAuthorRequests() {
    const list = document.getElementById("author-requests-robust-list");
    const count = document.getElementById("author-requests-robust-count");
    const debug = document.getElementById("author-requests-robust-debug");

    if (list) {
      list.innerHTML = `<article class="event-card">Chargement des demandes auteurs…</article>`;
    }
    if (count) count.textContent = "Chargement…";
    if (debug) debug.textContent = "Lecture de event_authors_presence…";

    const result = await readPresenceRows();

    if (result.error) {
      console.error("Erreur lecture event_authors_presence :", result.error);
      if (list) {
        list.innerHTML = `
          <article class="event-card">
            Impossible de charger les demandes auteurs.<br>
            <small>${escapeHtml(result.error.message || "Erreur Supabase")}</small>
          </article>
        `;
      }
      if (count) count.textContent = "Erreur";
      if (debug) {
        debug.textContent = "Vérifie les policies SELECT admin sur event_authors_presence et les colonnes disponibles.";
      }
      return;
    }

    rows = result.rows;
    await loadLinkedEvents(rows);
    await loadLinkedAuthors(rows);

    if (debug) {
      debug.textContent =
        `${rows.length} présence(s) auteur chargée(s). ` +
        `${eventMap.size} événement(s) lié(s), ${authorMap.size} auteur(s) lié(s).`;
    }

    renderAuthorRequests();
    updateAuthorCounters();
  }

  async function readPresenceRows() {
    const selectors = [
      "*",
      "id,event_id,pseudo,website,author_slug,author_id,validated,created_at",
      "id,event_id,author_id,validated,created_at",
      "id,event_id,pseudo,website,validated,created_at"
    ];

    let lastError = null;

    for (const selector of selectors) {
      const { data, error } = await client
        .from("event_authors_presence")
        .select(selector)
        .order("created_at", { ascending: false });

      if (!error) {
        return {
          rows: Array.isArray(data) ? data : [],
          error: null
        };
      }

      lastError = error;
      console.warn(`Lecture présences auteurs échouée avec select(${selector}) :`, error);
    }

    return {
      rows: [],
      error: lastError
    };
  }

  async function loadLinkedEvents(authorRows) {
    eventMap = new Map();

    const ids = Array.from(
      new Set(
        authorRows
          .map((row) => row.event_id)
          .filter(Boolean)
          .map(String)
      )
    );

    if (!ids.length) return;

    const { data, error } = await client
      .from("events")
      .select("id,title,city,region,start_date,end_date,type,validated,rejected")
      .in("id", ids);

    if (error) {
      console.warn("Événements liés indisponibles, affichage sans jointure :", error);
      return;
    }

    (Array.isArray(data) ? data : []).forEach((event) => {
      if (event?.id) eventMap.set(String(event.id), event);
    });
  }

  async function loadLinkedAuthors(authorRows) {
    authorMap = new Map();

    const ids = Array.from(
      new Set(
        authorRows
          .map((row) => row.author_id || row.authorId || row.author)
          .filter(Boolean)
          .map(String)
      )
    );

    if (!ids.length) return;

    const { data, error } = await client
      .from("authors")
      .select("*")
      .in("id", ids);

    if (error) {
      console.warn("Auteurs liés indisponibles, affichage sans jointure :", error);
      return;
    }

    (Array.isArray(data) ? data : []).forEach((author) => {
      if (author?.id) authorMap.set(String(author.id), author);
    });
  }

  function renderAuthorRequests() {
    const list = document.getElementById("author-requests-robust-list");
    const count = document.getElementById("author-requests-robust-count");

    if (!list || !count) return;

    const filtered = getFilteredRows();
    const pendingCount = rows.filter((row) => row.validated !== true).length;
    const validatedCount = rows.filter((row) => row.validated === true).length;

    count.textContent = `${pendingCount} en attente · ${validatedCount} validée(s) · ${rows.length} total`;

    if (!filtered.length) {
      list.innerHTML = `
        <article class="event-card">
          Aucune demande auteur pour ce filtre.
        </article>
      `;
      return;
    }

    list.innerHTML = filtered.map(renderAuthorRow).join("");
    bindAuthorActions(list);
  }

  function getFilteredRows() {
    return rows.filter((row) => {
      const event = eventMap.get(String(row.event_id)) || {};
      const author = getLinkedAuthor(row);
      const isValidated = row.validated === true;

      if (currentStatus === "pending" && isValidated) return false;
      if (currentStatus === "validated" && !isValidated) return false;

      const authorName = getAuthorName(row, author);
      const authorWebsite = getAuthorWebsite(row, author);

      const haystack = normalize([
        authorName,
        authorWebsite,
        row.author_slug,
        event.title,
        event.city,
        event.region,
        event.type,
        row.event_id,
        row.author_id
      ].filter(Boolean).join(" "));

      return !currentSearch || haystack.includes(currentSearch);
    });
  }

  function renderAuthorRow(row) {
    const event = eventMap.get(String(row.event_id)) || {};
    const author = getLinkedAuthor(row);
    const isValidated = row.validated === true;
    const statusLabel = isValidated ? "Validé" : "En attente";
    const rowClass = isValidated ? "is-validated" : "is-pending";
    const dateLabel = event.start_date ? formatDateRange(event.start_date, event.end_date) : "Date non précisée";
    const locationLabel = [event.city, event.region].filter(Boolean).join(", ") || "Lieu non précisé";
    const authorName = getAuthorName(row, author);
    const authorWebsite = getAuthorWebsite(row, author);

    return `
      <article class="author-request-row ${rowClass}">
        <div class="author-request-main">
          <strong>${escapeHtml(authorName || "Auteur sans nom")}</strong>
          <small>
            ${escapeHtml(event.title || "Événement non retrouvé")}
            ${event.title ? ` · ${escapeHtml(locationLabel)} · ${escapeHtml(dateLabel)}` : ` · ID événement : ${escapeHtml(row.event_id || "—")}`}
          </small>
          <small>
            ${authorWebsite ? `Site auteur : ${escapeHtml(authorWebsite)}` : "Aucun site auteur renseigné"}
          </small>
          <div class="author-request-badges">
            <span class="badge ${isValidated ? "" : "pending"}">${statusLabel}</span>
            ${event.type ? `<span class="badge featured">${escapeHtml(event.type)}</span>` : ""}
            ${row.author_id ? `<span class="badge">author_id</span>` : ""}
            ${row.created_at ? `<span class="badge missing-image">${escapeHtml(formatDate(row.created_at))}</span>` : ""}
          </div>
        </div>

        <div class="author-request-actions">
          ${row.event_id ? `<a href="event.html?id=${encodeURIComponent(row.event_id)}" target="_blank" rel="noopener noreferrer">Événement</a>` : ""}
          ${authorWebsite ? `<a href="${escapeAttribute(authorWebsite)}" target="_blank" rel="noopener noreferrer">Site auteur</a>` : ""}
          ${!isValidated ? `<button class="approve" type="button" data-author-action="validate" data-id="${escapeAttribute(row.id)}">Valider</button>` : `<button class="pending" type="button" data-author-action="pending" data-id="${escapeAttribute(row.id)}">Remettre en attente</button>`}
          <button class="delete" type="button" data-author-action="delete" data-id="${escapeAttribute(row.id)}">Retirer / supprimer</button>
        </div>
      </article>
    `;
  }

  function bindAuthorActions(container) {
    container.querySelectorAll("[data-author-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.id;
        const action = button.dataset.authorAction;

        if (!id || !action) return;

        if (action === "validate") await updateAuthorPresence(id, true);
        if (action === "pending") await updateAuthorPresence(id, false);
        if (action === "delete") await deleteAuthorPresence(id);
      });
    });
  }

  async function updateAuthorPresence(id, validated) {
    const { error } = await client
      .from("event_authors_presence")
      .update({ validated })
      .eq("id", id);

    if (error) {
      console.error("Erreur validation auteur :", error);
      alert("Erreur pendant la mise à jour de la demande auteur.");
      return;
    }

    await loadAuthorRequests();
  }

  async function deleteAuthorPresence(id) {
    const row = rows.find((item) => String(item.id) === String(id));
    const author = row ? getLinkedAuthor(row) : null;
    const authorName = row ? getAuthorName(row, author) : "cette demande";

    if (!window.confirm(`Retirer / supprimer la demande auteur : ${authorName || "auteur sans nom"} ?`)) {
      return;
    }

    const { error } = await client
      .from("event_authors_presence")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur suppression auteur :", error);
      alert("Erreur pendant la suppression de la demande auteur.");
      return;
    }

    await loadAuthorRequests();
  }

  function updateAuthorCounters() {
    const pendingCount = rows.filter((row) => row.validated !== true).length;
    const stat = document.getElementById("stats-author-requests");
    const badge = document.getElementById("author-requests-tab-badge");

    if (stat) stat.textContent = String(pendingCount);

    if (badge) {
      badge.textContent = String(pendingCount);
      badge.hidden = pendingCount === 0;
    }
  }

  function getLinkedAuthor(row) {
    const id = row.author_id || row.authorId || row.author;
    return id ? authorMap.get(String(id)) : null;
  }

  function getAuthorName(row, author) {
    return cleanText(
      row.pseudo ||
      row.name ||
      row.author_name ||
      row.author_slug ||
      author?.name ||
      author?.pseudo ||
      author?.author_name ||
      author?.slug ||
      ""
    );
  }

  function getAuthorWebsite(row, author) {
    return normalizeOptionalWebsite(
      row.website ||
      row.url ||
      row.link ||
      author?.website ||
      author?.url ||
      author?.link ||
      ""
    );
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeOptionalWebsite(value) {
    const raw = cleanText(value);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;

    try {
      return `https://${raw}`;
    } catch {
      return "";
    }
  }

  function normalize(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function formatDateRange(start, end) {
    const startLabel = formatDate(start);
    const endLabel = end && end !== start ? formatDate(end) : "";
    return endLabel ? `${startLabel} → ${endLabel}` : startLabel;
  }

  function formatDate(value) {
    if (!value) return "";

    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date(value));
    } catch {
      return value;
    }
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
