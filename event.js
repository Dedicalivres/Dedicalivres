(function () {
  const config = window.DEDICALIVRES_CONFIG;
  const geo = window.DEDICALIVRES_GEO;
  const container = document.getElementById("event-detail");

  if (!config || !container) return;

  const client =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = client;
  }
  const FAVORITES_KEY = "dedicalivres_favorites";
  const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");
  let leafletAssetsPromise = null;

  if (!eventId) {
    container.innerHTML = `<div class="empty-state"><p>Événement introuvable.</p></div>`;
    return;
  }

  loadEvent(eventId);

  async function loadEvent(id) {
    const { data, error } = await client
      .from("events")
      .select("*")
      .eq("id", id)
      .eq("validated", true)
      .maybeSingle();

    if (error || !data) {
      container.innerHTML = `<div class="empty-state"><p>Impossible de charger cet événement.</p></div>`;
      return;
    }

    document.title = `${data.title || "Événement"} — Dédicalivres`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", `${data.title || "Événement littéraire"} à ${data.city || "proximité"} — informations, dates et lien officiel.`);

    const image = renderDetailImage(data.image_url, data.title || "Événement");

    container.innerHTML = `
      ${image}

      <div class="detail-body">
        <div class="card-tags">
          ${data.type ? `<span class="badge">${escapeHtml(data.type)}</span>` : ""}
          ${data.price ? `<span class="badge badge-price">${escapeHtml(data.price)}</span>` : ""}
        </div>

        <h1 class="detail-title">${escapeHtml(data.title || "Sans titre")}</h1>

        <div class="detail-meta detail-info-grid">
          ${data.start_date ? `<p>📅 <strong>Date :</strong> ${formatDateRange(data.start_date, data.end_date)}</p>` : ""}
          <p>📍 <strong>Lieu :</strong> ${escapeHtml(formatEventPlace(data)) || "Non précisé"}</p>
        </div>

        ${data.description ? `<div class="detail-description">${escapeHtml(data.description).replace(/\n/g, "<br>")}</div>` : ""}

        <div class="detail-actions">
          ${data.website ? `<a class="btn-primary detail-button" href="${escapeAttribute(data.website)}" target="_blank" rel="noopener noreferrer">Site officiel</a>` : ""}
          <button id="detail-favorite-btn" class="btn-secondary detail-button favorite-toggle" type="button">♡ Ajouter aux favoris</button>
          <button id="detail-calendar-btn" class="btn-secondary detail-button" type="button">📅 Ajouter à mon agenda</button>
          <a class="btn-secondary detail-button" href="index.html#agenda">Retour à l’agenda</a>
        </div>

        ${Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng)) ? `
              <div class="detail-map-block">
                <h2>Localisation</h2>
                <p>Repérez rapidement le lieu de cet événement littéraire.</p>
                <div id="detail-map"></div>
              </div>
            ` : ""}
      </div>
    `;

    bindDetailActions(data);

    if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
      initDetailMap(data);
    }
  }

  async function initDetailMap(event) {
    const mapElement = document.getElementById("detail-map");
    if (!mapElement) return;

    mapElement.innerHTML = `
      <div class="map-loading-state">
        <strong>Carte en cours de chargement</strong>
        <span>Elle se lance uniquement sur cette fiche.</span>
      </div>
    `;

    try {
      await ensureLeafletAssets();
      if (!window.L) throw new Error("Leaflet indisponible");

      mapElement.innerHTML = "";

      const map = L.map("detail-map", { scrollWheelZoom: false }).setView(
        [Number(event.lat), Number(event.lng)],
        11
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      L.marker([Number(event.lat), Number(event.lng)])
        .addTo(map)
        .bindPopup(escapeHtml(event.title || "Événement"))
        .openPopup();
    } catch (error) {
      console.warn("Carte fiche événement indisponible :", error);
      mapElement.innerHTML = `
        <div class="empty-state">
          <p>Carte indisponible pour le moment. Le lieu reste indiqué dans les informations de l’événement.</p>
        </div>
      `;
    }
  }

  function ensureLeafletAssets() {
    if (window.L) return Promise.resolve();

    if (!leafletAssetsPromise) {
      leafletAssetsPromise = Promise.all([
        loadStylesheetOnce(LEAFLET_CSS_URL),
        loadScriptOnce(LEAFLET_JS_URL)
      ]).then(() => undefined);
    }

    return leafletAssetsPromise;
  }

  function loadStylesheetOnce(href) {
    if (document.querySelector(`link[href="${href}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.crossOrigin = "";
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function loadScriptOnce(src) {
    if (document.querySelector(`script[src="${src}"]`)) {
      return window.L ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 240));
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.crossOrigin = "";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function renderDetailImage(imageUrl, title) {
    if (!imageUrl) {
      return `<div class="detail-image detail-image-placeholder"></div>`;
    }

    const safeImage = escapeAttribute(imageUrl);
    const safeTitle = escapeAttribute(title || "Événement");

    return `
      <figure class="detail-image-frame">
        <img class="detail-image-background" src="${safeImage}" alt="" aria-hidden="true" />
        <img class="detail-image" src="${safeImage}" alt="${safeTitle}" />
      </figure>
    `;
  }

  function bindDetailActions(event) {
    const favoriteButton = document.getElementById("detail-favorite-btn");
    const calendarButton = document.getElementById("detail-calendar-btn");

    function refreshFavoriteButton() {
      if (!favoriteButton) return;
      const active = getFavoriteIds().includes(String(event.id));
      favoriteButton.classList.toggle("is-favorite", active);
      favoriteButton.textContent = active ? "♥ Favori" : "♡ Ajouter aux favoris";
      favoriteButton.setAttribute("aria-pressed", active ? "true" : "false");
    }

    favoriteButton?.addEventListener("click", () => {
      toggleFavorite(event.id);
      refreshFavoriteButton();
      animateFavoriteButton(
        favoriteButton,
        getFavoriteIds().includes(String(event.id))
      );
    });

    calendarButton?.addEventListener("click", () => downloadICS(event));
    refreshFavoriteButton();
  }

  function getFavoriteIds() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }

  function toggleFavorite(id) {
    const ids = getFavoriteIds();
    const key = String(id || "");
    if (!key) return;
    const next = ids.includes(key) ? ids.filter((item) => item !== key) : [...ids, key];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(next)]));
    window.dispatchEvent(new CustomEvent("dedicalivres:favorites-updated"));
  }

  function animateFavoriteButton(button, active) {
    if (!button) return;

    button.classList.remove("favorite-pop", "favorite-release");
    void button.offsetWidth;
    button.classList.add(active ? "favorite-pop" : "favorite-release");

    window.setTimeout(() => {
      button.classList.remove("favorite-pop", "favorite-release");
    }, 700);
  }

  function downloadICS(event) {
    const detailUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(event.id)}`;
    const location = formatEventPlace(event);
    const start = toICSDate(event.start_date);
    const end = toICSDate(addOneDay(event.end_date || event.start_date));
    const description = `${event.description || ""}\n\nFiche Dédicalivres : ${detailUrl}`;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Dedicalivres//Agenda//FR",
      "BEGIN:VEVENT",
      `UID:${event.id || Date.now()}@dedicalivres.fr`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      start ? `DTSTART;VALUE=DATE:${start}` : "",
      end ? `DTEND;VALUE=DATE:${end}` : "",
      `SUMMARY:${escapeICS(event.title || "Événement littéraire")}`,
      location ? `LOCATION:${escapeICS(location)}` : "",
      `DESCRIPTION:${escapeICS(description)}`,
      `URL:${detailUrl}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(event.title || "dedicalivres-evenement")}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toICSDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10).replace(/-/g, "");
  }

  function addOneDay(value) {
    if (!value) return "";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  function escapeICS(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function slugify(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "dedicalivres";
  }

  function normalize(value) {
    return (value || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = endDate && endDate !== startDate ? formatDate(endDate) : "";
    return end ? `${start} → ${end}` : start;
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
  }

  function formatEventPlace(event) {
    if (geo) return geo.formatPlace(event);
    return [event?.city, event?.region].filter(Boolean).join(", ");
  }

  function escapeHtml(value) {
    return (value || "").toString()
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
