/* =========================================================
   DÉDICALIVRES — Correctif compteur visites admin V7.6.5

   Rôle :
   - lire la table site_visits avec le schéma réel :
     id, created_at, page, path, referrer, user_agent ;
   - mettre à jour la carte VISITES dans l'admin ;
   - mettre à jour les statistiques trafic si les blocs existent ;
   - ne pas remplacer admin.js, pour éviter les régressions.
========================================================= */

(function () {
  "use strict";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  ready(function () {
    setTimeout(initVisitsCounterFix, 600);
  });

  function initVisitsCounterFix() {
    const config = window.DEDICALIVRES_CONFIG;

    if (!config || !window.supabase) {
      console.warn("Correctif visites admin : configuration Supabase manquante.");
      return;
    }

    const client =
      (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
      window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
      window.DEDICALIVRES_SUPABASE_CLIENT = client;
    }

    updateVisitsWidgets(client);

    const refreshButton = document.getElementById("refresh-btn");
    if (refreshButton) {
      refreshButton.addEventListener("click", function () {
        setTimeout(function () {
          updateVisitsWidgets(client);
        }, 800);
      });
    }
  }

  async function updateVisitsWidgets(client) {
    const statsVisits = document.getElementById("stats-visits");
    const statsVisitsLabel = document.getElementById("stats-visits-label");

    try {
      const { count, error } = await client
        .from("site_visits")
        .select("*", { count: "exact", head: true });

      if (error) throw error;

      if (statsVisits) statsVisits.textContent = String(count || 0);
      if (statsVisitsLabel) statsVisitsLabel.textContent = "VISITES";
    } catch (error) {
      console.warn("Correctif visites admin : compteur site_visits indisponible.", error);
      if (statsVisits && (!statsVisits.textContent || statsVisits.textContent === "0")) {
        statsVisits.textContent = "0";
      }
    }

    await updateTrafficStats(client);
  }

  async function updateTrafficStats(client) {
    injectTrafficControlPanel();

    const trafficToday = document.getElementById("traffic-today");
    const trafficWeek = document.getElementById("traffic-week");
    const topSitePagesList = document.getElementById("top-site-pages-list");
    const trafficStatsStatus = document.getElementById("traffic-stats-status");

    if (!trafficToday && !trafficWeek && !topSitePagesList && !trafficStatsStatus) {
      return;
    }

    try {
      const { data, error } = await client
        .from("site_visits")
        .select("id, created_at, page, path, referrer, user_agent")
        .order("created_at", { ascending: false })
        .limit(1500);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];

      renderTrafficCounters(rows);
      renderTrafficSources(rows);

      if (trafficToday) trafficToday.textContent = String(countSince(rows, 1, true));
      if (trafficWeek) trafficWeek.textContent = String(countSince(rows, 7, false));
      if (trafficStatsStatus) {
        trafficStatsStatus.textContent = `${rows.length} visite${rows.length > 1 ? "s" : ""} site enregistrée${rows.length > 1 ? "s" : ""}`;
      }

      renderTopPages(topSitePagesList, rows);
    } catch (error) {
      console.warn("Correctif visites admin : statistiques site_visits indisponibles.", error);
      if (trafficStatsStatus) trafficStatsStatus.textContent = "Statistiques visites indisponibles";
      if (topSitePagesList) {
        topSitePagesList.innerHTML = `<p class="priority-empty">Impossible de charger les pages consultées.</p>`;
      }
    }
  }

  function injectTrafficControlPanel() {
    const statsTab = document.getElementById("tab-stats");
    if (!statsTab || document.getElementById("traffic-control-panel")) return;

    const panel = document.createElement("section");
    panel.id = "traffic-control-panel";
    panel.className = "admin-panel traffic-control-panel";
    panel.innerHTML = `
      <div class="section-head">
        <h3>TRAFIC VISITEURS</h3>
        <span id="traffic-stats-status">Lecture des visites…</span>
      </div>

      <div class="traffic-counter-grid" aria-label="Compteurs de visites">
        <article class="traffic-counter is-today"><span>Aujourd’hui</span><strong id="traffic-today">0</strong></article>
        <article class="traffic-counter is-week"><span>7 jours</span><strong id="traffic-week">0</strong></article>
        <article class="traffic-counter is-month"><span>30 jours</span><strong id="traffic-month">0</strong></article>
        <article class="traffic-counter is-total"><span>Total</span><strong id="traffic-total">0</strong></article>
      </div>

      <div class="traffic-split-grid">
        <article class="cockpit-plain-panel">
          <h4>Origine des visiteurs</h4>
          <div id="traffic-sources-list" class="traffic-list">Chargement…</div>
        </article>

        <article class="cockpit-plain-panel">
          <h4>Pages consultées</h4>
          <div id="top-site-pages-list" class="traffic-list">Chargement…</div>
        </article>
      </div>
    `;

    const statsPanel = statsTab.querySelector(".cockpit-stats-panel");
    if (statsPanel) statsPanel.insertAdjacentElement("afterend", panel);
    else statsTab.prepend(panel);
  }

  function renderTrafficCounters(rows) {
    setPlainText("traffic-today", countSince(rows, 1, true));
    setPlainText("traffic-week", countSince(rows, 7, false));
    setPlainText("traffic-month", countSince(rows, 30, false));
    setPlainText("traffic-total", rows.length);
  }

  function renderTrafficSources(rows) {
    const container = document.getElementById("traffic-sources-list");
    if (!container) return;

    if (!rows.length) {
      container.innerHTML = `<p class="priority-empty">Aucune source enregistrée pour le moment.</p>`;
      return;
    }

    const counts = new Map();

    rows.forEach(function (row) {
      const source = getTrafficSource(row.referrer);
      const current = counts.get(source.key) || {
        label: source.label,
        detail: source.detail,
        count: 0
      };
      current.count += 1;
      counts.set(source.key, current);
    });

    const items = Array.from(counts.values())
      .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label, "fr"); })
      .slice(0, 8);

    container.innerHTML = items.map(function (item) {
      return `
        <div class="traffic-list-row">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <small>${escapeHtml(item.detail)}</small>
          </div>
          <span>${item.count}</span>
        </div>
      `;
    }).join("");
  }

  function getTrafficSource(referrer) {
    const value = String(referrer || "").trim();

    if (!value) {
      return {
        key: "direct",
        label: "Accès direct",
        detail: "Favori, saisie directe ou source masquée"
      };
    }

    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");

      if (host.includes("google.")) {
        return {
          key: "google",
          label: "Google",
          detail: host
        };
      }

      if (host === "dedicalivres.fr" || host === "dédicalivres.fr" || host.endsWith(".dedicalivres.fr") || host.endsWith(".dédicalivres.fr")) {
        return {
          key: "dedicalivres",
          label: "Dédicalivres",
          detail: host
        };
      }

      return {
        key: host,
        label: host,
        detail: "Site référent"
      };
    } catch {
      return {
        key: "other",
        label: "Autre source",
        detail: value.slice(0, 80)
      };
    }
  }

  function countSince(rows, days, todayOnly) {
    const now = new Date();
    const start = new Date(now);

    if (todayOnly) {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(now.getDate() - days);
    }

    return rows.filter(function (row) {
      if (!row.created_at) return false;
      return new Date(row.created_at) >= start;
    }).length;
  }

  function renderTopPages(container, rows) {
    if (!container) return;

    if (!rows.length) {
      container.innerHTML = `<p class="priority-empty">Aucune visite enregistrée pour le moment.</p>`;
      return;
    }

    const counts = new Map();

    rows.forEach(function (row) {
      const path = cleanPath(row.path || "/");
      const label = cleanLabel(row.page || path);
      const current = counts.get(path) || { path, label, count: 0 };
      current.count += 1;
      if (label && label !== path) current.label = label;
      counts.set(path, current);
    });

    const items = Array.from(counts.values())
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 8);

    container.innerHTML = items.map(function (item) {
      return `
        <div class="traffic-list-row">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <small>${escapeHtml(item.path)}</small>
          </div>
          <span>${item.count}</span>
        </div>
      `;
    }).join("");
  }

  function setPlainText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? "0");
  }

  function cleanPath(value) {
    return String(value || "/").replace(/^https?:\/\/[^/]+/i, "") || "/";
  }

  function cleanLabel(value) {
    return String(value || "Page")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
