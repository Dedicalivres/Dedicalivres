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
  const PUBLIC_EVENT_COLUMNS = [
    "id", "title", "type", "country_code", "region", "city", "start_date", "end_date",
    "price", "website", "description", "image_url", "featured", "verified", "lat", "lng",
    "validated", "rejected", "registration_enabled", "registration_open_date",
    "registration_deadline", "registration_url", "registration_audience", "registration_note",
    "registration_force_status"
  ].join(",");
  const PUBLIC_EVENT_LEGACY_COLUMNS = [
    "id", "title", "type", "country_code", "region", "city", "start_date", "end_date",
    "price", "website", "description", "image_url", "featured", "verified", "lat", "lng",
    "validated", "rejected"
  ].join(",");
  const REGISTRATION_PROGRESS_STEPS = [
    { key: "soon", label: "Bientôt" },
    { key: "open", label: "Ouvertes" },
    { key: "last-days", label: "Derniers jours" },
    { key: "closed", label: "Clôturées" }
  ];
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");
  let leafletAssetsPromise = null;

  if (!eventId) {
    container.innerHTML = `<div class="empty-state"><p>Événement introuvable.</p></div>`;
    return;
  }

  loadEvent(eventId);

  async function loadEvent(id) {
    let response = await fetchEvent(id, PUBLIC_EVENT_COLUMNS);

    if (response.error && isMissingColumnError(response.error)) {
      response = await fetchEvent(id, PUBLIC_EVENT_LEGACY_COLUMNS);
    }

    const { data, error } = response;

    if (error || !data) {
      container.innerHTML = `<div class="empty-state"><p>Impossible de charger cet événement.</p></div>`;
      return;
    }

    document.title = `${data.title || "Événement"} — Dédicalivres`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", `${data.title || "Événement littéraire"} à ${data.city || "proximité"} — informations, dates et lien officiel.`);

    const image = renderDetailImage(data.image_url, data.title || "Événement");
    const registrationStatus = window.DEDICALIVRES_REGISTRATION?.getStatus(data);
    const registrationModule = renderRegistrationModule(data, registrationStatus);
    const primaryActions = renderPrimaryActions(data, registrationStatus);

    container.innerHTML = `
      ${image}

      <div class="detail-body">
        <div class="card-tags">
          ${data.type ? `<span class="badge">${escapeHtml(data.type)}</span>` : ""}
          ${data.price ? `<span class="badge badge-price">${escapeHtml(data.price)}</span>` : ""}
          ${registrationStatus ? `<span class="badge registration-badge registration-badge-${escapeAttribute(registrationStatus.key)}">${escapeHtml(registrationStatus.shortLabel)}</span>` : ""}
        </div>

        <h1 class="detail-title">${escapeHtml(data.title || "Sans titre")}</h1>

        <div class="detail-meta detail-info-grid">
          ${data.start_date ? `<p>📅 <strong>Date :</strong> ${formatDateRange(data.start_date, data.end_date)}</p>` : ""}
          <p>📍 <strong>Lieu :</strong> ${escapeHtml(formatEventPlace(data)) || "Non précisé"}</p>
        </div>

        ${data.description ? `<div class="detail-description">${escapeHtml(data.description).replace(/\n/g, "<br>")}</div>` : ""}

        ${registrationModule}
        ${primaryActions}

        <div class="detail-actions detail-secondary-actions" aria-label="Autres actions">
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

  function renderPrimaryActions(event, status) {
    const registrationAvailable = Boolean(
      event.registration_url &&
      (!status || ["open", "last-days", "soon"].includes(status.key))
    );
    const presenceClass = registrationAvailable ? "btn-secondary" : "btn-primary";

    return `
      <div class="detail-primary-actions" aria-label="Actions principales">
        ${registrationAvailable ? `<a id="detail-registration-cta" class="btn-primary detail-primary-button" href="${escapeAttribute(event.registration_url)}" target="_blank" rel="noopener noreferrer">S’inscrire</a>` : ""}
        <a id="detail-presence-cta" class="${presenceClass} detail-primary-button" href="#authors-presence-section">Indiquer ma présence</a>
        <button id="detail-share-btn" class="btn-secondary detail-primary-button" type="button" aria-describedby="detail-share-feedback">Partager</button>
        <p id="detail-share-feedback" class="detail-share-feedback" role="status" aria-live="polite"></p>
      </div>
    `;
  }

  function fetchEvent(id, columns) {
    return client
      .from("events")
      .select(columns)
      .eq("id", id)
      .eq("validated", true)
      .maybeSingle();
  }

  function renderRegistrationModule(event, status) {
    const helpers = window.DEDICALIVRES_REGISTRATION;
    if (!helpers?.isEligible(event)) return "";

    const audience = helpers.getAudienceLabels(event.registration_audience);
    const hasContent = Boolean(
      status || event.registration_open_date || event.registration_deadline ||
      event.registration_url || audience.length || event.registration_note
    );
    if (!hasContent) return "";

    const progress = renderRegistrationProgress(status);
    const dateText = getRegistrationDateText(event, status);

    return `
      <section class="registration-detail registration-detail-${escapeAttribute(status?.key || "info")}" aria-labelledby="registration-detail-title">
        <div class="registration-detail-heading">
          <p class="category-kicker">Inscriptions</p>
          ${progress}
          <h2 id="registration-detail-title" class="registration-detail-status">${escapeHtml(status?.label || "Informations d’inscription")}</h2>
          ${dateText ? `<p class="registration-detail-date">${escapeHtml(dateText)}</p>` : ""}
        </div>

        ${audience.length ? `
          <div class="registration-audience-list">
            <strong>Profils concernés</strong>
            <ul>${helpers.normalizeAudience(event.registration_audience).map((value) => `<li class="registration-audience-${escapeAttribute(value)}">${escapeHtml(helpers.audienceLabels[value])}</li>`).join("")}</ul>
          </div>
        ` : ""}

        ${event.registration_note ? `<p class="registration-detail-note">${escapeHtml(event.registration_note).replace(/\n/g, "<br>")}</p>` : ""}
      </section>
    `;
  }

  function renderRegistrationProgress(status) {
    const currentIndex = REGISTRATION_PROGRESS_STEPS.findIndex((step) => step.key === status?.key);
    if (currentIndex < 0) return "";

    return `
      <ol class="registration-progress registration-progress-current-${currentIndex}" aria-label="Progression des inscriptions">
        ${REGISTRATION_PROGRESS_STEPS.map((step, index) => {
          const stateClass = index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : "is-upcoming";
          const currentAttribute = index === currentIndex ? ' aria-current="step"' : "";
          return `
            <li class="registration-progress-step ${stateClass}"${currentAttribute}>
              <span class="registration-progress-marker" aria-hidden="true"></span>
              <span>${escapeHtml(step.label)}</span>
            </li>
          `;
        }).join("")}
      </ol>
    `;
  }

  function getRegistrationDateText(event, status) {
    if (status?.key === "soon" && event.registration_open_date) {
      return `Ouverture prévue le ${formatDate(event.registration_open_date)}`;
    }

    if (["open", "last-days"].includes(status?.key) && event.registration_deadline) {
      return `Jusqu’au ${formatDate(event.registration_deadline)}`;
    }

    if (status?.key === "closed" && event.registration_deadline) {
      return `Date limite passée le ${formatDate(event.registration_deadline)}`;
    }

    if (event.registration_deadline) {
      return `Date limite : ${formatDate(event.registration_deadline)}`;
    }

    if (event.registration_open_date) {
      return `Ouverture prévue le ${formatDate(event.registration_open_date)}`;
    }

    return "";
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
    const shareButton = document.getElementById("detail-share-btn");
    const shareFeedback = document.getElementById("detail-share-feedback");

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
    shareButton?.addEventListener("click", () => shareEvent(event, shareFeedback));
    refreshFavoriteButton();
    window.addEventListener('storage', event => {
      if (event.key === FAVORITES_KEY || event.key === null) refreshFavoriteButton();
    });
  }

  async function shareEvent(event, feedback) {
    const url = buildEventDetailUrl(event.id);
    const shareApi = window.DEDICALIVRES_SHARE_API || navigator;
    const shareData = {
      title: `${event.title || "Événement littéraire"} — Dédicalivres`,
      text: `Découvrez ${event.title || "cet événement littéraire"} sur Dédicalivres.`,
      url
    };

    if (typeof shareApi.share === "function") {
      try {
        await shareApi.share(shareData);
        setShareFeedback(feedback, "Partage effectué");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    if (await copyEventLink(url, shareApi)) {
      setShareFeedback(feedback, "Lien copié");
      return;
    }

    window.prompt("Copiez le lien de la fiche :", url);
    setShareFeedback(feedback, "Lien prêt à copier");
  }

  function buildEventDetailUrl(id) {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set("id", String(id || ""));
    return url.toString();
  }

  async function copyEventLink(url, shareApi = navigator) {
    if (shareApi.clipboard?.writeText) {
      try {
        await shareApi.clipboard.writeText(url);
        return true;
      } catch {
        // Le fallback historique ci-dessous reste disponible hors contexte sécurisé.
      }
    }

    const field = document.createElement("textarea");
    field.value = url;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }

  function setShareFeedback(feedback, message) {
    if (!feedback) return;
    feedback.textContent = message;
    window.clearTimeout(Number(feedback.dataset.clearTimer || 0));
    const timer = window.setTimeout(() => {
      feedback.textContent = "";
      delete feedback.dataset.clearTimer;
    }, 2400);
    feedback.dataset.clearTimer = String(timer);
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
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(next)]));
    } catch (_) {
      window.alert('Vos favoris ne peuvent pas être enregistrés : le stockage de ce navigateur est indisponible.');
      return;
    }
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

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || error?.details || "").toLowerCase();
    return ["42703", "PGRST204"].includes(code) || (
      message.includes("column") &&
      (message.includes("does not exist") || message.includes("schema cache"))
    );
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
