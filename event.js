(function () {
  const config = window.DEDICALIVRES_CONFIG;
  const container = document.getElementById("event-detail");

  if (!config || !container) return;

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!eventId) {
    container.innerHTML = `<div class="empty-state"><p>Événement introuvable.</p></div>`;
    return;
  }

  loadEvent(eventId);

  async function loadEvent(id) {
    const { data, error } = await client
      .from("events")
      .select("id,title,type,region,city,price,start_date,end_date,website,description,lat,lng,image_url,validated")
      .eq("id", id)
      .eq("validated", true)
      .maybeSingle();

    if (error || !data) {
      container.innerHTML = `<div class="empty-state"><p>Impossible de charger cet événement.</p></div>`;
      return;
    }

    document.title = `${data.title || "Événement"} — Dédicalivres`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", `${data.title || "Événement littéraire"} à ${data.city || "proximité"} — informations, dates et lien officiel.`);

    const image = data.image_url
      ? `<img class="detail-image" src="${escapeAttribute(data.image_url)}" alt="${escapeAttribute(data.title || "Événement")}" loading="lazy" decoding="async" />`
      : `<div class="detail-image detail-image-placeholder"></div>`;

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
          <p>📍 <strong>Lieu :</strong> ${escapeHtml([data.city, data.region].filter(Boolean).join(", ")) || "Non précisé"}</p>
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

    if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng)) && window.L) {
      const map = L.map("detail-map", { scrollWheelZoom: false }).setView([Number(data.lat), Number(data.lng)], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);
      L.marker([Number(data.lat), Number(data.lng)]).addTo(map).bindPopup(escapeHtml(data.title || "Événement")).openPopup();
    }
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
  }

  function downloadICS(event) {
    const detailUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(event.id)}`;
    const location = [event.city, event.region].filter(Boolean).join(", ");
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
