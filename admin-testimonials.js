/* =========================================================
   DÉDICALIVRES — ADMIN TÉMOIGNAGES V7.7.8b
   Module isolé : n’écrase pas admin.js
========================================================= */
(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  if (!config || !window.supabase) return;

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  let rows = [];
  let currentFilter = "pending";

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(initTestimonialsAdmin, 900);
  });

  window.addEventListener("dedicalivres:testimonials-refresh", loadTestimonials);

  function initTestimonialsAdmin() {
    injectStatCard();
    injectPanel();
    bindRefreshButton();
    loadTestimonials();
  }

  function injectStatCard() {
    const statsGrid = document.querySelector(".stats-grid");
    if (!statsGrid || document.getElementById("stats-testimonials-card")) return;

    const card = document.createElement("article");
    card.id = "stats-testimonials-card";
    card.className = "stat-card glow-cyan stat-card-testimonials";
    card.innerHTML = `
      <span class="stat-label">TÉMOIGNAGES</span>
      <strong id="stats-testimonials-pending">0</strong>
    `;
    statsGrid.appendChild(card);
  }

  function injectPanel() {
    const moderation = document.getElementById("tab-moderation");
    if (!moderation || document.getElementById("testimonials-admin-panel")) return;

    const panel = document.createElement("section");
    panel.id = "testimonials-admin-panel";
    panel.className = "admin-panel testimonials-admin-panel";

    panel.innerHTML = `
      <div class="section-head">
        <h3>TÉMOIGNAGES</h3>
        <span id="testimonials-admin-count">Chargement…</span>
      </div>

      <div class="author-admin-toolbar testimonials-admin-toolbar">
        <input id="testimonials-admin-search" type="search" placeholder="Rechercher pseudo, message, événement…" />
        <select id="testimonials-admin-filter">
          <option value="pending">En attente</option>
          <option value="validated">Validés</option>
          <option value="rejected">Refusés</option>
          <option value="all">Tous</option>
        </select>
        <button id="testimonials-admin-refresh" class="cyber-btn-secondary" type="button">Rafraîchir</button>
      </div>

      <div id="testimonials-admin-list" class="testimonials-admin-list">
        <article class="event-card">Chargement des témoignages…</article>
      </div>
    `;

    const firstAdminPanel = moderation.querySelector(".admin-panel");
    if (firstAdminPanel) moderation.insertBefore(panel, firstAdminPanel);
    else moderation.appendChild(panel);

    document.getElementById("testimonials-admin-search")?.addEventListener("input", render);
    document.getElementById("testimonials-admin-filter")?.addEventListener("change", (event) => {
      currentFilter = event.target.value || "pending";
      render();
    });
    document.getElementById("testimonials-admin-refresh")?.addEventListener("click", loadTestimonials);
  }

  function bindRefreshButton() {
    document.getElementById("refresh-btn")?.addEventListener("click", () => {
      setTimeout(loadTestimonials, 450);
    });
  }

  async function loadTestimonials() {
    const list = document.getElementById("testimonials-admin-list");
    if (list) list.innerHTML = `<article class="event-card">Chargement des témoignages…</article>`;

    const { data, error } = await client
      .from("testimonials")
      .select("id, pseudo, email, message, event_title, image_url, validated, rejected, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("Admin témoignages indisponible :", error);
      if (list) list.innerHTML = `<article class="event-card">Impossible de charger les témoignages. Vérifie la table <code>testimonials</code>.</article>`;
      updateCounters([]);
      return;
    }

    rows = Array.isArray(data) ? data : [];
    updateCounters(rows);
    render();
  }

  function render() {
    const list = document.getElementById("testimonials-admin-list");
    const count = document.getElementById("testimonials-admin-count");
    const search = normalize(document.getElementById("testimonials-admin-search")?.value || "");

    if (!list) return;

    const filtered = rows.filter((row) => {
      if (currentFilter === "pending" && (row.validated || row.rejected)) return false;
      if (currentFilter === "validated" && !row.validated) return false;
      if (currentFilter === "rejected" && !row.rejected) return false;

      const haystack = normalize([row.pseudo, row.email, row.message, row.event_title].join(" "));
      return !search || haystack.includes(search);
    });

    if (count) count.textContent = `${filtered.length} témoignage${filtered.length > 1 ? "s" : ""}`;

    if (!filtered.length) {
      list.innerHTML = `<article class="event-card">Aucun témoignage dans ce filtre.</article>`;
      return;
    }

    list.innerHTML = filtered.map(renderCard).join("");
    bindActions(list);
  }

  function renderCard(row) {
    const status = row.validated ? "VALIDÉ" : row.rejected ? "REFUSÉ" : "EN ATTENTE";

    return `
      <article class="event-card testimonial-admin-card">
        ${row.image_url ? `<div class="event-admin-thumb-placeholder" title="Photo disponible, non chargée automatiquement pour économiser Supabase">PHOTO DISPONIBLE</div>` : `<div class="event-admin-thumb-placeholder">SANS PHOTO</div>`}

        <div>
          <div class="event-title">${escapeHtml(row.pseudo || "Témoignage")}</div>
          <div class="event-meta">
            ${row.event_title ? `<span>📚 ${escapeHtml(row.event_title)}</span>` : ""}
            ${row.email ? `<span>✉️ ${escapeHtml(row.email)}</span>` : ""}
            <span>🕒 ${formatDate(row.created_at)}</span>
          </div>
          <p class="testimonial-admin-message">${escapeHtml(row.message || "")}</p>
          <div class="event-badges">
            <span class="badge ${row.rejected ? "rejected" : row.validated ? "" : "pending"}">${status}</span>
          </div>
        </div>

        <div class="event-actions testimonial-admin-actions">
          ${row.image_url ? `<a class="event-action edit" href="${escapeAttribute(row.image_url)}" target="_blank" rel="noopener noreferrer" title="Voir photo">↗</a>` : ""}
          ${!row.validated ? `<button class="event-action validate" data-testimonial-action="validate" data-id="${escapeAttribute(row.id)}" type="button" title="Valider">✔</button>` : `<button class="event-action featured" data-testimonial-action="pending" data-id="${escapeAttribute(row.id)}" type="button" title="Remettre en attente">↺</button>`}
          ${!row.rejected ? `<button class="event-action reject" data-testimonial-action="reject" data-id="${escapeAttribute(row.id)}" type="button" title="Refuser">✖</button>` : ""}
          <button class="event-action reject" data-testimonial-action="delete" data-id="${escapeAttribute(row.id)}" type="button" title="Supprimer">🗑</button>
        </div>
      </article>
    `;
  }

  function bindActions(root) {
    root.querySelectorAll("[data-testimonial-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.testimonialAction;
        const id = button.dataset.id;
        if (!id) return;

        if (action === "validate") await updateStatus(id, { validated: true, rejected: false }, "Témoignage validé");
        if (action === "pending") await updateStatus(id, { validated: false, rejected: false }, "Témoignage remis en attente");
        if (action === "reject") await updateStatus(id, { validated: false, rejected: true }, "Témoignage refusé");
        if (action === "delete") await deleteRow(id);
      });
    });
  }

  async function updateStatus(id, payload, successMessage) {
    const { error } = await client.from("testimonials").update(payload).eq("id", id);
    if (error) {
      alert("Action impossible. Vérifie les règles RLS de la table testimonials.");
      console.error(error);
      return;
    }
    await loadTestimonials();
    toast(successMessage);
  }

  async function deleteRow(id) {
    if (!confirm("Supprimer définitivement ce témoignage ?")) return;
    const { error } = await client.from("testimonials").delete().eq("id", id);
    if (error) {
      alert("Suppression impossible. Vérifie les règles RLS de la table testimonials.");
      console.error(error);
      return;
    }
    rows = rows.filter((row) => String(row.id) !== String(id));
    updateCounters(rows);
    render();
    toast("Témoignage supprimé");
  }

  function updateCounters(sourceRows) {
    const pending = sourceRows.filter((row) => !row.validated && !row.rejected).length;
    const stat = document.getElementById("stats-testimonials-pending");
    if (stat) stat.textContent = pending;

    const adminTab = document.querySelector('[data-tab="moderation"]');
    if (!adminTab) return;

    let badge = document.getElementById("testimonials-tab-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "testimonials-tab-badge";
      badge.className = "admin-tab-badge testimonials-tab-badge";
      adminTab.appendChild(badge);
    }

    badge.textContent = pending;
    badge.hidden = pending === 0;
  }

  function toast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
      return;
    }
    console.log(message);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  }

  function formatDate(value) {
    if (!value) return "Date inconnue";
    try {
      return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
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
