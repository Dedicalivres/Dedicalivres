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
  const pageMode = document.body.dataset.agendaMode || "";
  const params = new URLSearchParams(window.location.search || "");

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
        if (!event || event.rejected === true || event.validated !== true) return false;
        if (pageMode === "salons") return ["Salon", "Festival"].includes(event.type);
        if (pageMode === "dedicaces") return event.type === "Dédicace";
        return !eventTypes.length || eventTypes.includes(event.type);
      })
      .sort(sortByUpcomingDate);

    if (seoCount) {
      seoCount.textContent =
        `${events.length} événement${events.length > 1 ? "s" : ""} trouvé${events.length > 1 ? "s" : ""}`;
    }

    if (!events.length) {
      eventsContainer.innerHTML = renderEmptyRegionalState();

      window.dispatchEvent(
        new CustomEvent("dedicalivres:cards-rendered")
      );

      return;
    }

    eventsContainer.innerHTML = events.map(renderEventCard).join("");

    window.dispatchEvent(
      new CustomEvent("dedicalivres:cards-rendered")
    );
  }


  function renderEmptyRegionalState() {
    const regionName = region || "cette région";
    const isRegionalPage = Boolean(region);

    if (!isRegionalPage) {
      return `
        <article class="empty-state seo-empty-state">
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
          Si vous connaissez un événement littéraire dans cette région, votre contribution
          peut aider à faire vivre l’agenda local et à équilibrer la visibilité entre les territoires.
        </p>

        <div class="regional-empty-actions">
          <a class="btn-primary" href="index.html#soumettre">
            Proposer un événement en ${escapeHtml(regionName)}
          </a>

          <a class="btn-secondary" href="index.html#agenda">
            Voir l’agenda national
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
                loading="lazy"
                decoding="async"
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
