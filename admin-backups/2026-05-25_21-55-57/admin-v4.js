/*
  DÉDICALIVRES — Admin V4 Stats
  Affiche les visites site + fiches événements dans l’admin.
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !window.supabase) return;

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(loadV4Stats, 1200);
  });

  async function loadV4Stats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const week = new Date();
      week.setDate(week.getDate() - 7);

      const { count: totalVisits } = await client
        .from("site_visits")
        .select("*", { count: "exact", head: true });

      const { count: todayVisits } = await client
        .from("site_visits")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      const { count: weekVisits } = await client
        .from("site_visits")
        .select("*", { count: "exact", head: true })
        .gte("created_at", week.toISOString());

      setText("visits-total-odo", formatOdometer(totalVisits || 0));
      setText("visits-today-big", todayVisits || 0);
      setText("visits-week", weekVisits || 0);

      await loadTopPages();
      await loadTopEvents();
    } catch (error) {
      console.warn("Stats V4 non disponibles :", error);
    }
  }

  async function loadTopPages() {
    const container = document.getElementById("top-pages");
    if (!container) return;

    const { data, error } = await client
      .from("site_visits")
      .select("path, created_at")
      .limit(1000);

    if (error) {
      container.innerHTML = `<p class="empty">Stats indisponibles.</p>`;
      return;
    }

    const counts = new Map();

    (data || []).forEach((row) => {
      const path = row.path || "/";
      counts.set(path, (counts.get(path) || 0) + 1);
    });

    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (!top.length) {
      container.innerHTML = `<p class="empty">Aucune visite enregistrée.</p>`;
      return;
    }

    container.innerHTML = top
      .map(([path, count]) => {
        return `
          <article class="top-page-item">
            <span>${escapeHtml(path)}</span>
            <strong>${count}</strong>
          </article>
        `;
      })
      .join("");
  }

  async function loadTopEvents() {
    const container = document.getElementById("top-events-v4");

    if (!container) return;

    const { data, error } = await client
      .from("event_visits")
      .select(`
        event_id,
        events (
          id,
          title,
          city,
          start_date
        )
      `)
      .limit(1000);

    if (error) {
      container.innerHTML = `<p class="empty">Événements populaires indisponibles.</p>`;
      return;
    }

    const map = new Map();

    (data || []).forEach((row) => {
      const id = String(row.event_id || "");
      if (!id) return;

      if (!map.has(id)) {
        map.set(id, {
          count: 0,
          event: row.events || null
        });
      }

      map.get(id).count++;
    });

    const top = [...map.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    if (!top.length) {
      container.innerHTML = `<p class="empty">Aucune vue événement enregistrée.</p>`;
      return;
    }

    container.innerHTML = top
      .map((item) => {
        const event = item.event || {};

        return `
          <article class="top-page-item">
            <span>
              ${escapeHtml(event.title || "Événement")}
              ${event.city ? `<small>${escapeHtml(event.city)}</small>` : ""}
            </span>
            <strong>${item.count}</strong>
          </article>
        `;
      })
      .join("");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (!element) return;

    if (id === "visits-total-odo" && typeof value === "string") {
      element.innerHTML = value;
      return;
    }

    element.textContent = value;
  }

  function formatOdometer(value) {
    const text = String(value).padStart(6, "0");

    return text
      .split("")
      .map((char) => `<span>${char}</span>`)
      .join("");
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
