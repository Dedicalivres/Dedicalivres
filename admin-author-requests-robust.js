/* =========================================================
   DÉDICALIVRES — ADMIN AUTEURS PRÉSENTS
   Pack SEO-Auteurs-1
   Fichier : admin-author-requests-robust.js

   Rôle :
   - Modérer les demandes auteurs liées aux événements.
   - Gérer le statut AE / ME / Hybride.
   - Gérer les deux liens : auteur/réseau + livre/boutique/éditeur.
========================================================= */

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.warn("Admin auteurs : configuration Supabase indisponible.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  let rows = [];
  let currentFilter = "pending";

  ensureStyles();
  bindAuthEvents();

  function bindAuthEvents() {
    window.addEventListener("dedicalivres:admin-authenticated", init);
    window.addEventListener("dedicalivres:admin-dashboard-refreshed", refreshIfVisible);

    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED) {
      init();
    }
  }

  async function init() {
    ensurePanel();
    await loadRows();
    render();
  }

  async function refreshIfVisible() {
    if (!document.getElementById("author-requests-admin-panel")) return;
    await loadRows();
    render();
  }

  function ensurePanel() {
    const moderationTab = document.getElementById("tab-moderation");
    if (!moderationTab || document.getElementById("author-requests-admin-panel")) return;

    const panel = document.createElement("section");
    panel.id = "author-requests-admin-panel";
    panel.className = "admin-panel author-requests-admin-panel";
    panel.innerHTML = `
      <div class="section-head">
        <h3>DEMANDES AUTEURS</h3>
        <span id="author-requests-count">Chargement…</span>
      </div>

      <div class="author-requests-toolbar">
        <button type="button" class="cyber-btn-secondary is-active" data-author-filter="pending">En attente</button>
        <button type="button" class="cyber-btn-secondary" data-author-filter="validated">Validées</button>
        <button type="button" class="cyber-btn-secondary" data-author-filter="rejected">Refusées</button>
        <button type="button" class="cyber-btn-secondary" data-author-filter="all">Toutes</button>
        <button type="button" class="cyber-btn-primary" id="author-requests-refresh">Actualiser</button>
      </div>

      <div id="author-requests-list" class="author-requests-list">
        Chargement…
      </div>
    `;

    moderationTab.prepend(panel);

    panel.addEventListener("click", handlePanelClick);
    panel.addEventListener("change", handlePanelChange);
  }

  async function loadRows() {
    const selectExtended = [
      "id",
      "event_id",
      "pseudo",
      "website",
      "author_profile_url",
      "author_profile_url_type",
      "publication_mode",
      "book_or_publisher_url",
      "book_or_publisher_url_type",
      "publisher_name",
      "admin_note",
      "validated",
      "rejected",
      "created_at",
      "events(title, city, region, start_date)"
    ].join(", ");

    let response = await supabaseClient
      .from("event_authors_presence")
      .select(selectExtended)
      .order("created_at", { ascending: false })
      .limit(200);

    if (response.error) {
      // Fallback si la relation events ou les nouvelles colonnes ne sont pas encore disponibles.
      response = await supabaseClient
        .from("event_authors_presence")
        .select("id, event_id, pseudo, website, validated, rejected, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
    }

    if (response.error) {
      console.warn("Admin auteurs : chargement impossible", response.error);
      rows = [];
      showListError(response.error.message || "Chargement impossible.");
      return;
    }

    rows = Array.isArray(response.data) ? response.data : [];
  }

  function render() {
    const count = document.getElementById("author-requests-count");
    const list = document.getElementById("author-requests-list");

    if (!list) return;

    const filtered = filterRows(rows, currentFilter);

    if (count) {
      const pending = rows.filter(isPending).length;
      count.textContent = `${filtered.length} affichée(s) · ${pending} en attente`;
    }

    if (!filtered.length) {
      list.innerHTML = `<p class="priority-empty">Aucune demande auteur pour ce filtre.</p>`;
      return;
    }

    list.innerHTML = filtered.map(renderCard).join("");
  }

  function renderCard(row) {
    const event = row.events || {};
    const eventTitle = event.title || `Événement ${row.event_id || ""}`;
    const eventMeta = [event.start_date, event.city, event.region].filter(Boolean).join(" · ");
    const status = row.validated ? "validée" : row.rejected ? "refusée" : "en attente";

    return `
      <article class="author-request-card" data-request-id="${escapeAttribute(row.id)}">
        <div class="author-request-head">
          <div>
            <strong>${escapeHtml(row.pseudo || "Auteur sans nom")}</strong>
            <small>${escapeHtml(eventTitle)}${eventMeta ? ` — ${escapeHtml(eventMeta)}` : ""}</small>
          </div>
          <span class="author-request-status is-${statusToClass(status)}">${escapeHtml(status)}</span>
        </div>

        <div class="author-request-grid">
          <label>
            <span>Nom / pseudo</span>
            <input data-field="pseudo" value="${escapeAttribute(row.pseudo || "")}" />
          </label>

          <label>
            <span>Situation éditoriale</span>
            <select data-field="publication_mode">
              ${option("unknown", "Non précisé", row.publication_mode)}
              ${option("self_published", "Autoédition", row.publication_mode)}
              ${option("publisher", "Maison d’édition", row.publication_mode)}
              ${option("hybrid", "Hybride", row.publication_mode)}
            </select>
          </label>

          <label>
            <span>Lien auteur / réseau</span>
            <input data-field="author_profile_url" value="${escapeAttribute(row.author_profile_url || row.website || "")}" placeholder="https://..." />
          </label>

          <label>
            <span>Type lien auteur</span>
            <select data-field="author_profile_url_type">
              ${option("site_officiel", "Site officiel", row.author_profile_url_type)}
              ${option("instagram", "Instagram", row.author_profile_url_type)}
              ${option("facebook", "Facebook", row.author_profile_url_type)}
              ${option("linktree", "Linktree", row.author_profile_url_type)}
              ${option("autre", "Autre", row.author_profile_url_type)}
            </select>
          </label>

          <label>
            <span>Lien livre / boutique / éditeur</span>
            <input data-field="book_or_publisher_url" value="${escapeAttribute(row.book_or_publisher_url || "")}" placeholder="https://..." />
          </label>

          <label>
            <span>Type second lien</span>
            <select data-field="book_or_publisher_url_type">
              ${option("page_livre", "Page du livre", row.book_or_publisher_url_type)}
              ${option("maison_edition", "Maison d’édition", row.book_or_publisher_url_type)}
              ${option("boutique_auteur", "Boutique auteur", row.book_or_publisher_url_type)}
              ${option("librairie", "Librairie", row.book_or_publisher_url_type)}
              ${option("amazon", "Amazon", row.book_or_publisher_url_type)}
              ${option("autre", "Autre", row.book_or_publisher_url_type)}
            </select>
          </label>

          <label>
            <span>Nom éditeur / boutique</span>
            <input data-field="publisher_name" value="${escapeAttribute(row.publisher_name || "")}" />
          </label>

          <label>
            <span>Note admin</span>
            <input data-field="admin_note" value="${escapeAttribute(row.admin_note || "")}" />
          </label>
        </div>

        <div class="author-request-links">
          ${renderCheckLink("Lien auteur", row.author_profile_url || row.website)}
          ${renderCheckLink("Lien livre/éditeur", row.book_or_publisher_url)}
        </div>

        <div class="author-request-actions">
          <button type="button" class="cyber-btn-secondary" data-action="save">Enregistrer</button>
          <button type="button" class="cyber-btn-primary" data-action="validate">Valider</button>
          <button type="button" class="cyber-btn-danger" data-action="reject">Refuser</button>
          <button type="button" class="cyber-btn-secondary" data-action="hide">Masquer</button>
        </div>
      </article>
    `;
  }

  async function handlePanelClick(event) {
    const filterButton = event.target.closest("[data-author-filter]");
    if (filterButton) {
      currentFilter = filterButton.dataset.authorFilter || "pending";
      document.querySelectorAll("[data-author-filter]").forEach((button) => {
        button.classList.toggle("is-active", button === filterButton);
      });
      render();
      return;
    }

    if (event.target.closest("#author-requests-refresh")) {
      await loadRows();
      render();
      toast("Demandes auteurs actualisées");
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const card = actionButton.closest(".author-request-card");
    if (!card) return;

    const id = card.dataset.requestId;
    const action = actionButton.dataset.action;

    await updateRequestFromCard(id, card, action);
  }

  function handlePanelChange(event) {
    const select = event.target.closest("select[data-field]");
    if (!select) return;
    // Réservé : changement immédiat possible plus tard.
  }

  async function updateRequestFromCard(id, card, action) {
    const payload = readPayload(card);

    if (action === "validate") {
      payload.validated = true;
      payload.rejected = false;
    } else if (action === "reject") {
      payload.validated = false;
      payload.rejected = true;
    } else if (action === "hide") {
      payload.validated = false;
      payload.rejected = false;
    }

    payload.updated_at = new Date().toISOString();

    const { error } = await supabaseClient
      .from("event_authors_presence")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.warn("Admin auteurs : update impossible", error);
      toast("Erreur mise à jour demande auteur");
      return;
    }

    await loadRows();
    render();
    toast("Demande auteur mise à jour");
  }

  function readPayload(card) {
    const payload = {};

    card.querySelectorAll("[data-field]").forEach((field) => {
      const key = field.dataset.field;
      let value = field.value || "";

      if (["author_profile_url", "book_or_publisher_url"].includes(key)) {
        value = normalizeOptionalUrl(value);
      }

      if (key === "author_profile_url") {
        payload.website = value || null; // compatibilité ancien champ
      }

      payload[key] = value || null;
    });

    return payload;
  }

  function filterRows(items, filter) {
    if (filter === "validated") return items.filter((row) => row.validated === true);
    if (filter === "rejected") return items.filter((row) => row.rejected === true);
    if (filter === "pending") return items.filter(isPending);
    return items;
  }

  function isPending(row) {
    return row.validated !== true && row.rejected !== true;
  }

  function renderCheckLink(label, url) {
    if (!url) return "";
    return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function option(value, label, current) {
    return `<option value="${escapeAttribute(value)}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function statusToClass(status) {
    if (status === "validée") return "validated";
    if (status === "refusée") return "rejected";
    return "pending";
  }

  function normalizeOptionalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function showListError(message) {
    const list = document.getElementById("author-requests-list");
    if (list) list.innerHTML = `<p class="priority-empty">${escapeHtml(message)}</p>`;
  }

  function toast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    } else {
      console.log(message);
    }
  }

  function ensureStyles() {
    if (document.getElementById("admin-author-requests-seo-styles")) return;

    const style = document.createElement("style");
    style.id = "admin-author-requests-seo-styles";
    style.textContent = `
      .author-requests-toolbar,
      .author-request-actions,
      .author-request-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 14px 0;
      }

      .author-requests-toolbar .is-active {
        outline: 2px solid rgba(25,255,156,.42);
        color: var(--cyber-green);
      }

      .author-requests-list {
        display: grid;
        gap: 16px;
      }

      .author-request-card {
        padding: 16px;
        border-radius: 22px;
        background: rgba(8,18,14,.92);
        border: 1px solid rgba(25,255,156,.12);
      }

      .author-request-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 14px;
      }

      .author-request-head strong {
        display: block;
        font-size: 1rem;
      }

      .author-request-head small {
        display: block;
        margin-top: 4px;
        color: var(--cyber-muted);
        line-height: 1.35;
      }

      .author-request-status {
        flex: 0 0 auto;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: .75rem;
        font-weight: 900;
        text-transform: uppercase;
      }

      .author-request-status.is-pending {
        color: var(--cyber-orange);
        background: rgba(255,158,68,.12);
      }

      .author-request-status.is-validated {
        color: var(--cyber-green);
        background: rgba(25,255,156,.12);
      }

      .author-request-status.is-rejected {
        color: var(--cyber-red);
        background: rgba(255,95,115,.12);
      }

      .author-request-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .author-request-grid label {
        display: grid;
        gap: 6px;
      }

      .author-request-grid span {
        color: var(--cyber-muted);
        font-weight: 900;
        font-size: .78rem;
      }

      .author-request-grid input,
      .author-request-grid select {
        width: 100%;
        min-height: 42px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.14);
        padding: 10px 12px;
        background: rgba(255,255,255,.94);
        color: #111;
        font: inherit;
      }

      .author-request-links a {
        color: var(--cyber-cyan);
        font-weight: 900;
      }

      @media (max-width: 760px) {
        .author-request-head {
          flex-direction: column;
        }

        .author-request-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
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
