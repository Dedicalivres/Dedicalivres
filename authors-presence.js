/* =========================================================
   DÉDICALIVRES — V6.6 Modération auteurs
   Fichier isolé, chargé après admin.js.

   Rôle :
   - Afficher les demandes auteurs en attente.
   - Afficher aussi les présences validées.
   - Rechercher / filtrer les présences auteurs.
   - Valider, remettre en attente ou supprimer une présence.
   - Garder les notifications admin basées uniquement sur les demandes en attente.
========================================================= */

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.error("Configuration Supabase manquante pour admin-author-requests.js");
    return;
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  let authorRows = [];

  document.addEventListener("DOMContentLoaded", initAuthorModerationAdmin);

  async function initAuthorModerationAdmin() {
    ensurePanelExists();
    bindAuthorModerationControls();
    await loadAuthorModerationRows();

    const refreshBtn = document.getElementById("refresh-btn");
    refreshBtn?.addEventListener("click", () => {
      setTimeout(loadAuthorModerationRows, 500);
    });
  }

  function ensurePanelExists() {
    let panel = document.getElementById("author-requests-panel");

    if (!panel) {
      const moderationTab = document.getElementById("tab-moderation");
      if (!moderationTab) return;

      const supervisionPanel = moderationTab.querySelector(".admin-panel");
      panel = document.createElement("section");
      panel.id = "author-requests-panel";
      panel.className = "admin-panel author-requests-panel";

      if (supervisionPanel) {
        moderationTab.insertBefore(panel, supervisionPanel);
      } else {
        moderationTab.appendChild(panel);
      }
    }

    panel.innerHTML = `
      <div class="section-head author-moderation-head">
        <div>
          <h3>MODÉRATION AUTEURS</h3>
          <p class="author-moderation-subtitle">
            Valide les demandes d’association auteurs et garde un œil sur les présences déjà publiées.
          </p>
        </div>
        <span id="author-requests-count">Chargement…</span>
      </div>

      <div class="author-moderation-toolbar">
        <input
          id="author-moderation-search"
          type="search"
          placeholder="Rechercher un auteur, événement, ville…"
        />

        <select id="author-moderation-status">
          <option value="pending">En attente</option>
          <option value="validated">Validées</option>
          <option value="all">Toutes</option>
        </select>

        <button id="author-moderation-refresh" class="cyber-btn-secondary" type="button">
          Rafraîchir auteurs
        </button>
      </div>

      <div class="author-moderation-summary" id="author-moderation-summary">
        <article>
          <span>En attente</span>
          <strong id="author-summary-pending">0</strong>
        </article>
        <article>
          <span>Validées</span>
          <strong id="author-summary-validated">0</strong>
        </article>
        <article>
          <span>Total</span>
          <strong id="author-summary-total">0</strong>
        </article>
      </div>

      <div id="author-requests-container" class="author-requests-container">
        <article class="author-request-card">Chargement de la modération auteurs…</article>
      </div>
    `;
  }

  function bindAuthorModerationControls() {
    document
      .getElementById("author-moderation-search")
      ?.addEventListener("input", renderAuthorModerationRows);

    document
      .getElementById("author-moderation-status")
      ?.addEventListener("change", renderAuthorModerationRows);

    document
      .getElementById("author-moderation-refresh")
      ?.addEventListener("click", loadAuthorModerationRows);
  }

  async function loadAuthorModerationRows() {
    const container = document.getElementById("author-requests-container");
    const count = document.getElementById("author-requests-count");

    if (!container) return;

    container.innerHTML = `<article class="author-request-card">Chargement de la modération auteurs…</article>`;
    if (count) count.textContent = "Chargement…";

    const { data, error } = await client
      .from("event_authors_presence")
      .select(`
        id,
        event_id,
        pseudo,
        website,
        author_slug,
        validated,
        created_at,
        events (
          id,
          title,
          city,
          region,
          start_date
        )
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Erreur chargement modération auteurs :", error);
      authorRows = [];
      container.innerHTML = `
        <div class="author-request-error">
          Impossible de charger la modération auteurs. Vérifie les droits Supabase sur event_authors_presence.
        </div>
      `;
      if (count) count.textContent = "Erreur";
      updateAuthorRequestsNotifications(0, true);
      updateAuthorSummary();
      return;
    }

    authorRows = Array.isArray(data) ? data : [];
    updateAuthorSummary();
    updateAuthorRequestsNotifications(getPendingRows().length);
    renderAuthorModerationRows();
  }

  function renderAuthorModerationRows() {
    const container = document.getElementById("author-requests-container");
    const count = document.getElementById("author-requests-count");
    const searchInput = document.getElementById("author-moderation-search");
    const statusSelect = document.getElementById("author-moderation-status");

    if (!container) return;

    const status = statusSelect?.value || "pending";
    const query = normalize(searchInput?.value || "");

    const rows = authorRows.filter((row) => {
      if (status === "pending" && row.validated === true) return false;
      if (status === "validated" && row.validated !== true) return false;

      const event = row.events || {};
      const haystack = normalize([
        row.pseudo,
        row.website,
        row.author_slug,
        event.title,
        event.city,
        event.region
      ].filter(Boolean).join(" "));

      return !query || haystack.includes(query);
    });

    if (count) {
      count.textContent = `${rows.length} résultat${rows.length > 1 ? "s" : ""}`;
    }

    if (!rows.length) {
      const emptyText = status === "pending"
        ? "Aucune demande auteur en attente."
        : status === "validated"
          ? "Aucune présence auteur validée trouvée."
          : "Aucune présence auteur trouvée.";

      container.innerHTML = `<div class="author-request-empty">${emptyText}</div>`;
      return;
    }

    container.innerHTML = rows.map(renderAuthorModerationCard).join("");
    bindAuthorModerationActions();
  }

  function renderAuthorModerationCard(row) {
    const event = row.events || {};
    const date = row.created_at ? formatDate(row.created_at) : "Date inconnue";
    const isValidated = row.validated === true;
    const authorLink = row.author_slug
      ? `author.html?slug=${encodeURIComponent(row.author_slug)}`
      : "";

    return `
      <article class="author-request-card author-request-card-${isValidated ? "validated" : "pending"}">
        <div class="author-request-main">
          <div class="author-request-title-row">
            <strong>${escapeHtml(row.pseudo || "Auteur sans nom")}</strong>
            <span class="author-status-pill ${isValidated ? "is-validated" : "is-pending"}">
              ${isValidated ? "Validée" : "En attente"}
            </span>
          </div>

          <small>Créée le : ${escapeHtml(date)}</small>
          <small>Événement : ${escapeHtml(event.title || "Événement inconnu")}</small>
          <small>${escapeHtml([event.city, event.region].filter(Boolean).join(" — ") || "Lieu non précisé")}</small>
          ${row.website ? `<small>Site auteur : ${escapeHtml(row.website)}</small>` : ""}
          ${row.author_slug ? `<small>Slug auteur : ${escapeHtml(row.author_slug)}</small>` : ""}
        </div>

        <div class="author-request-actions">
          <a href="event.html?id=${encodeURIComponent(row.event_id)}" target="_blank" rel="noopener noreferrer">Voir événement</a>
          ${row.website ? `<a href="${escapeAttribute(row.website)}" target="_blank" rel="noopener noreferrer">Site auteur</a>` : ""}
          ${authorLink ? `<a href="${authorLink}" target="_blank" rel="noopener noreferrer">Fiche auteur</a>` : ""}

          ${
            isValidated
              ? `<button class="pending-author-request" type="button" data-author-request-pending="${escapeAttribute(row.id)}">Remettre en attente</button>`
              : `<button class="validate-author-request" type="button" data-author-request-validate="${escapeAttribute(row.id)}">Valider</button>`
          }

          <button class="reject-author-request" type="button" data-author-request-delete="${escapeAttribute(row.id)}">
            Supprimer
          </button>
        </div>
      </article>
    `;
  }

  function bindAuthorModerationActions() {
    document.querySelectorAll("[data-author-request-validate]").forEach((button) => {
      button.addEventListener("click", () => validateAuthorPresence(button.dataset.authorRequestValidate));
    });

    document.querySelectorAll("[data-author-request-pending]").forEach((button) => {
      button.addEventListener("click", () => markAuthorPresencePending(button.dataset.authorRequestPending));
    });

    document.querySelectorAll("[data-author-request-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteAuthorPresence(button.dataset.authorRequestDelete));
    });
  }

  async function validateAuthorPresence(id) {
    if (!id) return;

    const { error } = await client
      .from("event_authors_presence")
      .update({ validated: true })
      .eq("id", id);

    if (error) {
      console.error("Erreur validation auteur :", error);
      alert("Validation impossible. Vérifie les droits Supabase UPDATE.");
      return;
    }

    await loadAuthorModerationRows();
    showLocalToast("Présence auteur validée");
  }

  async function markAuthorPresencePending(id) {
    if (!id) return;

    const ok = confirm("Remettre cette présence auteur en attente ? Elle ne sera plus visible publiquement.");
    if (!ok) return;

    const { error } = await client
      .from("event_authors_presence")
      .update({ validated: false })
      .eq("id", id);

    if (error) {
      console.error("Erreur remise en attente auteur :", error);
      alert("Modification impossible. Vérifie les droits Supabase UPDATE.");
      return;
    }

    await loadAuthorModerationRows();
    showLocalToast("Présence auteur remise en attente");
  }

  async function deleteAuthorPresence(id) {
    if (!id) return;

    const ok = confirm("Supprimer définitivement cette présence / demande auteur ?");
    if (!ok) return;

    const { error } = await client
      .from("event_authors_presence")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur suppression auteur :", error);
      alert("Suppression impossible. Vérifie les droits Supabase DELETE.");
      return;
    }

    await loadAuthorModerationRows();
    showLocalToast("Présence auteur supprimée");
  }

  function updateAuthorSummary() {
    const pending = getPendingRows().length;
    const validated = authorRows.filter((row) => row.validated === true).length;
    const total = authorRows.length;

    setText("author-summary-pending", pending);
    setText("author-summary-validated", validated);
    setText("author-summary-total", total);
  }

  function getPendingRows() {
    return authorRows.filter((row) => row.validated !== true);
  }

  function updateAuthorRequestsNotifications(total, hasError) {
    const stat = document.getElementById("stats-author-requests");
    const statCard = document.getElementById("stat-card-author-requests");
    const tabBadge = document.getElementById("author-requests-tab-badge");
    const moderationTab = document.querySelector('.admin-tab[data-tab="moderation"]');

    if (stat) stat.textContent = hasError ? "!" : String(total);

    if (tabBadge) {
      tabBadge.textContent = String(total);
      tabBadge.hidden = !total || !!hasError;
    }

    statCard?.classList.toggle("has-alert", !!total && !hasError);
    moderationTab?.classList.toggle("has-author-requests", !!total && !hasError);

    window.dispatchEvent(new CustomEvent("dedicalivres:authorRequestsUpdated", {
      detail: { total, hasError: !!hasError }
    }));
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function showLocalToast(message) {
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

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
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
