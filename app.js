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

  const supabaseClient =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = supabaseClient;
  }

  const FAVORITES_KEY = "dedicalivres_favorites";
  const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

  const eventsGrid = document.getElementById("events-grid");
  const resultsCount = document.getElementById("results-count");
  const pastEventsGrid = document.getElementById("past-events-grid");
  const pastEventsCount = document.getElementById("past-events-count");
  const pastEventsSection = document.getElementById("past-events");
  const favoritesList = document.getElementById("favorites-list");
  const clearFavoritesButton = document.getElementById("clear-favorites");
  const savedEventsSection = document.getElementById("saved-events");

  const form = document.getElementById("submission-form");
  const formFeedback = document.getElementById("form-feedback");
  const submissionTypeSelect = document.getElementById("event-type-submit");
  const dedicaceAuthorFields = document.getElementById("dedicace-author-fields");

  const newsletterForm = document.getElementById("newsletter-form");
  const newsletterFeedback = document.getElementById("newsletter-feedback");

  const searchInput = document.getElementById("search-input");
  const regionFilter = document.getElementById("region-filter");
  const typeFilter = document.getElementById("type-filter");
  const dateFilter = document.getElementById("date-filter");
  const calendarGrid = document.getElementById("agenda-calendar-grid");
  const calendarMonthLabel = document.getElementById("calendar-current-month");
  const calendarPrevButton = document.getElementById("calendar-prev");
  const calendarNextButton = document.getElementById("calendar-next");
  const calendarClearButton = document.getElementById("calendar-clear-date");
  const calendarSelection = document.getElementById("agenda-calendar-selection");

  const mobileMapToggle = document.getElementById("mobile-map-toggle");
  const locateMeButton = document.getElementById("locate-me");
  const locateStatus = document.getElementById("locate-status");
  const mapPanel = document.getElementById("map-panel");

  const cityInput = document.getElementById("city-input");
  const cityLatInput = document.getElementById("city-lat");
  const cityLngInput = document.getElementById("city-lng");
  const cityHelp = document.getElementById("city-help");
  const citySuggestions = document.getElementById("city-suggestions");

  let map;
  let markersLayer;
  let allEvents = [];
  let markerByEventId = {};
  let mapFloatingPanel = null;
  let cityAutocompleteTimer = null;
  let citySuggestionCache = new Map();
  let userPosition = null;
  let selectedPreviewImage = null;
  let userMarker = null;
  let pendingMapEvents = [];
  let leafletAssetsPromise = null;
  let selectedCalendarDate = "";
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const DAY_MS = 24 * 60 * 60 * 1000;
  const AUTHOR_PORTRAIT_FOLDER = "author-portraits";
  const AUTHOR_PORTRAIT_FALLBACK_FOLDER = "event-images";
  const MAX_AUTHOR_PORTRAIT_SIZE = 4 * 1024 * 1024;

  const TYPE_META = {
    Salon: { className: "type-salon", color: "#3a1c71" },
    Festival: { className: "type-festival", color: "#ff6b35" },
    Dédicace: { className: "type-dedicace", color: "#16803c" },
    Autre: { className: "type-autre", color: "#2f6fed" }
  };

  init();

  function init() {
    bindEvents();
    bindFavorites();
    bindImagePreview();
    populateMonthFilter();
    initDefaultMapVisibility();

    if (eventsGrid || mapPanel || pastEventsGrid) {
      loadEvents();
    }
  }

  function initDefaultMapVisibility() {
    if (!mapPanel) return;

    const shouldOpenByDefault =
      window.matchMedia &&
      window.matchMedia("(min-width: 781px)").matches;

    mapPanel.classList.toggle("is-open", shouldOpenByDefault);

    if (mobileMapToggle) {
      mobileMapToggle.textContent = shouldOpenByDefault
        ? "Fermer la carte en direct"
        : "Carte en direct";
    }

    if (shouldOpenByDefault) {
      requestMapRender();
    }
  }

  function bindEvents() {
    document
      .getElementById("apply-filters")
      ?.addEventListener("click", renderFilteredEvents);

    document
      .getElementById("reset-filters")
      ?.addEventListener("click", resetFilters);

    form?.addEventListener("submit", handleFormSubmit);
    submissionTypeSelect?.addEventListener("change", syncDedicaceAuthorFields);
    syncDedicaceAuthorFields();

    if (newsletterForm) {
      newsletterForm.setAttribute("novalidate", "novalidate");

      newsletterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleNewsletterSubmit(event);
        return false;
      });
    }

    mobileMapToggle?.addEventListener("click", toggleMobileMap);
    locateMeButton?.addEventListener("click", locateUser);
    calendarPrevButton?.addEventListener("click", () => {
      calendarCursor = new Date(
        calendarCursor.getFullYear(),
        calendarCursor.getMonth() - 1,
        1
      );
      renderAgendaCalendar();
    });
    calendarNextButton?.addEventListener("click", () => {
      calendarCursor = new Date(
        calendarCursor.getFullYear(),
        calendarCursor.getMonth() + 1,
        1
      );
      renderAgendaCalendar();
    });
    calendarClearButton?.addEventListener("click", clearCalendarDate);
    calendarGrid?.addEventListener("click", handleCalendarClick);
    document.querySelectorAll("[data-calendar-shortcut]").forEach((button) => {
      button.addEventListener("click", handleCalendarShortcut);
    });

    [regionFilter, typeFilter].forEach((el) => {
      el?.addEventListener("change", renderFilteredEvents);
    });

    dateFilter?.addEventListener("change", () => {
      selectedCalendarDate = "";
      syncCalendarCursorFromMonth(dateFilter.value);
      renderFilteredEvents();
    });

    searchInput?.addEventListener("input", renderFilteredEvents);

    bindCityAutocomplete();
  }

  function syncDedicaceAuthorFields() {
    if (!dedicaceAuthorFields || !submissionTypeSelect) return;

    const isDedicace = submissionTypeSelect.value === "Dédicace";
    dedicaceAuthorFields.hidden = !isDedicace;

    dedicaceAuthorFields
      .querySelectorAll("input, select, textarea")
      .forEach((field) => {
        field.disabled = !isDedicace;
      });
  }

  function toggleMobileMap() {
    if (!mapPanel) return;

    mapPanel.classList.toggle("is-open");

    if (mapPanel.classList.contains("is-open")) {
      mobileMapToggle.textContent = "Fermer la carte en direct";
      requestMapRender(filterEvents(allEvents));
    } else {
      mobileMapToggle.textContent = "Carte en direct";
    }
  }

  function bindImagePreview() {
    const input = document.getElementById("event-image-input");
    const preview = document.getElementById("image-preview");

    if (!input || !preview) return;

    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        preview.innerHTML = "";
        preview.classList.remove("is-visible");
        selectedPreviewImage = null;
        return;
      }

      if (!file.type.startsWith("image/")) {
        alert("Veuillez sélectionner une image.");
        input.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("Image trop lourde (5 Mo max).");
        input.value = "";
        return;
      }

      selectedPreviewImage = file;

      const reader = new FileReader();

      reader.onload = (e) => {
        const previewUrl = escapeAttribute(e.target.result);
        const previewName = escapeHtml(file.name);

        preview.innerHTML = `
          <div class="image-preview-intro">
            <strong>Aperçu rassurant de votre visuel</strong>
            <p>L’interface optimise le format pour garder un maximum de visibilité pour votre affiche.</p>
          </div>

          <div class="image-preview-grid">
            <figure class="image-preview-example image-preview-card">
              <figcaption>Dans l’agenda</figcaption>
              <div class="card-image-frame">
                <img class="card-image-blur" src="${previewUrl}" alt="" aria-hidden="true" />
                <img class="card-image" src="${previewUrl}" alt="Aperçu tuile" />
              </div>
              <small>Format compact, pensé pour la liste.</small>
            </figure>

            <figure class="image-preview-example image-preview-example-detail image-preview-card">
              <figcaption>Dans la fiche événement</figcaption>
              <div class="detail-image-frame">
                <img class="detail-image-background" src="${previewUrl}" alt="" aria-hidden="true" />
                <img class="detail-image" src="${previewUrl}" alt="Aperçu fiche événement" />
              </div>
              <small>Affichage plus large pour mieux voir l’affiche.</small>
            </figure>
          </div>

          <div class="image-preview-caption">
            ${previewName}
          </div>
        `;

        preview.classList.add("is-visible");
      };

      reader.readAsDataURL(file);
    });
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

  function setMapLoadingState() {
    const mapElement = document.getElementById("map");

    if (!mapElement || map || mapElement.querySelector(".map-loading-state")) return;

    mapElement.innerHTML = `
      <div class="map-loading-state">
        <strong>Carte en cours de chargement</strong>
        <span>Elle se lance uniquement quand vous l’utilisez.</span>
      </div>
    `;
  }

  async function requestMapRender(events = pendingMapEvents) {
    if (!mapPanel) return;

    pendingMapEvents = Array.isArray(events) ? events : [];
    setMapLoadingState();

    try {
      await initMap();
      renderMapMarkers(pendingMapEvents.length ? pendingMapEvents : filterEvents(allEvents));

      setTimeout(() => {
        map?.invalidateSize();
        installMapPremiumToolbarCleanupSafe();
      }, 180);
    } catch (error) {
      console.warn("Carte en direct indisponible :", error);
    }
  }

  async function initMap() {
    const mapElement = document.getElementById("map");

    if (!mapElement) return null;
    if (map) return map;

    await ensureLeafletAssets();

    if (!window.L) return null;

    mapElement.innerHTML = "";

    map = L.map("map").setView([46.603354, 1.888334], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    ensureMapFloatingPanel();
    installMapPremiumToolbarCleanupSafe();

    return map;
  }

  async function loadEvents() {
    setLoadingState();

    const { data, error } = await supabaseClient
      .from("events")
      .select("id,title,type,region,city,start_date,end_date,price,website,description,image_url,featured,verified,lat,lng")
      .eq("validated", true)
      .eq("rejected", false)
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true });

    if (error) {
      console.error(error);
      setErrorState("Impossible de charger les événements.");
      return;
    }

    allEvents = Array.isArray(data) ? data : [];
    renderFilteredEvents();
    renderSavedFavorites();
  }

  function renderFilteredEvents() {
    const filtered = filterEvents(allEvents);
    const upcoming = filtered
      .filter((event) => !isPastEvent(event))
      .sort(sortUpcomingEvents);
    const past = filtered
      .filter(isPastEvent)
      .sort(sortPastEvents);

    renderEvents(upcoming, past.length);
    renderPastEvents(past);
    renderMapMarkers(upcoming);
    renderAgendaCalendar();
  }

  function filterEvents(events, options = {}) {
    const includeMonth = options.includeMonth !== false;
    const includeCalendarDate = options.includeCalendarDate !== false;
    const search = normalize(searchInput?.value || "");
    const region = regionFilter?.value || "";
    const type = typeFilter?.value || "";
    const selectedMonth = dateFilter?.value || "";
    const pageMode = document.body.dataset.agendaMode || "global";

    return events.filter((event) => {
      if (pageMode === "dedicaces" && event.type !== "Dédicace") {
        return false;
      }

      if (
        pageMode === "salons" &&
        !["Salon", "Festival"].includes(event.type)
      ) {
        return false;
      }

      const haystack = normalize([
        event.title,
        event.city,
        event.region,
        event.description,
        event.type
      ].join(" "));

      if (search && !haystack.includes(search)) return false;
      if (region && normalize(event.region) !== normalize(region)) return false;
      if (type && event.type !== type) return false;
      if (selectedMonth && includeMonth && !matchesMonth(event, selectedMonth)) return false;
      if (selectedCalendarDate && includeCalendarDate && !matchesDate(event, selectedCalendarDate)) return false;

      return true;
    });
  }

  function matchesDate(event, selectedDate) {
    if (!selectedDate) return true;

    const day = parseLocalDate(selectedDate);
    const eventStart = parseLocalDate(event.start_date);
    const eventEnd = parseLocalDate(event.end_date || event.start_date);

    if (!day || (!eventStart && !eventEnd)) return false;

    const start = eventStart || eventEnd;
    const end = eventEnd || eventStart;

    return start <= day && end >= day;
  }

  function matchesMonth(event, selectedMonth) {
    if (!selectedMonth) return true;

    const monthStart = new Date(`${selectedMonth}-01T00:00:00`);
    if (Number.isNaN(monthStart.getTime())) return true;

    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    const eventStart = parseLocalDate(event.start_date);
    const eventEnd = parseLocalDate(event.end_date || event.start_date);

    if (!eventStart && !eventEnd) return false;

    const start = eventStart || eventEnd;
    const end = eventEnd || eventStart;

    return start <= monthEnd && end >= monthStart;
  }

  function renderAgendaCalendar() {
    if (!calendarGrid || !calendarMonthLabel) return;

    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const monthStart = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingDays = (monthStart.getDay() + 6) % 7;
    const baseEvents = filterEvents(allEvents, {
      includeMonth: false,
      includeCalendarDate: false
    }).filter((event) => !isPastEvent(event));
    const todayKey = toDateKey(new Date());
    const cells = [];

    calendarMonthLabel.textContent = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric"
    }).format(monthStart);

    for (let i = 0; i < leadingDays; i += 1) {
      cells.push(`<span class="agenda-calendar-day is-empty" aria-hidden="true"></span>`);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dateKey = toDateKey(date);
      const events = getEventsForCalendarDate(baseEvents, dateKey);
      const summary = getCalendarSummary(events);
      const dots = getCalendarDots(events);
      const classes = [
        "agenda-calendar-day",
        events.length ? "has-events" : "",
        dateKey === todayKey ? "is-today" : "",
        dateKey === selectedCalendarDate ? "is-selected" : ""
      ].filter(Boolean).join(" ");

      cells.push(`
        <button
          class="${classes}"
          type="button"
          data-calendar-date="${dateKey}"
          aria-label="${escapeAttribute(`${formatDate(dateKey)} : ${summary || "aucun événement"}`)}"
        >
          <span class="calendar-day-number">${day}</span>
          ${events.length ? `<span class="calendar-day-count">${events.length}</span>` : ""}
          ${dots}
          ${events.length ? `<span class="calendar-tooltip" role="tooltip">${escapeHtml(summary)}</span>` : ""}
        </button>
      `);
    }

    calendarGrid.innerHTML = cells.join("");
    updateCalendarSelection(baseEvents);
  }

  function getEventsForCalendarDate(events, dateKey) {
    return (Array.isArray(events) ? events : [])
      .filter((event) => matchesDate(event, dateKey));
  }

  function getCalendarSummary(events) {
    const total = events.length;
    if (!total) return "";

    const salonCount = events.filter((event) => ["Salon", "Festival"].includes(event.type)).length;
    const dedicaceCount = events.filter((event) => event.type === "Dédicace").length;
    const otherCount = Math.max(0, total - salonCount - dedicaceCount);
    const parts = [`${total} événement${total > 1 ? "s" : ""}`];

    if (salonCount) parts.push(`${salonCount} salon/festival`);
    if (dedicaceCount) parts.push(`${dedicaceCount} dédicace${dedicaceCount > 1 ? "s" : ""}`);
    if (otherCount) parts.push(`${otherCount} autre${otherCount > 1 ? "s" : ""}`);

    return parts.join(" · ");
  }

  function getCalendarDots(events) {
    if (!events.length) return "";

    const types = [...new Set(events.map((event) => event.type || "Autre"))].slice(0, 3);

    return `
      <span class="calendar-day-dots" aria-hidden="true">
        ${types.map((type) => {
          const typeMeta = TYPE_META[type] || TYPE_META.Autre;
          return `<i style="--dot-color:${typeMeta.color}"></i>`;
        }).join("")}
      </span>
    `;
  }

  function updateCalendarSelection(baseEvents) {
    if (!calendarSelection) return;

    if (!selectedCalendarDate) {
      calendarSelection.textContent = "Cliquez sur une date pour filtrer la carte et les événements.";
      if (calendarClearButton) calendarClearButton.hidden = true;
      return;
    }

    const selectedEvents = getEventsForCalendarDate(baseEvents, selectedCalendarDate);
    const summary = getCalendarSummary(selectedEvents) || "aucun événement";

    calendarSelection.textContent = `${formatDate(selectedCalendarDate)} · ${summary}`;
    if (calendarClearButton) calendarClearButton.hidden = false;
  }

  function handleCalendarClick(event) {
    const button = event.target.closest("[data-calendar-date]");
    if (!button) return;

    selectCalendarDate(button.dataset.calendarDate || "");
  }

  function handleCalendarShortcut(event) {
    const shortcut = event.currentTarget?.dataset?.calendarShortcut;
    const now = new Date();

    if (shortcut === "today") {
      selectCalendarDate(toDateKey(now));
      return;
    }

    if (shortcut === "tomorrow") {
      selectCalendarDate(toDateKey(addDays(now, 1)));
      return;
    }

    if (shortcut === "month") {
      selectedCalendarDate = "";
      calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      if (dateFilter) {
        dateFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }
      renderFilteredEvents();
    }
  }

  function selectCalendarDate(dateKey) {
    if (!dateKey) return;

    const date = parseLocalDate(dateKey);
    if (!date) return;

    selectedCalendarDate = dateKey;
    calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);

    if (dateFilter) {
      const monthValue = dateKey.slice(0, 7);
      const hasMonthOption = Array.from(dateFilter.options || [])
        .some((option) => option.value === monthValue);

      dateFilter.value = hasMonthOption ? monthValue : "";
    }

    if (
      mapPanel &&
      window.matchMedia &&
      window.matchMedia("(min-width: 781px)").matches
    ) {
      mapPanel.classList.add("is-open");
    }

    renderFilteredEvents();
  }

  function clearCalendarDate() {
    selectedCalendarDate = "";
    if (dateFilter) dateFilter.value = "";
    renderFilteredEvents();
  }

  function syncCalendarCursorFromMonth(monthValue) {
    if (!monthValue) return;

    const monthStart = new Date(`${monthValue}-01T00:00:00`);
    if (Number.isNaN(monthStart.getTime())) return;

    calendarCursor = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  }

  function addDays(date, days) {
    return new Date(date.getTime() + Number(days || 0) * DAY_MS);
  }

  function toDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function isPastEvent(event) {
    const eventEnd = parseLocalDate(event.end_date || event.start_date);

    if (!eventEnd) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return eventEnd < today;
  }

  function sortUpcomingEvents(a, b) {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;

    const dateA = parseLocalDate(a.start_date)?.getTime() || Number.MAX_SAFE_INTEGER;
    const dateB = parseLocalDate(b.start_date)?.getTime() || Number.MAX_SAFE_INTEGER;

    if (dateA !== dateB) return dateA - dateB;

    return String(a.title || "").localeCompare(String(b.title || ""), "fr");
  }

  function sortPastEvents(a, b) {
    const dateA = parseLocalDate(a.end_date || a.start_date)?.getTime() || 0;
    const dateB = parseLocalDate(b.end_date || b.start_date)?.getTime() || 0;

    if (dateA !== dateB) return dateB - dateA;

    return String(a.title || "").localeCompare(String(b.title || ""), "fr");
  }

  function parseLocalDate(value) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function renderEvents(events, pastCount = 0) {
    if (!eventsGrid || !resultsCount) return;

    resultsCount.textContent =
      `${events.length} événement${events.length > 1 ? "s" : ""} à venir${
        pastCount ? ` · ${pastCount} passé${pastCount > 1 ? "s" : ""}` : ""
      }`;

    if (!events.length) {
      eventsGrid.innerHTML = `
        <article class="empty-state">
          Aucun événement à venir pour cette recherche.
          ${pastCount ? "Des événements passés restent disponibles dans la sous-section ci-dessous." : ""}
        </article>
      `;
      window.dispatchEvent(new CustomEvent("dedicalivres:cards-rendered", {
        detail: { count: 0 }
      }));
      return;
    }

    eventsGrid.innerHTML = events.map((event) => renderEventCard(event)).join("");
    refreshFavoriteButtons();
    window.dispatchEvent(new CustomEvent("dedicalivres:cards-rendered", {
      detail: { count: events.length }
    }));
  }

  function renderPastEvents(events) {
    if (!pastEventsGrid || !pastEventsCount || !pastEventsSection) return;

    pastEventsCount.textContent = events.length
      ? `${events.length} événement${events.length > 1 ? "s" : ""}`
      : "Aucun événement passé";

    pastEventsSection.hidden = !events.length;

    if (!events.length) {
      pastEventsGrid.innerHTML = "";
      return;
    }

    pastEventsGrid.innerHTML = events
      .map((event) => renderEventCard(event, { isPast: true }))
      .join("");
  }

  function renderEventCard(event, options = {}) {
    const typeMeta = TYPE_META[event.type] || TYPE_META.Autre;
    const image = resolveImageUrl(event.image_url);
    const isPast = Boolean(options.isPast);

    return `
      <article
        class="event-card ${typeMeta.className}${isPast ? " is-past-event" : ""}"
        id="event-${escapeAttribute(event.id)}"
        data-event-id="${escapeAttribute(event.id)}"
      >
        ${
          event.featured
            ? `<div class="featured-ribbon">Mis en avant</div>`
            : ""
        }

        ${renderCardImage(image, event.title || "Événement")}

        <div class="card-body">
          <div class="card-tags">
            ${
              event.type
                ? `
                  <span class="badge badge-type ${typeMeta.className}">
                    <i></i>
                    ${escapeHtml(event.type)}
                  </span>
                `
                : ""
            }

            ${
              event.price
                ? `<span class="badge badge-price">${escapeHtml(event.price)}</span>`
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
                ? `<span>📅 ${formatDateRange(event.start_date, event.end_date)}</span>`
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

            <button
              class="favorite-btn ${isFavorite(event.id) ? "is-active" : ""}"
              type="button"
              data-favorite-id="${escapeAttribute(event.id)}"
              aria-pressed="${isFavorite(event.id) ? "true" : "false"}"
            >
              ${isFavorite(event.id) ? "♥ Favori" : "♡ Favori"}
            </button>

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

  function renderCardImage(image, title) {
    if (!image) {
      return `
        <div class="card-image-frame is-empty">
          <div class="card-image"></div>
        </div>
      `;
    }

    const safeImage = escapeAttribute(image);
    const safeTitle = escapeAttribute(title || "Événement");

    return `
      <div class="card-image-frame">
        <img class="card-image-blur" src="${safeImage}" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <img class="card-image" src="${safeImage}" alt="${safeTitle}" loading="lazy" decoding="async" />
      </div>
    `;
  }


  function bindFavorites() {
    clearFavoritesButton?.addEventListener("click", () => {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([]));
      refreshFavoriteButtons();
      renderSavedFavorites();
    });

    function handleFavoriteClick(event) {
      const button = event.target.closest("[data-favorite-id]");

      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const isSavedListButton = Boolean(button.closest("#favorites-list"));
      const wasActive = isFavorite(button.dataset.favoriteId);

      toggleFavorite(button.dataset.favoriteId);
      refreshFavoriteButtons();

      const active = isFavorite(button.dataset.favoriteId);
      animateFavoriteButton(button, active);

      if (isSavedListButton && wasActive && !active) {
        window.setTimeout(renderSavedFavorites, 320);
        return;
      }

      renderSavedFavorites();
    }

    eventsGrid?.addEventListener("click", handleFavoriteClick);
    favoritesList?.addEventListener("click", handleFavoriteClick);

    window.addEventListener("storage", (event) => {
      if (event.key !== FAVORITES_KEY) return;

      refreshFavoriteButtons();
      renderSavedFavorites();
    });
  }

  function getFavoriteIds() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }

  function setFavoriteIds(ids) {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify([...new Set(ids.map(String).filter(Boolean))])
    );
  }

  function isFavorite(id) {
    return getFavoriteIds().includes(String(id || ""));
  }

  function toggleFavorite(id) {
    const key = String(id || "");

    if (!key) return;

    const ids = getFavoriteIds();
    const next = ids.includes(key)
      ? ids.filter((item) => item !== key)
      : [...ids, key];

    setFavoriteIds(next);
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

  function refreshFavoriteButtons() {
    document.querySelectorAll("[data-favorite-id]").forEach((button) => {
      const active = isFavorite(button.dataset.favoriteId);

      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.textContent = active ? "♥ Favori" : "♡ Favori";
    });
  }

  function renderSavedFavorites() {
    if (!favoritesList) return;

    const ids = getFavoriteIds();

    if (!ids.length) {
      savedEventsSection?.classList.add("is-empty");
      favoritesList.innerHTML = `
        <article class="empty-state">Aucun favori pour le moment.</article>
      `;
      return;
    }

    const events = ids
      .map((id) => allEvents.find((event) => String(event.id) === String(id)))
      .filter(Boolean);

    if (!events.length) {
      savedEventsSection?.classList.add("is-empty");
      favoritesList.innerHTML = `
        <article class="empty-state">
          Vos favoris seront affichés ici lorsque les événements correspondants seront encore à venir.
        </article>
      `;
      return;
    }

    savedEventsSection?.classList.remove("is-empty");
    favoritesList.innerHTML = events.map(renderFavoriteItem).join("");
  }

  function renderFavoriteItem(event) {
    return `
      <article class="favorite-item">
        <div>
          <strong>${escapeHtml(event.title || "Sans titre")}</strong>
          <span>
            ${escapeHtml(formatDateRange(event.start_date, event.end_date))}
            ${event.city || event.region ? ` · ${escapeHtml([event.city, event.region].filter(Boolean).join(", "))}` : ""}
          </span>
        </div>

        <div class="favorite-item-actions">
          <a class="card-link" href="event.html?id=${encodeURIComponent(event.id)}">
            Voir
          </a>
          <button
            class="favorite-btn is-active"
            type="button"
            data-favorite-id="${escapeAttribute(event.id)}"
            aria-pressed="true"
          >
            ♥ Favori
          </button>
        </div>
      </article>
    `;
  }


  function renderMapMarkers(events) {
    pendingMapEvents = Array.isArray(events) ? events : [];

    if (!map || !markersLayer) {
      if (mapPanel?.classList.contains("is-open")) {
        requestMapRender(pendingMapEvents);
      }

      return;
    }

    markersLayer.clearLayers();
    markerByEventId = {};
    closeMapFloatingPanel();

    const grouped = {};

    events.forEach((event) => {
      if (
        !Number.isFinite(Number(event.lat)) ||
        !Number.isFinite(Number(event.lng))
      ) {
        return;
      }

      const key = `${event.lat},${event.lng}`;

      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push(event);
    });

    Object.values(grouped).forEach((group) => {
      const first = group[0];
      const lat = Number(first.lat);
      const lng = Number(first.lng);
      const typeMeta = TYPE_META[first.type] || TYPE_META.Autre;

      const marker = L.marker([lat, lng], {
        icon: createTypeIcon(typeMeta),
        keyboard: true,
        title: group.length > 1
          ? `${group.length} événements`
          : first.title || "Événement"
      });

      marker.on("click", () => {
        openMapFloatingPanel(group);
      });

      marker.addTo(markersLayer);

      group.forEach((event) => {
        markerByEventId[event.id] = marker;
      });
    });
  }

  function ensureMapFloatingPanel() {
    if (mapFloatingPanel || !mapPanel) return mapFloatingPanel;

    mapFloatingPanel = document.createElement("aside");
    mapFloatingPanel.id = "map-floating-panel";
    mapFloatingPanel.className = "map-floating-panel";
    mapFloatingPanel.setAttribute("aria-live", "polite");
    mapFloatingPanel.setAttribute("aria-label", "Détails de l’événement sélectionné sur la carte");
    mapFloatingPanel.hidden = true;
    mapFloatingPanel.innerHTML = `
      <button
        type="button"
        class="map-floating-close"
        aria-label="Fermer le panneau événement"
      >
        ×
      </button>
      <div id="map-floating-content" class="map-floating-content"></div>
    `;

    mapPanel.appendChild(mapFloatingPanel);

    mapFloatingPanel
      .querySelector(".map-floating-close")
      ?.addEventListener("click", closeMapFloatingPanel);

    mapFloatingPanel.addEventListener("click", (event) => {
      const focusButton = event.target.closest("[data-map-focus-id]");
      if (focusButton) {
        focusEventFromMap(
          focusButton.dataset.mapFocusId,
          focusButton.dataset.mapFocusType || ""
        );
      }
    });

    return mapFloatingPanel;
  }

  function openMapFloatingPanel(group) {
    const panel = ensureMapFloatingPanel();
    const content = document.getElementById("map-floating-content");

    if (!panel || !content) return;

    const events = Array.isArray(group) ? group : [];

    content.innerHTML = renderMapFloatingContent(events);
    panel.hidden = false;
    panel.classList.add("is-open");
  }

  function closeMapFloatingPanel() {
    if (!mapFloatingPanel) return;

    mapFloatingPanel.classList.remove("is-open");
    mapFloatingPanel.hidden = true;

    const content = document.getElementById("map-floating-content");
    if (content) content.innerHTML = "";
  }

  function renderMapFloatingContent(events) {
    if (!events.length) {
      return `<div class="map-floating-empty">Aucun événement sélectionné.</div>`;
    }

    const title = events.length > 1
      ? `${events.length} événements à cet endroit`
      : "1 événement sélectionné";

    return `
      <div class="map-floating-head">
        <span class="map-floating-kicker">Carte en direct</span>
        <strong>${escapeHtml(title)}</strong>
      </div>

      <div class="map-floating-list">
        ${events.map(renderMapFloatingEvent).join("")}
      </div>
    `;
  }

  function renderMapFloatingEvent(event) {
    const typeMeta = TYPE_META[event.type] || TYPE_META.Autre;
    const image = resolveImageUrl(event.image_url);
    const place = [event.city, event.region].filter(Boolean).join(" — ") || "Lieu non précisé";
    const date = event.start_date
      ? formatDateRange(event.start_date, event.end_date)
      : "Date à préciser";
    const description = truncateText(event.description || "", 135);
    const detailUrl = `event.html?id=${encodeURIComponent(event.id)}`;

    return `
      <article class="map-floating-event">
        ${
          image
            ? `
              <a class="map-floating-image-link" href="${detailUrl}">
                <img
                  class="map-floating-image"
                  src="${escapeAttribute(image)}"
                  alt="${escapeAttribute(event.title || "Événement")}"
                  loading="lazy"
                  decoding="async"
                />
              </a>
            `
            : `<div class="map-floating-image map-floating-image-placeholder"></div>`
        }

        <div class="map-floating-event-body">
          <div class="map-floating-badges">
            ${
              event.type
                ? `
                  <span class="badge badge-type ${typeMeta.className}">
                    ${escapeHtml(event.type)}
                  </span>
                `
                : ""
            }

            ${
              event.featured
                ? `<span class="badge badge-featured">Sélection</span>`
                : ""
            }
          </div>

          <h3>${escapeHtml(event.title || "Sans titre")}</h3>

          <p class="map-floating-meta">📅 ${escapeHtml(date)}</p>
          <p class="map-floating-meta">📍 ${escapeHtml(place)}</p>

          ${
            description
              ? `<p class="map-floating-description">${escapeHtml(description)}</p>`
              : ""
          }

          <div class="map-floating-actions">
            <a class="btn-primary" href="${detailUrl}">
              Voir la fiche
            </a>

            <button
              type="button"
              class="btn-secondary"
              data-map-focus-id="${escapeAttribute(event.id)}"
              data-map-focus-type="${escapeAttribute(event.type || "")}"
            >
              Voir dans la liste
            </button>

            ${
              event.website
                ? `
                  <a
                    class="btn-secondary"
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

  function truncateText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();

    if (text.length <= maxLength) return text;

    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  function createTypeIcon(typeMeta) {
    return L.divIcon({
      className: "event-marker-v5",
      html: `<span style="--marker-color:${typeMeta.color}"></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    });
  }

  function focusEventFromMap(eventId, eventType) {
    if (typeFilter && eventType && typeFilter.value !== eventType) {
      typeFilter.value = eventType;
      renderFilteredEvents();
    }

    if (mapPanel) {
      mapPanel.classList.remove("is-open");

      if (mobileMapToggle) {
        mobileMapToggle.textContent = "Carte en direct";
      }
    }

    setTimeout(() => {
      const target = document.getElementById(`event-${eventId}`);

      if (!target) return;

      document
        .querySelectorAll(".event-card.is-map-focused")
        .forEach((card) => {
          card.classList.remove("is-map-focused");
        });

      target.classList.add("is-map-focused");

      target.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      setTimeout(() => {
        target.classList.remove("is-map-focused");
      }, 2600);
    }, 280);
  }



  /* =========================================================
     PACK CARTE-2F — suppression toolbar maison identifiée
     Ne touche pas aux clics des cartes événements.
  ========================================================= */

  function installMapPremiumToolbarCleanupSafe() {
    removeMapPremiumToolbarButtons();

    const target = mapPanel || document.getElementById("map") || document.body;

    if (target && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        removeMapPremiumToolbarButtons();
      });

      observer.observe(target, {
        childList: true,
        subtree: true
      });
    }

    setTimeout(removeMapPremiumToolbarButtons, 100);
    setTimeout(removeMapPremiumToolbarButtons, 500);
    setTimeout(removeMapPremiumToolbarButtons, 1500);
    setTimeout(removeMapPremiumToolbarButtons, 3000);
  }

  function removeMapPremiumToolbarButtons() {
    [
      document.getElementById("map-fullscreen-toggle"),
      document.getElementById("map-close-mobile")
    ].forEach((element) => {
      if (element) element.remove();
    });

    const toolbar = document.querySelector(".map-premium-toolbar");

    if (toolbar) {
      toolbar.remove();
    }
  }


  async function handleNewsletterSubmit(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!newsletterForm || !newsletterFeedback) return;

    const formData = new FormData(newsletterForm);

    const email = (formData.get("email") || "")
      .toString()
      .trim()
      .toLowerCase();

    const region = (formData.get("region") || "")
      .toString()
      .trim();

    if (!isValidEmail(email)) {
      setNewsletterFeedback(
        "Veuillez saisir une adresse email valide.",
        "error"
      );
      return;
    }

    const submitButton = newsletterForm.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Inscription…";
    }

    setNewsletterFeedback("Inscription en cours…", "");

    try {
      const { error } = await supabaseClient
        .from("newsletter_subscribers")
        .insert([
          {
            email,
            region: region || null
          }
        ]);

      if (error) {
        if (
          error.code === "23505" ||
          /duplicate|unique/i.test(error.message || "")
        ) {
          setNewsletterFeedback(
            "Vous êtes déjà inscrit à la newsletter.",
            "success"
          );

          newsletterForm.reset();
          return;
        }

        throw error;
      }

      setNewsletterFeedback(
        region
          ? `Inscription confirmée pour la région ${region}.`
          : "Inscription confirmée. Vous recevrez les prochains événements.",
        "success"
      );

      newsletterForm.reset();
    } catch (error) {
      console.error("Erreur newsletter :", error);

      setNewsletterFeedback(
        "Impossible de finaliser l’inscription pour le moment.",
        "error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "S’inscrire";
      }
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();

    if (!form) return;

    setFormFeedback("Envoi en cours...", "");

    const formData = new FormData(form);

    try {
      if (formData.get("legal_accept") !== "on") {
        throw new Error("Merci de valider l’autorisation de relecture, modération et publication avant l’envoi.");
      }

      let lat = Number(formData.get("lat"));
      let lng = Number(formData.get("lng"));

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const coords = await geocodeMunicipality(formData.get("city"));

        if (!coords) {
          throw new Error("Ville invalide.");
        }

        lat = coords.lat;
        lng = coords.lng;
      }

      const eventId = createClientUuid();
      const eventType = cleanText(formData.get("type"));

      const payload = {
        id: eventId,
        title: formData.get("title"),
        type: eventType,
        region: formData.get("region"),
        city: formData.get("city"),
        price: formData.get("price"),
        start_date: formData.get("start_date"),
        end_date: formData.get("end_date"),
        website: formData.get("website"),
        description: formData.get("description"),
        lat,
        lng,
        validated: false,
        featured: false,
        rejected: false,
        verified: false
      };

      const imageFile = selectedPreviewImage || formData.get("image");

      if (imageFile instanceof File && imageFile.size > 0) {
        payload.image_url = await uploadImage(imageFile);
      }

      const authorPresencePayload = await buildSubmittedAuthorPresencePayload(formData, payload);

      const { error } = await supabaseClient
        .from("events")
        .insert([payload]);

      if (error) throw error;

      let authorPresenceWarning = "";

      if (authorPresencePayload) {
        const { error: authorPresenceError } = await supabaseClient
          .from("event_authors_presence")
          .insert([authorPresencePayload]);

        if (authorPresenceError) {
          console.warn("Présence auteur non jointe à la soumission :", authorPresenceError);

          const legacyPayload = {
            event_id: eventId,
            pseudo: authorPresencePayload.pseudo,
            website: authorPresencePayload.author_profile_url || payload.website || "https://dedicalivres.fr/",
            validated: false,
            rejected: false
          };

          const { error: legacyAuthorPresenceError } = await supabaseClient
            .from("event_authors_presence")
            .insert([legacyPayload]);

          if (legacyAuthorPresenceError) {
            console.warn("Fallback présence auteur impossible :", legacyAuthorPresenceError);
            authorPresenceWarning = " La fiche événement est transmise, mais la présence auteur devra être ajoutée ou corrigée en modération.";
          }
        }
      }

      form.reset();
      selectedPreviewImage = null;
      syncDedicaceAuthorFields();

      const preview = document.getElementById("image-preview");

      if (preview) {
        preview.innerHTML = "";
        preview.classList.remove("is-visible");
      }

      setFormFeedback(`Votre événement a bien été transmis.${authorPresenceWarning}`, "success");
    } catch (error) {
      console.error(error);

      setFormFeedback(
        error.message || "Erreur pendant l’envoi.",
        "error"
      );
    }
  }

  async function buildSubmittedAuthorPresencePayload(formData, eventPayload) {
    if (!eventPayload || eventPayload.type !== "Dédicace") return null;

    const pseudo = cleanText(formData.get("author_pseudo")).slice(0, 120);
    const authorProfileUrl = normalizeOptionalWebsite(formData.get("author_profile_url"));
    const portraitFile = formData.get("author_portrait");
    const hasPortrait = portraitFile instanceof File && portraitFile.size > 0;

    if (!pseudo && !authorProfileUrl && !hasPortrait) return null;

    if (pseudo.length < 2) {
      throw new Error("Pour associer un portrait ou un lien auteur, merci d’indiquer le nom ou pseudo de l’auteur.");
    }

    if (authorProfileUrl && !isValidUrl(authorProfileUrl)) {
      throw new Error("Le lien auteur semble invalide. Vous pouvez le corriger ou laisser ce champ vide.");
    }

    validateAuthorPortraitFile(portraitFile);

    const authorIdentityKey = slugifyAuthorIdentity(pseudo);
    let authorPortraitUrl = null;
    let authorPortraitStorageKey = null;

    if (hasPortrait) {
      const uploadedPortrait = await uploadAuthorPortrait(portraitFile, authorIdentityKey);
      authorPortraitUrl = uploadedPortrait.url;
      authorPortraitStorageKey = uploadedPortrait.storageKey;
    }

    return {
      event_id: eventPayload.id,
      pseudo,
      author_slug: authorIdentityKey || null,
      author_identity_key: authorIdentityKey || null,
      website: authorProfileUrl || null,
      author_profile_url: authorProfileUrl || null,
      author_profile_url_type: authorProfileUrl ? inferAuthorProfileUrlType(authorProfileUrl) : null,
      publication_mode: "unknown",
      book_or_publisher_url: null,
      book_or_publisher_url_type: null,
      publisher_name: null,
      author_portrait_url: authorPortraitUrl,
      author_portrait_storage_key: authorPortraitStorageKey,
      source: "event_submission",
      validated: false,
      rejected: false
    };
  }

  async function uploadImage(file) {
    const compressed = await compressImage(file);

    if (shouldUseR2Upload()) {
      try {
        return await uploadImageToR2(compressed, "event-images");
      } catch (error) {
        console.warn("Upload R2 indisponible, bascule Supabase :", error);
      }
    }

    return uploadImageToSupabase(compressed, "event-images");
  }

  function validateAuthorPortraitFile(file) {
    if (!(file instanceof File) || !file.size) return;

    if (!file.type.startsWith("image/")) {
      throw new Error("Le portrait auteur doit être une image.");
    }

    if (file.size > MAX_AUTHOR_PORTRAIT_SIZE) {
      throw new Error("Le portrait auteur est trop lourd. Merci d’utiliser une image de moins de 4 Mo.");
    }
  }

  async function uploadAuthorPortrait(file, authorIdentityKey) {
    if (!shouldUseR2Upload()) {
      throw new Error("L’upload du portrait auteur n’est pas disponible pour le moment.");
    }

    const compressed = await compressAuthorPortrait(file, authorIdentityKey);
    let url = "";

    try {
      url = await uploadImageToR2(compressed, AUTHOR_PORTRAIT_FOLDER, {
        fileName: compressed.name,
        identityKey: authorIdentityKey || "auteur"
      });
    } catch (error) {
      console.warn("Upload portrait auteur dans author-portraits indisponible, bascule R2 event-images :", error);
      url = await uploadImageToR2(compressed, AUTHOR_PORTRAIT_FALLBACK_FOLDER, {
        fileName: compressed.name,
        identityKey: authorIdentityKey || "auteur"
      });
    }

    return {
      url,
      storageKey: getR2StorageKey(url)
    };
  }

  function shouldUseR2Upload() {
    return (
      config?.imageUploadProvider === "r2" &&
      typeof config.imageUploadEndpoint === "string" &&
      config.imageUploadEndpoint.trim()
    );
  }

  async function uploadImageToR2(file, folder, options = {}) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    if (options.fileName) {
      formData.append("file_name", options.fileName);
    }

    if (options.identityKey) {
      formData.append("identity_key", options.identityKey);
    }

    const response = await fetch(config.imageUploadEndpoint, {
      method: "POST",
      body: formData
    });

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || `Upload R2 impossible (${response.status})`);
    }

    return payload.url;
  }

  async function uploadImageToSupabase(file, bucket) {
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const { error } = await supabaseClient.storage
      .from(bucket)
      .upload(fileName, file, {
        cacheControl: "2592000",
        upsert: false
      });

    if (error) throw error;

    const { data } = supabaseClient.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async function compressImage(file) {
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxWidth = 1600;
        const ratio = Math.min(1, maxWidth / img.width);

        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            resolve(
              new File([blob], file.name, {
                type: "image/jpeg"
              })
            );
          },
          "image/jpeg",
          0.86
        );
      };

      img.src = URL.createObjectURL(file);
    });
  }

  function compressAuthorPortrait(file, authorIdentityKey) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Lecture du portrait auteur impossible."));
      reader.onload = (event) => {
        img.onload = () => {
          const maxWidth = 900;
          const ratio = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");

          canvas.width = Math.max(1, Math.round(img.width * ratio));
          canvas.height = Math.max(1, Math.round(img.height * ratio));

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Compression du portrait auteur impossible."));
                return;
              }

              const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
              const safeName = `${authorIdentityKey || "auteur"}-${stamp}-${Math.random().toString(36).slice(2, 8)}.jpg`;
              resolve(new File([blob], safeName, { type: "image/jpeg" }));
            },
            "image/jpeg",
            0.82
          );
        };

        img.onerror = () => reject(new Error("Portrait auteur invalide."));
        img.src = event.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  async function geocodeMunicipality(city) {
    const suggestions = await fetchCitySuggestions(city, 1);

    return suggestions[0] || null;
  }

  async function fetchCitySuggestions(query, limit = 6) {
    const value = String(query || "").trim();

    if (value.length < 3) return [];

    const cacheKey = `${value.toLowerCase()}::${limit}`;

    if (citySuggestionCache.has(cacheKey)) {
      return citySuggestionCache.get(cacheKey);
    }

    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(value)}&limit=${limit}&type=municipality`
      );

      if (!response.ok) return [];

      const data = await response.json();

      const suggestions = (data.features || [])
        .map((feature) => {
          const properties = feature.properties || {};
          const coords = feature.geometry?.coordinates || [];

          const cityName =
            properties.city ||
            properties.municipality ||
            properties.name ||
            "";

          const postcode = properties.postcode || "";
          const context = properties.context || "";

          const label = [
            cityName,
            postcode,
            context
          ]
            .filter(Boolean)
            .join(" — ");

          return {
            label,
            city: cityName,
            postcode,
            context,
            lng: Number(coords[0]),
            lat: Number(coords[1])
          };
        })
        .filter((item) => {
          return (
            item.city &&
            Number.isFinite(item.lat) &&
            Number.isFinite(item.lng)
          );
        });

      citySuggestionCache.set(cacheKey, suggestions);

      return suggestions;
    } catch (error) {
      console.warn("Autocomplétion ville indisponible :", error);
      return [];
    }
  }

  async function reverseGeocodeApprox(lat, lng) {
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/reverse/?lon=${encodeURIComponent(lng)}&lat=${encodeURIComponent(lat)}`
      );

      const data = await response.json();
      const properties = data.features?.[0]?.properties || {};

      return {
        city:
          properties.city ||
          properties.municipality ||
          properties.name ||
          "",
        region: properties.context || ""
      };
    } catch {
      return {
        city: "",
        region: ""
      };
    }
  }

  function bindCityAutocomplete() {
    if (!cityInput) return;

    cityInput.addEventListener("input", () => {
      const value = cityInput.value.trim();

      if (cityLatInput) cityLatInput.value = "";
      if (cityLngInput) cityLngInput.value = "";

      clearTimeout(cityAutocompleteTimer);

      if (!citySuggestions || value.length < 3) {
        clearCitySuggestions();

        if (cityHelp) {
          cityHelp.textContent =
            value.length > 0
              ? "Tapez au moins 3 caractères pour rechercher une commune."
              : "Commencez à saisir une ville puis choisissez la bonne commune.";
          cityHelp.classList.remove("success", "error");
        }

        return;
      }

      if (cityHelp) {
        cityHelp.textContent = "Recherche de communes…";
        cityHelp.classList.remove("success", "error");
      }

      cityInput.classList.add("loading");

      cityAutocompleteTimer = setTimeout(async () => {
        const suggestions = await fetchCitySuggestions(value, 8);

        renderCitySuggestions(suggestions);

        cityInput.classList.remove("loading");

        if (cityHelp) {
          if (suggestions.length) {
            cityHelp.textContent =
              "Choisissez une commune dans la liste pour valider sa position.";
            cityHelp.classList.remove("error");
          } else {
            cityHelp.textContent = "Aucune commune trouvée pour cette saisie.";
            cityHelp.classList.remove("success");
            cityHelp.classList.add("error");
          }
        }
      }, 300);
    });

    cityInput.addEventListener("change", async () => {
      const value = cityInput.value.trim();

      if (!value) {
        clearSelectedCity();
        return;
      }

      const selected =
        findCitySuggestion(value) ||
        (await geocodeMunicipality(value));

      if (!selected) {
        clearSelectedCity();

        if (cityHelp) {
          cityHelp.textContent =
            "Ville non reconnue. Choisissez une commune proposée dans la liste.";
          cityHelp.classList.remove("success");
          cityHelp.classList.add("error");
        }

        return;
      }

      applySelectedCity(selected);
    });
  }

  function renderCitySuggestions(suggestions) {
    if (!citySuggestions) return;

    citySuggestions.innerHTML = "";

    suggestions.forEach((suggestion) => {
      const option = document.createElement("option");

      option.value = suggestion.label;
      option.dataset.city = suggestion.city;
      option.dataset.lat = String(suggestion.lat);
      option.dataset.lng = String(suggestion.lng);

      citySuggestions.appendChild(option);
    });
  }

  function clearCitySuggestions() {
    if (citySuggestions) {
      citySuggestions.innerHTML = "";
    }
  }

  function findCitySuggestion(value) {
    const normalizedValue = normalize(value);

    if (!citySuggestions) return null;

    const option = Array.from(citySuggestions.options || []).find((item) => {
      return normalize(item.value) === normalizedValue;
    });

    if (!option) return null;

    return {
      label: option.value,
      city: option.dataset.city || option.value,
      lat: Number(option.dataset.lat),
      lng: Number(option.dataset.lng)
    };
  }

  function applySelectedCity(selected) {
    if (!selected) return;

    cityInput.value = selected.city || selected.label || cityInput.value;

    if (cityLatInput) cityLatInput.value = selected.lat;
    if (cityLngInput) cityLngInput.value = selected.lng;

    if (cityHelp) {
      cityHelp.textContent = "Ville validée ✔";
      cityHelp.classList.remove("error");
      cityHelp.classList.add("success");
    }
  }

  function clearSelectedCity() {
    if (cityLatInput) cityLatInput.value = "";
    if (cityLngInput) cityLngInput.value = "";

    if (cityHelp) {
      cityHelp.classList.remove("success", "error");
    }
  }

  function populateMonthFilter() {
    if (!dateFilter) return;

    const alreadyFilled = dateFilter.options && dateFilter.options.length > 1;
    if (alreadyFilled) return;

    const formatter = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric"
    });

    const now = new Date();

    for (let i = 0; i < 18; i++) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth() + i,
        1
      );

      const value = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      const option = document.createElement("option");

      option.value = value;
      option.textContent = formatter.format(date);

      dateFilter.appendChild(option);
    }
  }

  function setLocateStatus(message, type = "") {
    if (!locateStatus) return;

    locateStatus.textContent = message || "";
    locateStatus.className = `locate-status ${type}`.trim();
  }

  function getGeolocationErrorMessage(error) {
    if (!error || typeof error.code !== "number") {
      return "Impossible de récupérer votre position pour le moment.";
    }

    if (error.code === error.PERMISSION_DENIED) {
      return "Localisation refusée. Autorisez la position dans le navigateur pour centrer la carte.";
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return "Position indisponible. Essayez de nouveau ou filtrez par région.";
    }

    if (error.code === error.TIMEOUT) {
      return "La localisation prend trop de temps. Réessayez dans quelques secondes.";
    }

    return "Impossible de récupérer votre position pour le moment.";
  }

  async function locateUser() {
    setLocateStatus("", "");

    if (!window.isSecureContext) {
      setLocateStatus(
        "La localisation fonctionne uniquement sur une page sécurisée en HTTPS.",
        "error"
      );
      return;
    }

    if (!navigator.geolocation) {
      setLocateStatus("La géolocalisation n’est pas disponible sur cet appareil.", "error");
      return;
    }

    if (mapPanel && !mapPanel.classList.contains("is-open")) {
      mapPanel.classList.add("is-open");
      if (mobileMapToggle) mobileMapToggle.textContent = "Fermer la carte en direct";
    }

    if (!map) {
      await requestMapRender(filterEvents(allEvents));
    }

    if (!map || !window.L) {
      setLocateStatus("La carte n’est pas disponible pour le moment.", "error");
      return;
    }

    if (locateMeButton) {
      locateMeButton.disabled = true;
      locateMeButton.textContent = "Localisation…";
    }

    setLocateStatus("Demande de position en cours…", "");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        userPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        map.setView([userPosition.lat, userPosition.lng], 9);

        if (userMarker) {
          map.removeLayer(userMarker);
        }

        userMarker = L.circleMarker([userPosition.lat, userPosition.lng], {
          radius: 8,
          color: "#ff6b35",
          fillColor: "#ff6b35",
          fillOpacity: 0.85
        })
          .bindPopup("Vous êtes ici")
          .addTo(map);

        const nearbyEvents = findNearestEvents(userPosition, filterEvents(allEvents));
        if (nearbyEvents.length) {
          openMapFloatingPanel(nearbyEvents);
        }

        await trackLocationRequest(userPosition);
        setLocateStatus(
          nearbyEvents.length
            ? "Position trouvée. Les rendez-vous les plus proches sont affichés sur la carte."
            : "Position trouvée. Aucun événement proche avec coordonnées n’est disponible dans ce filtre.",
          "success"
        );

        if (locateMeButton) {
          locateMeButton.disabled = false;
          locateMeButton.textContent = "Me localiser à nouveau";
        }
      },
      (error) => {
        if (locateMeButton) {
          locateMeButton.disabled = false;
          locateMeButton.textContent = "Me localiser";
        }

        setLocateStatus(getGeolocationErrorMessage(error), "error");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 600000
      }
    );
  }

  function findNearestEvents(position, events) {
    if (!position) return [];

    return (Array.isArray(events) ? events : [])
      .filter((event) => (
        Number.isFinite(Number(event.lat)) &&
        Number.isFinite(Number(event.lng))
      ))
      .map((event) => ({
        ...event,
        distanceKm: distanceInKm(
          Number(position.lat),
          Number(position.lng),
          Number(event.lat),
          Number(event.lng)
        )
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
  }

  function distanceInKm(lat1, lng1, lat2, lng2) {
    const radius = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function toRadians(value) {
    return Number(value) * Math.PI / 180;
  }

  async function trackLocationRequest(position) {
    if (!position) return;

    const roundedLat = roundCoordinate(position.lat);
    const roundedLng = roundCoordinate(position.lng);
    const place = await reverseGeocodeApprox(position.lat, position.lng);

    const payload = {
      lat: roundedLat,
      lng: roundedLng,
      city: place.city || null,
      region: place.region || null,
      page: window.location.pathname || "/",
      device: getDeviceType(),
      user_agent: navigator.userAgent || null
    };

    try {
      const { error } = await supabaseClient
        .from("location_tracking")
        .insert([payload]);

      if (error) {
        console.warn("Tracking localisation non enregistré :", error.message);
      }
    } catch (error) {
      console.warn("Tracking localisation indisponible :", error);
    }
  }

  function roundCoordinate(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function getDeviceType() {
    const width = window.innerWidth;

    if (width <= 640) return "mobile";
    if (width <= 1024) return "tablet";

    return "desktop";
  }

  function resetFilters() {
    if (searchInput) searchInput.value = "";
    if (regionFilter) regionFilter.value = "";
    if (typeFilter) typeFilter.value = "";
    if (dateFilter) dateFilter.value = "";
    selectedCalendarDate = "";
    calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    renderFilteredEvents();
  }

  function setLoadingState() {
    if (!eventsGrid) return;

    eventsGrid.innerHTML = `
      <article class="empty-state">
        Chargement…
      </article>
    `;
  }

  function setErrorState(message) {
    if (!eventsGrid) return;

    eventsGrid.innerHTML = `
      <article class="empty-state">
        ${escapeHtml(message)}
      </article>
    `;
  }

  function setFormFeedback(message, type) {
    if (!formFeedback) return;

    formFeedback.textContent = message;
    formFeedback.className = `form-feedback ${type || ""}`;
  }

  function setNewsletterFeedback(message, type) {
    if (!newsletterFeedback) return;

    newsletterFeedback.textContent = message;
    newsletterFeedback.className = type || "";
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

  function normalize(value) {
    return (value || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeOptionalWebsite(value) {
    const raw = cleanText(value);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function isValidUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function inferAuthorProfileUrlType(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();

      if (host.includes("instagram.com")) return "instagram";
      if (host.includes("facebook.com") || host.includes("fb.me")) return "facebook";
      if (host.includes("linktr.ee") || host.includes("linktree")) return "linktree";
      return "site_officiel";
    } catch {
      return "autre";
    }
  }

  function slugifyAuthorIdentity(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
  }

  function getR2StorageKey(url) {
    try {
      const parsed = new URL(url);
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    } catch {
      return "";
    }
  }

  function createClientUuid() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
      const random = window.crypto?.getRandomValues
        ? window.crypto.getRandomValues(new Uint8Array(1))[0]
        : Math.floor(Math.random() * 256);

      return (Number(char) ^ (random & (15 >> (Number(char) / 4)))).toString(16);
    });
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
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
