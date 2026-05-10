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

  const eventTypes = (document.body.dataset.eventTypes || eventType || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

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

    bindSeoCalendarButtons(events);

    window.dispatchEvent(
      new CustomEvent("dedicalivres:cards-rendered")
    );
  }

  function bindSeoCalendarButtons(events) {
    document.querySelectorAll(".seo-calendar-download").forEach((button) => {
      button.addEventListener("click", () => {
        const item = events.find((event) => String(event.id) === String(button.dataset.eventId));
        if (item) downloadICS(item);
      });
    });
  }

  function downloadICS(event) {
    const detailUrl = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}event.html?id=${encodeURIComponent(event.id)}`;
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
