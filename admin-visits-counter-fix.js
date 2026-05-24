/* =========================================================
   DÉDICALIVRES — Admin Traffic 1

   Rôle :
   - lire site_visits avec le schéma réel :
     id, created_at, page, path, referrer, user_agent ;
   - lire event_visits pour les fiches événements les plus vues ;
   - mettre à jour la carte VISITES et le panneau Trafic ;
   - rester isolé de admin.js pour éviter les régressions.
========================================================= */

(function () {
  "use strict";

  const SITE_VISITS_LIMIT = 1500;
  const EVENT_VISITS_LIMIT = 1500;

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
      console.warn("Admin Traffic : configuration Supabase manquante.");
      return;
    }

    const client = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );

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
      console.warn("Admin Traffic : compteur site_visits indisponible.", error);
      if (statsVisits && (!statsVisits.textContent || statsVisits.textContent === "0")) {
        statsVisits.textContent = "0";
      }
    }

    await Promise.all([
      updateSiteTrafficStats(client),
      updateEventTrafficStats(client)
    ]);
  }

  async function updateSiteTrafficStats(client) {
    const trafficToday = document.getElementById("traffic-today");
    const trafficWeek = document.getElementById("traffic-week");
    const trafficRowsCount = document.getElementById("traffic-rows-count");
    const topSitePagesList = document.getElementById("top-site-pages-list");
    const topReferrersList = document.getElementById("top-referrers-list");
    const trafficStatsStatus = document.getElementById("traffic-stats-status");

    if (!trafficToday && !trafficWeek && !topSitePagesList && !trafficStatsStatus) {
      return;
    }

    try {
      const { data, error } = await client
        .from("site_visits")
        .select("id, created_at, page, path, referrer, user_agent")
        .order("created_at", { ascending: false })
        .limit(SITE_VISITS_LIMIT);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];

      if (trafficToday) trafficToday.textContent = String(countSince(rows, 1, true));
      if (trafficWeek) trafficWeek.textContent = String(countSince(rows, 7, false));
      if (trafficRowsCount) trafficRowsCount.textContent = String(rows.length);
      if (trafficStatsStatus) {
        trafficStatsStatus.textContent = `${rows.length} visite${rows.length > 1 ? "s" : ""} récente${rows.length > 1 ? "s" : ""} analysée${rows.length > 1 ? "s" : ""}`;
      }

      renderTopPages(topSitePagesList, rows);
      renderTopReferrers(topReferrersList, rows);
    } catch (error) {
      console.warn("Admin Traffic : statistiques site_visits indisponibles.", error);
      if (trafficStatsStatus) trafficStatsStatus.textContent = "Statistiques visites indisponibles";
      if (topSitePagesList) {
        topSitePagesList.innerHTML = `<p class="priority-empty">Impossible de charger les pages consultées.</p>`;
      }
      if (topReferrersList) {
        topReferrersList.innerHTML = `<p class="priority-empty">Sources indisponibles.</p>`;
      }
    }
  }

  async function updateEventTrafficStats(client) {
    const total = document.getElementById("traffic-event-views-count");
    const list = document.getElementById("top-event-pages-list");

    if (!total && !list) return;

    try {
      const { data, error } = await client
        .from("event_visits")
        .select(`
          id,
          created_at,
          event_id,
          path,
          events (
            id,
            title,
            city,
            region,
            start_date
          )
        `)
        .order("created_at", { ascending: false })
        .limit(EVENT_VISITS_LIMIT);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      if (total) total.textContent = String(rows.length);
      renderTopEvents(list, rows);
    } catch (error) {
      console.warn("Admin Traffic : statistiques event_visits indisponibles.", error);
      if (total) total.textContent = "0";
      if (list) {
        list.innerHTML = `<p class="priority-empty">Fiches événements indisponibles.</p>`;
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
      return renderTrafficRow(item.label, item.path, item.count, item.path);
    }).join("");
  }

  function renderTopEvents(container, rows) {
    if (!container) return;

    if (!rows.length) {
      container.innerHTML = `<p class="priority-empty">Aucune vue événement enregistrée pour le moment.</p>`;
      return;
    }

    const counts = new Map();

    rows.forEach(function (row) {
      const id = String(row.event_id || "");
      if (!id) return;

      const event = row.events || {};
      const current = counts.get(id) || {
        id,
        count: 0,
        title: event.title || `Événement ${id}`,
        meta: [event.city, event.region].filter(Boolean).join(" — "),
        url: `event.html?id=${encodeURIComponent(id)}`
      };

      current.count += 1;
      counts.set(id, current);
    });

    const items = Array.from(counts.values())
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 8);

    container.innerHTML = items.map(function (item) {
      return renderTrafficRow(item.title, item.meta || "Fiche événement", item.count, item.url);
    }).join("");
  }

  function renderTopReferrers(container, rows) {
    if (!container) return;

    const external = rows
      .map(function (row) { return normalizeReferrer(row.referrer); })
      .filter(Boolean);

    if (!external.length) {
      container.innerHTML = `<p class="priority-empty">Aucune source externe lisible pour le moment.</p>`;
      return;
    }

    const counts = new Map();
    external.forEach(function (label) {
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    const items = Array.from(counts.entries())
      .map(function ([label, count]) { return { label, count }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 8);

    container.innerHTML = items.map(function (item) {
      return renderTrafficRow(item.label, "Source externe", item.count, "");
    }).join("");
  }

  function renderTrafficRow(title, meta, count, href) {
    const content = `
      <div>
        <strong>${escapeHtml(title || "Page")}</strong>
        <small>${escapeHtml(meta || "")}</small>
      </div>
      <span>${count}</span>
    `;

    if (href && /^event\.html\?id=/.test(href)) {
      return `<a class="traffic-list-row" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
    }

    return `<div class="traffic-list-row">${content}</div>`;
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

  function normalizeReferrer(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
      const url = new URL(raw);
      if (url.hostname.includes("dedicalivres.fr")) return "";
      return url.hostname.replace(/^www\./, "");
    } catch {
      return raw.slice(0, 80);
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
