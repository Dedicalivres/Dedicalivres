(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (
    !config ||
    !config.supabaseUrl ||
    !config.supabaseAnonKey ||
    !window.supabase
  ) {
    console.error("Configuration Supabase manquante.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const eventsContainer = document.getElementById("seo-events");
  const seoCount = document.getElementById("seo-count");

  const region = document.body.dataset.region || "";
  const city = document.body.dataset.city || "";
  const eventType = document.body.dataset.eventType || "";
  const pageMode = document.body.dataset.agendaMode || "";
  const urlParams = new URLSearchParams(window.location.search || "");
  const urlType = urlParams.get("type") || "";
  const urlTypes = urlParams.get("types") || "";

  let eventTypes = (urlTypes || urlType || document.body.dataset.eventTypes || eventType || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!eventTypes.length && pageMode === "salons") {
    eventTypes = ["Salon", "Festival"];
  }

  if (!eventTypes.length && pageMode === "dedicaces") {
    eventTypes = ["Dédicace"];
  }

  const TYPE_META = {
    Salon: { className: "type-salon" },
    Festival: { className: "type-festival" },
    Dédicace: { className: "type-dedicace" },
    Autre: { className: "type-autre" }
  };

  ensurePublicNavigation();
  loadSeoEvents();

  function ensurePublicNavigation() {
    const nav = document.querySelector("header nav");
    if (!nav) return;

    nav.querySelectorAll('a[href*="auteurs-independants.html"]').forEach((link) => link.remove());

    if (!nav.querySelector('a[href="temoignages.html"]')) {
      const submit = nav.querySelector(".nav-submit-link") || nav.querySelector('a[href="index.html#soumettre"]');
      const testimonialLink = document.createElement("a");
      testimonialLink.href = "temoignages.html";
      testimonialLink.textContent = "Témoignages";
      if (submit) nav.insertBefore(testimonialLink, submit);
      else nav.appendChild(testimonialLink);
    }
  }

  async function loadSeoEvents() {
    if (!eventsContainer) return;

    eventsContainer.innerHTML = `
      <article class="empty-state">
        <div class="loader"></div>
        <p>Chargement des événements...</p>
      </article>
    `;

    const today = new Date().toISOString().slice(0, 10);

    let query = supabaseClient
      .from("events")
      .select("*")
      .eq("validated", true)
      .eq("rejected", false)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true });

    if (region) {
      query = query.eq("region", region);
    }

    if (city) {
      query = query.ilike("city", city);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);

      eventsContainer.innerHTML = `
        <article class="empty-state">
          <p>Impossible de charger les événements pour le moment.</p>
        </article>
      `;

      return;
    }

    const events = (Array.isArray(data) ? data : [])
      .filter((event) => {
        return !eventTypes.length || eventTypes.includes(event.type);
      })
      .sort(sortByUpcomingDate);

    if (seoCount) {
      seoCount.textContent =
        `${events.length} événement${events.length > 1 ? "s" : ""} trouvé${events.length > 1 ? "s" : ""}`;
    }

    if (!events.length) {
      eventsContainer.innerHTML = `
        <article class="empty-state">
          <p>
            Aucun événement à venir pour le moment.
            Revenez bientôt ou proposez un événement.
          </p>

          <p>
            <a class="card-link" href="index.html#soumettre">
              Proposer un événement
            </a>
          </p>
        </article>
      `;

      return;
    }

    eventsContainer.innerHTML = events.map(renderEventCard).join("");

    window.dispatchEvent(
      new CustomEvent("dedicalivres:cards-rendered")
    );
  }

  function sortByUpcomingDate(a, b) {
    const dateA = new Date(a.start_date || "2999-12-31").getTime();
    const dateB = new Date(b.start_date || "2999-12-31").getTime();

    if (dateA !== dateB) return dateA - dateB;

    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;

    return String(a.title || "").localeCompare(
      String(b.title || ""),
      "fr"
    );
  }

  function renderEventCard(event) {
    const imageUrl = resolveImageUrl(event.image_url);
    const meta = TYPE_META[event.type] || TYPE_META.Autre;

    return `
      <article
        class="event-card ${event.featured ? "event-card-featured" : ""} ${meta.className}"
        id="event-${escapeAttribute(event.id)}"
      >
        ${
          event.featured
            ? `<div class="featured-ribbon">Mis en avant</div>`
            : ""
        }

        ${
          imageUrl
            ? `
              <img
                class="card-image"
                src="${escapeAttribute(imageUrl)}"
                alt="${escapeAttribute(event.title || "Événement littéraire")}"
              />
            `
            : `<div class="card-image"></div>`
        }

        <div class="card-body">
          <div class="card-tags">
            ${
              event.type
                ? `
                  <span class="badge badge-type ${meta.className}">
                    <i></i>
                    ${escapeHtml(event.type)}
                  </span>
                `
                : ""
            }

            ${
              event.price
                ? `
                  <span class="badge badge-price">
                    ${escapeHtml(event.price)}
                  </span>
                `
                : ""
            }

            ${
              event.featured
                ? `<span class="badge badge-featured">Sélection</span>`
                : ""
            }

            ${
              event.verified
                ? `<span class="badge badge-verified">Vérifié</span>`
                : ""
            }
          </div>

          <h3 class="card-title">
            ${escapeHtml(event.title || "Sans titre")}
          </h3>

          <div class="card-meta">
            ${
              event.start_date
                ? `
                  <span>
                    📅 ${formatDateRange(event.start_date, event.end_date)}
                  </span>
                `
                : ""
            }

            <span>
              📍 ${escapeHtml([event.city, event.region].filter(Boolean).join(", ")) || "Lieu non précisé"}
            </span>
          </div>

          <p class="card-description">
            ${escapeHtml(event.description || "")}
          </p>

          <div class="card-footer">
            <a
              class="card-link"
              href="event.html?id=${encodeURIComponent(event.id)}"
            >
              Voir le détail
            </a>

            ${
              event.website
                ? `
                  <a
                    class="card-link"
                    href="${escapeAttribute(event.website)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Site officiel
                  </a>
                `
                : ""
            }
          </div>
        </div>
      </article>
    `;
  }

  function resolveImageUrl(path) {
    if (!path) return "";

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return `${config.assetsBaseUrl || ""}${path}`;
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end =
      endDate && endDate !== startDate
        ? formatDate(endDate)
        : "";

    return end ? `${start} → ${end}` : start;
  }

  function formatDate(value) {
    if (!value) return "";

    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(new Date(value));
    } catch {
      return value;
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
