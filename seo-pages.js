(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const geo = window.DEDICALIVRES_GEO;

  if (
    !config ||
    !config.supabaseUrl ||
    !config.supabaseAnonKey ||
    !window.supabase
  ) {
    console.error("Configuration Supabase manquante.");
    return;
  }

  const supabaseClient =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = supabaseClient;
  }

  const params = new URLSearchParams(window.location.search || "");
  const eventsContainer = document.getElementById("seo-events");
  const seoCount = document.getElementById("seo-count");
  const pastEventsSection = ensurePastEventsSection();

  const region = document.body.dataset.region || params.get("region") || "";
  const city = document.body.dataset.city || "";
  const countryCode = document.body.dataset.countryCode || params.get("country") || "";
  const pageMode = document.body.dataset.agendaMode || "";

  function getRequiredTypes() {
    const fromParams = params.get("types") || params.get("type") || "";
    const fromDataset = document.body.dataset.eventTypes || document.body.dataset.eventType || "";
    let values = (fromParams || fromDataset)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (pageMode === "salons") {
      values = ["Salon", "Festival"];
    }

    if (pageMode === "dedicaces") {
      values = ["Dédicace"];
    }

    return Array.from(new Set(values));
  }

  let eventTypes = getRequiredTypes();

  const TYPE_META = {
    Salon: { className: "type-salon" },
    Festival: { className: "type-festival" },
    Dédicace: { className: "type-dedicace" },
    Autre: { className: "type-autre" }
  };

  loadSeoEvents();

  async function loadSeoEvents() {
    if (!eventsContainer) return;

    eventsContainer.innerHTML = `
      <article class="empty-state">
        <div class="loader"></div>
        <p>Chargement des événements...</p>
      </article>
    `;

    let query = supabaseClient
      .from("events")
      .select("*")
      .eq("validated", true)
      .eq("rejected", false)
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true });

    if (region) {
      query = query.eq("region", region);
    }

    if (countryCode) {
      query = query.eq("country_code", geo?.normalizeCountryCode(countryCode) || countryCode);
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

    const filteredEvents = (Array.isArray(data) ? data : [])
      .filter((event) => {
        if (!event || event.rejected === true || event.validated !== true) return false;
        if (pageMode === "salons") return ["Salon", "Festival"].includes(event.type);
        if (pageMode === "dedicaces") return event.type === "Dédicace";
        return !eventTypes.length || eventTypes.includes(event.type);
      });
    const events = filteredEvents
      .filter((event) => !isPastEvent(event))
      .sort(sortByUpcomingDate);
    const pastEvents = filteredEvents
      .filter(isPastEvent)
      .sort(sortByPastDate);

    if (seoCount) {
      seoCount.textContent =
        `${events.length} événement${events.length > 1 ? "s" : ""} à venir${
          pastEvents.length ? ` · ${pastEvents.length} passé${pastEvents.length > 1 ? "s" : ""}` : ""
        }`;
    }

    if (!events.length) {
      eventsContainer.innerHTML = renderEmptyRegionalState(pastEvents.length);
      renderPastEvents(pastEvents);

      window.dispatchEvent(
        new CustomEvent("dedicalivres:cards-rendered")
      );

      return;
    }

    eventsContainer.innerHTML = events.map(renderEventCard).join("");
    renderPastEvents(pastEvents);

    window.dispatchEvent(
      new CustomEvent("dedicalivres:cards-rendered")
    );
  }


  function ensurePastEventsSection() {
    if (!eventsContainer) return null;

    let section = document.getElementById("seo-past-events");
    if (section) return section;

    section = document.createElement("details");
    section.id = "seo-past-events";
    section.className = "past-events-section seo-past-events";
    section.innerHTML = `
      <summary>
        <span>Événements passés</span>
        <small id="seo-past-count">Chargement…</small>
      </summary>
      <div id="seo-past-grid" class="events-grid past-events-grid" aria-live="polite"></div>
    `;

    eventsContainer.insertAdjacentElement("afterend", section);

    return section;
  }

  function renderPastEvents(events) {
    if (!pastEventsSection) return;

    const count = pastEventsSection.querySelector("#seo-past-count");
    const grid = pastEventsSection.querySelector("#seo-past-grid");

    pastEventsSection.hidden = !events.length;

    if (count) {
      count.textContent = events.length
        ? `${events.length} événement${events.length > 1 ? "s" : ""}`
        : "Aucun événement passé";
    }

    if (grid) {
      grid.innerHTML = events.length
        ? events.map((event) => renderEventCard(event, { isPast: true })).join("")
        : "";
    }
  }

  function renderEmptyRegionalState(pastCount = 0) {
    const regionName = region || (countryCode ? geo?.getCountryName(countryCode) : "") || "ce territoire";
    const isRegionalPage = Boolean(region || countryCode);

    if (!isRegionalPage) {
      return `
        <article class="empty-state seo-empty-state">
          <p>
            Aucun événement à venir pour le moment.
            ${pastCount ? "Les rendez-vous déjà passés restent consultables ci-dessous." : "Revenez bientôt ou proposez un événement."}
          </p>

          <p>
            <a class="card-link" href="soumettre.html">
              Proposer un événement
            </a>
          </p>
        </article>
      `;
    }

    return `
      <article class="empty-state seo-empty-state regional-empty-state">
        <span class="regional-empty-kicker">Agenda participatif</span>

        <h2>${escapeHtml(regionName)} attend ses prochaines rencontres littéraires</h2>

        <p>
          Aucun salon du livre, festival littéraire, rencontre d’auteur ou séance de dédicace
          n’est encore référencé pour ${escapeHtml(regionName)}.
        </p>

        <p>
          Dédicalivres avance grâce aux lecteurs, auteurs, librairies, médiathèques,
          associations et organisateurs qui partagent les rendez-vous autour du livre.
          Si vous connaissez un événement littéraire dans ce territoire, votre contribution
          peut aider à faire vivre l’agenda local et à équilibrer la visibilité entre les territoires.
        </p>

        <div class="regional-empty-actions">
          <a class="btn-primary" href="soumettre.html">
            Proposer un événement en ${escapeHtml(regionName)}
          </a>

          <a class="btn-secondary" href="index.html#agenda">
            Voir l’agenda francophone
          </a>
        </div>
      </article>
    `;
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

  function sortByPastDate(a, b) {
    const dateA = parseLocalDate(a.end_date || a.start_date)?.getTime() || 0;
    const dateB = parseLocalDate(b.end_date || b.start_date)?.getTime() || 0;

    if (dateA !== dateB) return dateB - dateA;

    return String(a.title || "").localeCompare(
      String(b.title || ""),
      "fr"
    );
  }

  function renderEventCard(event, options = {}) {
    const imageUrl = resolveImageUrl(event.image_url);
    const meta = TYPE_META[event.type] || TYPE_META.Autre;
    const isPast = Boolean(options.isPast);

    return `
      <article
        class="event-card ${event.featured ? "event-card-featured" : ""} ${meta.className}${isPast ? " is-past-event" : ""}"
        id="event-${escapeAttribute(event.id)}"
      >
        ${
          event.featured
            ? `<div class="featured-ribbon">Mis en avant</div>`
            : ""
        }

        ${renderCardImage(imageUrl, event.title || "Événement littéraire")}

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

            ${
              isPast
                ? `<span class="badge badge-past">Passé</span>`
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
              📍 ${escapeHtml(formatEventPlace(event)) || "Lieu non précisé"}
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

  function renderCardImage(imageUrl, title) {
    if (!imageUrl) {
      return `
        <div class="card-image-frame is-empty">
          <div class="card-image"></div>
        </div>
      `;
    }

    const safeImage = escapeAttribute(imageUrl);
    const safeTitle = escapeAttribute(title || "Événement littéraire");

    return `
      <div class="card-image-frame">
        <img class="card-image-blur" src="${safeImage}" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <img class="card-image" src="${safeImage}" alt="${safeTitle}" loading="lazy" decoding="async" />
      </div>
    `;
  }

  function resolveImageUrl(path) {
    if (!path) return "";

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return `${config.assetsBaseUrl || ""}${path}`;
  }

  function formatEventPlace(event) {
    if (geo) return geo.formatPlace(event);
    return [event?.city, event?.region].filter(Boolean).join(", ");
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end =
      endDate && endDate !== startDate
        ? formatDate(endDate)
        : "";

    return end ? `${start} → ${end}` : start;
  }

  function isPastEvent(event) {
    const eventEnd = parseLocalDate(event.end_date || event.start_date);

    if (!eventEnd) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return eventEnd < today;
  }

  function parseLocalDate(value) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime()) ? null : date;
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
