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
