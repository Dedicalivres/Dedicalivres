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

  const FAVORITES_KEY = "dedicalivres_favorites";

  const eventsGrid = document.getElementById("events-grid");
  const resultsCount = document.getElementById("results-count");
  const favoritesList = document.getElementById("favorites-list");
  const clearFavoritesButton = document.getElementById("clear-favorites");

  const form = document.getElementById("submission-form");
  const formFeedback = document.getElementById("form-feedback");

  const newsletterForm = document.getElementById("newsletter-form");
  const newsletterFeedback = document.getElementById("newsletter-feedback");

  const searchInput = document.getElementById("search-input");
  const regionFilter = document.getElementById("region-filter");
  const typeFilter = document.getElementById("type-filter");
  const dateFilter = document.getElementById("date-filter");

  const mobileMapToggle = document.getElementById("mobile-map-toggle");
  const locateMeButton = document.getElementById("locate-me");
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
  let mapPopupHoverTimer = null;
  let mapFloatingPanel = null;
  let cityAutocompleteTimer = null;
  let citySuggestionCache = new Map();
  let userPosition = null;
  let selectedPreviewImage = null;
  let userMarker = null;

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
    initMap();
    loadEvents();

    initDefaultMapVisibility();
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
      setTimeout(() => {
        map?.invalidateSize();
      }, 350);
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

    [regionFilter, typeFilter, dateFilter].forEach((el) => {
      el?.addEventListener("change", renderFilteredEvents);
    });

    searchInput?.addEventListener("input", renderFilteredEvents);

    bindCityAutocomplete();
  }

  function toggleMobileMap() {
    if (!mapPanel) return;

    mapPanel.classList.toggle("is-open");

    if (mapPanel.classList.contains("is-open")) {
      mobileMapToggle.textContent = "Fermer la carte en direct";

      setTimeout(() => {
        map?.invalidateSize();
      }, 300);
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
        preview.innerHTML = `
          <img src="${e.target.result}" alt="Prévisualisation" />
          <div class="image-preview-caption">
            ${escapeHtml(file.name)}
          </div>
        `;

        preview.classList.add("is-visible");
      };

      reader.readAsDataURL(file);
    });
  }

  function initMap() {
    const mapElement = document.getElementById("map");

    if (!mapElement || !window.L) return;

    map = L.map("map").setView([46.603354, 1.888334], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    ensureMapFloatingPanel();

    map.on("click", () => {
      closeMapFloatingPanel();
    });
  }

  async function loadEvents() {
    setLoadingState();

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabaseClient
      .from("events")
      .select("*")
      .eq("validated", true)
      .eq("rejected", false)
      .or(`end_date.is.null,end_date.gte.${today}`)
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

    renderEvents(filtered);
    renderMapMarkers(filtered);
  }

  function filterEvents(events) {
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
      if (selectedMonth && !matchesMonth(event, selectedMonth)) return false;

      return true;
    });
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

  function parseLocalDate(value) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function renderEvents(events) {
    if (!eventsGrid || !resultsCount) return;

    resultsCount.textContent =
      `${events.length} événement${events.length > 1 ? "s" : ""}`;

    if (!events.length) {
      eventsGrid.innerHTML = `
        <article class="empty-state">
          Aucun événement trouvé.
        </article>
      `;
      return;
    }

    eventsGrid.innerHTML = events.map(renderEventCard).join("");
    refreshFavoriteButtons();
  }

  function renderEventCard(event) {
    const typeMeta = TYPE_META[event.type] || TYPE_META.Autre;
    const image = resolveImageUrl(event.image_url);

    return `
      <article
        class="event-card ${typeMeta.className}"
        id="event-${escapeAttribute(event.id)}"
      >
        ${
          event.featured
            ? `<div class="featured-ribbon">Mis en avant</div>`
            : ""
        }

        ${
          image
            ? `
              <img
                class="card-image"
                src="${escapeAttribute(image)}"
                alt="${escapeAttribute(event.title || "Événement")}"
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


  function bindFavorites() {
    clearFavoritesButton?.addEventListener("click", () => {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([]));
      refreshFavoriteButtons();
      renderSavedFavorites();
    });

    eventsGrid?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-favorite-id]");

      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      toggleFavorite(button.dataset.favoriteId);
      refreshFavoriteButtons();
      renderSavedFavorites();
    });

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
      favoritesList.innerHTML = `
        <article class="empty-state">Aucun favori pour le moment.</article>
      `;
      return;
    }

    const events = ids
      .map((id) => allEvents.find((event) => String(event.id) === String(id)))
      .filter(Boolean);

    if (!events.length) {
      favoritesList.innerHTML = `
        <article class="empty-state">
          Vos favoris seront affichés ici lorsque les événements correspondants seront encore à venir.
        </article>
      `;
      return;
    }

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
    if (!map || !markersLayer) return;

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

      marker.on("click", (leafletEvent) => {
        if (leafletEvent?.originalEvent) {
          L.DomEvent.stopPropagation(leafletEvent.originalEvent);
        }

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
        return;
      }

      const closeButton = event.target.closest("[data-map-panel-close]");
      if (closeButton) {
        closeMapFloatingPanel();
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

    if (window.matchMedia && window.matchMedia("(max-width: 780px)").matches) {
      setTimeout(() => {
        panel.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }, 80);
    }
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
      return `
        <div class="map-floating-empty">
          Aucun événement sélectionné.
        </div>
      `;
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

      const payload = {
        title: formData.get("title"),
        type: formData.get("type"),
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

      const { error } = await supabaseClient
        .from("events")
        .insert([payload]);

      if (error) throw error;

      form.reset();
      selectedPreviewImage = null;

      const preview = document.getElementById("image-preview");

      if (preview) {
        preview.innerHTML = "";
        preview.classList.remove("is-visible");
      }

      setFormFeedback("Votre événement a bien été transmis.", "success");
    } catch (error) {
      console.error(error);

      setFormFeedback(
        error.message || "Erreur pendant l’envoi.",
        "error"
      );
    }
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

  function shouldUseR2Upload() {
    return (
      config?.imageUploadProvider === "r2" &&
      typeof config.imageUploadEndpoint === "string" &&
      config.imageUploadEndpoint.trim()
    );
  }

  async function uploadImageToR2(file, folder) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

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

  function locateUser() {
    if (!navigator.geolocation || !map) {
      alert("La géolocalisation n’est pas disponible.");
      return;
    }

    if (locateMeButton) {
      locateMeButton.disabled = true;
      locateMeButton.textContent = "Localisation…";
    }

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

        await trackLocationRequest(userPosition);

        if (locateMeButton) {
          locateMeButton.disabled = false;
          locateMeButton.textContent = "Me localiser";
        }
      },
      () => {
        if (locateMeButton) {
          locateMeButton.disabled = false;
          locateMeButton.textContent = "Me localiser";
        }

        alert("Impossible de récupérer votre position.");
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000
      }
    );
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
