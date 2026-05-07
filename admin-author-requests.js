/* =========================================================
   DÉDICALIVRES — V6.3 Admin demandes auteurs + notifications
   Fichier isolé, chargé après admin.js.
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

  document.addEventListener("DOMContentLoaded", initAuthorRequestsAdmin);

  async function initAuthorRequestsAdmin() {
    ensurePanelExists();
    await loadAuthorRequests();

    const refreshBtn = document.getElementById("refresh-btn");
    refreshBtn?.addEventListener("click", () => {
      setTimeout(loadAuthorRequests, 500);
    });
  }

  function ensurePanelExists() {
    if (document.getElementById("author-requests-panel")) return;

    const moderationTab = document.getElementById("tab-moderation");
    if (!moderationTab) return;

    const supervisionPanel = moderationTab.querySelector(".admin-panel");
    const section = document.createElement("section");
    section.id = "author-requests-panel";
    section.className = "admin-panel author-requests-panel";
    section.innerHTML = `
      <div class="section-head">
        <h3>DEMANDES AUTEURS</h3>
        <span id="author-requests-count">Chargement…</span>
      </div>

      <div id="author-requests-container" class="author-requests-container">
        <article class="author-request-card">Chargement des demandes auteurs…</article>
      </div>
    `;

    if (supervisionPanel) {
      moderationTab.insertBefore(section, supervisionPanel);
    } else {
      moderationTab.appendChild(section);
    }
  }

  async function loadAuthorRequests() {
    const container = document.getElementById("author-requests-container");
    const count = document.getElementById("author-requests-count");

    if (!container) return;

    container.innerHTML = `<article class="author-request-card">Chargement des demandes auteurs…</article>`;
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
      .eq("validated", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur chargement demandes auteurs :", error);
      container.innerHTML = `
        <div class="author-request-error">
          Impossible de charger les demandes auteurs. Vérifie les droits Supabase sur event_authors_presence.
        </div>
      `;
      if (count) count.textContent = "Erreur";
      updateAuthorRequestsNotifications(0, true);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    updateAuthorRequestsNotifications(rows.length);
    if (count) count.textContent = `${rows.length} demande${rows.length > 1 ? "s" : ""}`;

    if (!rows.length) {
      container.innerHTML = `<div class="author-request-empty">Aucune demande auteur en attente.</div>`;
      return;
    }

    container.innerHTML = rows.map(renderAuthorRequest).join("");
    bindAuthorRequestActions();
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

  function renderAuthorRequest(row) {
    const event = row.events || {};
    const date = row.created_at ? formatDate(row.created_at) : "Date inconnue";

    return `
      <article class="author-request-card">
        <div>
          <strong>${escapeHtml(row.pseudo || "Auteur sans nom")}</strong>
          <small>Demande reçue : ${escapeHtml(date)}</small>
          <small>Événement : ${escapeHtml(event.title || "Événement inconnu")}</small>
          <small>${escapeHtml([event.city, event.region].filter(Boolean).join(" — ") || "Lieu non précisé")}</small>
          ${row.website ? `<small>Site auteur : ${escapeHtml(row.website)}</small>` : ""}
        </div>

        <div class="author-request-actions">
          <a href="event.html?id=${encodeURIComponent(row.event_id)}" target="_blank" rel="noopener noreferrer">Voir événement</a>
          <button class="validate-author-request" type="button" data-author-request-validate="${escapeAttribute(row.id)}">Valider</button>
          <button class="reject-author-request" type="button" data-author-request-reject="${escapeAttribute(row.id)}">Refuser</button>
        </div>
      </article>
    `;
  }

  function bindAuthorRequestActions() {
    document.querySelectorAll("[data-author-request-validate]").forEach((button) => {
      button.addEventListener("click", () => validateAuthorRequest(button.dataset.authorRequestValidate));
    });

    document.querySelectorAll("[data-author-request-reject]").forEach((button) => {
      button.addEventListener("click", () => rejectAuthorRequest(button.dataset.authorRequestReject));
    });
  }

  async function validateAuthorRequest(id) {
    if (!id) return;

    const { error } = await client
      .from("event_authors_presence")
      .update({ validated: true })
      .eq("id", id);

    if (error) {
      console.error("Erreur validation demande auteur :", error);
      alert("Validation impossible. Vérifie les droits Supabase UPDATE.");
      return;
    }

    await loadAuthorRequests();
    showLocalToast("Demande auteur validée");
  }

  async function rejectAuthorRequest(id) {
    if (!id) return;

    const ok = confirm("Refuser et supprimer cette demande auteur ?");
    if (!ok) return;

    const { error } = await client
      .from("event_authors_presence")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur refus demande auteur :", error);
      alert("Refus impossible. Vérifie les droits Supabase DELETE.");
      return;
    }

    await loadAuthorRequests();
    showLocalToast("Demande auteur refusée");
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
