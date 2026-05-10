/* =========================================================
   DÉDICALIVRES — ADMIN QUALITÉ CONTENU V7.7.0c
   Module isolé : ajoute un panneau de contrôle qualité sans
   modifier la logique principale admin.js.
========================================================= */
(function () {
  "use strict";

  const VERSION = "7.7.7a";
  const SOON_DAYS = 14;

  const config = window.DEDICALIVRES_CONFIG;
  if (!config || !window.supabase) {
    console.warn("Qualité contenu : configuration Supabase manquante.");
    return;
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  let rows = [];
  let currentFilter = "all";
  let currentSearch = "";

  ready(function () {
    waitForAdmin();
  });

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  function waitForAdmin(attempt = 0) {
    const moderationPanel = document.getElementById("tab-events");
    if (moderationPanel) {
      injectStatCard();
      injectPanel(moderationPanel);
      bindGlobalRefresh();
      loadQualityRows();
      return;
    }

    if (attempt < 40) {
      setTimeout(function () {
        waitForAdmin(attempt + 1);
      }, 200);
    }
  }

  function injectStatCard() {
    const statsGrid = document.querySelector("#tab-overview .stats-grid");
    if (!statsGrid || document.getElementById("stats-quality-card")) return;

    const card = document.createElement("article");
    card.id = "stats-quality-card";
    card.className = "stat-card glow-cyan stat-card-quality";
    card.innerHTML = `
      <span class="stat-label">QUALITÉ</span>
      <strong id="stats-quality-issues">0</strong>
    `;

    statsGrid.appendChild(card);
  }

  function injectPanel(moderationPanel) {
    if (document.getElementById("quality-control-panel")) return;

    const panel = document.createElement("section");
    panel.id = "quality-control-panel";
    panel.className = "admin-panel quality-control-panel";
    panel.innerHTML = `
      <div class="section-head">
        <h3>QUALITÉ CONTENU</h3>
        <span id="quality-control-count">Chargement…</span>
      </div>

      <div class="quality-intro">
        <strong>Radar éditorial</strong>
        <small>
          Repère les fiches à améliorer avant diffusion publique ou publication Instagram : image, site officiel,
          coordonnées, description et événements proches.
        </small>
      </div>

      <div class="quality-kpi-grid" id="quality-kpi-grid">
        <article class="quality-kpi"><b>0</b><span>sans image</span></article>
        <article class="quality-kpi"><b>0</b><span>sans coordonnées</span></article>
        <article class="quality-kpi"><b>0</b><span>sans site officiel</span></article>
        <article class="quality-kpi"><b>0</b><span>à venir bientôt</span></article>
      </div>

      <div class="quality-toolbar">
        <input id="quality-search" type="search" placeholder="Rechercher titre, ville, région…" />
        <select id="quality-filter">
          <option value="all">Toutes les alertes</option>
          <option value="missing-image">Sans image</option>
          <option value="missing-coordinates">Sans coordonnées</option>
          <option value="missing-website">Sans site officiel</option>
          <option value="short-description">Description courte</option>
          <option value="soon">Événements sous ${SOON_DAYS} jours</option>
          <option value="past">Événements passés</option>
        </select>
        <button id="quality-refresh" class="cyber-btn-secondary" type="button">Rafraîchir</button>
        <span class="badge pending">V${VERSION}</span>
      </div>

      <div id="quality-control-list" class="quality-control-list">
        <article class="event-card">Chargement des alertes qualité…</article>
      </div>
    `;

    const firstPanel = moderationPanel.querySelector("#quality-anchor") || moderationPanel.querySelector(".admin-panel");
    if (firstPanel?.id === "quality-anchor") firstPanel.replaceWith(panel);
    else if (firstPanel) moderationPanel.insertBefore(panel, firstPanel);
    else moderationPanel.appendChild(panel);

    document.getElementById("quality-refresh")?.addEventListener("click", loadQualityRows);
    document.getElementById("quality-filter")?.addEventListener("change", function (event) {
      currentFilter = event.target.value || "all";
      renderQuality();
    });
    document.getElementById("quality-search")?.addEventListener("input", function (event) {
      currentSearch = normalize(event.target.value || "");
      renderQuality();
    });
  }

  function bindGlobalRefresh() {
    document.getElementById("refresh-btn")?.addEventListener("click", function () {
      setTimeout(loadQualityRows, 900);
    });
  }

  async function loadQualityRows() {
    const list = document.getElementById("quality-control-list");
    const count = document.getElementById("quality-control-count");

    if (list) list.innerHTML = `<article class="event-card">Chargement des alertes qualité…</article>`;
    if (count) count.textContent = "Chargement…";

    try {
      const { data, error } = await client
        .from("events")
        .select("id,title,type,city,region,start_date,end_date,website,description,image_url,lat,lng,validated,rejected,featured,created_at")
        .order("start_date", { ascending: true });

      if (error) throw error;

      rows = Array.isArray(data) ? data : [];
      renderQuality();
    } catch (error) {
      console.warn("Qualité contenu indisponible :", error);
      if (list) {
        list.innerHTML = `
          <article class="event-card">
            Impossible de charger le radar qualité.<br>
            <small>${escapeHtml(error.message || "Erreur Supabase")}</small>
          </article>
        `;
      }
      if (count) count.textContent = "Erreur";
    }
  }

  function renderQuality() {
    updateQualityKpis();

    const list = document.getElementById("quality-control-list");
    const count = document.getElementById("quality-control-count");
    if (!list || !count) return;

    const items = getQualityItems();
    const filtered = items.filter(function (item) {
      if (currentFilter !== "all" && !item.issueKeys.includes(currentFilter)) return false;
      if (!currentSearch) return true;
      return item.search.includes(currentSearch);
    });

    const allIssueCount = items.reduce(function (acc, item) {
      return acc + item.issueKeys.length;
    }, 0);

    const statsQuality = document.getElementById("stats-quality-issues");
    if (statsQuality) statsQuality.textContent = String(allIssueCount);

    count.textContent = `${filtered.length} fiche${filtered.length > 1 ? "s" : ""} à surveiller · ${allIssueCount} alerte${allIssueCount > 1 ? "s" : ""}`;

    if (!filtered.length) {
      list.innerHTML = `
        <article class="event-card">
          Aucun point qualité pour ce filtre.
        </article>
      `;
      return;
    }

    list.innerHTML = filtered.slice(0, 80).map(renderQualityRow).join("");
    bindQualityActions(list);
  }

  function getQualityItems() {
    const today = startOfDay(new Date());
    const soonLimit = new Date(today);
    soonLimit.setDate(today.getDate() + SOON_DAYS);

    return rows
      .filter(function (event) { return event && event.rejected !== true; })
      .map(function (event) {
        const issues = [];
        const issueKeys = [];
        const start = parseDate(event.start_date);
        const end = parseDate(event.end_date) || start;
        const description = String(event.description || "").trim();

        if (!event.image_url) addIssue("missing-image", "Sans image", issues, issueKeys);
        if (!hasCoordinates(event)) addIssue("missing-coordinates", "Sans coordonnées", issues, issueKeys);
        if (!String(event.website || "").trim()) addIssue("missing-website", "Sans site officiel", issues, issueKeys);
        if (!description || description.length < 80) addIssue("short-description", "Description courte", issues, issueKeys);
        if (start && start >= today && start <= soonLimit) addIssue("soon", `Sous ${SOON_DAYS} jours`, issues, issueKeys);
        if (end && end < today) addIssue("past", "Événement passé", issues, issueKeys);
        if (event.validated !== true) addIssue("not-validated", "Non validé", issues, issueKeys);

        return {
          event,
          issues,
          issueKeys,
          search: normalize([
            event.title,
            event.city,
            event.region,
            event.type,
            event.website,
            issues.join(" ")
          ].filter(Boolean).join(" "))
        };
      })
      .filter(function (item) { return item.issueKeys.length > 0; })
      .sort(sortQualityItems);
  }

  function addIssue(key, label, issues, issueKeys) {
    issues.push(label);
    issueKeys.push(key);
  }

  function updateQualityKpis() {
    const grid = document.getElementById("quality-kpi-grid");
    if (!grid) return;

    const active = rows.filter(function (event) { return event && event.rejected !== true; });
    const today = startOfDay(new Date());
    const soonLimit = new Date(today);
    soonLimit.setDate(today.getDate() + SOON_DAYS);

    const missingImage = active.filter(function (event) { return !event.image_url; }).length;
    const missingCoordinates = active.filter(function (event) { return !hasCoordinates(event); }).length;
    const missingWebsite = active.filter(function (event) { return !String(event.website || "").trim(); }).length;
    const soon = active.filter(function (event) {
      const start = parseDate(event.start_date);
      return start && start >= today && start <= soonLimit;
    }).length;

    grid.innerHTML = `
      <article class="quality-kpi"><b>${missingImage}</b><span>sans image</span></article>
      <article class="quality-kpi"><b>${missingCoordinates}</b><span>sans coordonnées</span></article>
      <article class="quality-kpi"><b>${missingWebsite}</b><span>sans site officiel</span></article>
      <article class="quality-kpi"><b>${soon}</b><span>à venir sous ${SOON_DAYS} jours</span></article>
    `;
  }

  function renderQualityRow(item) {
    const event = item.event;
    const dateLabel = formatDateRange(event.start_date, event.end_date);
    const location = [event.city, event.region].filter(Boolean).join(", ") || "Lieu non précisé";
    const image = event.image_url
      ? `<img class="event-admin-thumb" src="${escapeAttribute(event.image_url)}" alt="" />`
      : `<div class="event-admin-thumb-placeholder">SANS IMAGE</div>`;

    return `
      <article class="event-card quality-row">
        ${image}

        <div>
          <div class="event-title">${escapeHtml(event.title || "Sans titre")}</div>
          <div class="event-meta">
            <span>📅 ${escapeHtml(dateLabel || "Date non précisée")}</span>
            <span>📍 ${escapeHtml(location)}</span>
            ${event.type ? `<span>🏷️ ${escapeHtml(event.type)}</span>` : ""}
          </div>
          <div class="quality-badges">
            ${item.issues.map(function (issue) {
              return `<span class="badge pending">${escapeHtml(issue)}</span>`;
            }).join("")}
          </div>
        </div>

        <div class="event-actions quality-actions">
          <a class="event-action edit" href="event.html?id=${encodeURIComponent(event.id)}" target="_blank" rel="noopener noreferrer" title="Voir la fiche publique">↗</a>
          <button class="event-action edit" type="button" data-quality-edit="${escapeAttribute(event.id)}" title="Modifier">✎</button>
        </div>
      </article>
    `;
  }

  function bindQualityActions(container) {
    container.querySelectorAll("[data-quality-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-quality-edit");
        if (typeof window.openEditModal === "function") {
          window.openEditModal(id);
        } else if (typeof openEditModal === "function") {
          openEditModal(id);
        } else {
          alert("Ouvre l’événement dans la supervision pour le modifier.");
        }
      });
    });
  }

  function sortQualityItems(a, b) {
    const priorityA = getPriority(a.issueKeys);
    const priorityB = getPriority(b.issueKeys);
    if (priorityA !== priorityB) return priorityA - priorityB;

    const dateA = parseDate(a.event.start_date);
    const dateB = parseDate(b.event.start_date);
    if (dateA && dateB) return dateA.getTime() - dateB.getTime();
    if (dateA) return -1;
    if (dateB) return 1;
    return String(a.event.title || "").localeCompare(String(b.event.title || ""), "fr");
  }

  function getPriority(keys) {
    if (keys.includes("soon") && keys.includes("missing-image")) return 0;
    if (keys.includes("soon")) return 1;
    if (keys.includes("missing-coordinates")) return 2;
    if (keys.includes("missing-image")) return 3;
    if (keys.includes("missing-website")) return 4;
    if (keys.includes("short-description")) return 5;
    if (keys.includes("past")) return 6;
    return 9;
  }

  function hasCoordinates(event) {
    return Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng));
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return startOfDay(date);
  }

  function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function formatDateRange(start, end) {
    if (!start) return "";
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) return "";

    const options = { day: "numeric", month: "short", year: "numeric" };
    const startLabel = startDate.toLocaleDateString("fr-FR", options);

    if (!end || end === start) return startLabel;

    const endDate = new Date(end);
    if (Number.isNaN(endDate.getTime())) return startLabel;

    return `${startLabel} → ${endDate.toLocaleDateString("fr-FR", options)}`;
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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
