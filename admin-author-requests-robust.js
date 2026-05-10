/* =========================================================
   DÉDICALIVRES — V7.6.4
   Correctif robuste modération auteurs admin
   - Ne dépend pas de la jointure Supabase event_authors_presence -> events
   - Charge les présences puis les événements séparément
   - Affiche validated=false, validated=true et toutes les demandes
========================================================= */

(function () {
  "use strict";

  const VERSION = "7.7.8b";
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
  let currentStatus = "pending";
  let currentSearch = "";

  document.addEventListener("DOMContentLoaded", () => {
    waitForDashboard();
  });

  function waitForDashboard(attempt = 0) {
    const moderationPanel = document.getElementById("tab-moderation");

    if (moderationPanel) {
      initPanel(moderationPanel);
      return;
    }

    if (attempt < 30) {
      setTimeout(() => waitForDashboard(attempt + 1), 200);
    }
  }

  function initPanel(moderationPanel) {
    ensureCounterElements();

    if (document.getElementById("author-requests-robust-panel")) {
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
        Chargement robuste : présences auteurs puis événements liés séparément.
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

    const { data, error } = await client
      .from("event_authors_presence")
      .select("id,event_id,pseudo,website,author_slug,author_id,validated,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur lecture event_authors_presence :", error);
      if (list) {
        list.innerHTML = `
          <article class="event-card">
            Impossible de charger les demandes auteurs.<br>
            <small>${escapeHtml(error.message || "Erreur Supabase")}</small>
          </article>
        `;
      }
      if (count) count.textContent = "Erreur";
      if (debug) {
        debug.textContent = "Vérifie les policies SELECT pour authenticated sur event_authors_presence.";
      }
      return;
    }

    rows = Array.isArray(data) ? data : [];
    await loadLinkedEvents(rows);

    if (debug) {
      debug.textContent = `${rows.length} présence(s) auteur chargée(s). Les événements sont récupérés séparément pour éviter les erreurs de jointure.`;
    }

    renderAuthorRequests();
    updateAuthorCounters();
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
      const isValidated = row.validated === true;

      if (currentStatus === "pending" && isValidated) return false;
      if (currentStatus === "validated" && !isValidated) return false;

      const haystack = normalize([
        row.pseudo,
        row.website,
        row.author_slug,
        event.title,
        event.city,
        event.region,
        event.type,
        row.event_id
      ].filter(Boolean).join(" "));

      return !currentSearch || haystack.includes(currentSearch);
    });
  }

  function renderAuthorRow(row) {
    const event = eventMap.get(String(row.event_id)) || {};
    const isValidated = row.validated === true;
    const statusLabel = isValidated ? "Validé" : "En attente";
    const rowClass = isValidated ? "is-validated" : "is-pending";
    const dateLabel = event.start_date ? formatDateRange(event.start_date, event.end_date) : "Date non précisée";
    const locationLabel = [event.city, event.region].filter(Boolean).join(", ") || "Lieu non précisé";

    return `
      <article class="author-request-row ${rowClass}">
        <div class="author-request-main">
          <strong>${escapeHtml(row.pseudo || "Auteur sans nom")}</strong>
          <small>
            ${escapeHtml(event.title || "Événement non retrouvé")}
            ${event.title ? ` · ${escapeHtml(locationLabel)} · ${escapeHtml(dateLabel)}` : ` · ID événement : ${escapeHtml(row.event_id || "—")}`}
          </small>
          <small>
            ${row.website ? `Site auteur : ${escapeHtml(row.website)}` : "Aucun site auteur renseigné"}
          </small>
          <div class="author-request-badges">
            <span class="badge ${isValidated ? "" : "pending"}">${statusLabel}</span>
            ${event.type ? `<span class="badge featured">${escapeHtml(event.type)}</span>` : ""}
            ${row.created_at ? `<span class="badge missing-image">${escapeHtml(formatDate(row.created_at))}</span>` : ""}
          </div>
        </div>

        <div class="author-request-actions">
          ${row.event_id ? `<a href="event.html?id=${encodeURIComponent(row.event_id)}" target="_blank" rel="noopener noreferrer">Événement</a>` : ""}
          ${row.website ? `<a href="${escapeAttribute(row.website)}" target="_blank" rel="noopener noreferrer">Site auteur</a>` : ""}
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
      console.error("Erreur mise à jour auteur :", error);
      alert(error.message || "Mise à jour impossible.");
      return;
    }

    rows = rows.map((row) => (
      String(row.id) === String(id) ? { ...row, validated } : row
    ));

    renderAuthorRequests();
    updateAuthorCounters();
    safeToast(validated ? "Auteur validé" : "Auteur remis en attente");
  }

  async function deleteAuthorPresence(id) {
    const ok = confirm("Retirer définitivement cette présence auteur de la fiche événement ?");
    if (!ok) return;

    const { error } = await client
      .from("event_authors_presence")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur suppression auteur :", error);
      alert(error.message || "Suppression impossible.");
      return;
    }

    rows = rows.filter((row) => String(row.id) !== String(id));
    renderAuthorRequests();
    updateAuthorCounters();
    safeToast("Demande auteur supprimée");
  }

  function updateAuthorCounters() {
    ensureCounterElements();

    const pendingCount = rows.filter((row) => row.validated !== true).length;
    const stat = document.getElementById("stats-author-requests");
    const badge = document.getElementById("author-requests-tab-badge");
    const card = document.getElementById("stat-card-author-requests") || stat?.closest(".stat-card");

    if (stat) stat.textContent = String(pendingCount);

    if (badge) {
      badge.textContent = String(pendingCount);
      badge.hidden = pendingCount < 1;
      badge.setAttribute("aria-label", `${pendingCount} demande(s) auteur en attente`);
    }

    if (card) {
      card.classList.toggle("has-pending", pendingCount > 0);
      card.setAttribute("title", `${pendingCount} demande(s) auteur en attente de validation.`);
    }

    window.dispatchEvent(new CustomEvent("dedicalivres:author-requests-count", {
      detail: { pendingCount, total: rows.length }
    }));

    // Protection contre les mises à jour tardives d'admin.js : on réapplique le compteur
    // brièvement après le chargement ou après une action.
    clearTimeout(updateAuthorCounters._retryTimer);
    updateAuthorCounters._retryTimer = setTimeout(() => {
      const retryStat = document.getElementById("stats-author-requests");
      const retryBadge = document.getElementById("author-requests-tab-badge");
      if (retryStat) retryStat.textContent = String(pendingCount);
      if (retryBadge) {
        retryBadge.textContent = String(pendingCount);
        retryBadge.hidden = pendingCount < 1;
      }
    }, 500);
  }

  function safeToast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
      return;
    }

    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 2600);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .toLowerCase()
      .trim();
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
