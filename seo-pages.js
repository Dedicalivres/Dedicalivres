(function () {
  const config = window.DEDICALIVRES_CONFIG;
  if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
    console.error("Configuration Supabase manquante.");
    return;
  }

  const supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const eventsContainer = document.getElementById("seo-events");
  const seoCount = document.getElementById("seo-count");

  const region = document.body.dataset.region || "";
  const city = document.body.dataset.city || "";
  const eventType = document.body.dataset.eventType || "";

  loadSeoEvents();

  async function loadSeoEvents() {
    if (!eventsContainer) return;

    eventsContainer.innerHTML = '<article class="empty-state"><div class="loader"></div><p>Chargement des événements...</p></article>';

    const today = new Date().toISOString().slice(0, 10);

    let query = supabaseClient
      .from("events")
      .select("*")
      .eq("validated", true)
      .eq("rejected", false)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true });

    if (region) query = query.eq("region", region);
    if (city) query = query.ilike("city", city);
    if (eventType) query = query.eq("type", eventType);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      eventsContainer.innerHTML = '<article class="empty-state"><p>Impossible de charger les événements pour le moment.</p></article>';
      return;
    }

    const events = Array.isArray(data) ? data : [];
    if (seoCount) seoCount.textContent = `${events.length} événement${events.length > 1 ? "s" : ""} trouvé${events.length > 1 ? "s" : ""}`;

    if (!events.length) {
      eventsContainer.innerHTML = '<article class="empty-state"><p>Aucun événement à venir pour le moment. Revenez bientôt ou proposez un événement.</p><p><a class="card-link" href="index.html#soumettre">Proposer un événement</a></p></article>';
      return;
    }

    eventsContainer.innerHTML = events.map(renderEventCard).join("");
  }

  function renderEventCard(event) {
    const imageUrl = resolveImageUrl(event.image_url);

    return `
      <article class="event-card ${event.featured ? "event-card-featured" : ""}">
        ${event.featured ? '<div class="featured-ribbon">Mis en avant</div>' : ""}
        ${imageUrl ? `<img class="card-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(event.title || "Événement littéraire")}" />` : '<div class="card-image"></div>'}
        <div class="card-body">
          <div class="card-tags">
            ${event.type ? `<span class="badge">${escapeHtml(event.type)}</span>` : ""}
            ${event.price ? `<span class="badge badge-price">${escapeHtml(event.price)}</span>` : ""}
            ${event.featured ? '<span class="badge badge-featured">Sélection</span>' : ""}
          </div>
          <h3 class="card-title">${escapeHtml(event.title || "Sans titre")}</h3>
          <div class="card-meta">
            ${event.start_date ? `<span>📅 ${formatDateRange(event.start_date, event.end_date)}</span>` : ""}
            <span>📍 ${escapeHtml([event.city, event.region].filter(Boolean).join(", ")) || "Lieu non précisé"}</span>
          </div>
          <p class="card-description">${escapeHtml(event.description || "")}</p>
          <div class="card-footer">
            <a class="card-link" href="event.html?id=${encodeURIComponent(event.id)}">Voir le détail</a>
            ${event.website ? `<a class="card-link" href="${escapeAttribute(event.website)}" target="_blank" rel="noopener noreferrer">Site officiel</a>` : ""}
          </div>
        </div>
      </article>
    `;
  }

  function resolveImageUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${config.assetsBaseUrl || ""}${path}`;
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
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
