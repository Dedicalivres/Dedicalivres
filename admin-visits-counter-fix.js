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
    let exactTotal = null;

    try {
      const { count, error } = await client
        .from("site_visits")
        .select("*", { count: "exact", head: true });

      if (error) throw error;

      exactTotal = count || 0;

      if (statsVisits) statsVisits.textContent = String(exactTotal);
      if (statsVisitsLabel) statsVisitsLabel.textContent = "VISITES";
    } catch (error) {
      console.warn("Correctif visites admin : compteur site_visits indisponible.", error);
      if (statsVisits && (!statsVisits.textContent || statsVisits.textContent === "0")) {
        statsVisits.textContent = "0";
      }
    }

    await updateTrafficStats(client, exactTotal);
  }

  async function updateTrafficStats(client, exactTotal) {
    injectTrafficOverviewPanel();
    injectTrafficControlPanel();

    const trafficToday = document.getElementById("traffic-today");
    const trafficWeek = document.getElementById("traffic-week");
    const topSitePagesList = document.getElementById("top-site-pages-list");
    const trafficStatsStatus = document.getElementById("traffic-stats-status");

    if (!trafficToday && !trafficWeek && !topSitePagesList && !trafficStatsStatus) {
      return;
    }

    try {
      const windows = getTrafficWindows();
      const [
        rows,
        counters
      ] = await Promise.all([
        fetchTrafficRows(client, exactTotal),
        fetchTrafficCounters(client, windows, exactTotal)
      ]);

      renderTrafficCounters(counters);
      renderTrafficSources(rows);

      if (trafficToday) trafficToday.textContent = String(counters.today);
      if (trafficWeek) trafficWeek.textContent = String(counters.week);
      if (trafficStatsStatus) {
        trafficStatsStatus.textContent =
          rows.length < counters.total
            ? `${counters.total} visite${counters.total > 1 ? "s" : ""} au total · sources sur les ${rows.length} dernières`
            : `${counters.total} visite${counters.total > 1 ? "s" : ""} au total · sources complètes`;
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

  async function fetchTrafficRows(client, exactTotal) {
    const pageSize = 1000;
    const total = Number.isFinite(Number(exactTotal)) ? Number(exactTotal) : 3000;
    const maxRows = Math.max(1000, Math.min(total || 3000, 5000));
    const rows = [];

    for (let from = 0; from < maxRows; from += pageSize) {
      const to = Math.min(from + pageSize - 1, maxRows - 1);
      const { data, error } = await client
        .from("site_visits")
        .select("id, created_at, page, path, referrer, user_agent")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const pageRows = Array.isArray(data) ? data : [];
      rows.push(...pageRows);

      if (pageRows.length < pageSize) break;
    }

    return rows;
  }

  function getTrafficWindows() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const week = new Date();
    week.setDate(week.getDate() - 7);

    const month = new Date();
    month.setDate(month.getDate() - 30);

    return {
      today: today.toISOString(),
      week: week.toISOString(),
      month: month.toISOString()
    };
  }

  async function fetchTrafficCounters(client, windows, exactTotal) {
    const [today, week, month, total] = await Promise.all([
      fetchTrafficCount(client, windows.today),
      fetchTrafficCount(client, windows.week),
      fetchTrafficCount(client, windows.month),
      Number.isFinite(Number(exactTotal))
        ? Promise.resolve(Number(exactTotal))
        : fetchTrafficCount(client)
    ]);

    return {
      today,
      week,
      month,
      total
    };
  }

  async function fetchTrafficCount(client, sinceIso) {
    let query = client
      .from("site_visits")
      .select("*", { count: "exact", head: true });

    if (sinceIso) {
      query = query.gte("created_at", sinceIso);
    }

    const { count, error } = await query;

    if (error) throw error;

    return count || 0;
  }

  function injectTrafficOverviewPanel() {
    const overviewTab = document.getElementById("tab-overview");
    const statsGrid = overviewTab?.querySelector(".stats-grid");

    if (!overviewTab || !statsGrid || document.getElementById("traffic-overview-panel")) return;

    const panel = document.createElement("section");
    panel.id = "traffic-overview-panel";
    panel.className = "admin-panel traffic-control-panel traffic-overview-panel";
    panel.innerHTML = `
      <div class="section-head">
        <h3>TRAFIC EN DIRECT</h3>
        <span>Décomposition du compteur global</span>
      </div>

      <div class="traffic-counter-grid" aria-label="Compteurs de visites du tableau de bord">
        <article class="traffic-counter is-today"><span>Aujourd’hui</span><strong id="traffic-overview-today">0</strong></article>
        <article class="traffic-counter is-week"><span>7 jours</span><strong id="traffic-overview-week">0</strong></article>
        <article class="traffic-counter is-month"><span>30 jours</span><strong id="traffic-overview-month">0</strong></article>
        <article class="traffic-counter is-total"><span>Total</span><strong id="traffic-overview-total">0</strong></article>
      </div>

      <div class="traffic-overview-sources">
        <div class="traffic-overview-head">
          <strong>Sources principales</strong>
          <small>Google, Dédicalivres, accès direct et référents</small>
        </div>
        <div id="traffic-overview-sources-list" class="traffic-source-pills">Chargement…</div>
      </div>
    `;

    const missionPanel = document.getElementById("admin-mission-panel");
    if (missionPanel) missionPanel.insertAdjacentElement("afterend", panel);
    else statsGrid.insertAdjacentElement("afterend", panel);
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

  function renderTrafficCounters(counters) {
    setPlainText("traffic-today", counters.today);
    setPlainText("traffic-week", counters.week);
    setPlainText("traffic-month", counters.month);
    setPlainText("traffic-total", counters.total);
    setPlainText("traffic-overview-today", counters.today);
    setPlainText("traffic-overview-week", counters.week);
    setPlainText("traffic-overview-month", counters.month);
    setPlainText("traffic-overview-total", counters.total);
  }

  function renderTrafficSources(rows) {
    const container = document.getElementById("traffic-sources-list");
    const overviewContainer = document.getElementById("traffic-overview-sources-list");

    if (!rows.length) {
      if (container) container.innerHTML = `<p class="priority-empty">Aucune source enregistrée pour le moment.</p>`;
      if (overviewContainer) overviewContainer.innerHTML = `<span class="traffic-source-pill">Aucune source</span>`;
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

    if (container) {
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

    if (overviewContainer) {
      overviewContainer.innerHTML = items.slice(0, 5).map(function (item) {
      return `
        <span class="traffic-source-pill">
          <b>${escapeHtml(item.label)}</b>
          ${item.count}
        </span>
      `;
      }).join("");
    }
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

      if (host === "xn--ddicalivres-bbb.fr" || host.endsWith(".xn--ddicalivres-bbb.fr") || host === "dédicalivres.fr" || host.endsWith(".dédicalivres.fr")) {
        return {
          key: "dedicalivres-accent",
          label: "dédicalivres.fr",
          detail: host
        };
      }

      if (host === "dedicalivres.fr" || host.endsWith(".dedicalivres.fr")) {
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
