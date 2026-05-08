(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const container = document.getElementById("event-detail");

  if (!config || !container || !window.supabase) return;

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  const SITE_URL = "https://dedicalivres.fr";

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
      updateBasicNoIndexMeta();
      return;
    }

    updateSeoMeta(data);

    const image = data.image_url
      ? `<img class="detail-image" src="${escapeAttribute(data.image_url)}" alt="${escapeAttribute(data.title || "Événement littéraire")}" />`
      : `<div class="detail-image detail-image-placeholder"></div>`;

    container.innerHTML = `
      ${image}

      <div class="detail-body">
        <div class="card-tags">
          ${data.type ? `<span class="badge">${escapeHtml(data.type)}</span>` : ""}
          ${data.price ? `<span class="badge badge-price">${escapeHtml(data.price)}</span>` : ""}
          ${data.verified ? `<span class="badge badge-verified">Vérifié</span>` : ""}
        </div>

        <h1 class="detail-title">${escapeHtml(data.title || "Sans titre")}</h1>

        <div class="detail-meta detail-info-grid">
          ${data.start_date ? `<p>📅 <strong>Date :</strong> ${formatDateRange(data.start_date, data.end_date)}</p>` : ""}
          <p>📍 <strong>Lieu :</strong> ${escapeHtml([data.city, data.region].filter(Boolean).join(", ")) || "Non précisé"}</p>
          ${data.type ? `<p>🏷️ <strong>Type :</strong> ${escapeHtml(data.type)}</p>` : ""}
        </div>

        ${data.description ? `<div class="detail-description">${escapeHtml(data.description).replace(/\n/g, "<br>")}</div>` : ""}

        ${renderSeoRelayBlock(data)}

        <div class="detail-actions">
          ${data.website ? `<a class="btn-primary detail-button" href="${escapeAttribute(data.website)}" target="_blank" rel="noopener noreferrer">Site officiel</a>` : ""}
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

    if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng)) && window.L) {
      const map = L.map("detail-map", { scrollWheelZoom: false }).setView([Number(data.lat), Number(data.lng)], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);
      L.marker([Number(data.lat), Number(data.lng)]).addTo(map).bindPopup(escapeHtml(data.title || "Événement")).openPopup();
    }
  }

  function renderSeoRelayBlock(event) {
    const city = event.city ? escapeHtml(event.city) : "la ville indiquée";
    const region = event.region ? escapeHtml(event.region) : "sa région";
    const type = event.type ? escapeHtml(event.type.toLowerCase()) : "événement littéraire";

    return `
      <section class="event-seo-panel" aria-label="Informations Dédicalivres sur cet événement">
        <h2>À propos de cet événement littéraire</h2>
        <p>
          Cette fiche Dédicalivres référence ${type} à ${city}, en ${region}.
          Elle sert de relais pratique pour retrouver la date, le lieu, les informations essentielles
          et le lien officiel de l’organisateur lorsqu’il est disponible.
        </p>
      </section>
    `;
  }

  function updateSeoMeta(event) {
    const title = buildSeoTitle(event);
    const description = buildSeoDescription(event);
    const canonicalUrl = `${SITE_URL}/event.html?id=${encodeURIComponent(event.id)}`;
    const imageUrl = resolveAbsoluteUrl(event.image_url || "banner.jpg");

    document.title = title;

    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", "article");
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", imageUrl);
    setMeta("name", "twitter:card", "summary_large_image");

    const canonical = document.getElementById("canonical-link") || document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", canonicalUrl);

    updateJsonLd(event, canonicalUrl, imageUrl, title, description);
  }

  function updateBasicNoIndexMeta() {
    setMeta("name", "robots", "noindex,follow");
  }

  function buildSeoTitle(event) {
    const parts = [event.title || "Événement littéraire"];

    if (event.city) parts.push(event.city);
    if (event.start_date) parts.push(formatDate(event.start_date));

    return `${parts.join(" — ")} — Dédicalivres`;
  }

  function buildSeoDescription(event) {
    const fragments = [];

    fragments.push(`Retrouvez les informations de ${event.title || "cet événement littéraire"}`);

    if (event.type) fragments.push(`type ${event.type}`);
    if (event.city || event.region) fragments.push(`à ${[event.city, event.region].filter(Boolean).join(", ")}`);
    if (event.start_date) fragments.push(`le ${formatDateRange(event.start_date, event.end_date)}`);

    const base = `${fragments.join(" ")}.`;
    const suffix = " Dates, lieu, auteurs présents et lien officiel sur Dédicalivres.";

    return `${base}${suffix}`.replace(/\s+/g, " ").slice(0, 165);
  }

  function updateJsonLd(event, canonicalUrl, imageUrl, title, description) {
    const script = document.getElementById("event-jsonld");
    if (!script) return;

    const hasGeo = Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng));

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: event.title || "Événement littéraire",
      description,
      url: canonicalUrl,
      image: imageUrl ? [imageUrl] : undefined,
      startDate: event.start_date || undefined,
      endDate: event.end_date || event.start_date || undefined,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: [event.city, event.region].filter(Boolean).join(", ") || "Lieu à confirmer",
        address: {
          "@type": "PostalAddress",
          addressLocality: event.city || undefined,
          addressRegion: event.region || undefined,
          addressCountry: "FR"
        },
        geo: hasGeo
          ? {
              "@type": "GeoCoordinates",
              latitude: Number(event.lat),
              longitude: Number(event.lng)
            }
          : undefined
      },
      offers: event.price
        ? {
            "@type": "Offer",
            availability: "https://schema.org/InStock",
            price: /gratuit/i.test(event.price) ? "0" : undefined,
            priceCurrency: "EUR",
            url: event.website || canonicalUrl
          }
        : undefined,
      organizer: event.website
        ? {
            "@type": "Organization",
            name: event.title || "Organisateur de l’événement",
            url: event.website
          }
        : undefined,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonicalUrl,
        name: title
      }
    };

    script.textContent = JSON.stringify(removeUndefined(jsonLd), null, 2);
  }

  function removeUndefined(value) {
    if (Array.isArray(value)) {
      return value.map(removeUndefined).filter((item) => item !== undefined);
    }

    if (value && typeof value === "object") {
      return Object.entries(value).reduce((acc, [key, item]) => {
        const clean = removeUndefined(item);
        if (clean !== undefined) acc[key] = clean;
        return acc;
      }, {});
    }

    return value === undefined || value === null || value === "" ? undefined : value;
  }

  function resolveAbsoluteUrl(path) {
    if (!path) return `${SITE_URL}/banner.jpg`;
    if (/^https?:\/\//i.test(path)) return path;
    const normalized = String(path).replace(/^\/+/, "");
    return `${SITE_URL}/${normalized}`;
  }

  function setMeta(attribute, key, content) {
    if (!content) return;

    let meta = document.querySelector(`meta[${attribute}="${key}"]`);

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attribute, key);
      document.head.appendChild(meta);
    }

    meta.setAttribute("content", content);
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = endDate && endDate !== startDate ? formatDate(endDate) : "";
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
