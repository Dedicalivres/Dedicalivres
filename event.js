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

    const image = data.image_url
      ? `<img class="detail-image" src="${escapeAttribute(data.image_url)}" alt="${escapeAttribute(data.title || "Événement")}" />`
      : `<div class="detail-image detail-image-placeholder"></div>`;

    container.innerHTML = `
      ${image}

      <div class="detail-body">
        <div class="card-tags">
          ${data.type ? `<span class="badge">${escapeHtml(data.type)}</span>` : ""}
          ${data.price ? `<span class="badge badge-price">${escapeHtml(data.price)}</span>` : ""}
        </div>

        <h1 class="detail-title">${escapeHtml(data.title || "Sans titre")}</h1>

        <div class="detail-meta">
          ${data.start_date ? `<p>📅 <strong>Date :</strong> ${formatDateRange(data.start_date, data.end_date)}</p>` : ""}
          <p>📍 <strong>Lieu :</strong> ${escapeHtml([data.city, data.region].filter(Boolean).join(", ")) || "Non précisé"}</p>
        </div>

        ${data.description ? `<div class="detail-description">${escapeHtml(data.description).replace(/\n/g, "<br>")}</div>` : ""}

        <div class="detail-actions">
          ${data.website ? `<a class="btn-primary detail-button" href="${escapeAttribute(data.website)}" target="_blank" rel="noopener noreferrer">Site officiel</a>` : ""}
          <a class="btn-secondary detail-button" href="index.html#agenda">Retour à l’agenda</a>
        </div>

        ${Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng)) ? `<div id="detail-map"></div>` : ""}
      </div>
    `;

    if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng)) && window.L) {
      const map = L.map("detail-map", { scrollWheelZoom: false }).setView([Number(data.lat), Number(data.lng)], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);
      L.marker([Number(data.lat), Number(data.lng)]).addTo(map).bindPopup(escapeHtml(data.title || "Événement")).openPopup();
    }
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
