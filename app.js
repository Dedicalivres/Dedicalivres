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

  const eventsGrid = document.getElementById("events-grid");
  const resultsCount = document.getElementById("results-count");

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

  let map;
  let markersLayer;
  let allEvents = [];
  let markerByEventId = {};
  let userPosition = null;
  let selectedPreviewImage = null;

  const TYPE_META = {
    Salon: { className: "type-salon", color: "#3a1c71" },
    Festival: { className: "type-festival", color: "#ff6b35" },
    Dédicace: { className: "type-dedicace", color: "#16803c" },
    Autre: { className: "type-autre", color: "#2f6fed" }
  };

  init();

  function init() {
    bindEvents();
    bindImagePreview();
    populateMonthFilter();
    initMap();
    loadEvents();

    if (window.innerWidth <= 1080 && mapPanel) {
      mapPanel.classList.remove("is-open");
    }
  }

  function bindEvents() {
    document.getElementById("apply-filters")?.addEventListener("click", renderFilteredEvents);
    document.getElementById("reset-filters")?.addEventListener("click", resetFilters);

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
      mobileMapToggle.textContent = "Fermer la carte";

      setTimeout(() => {
        map?.invalidateSize();
      }, 300);
    } else {
      mobileMapToggle.textContent = "Carte";
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

      if (pageMode === "salons" && !["Salon", "Festival"].includes(event.type)) {
        return false;
      }

      const haystack = normalize([
        event.title,
        event.city,
        event.region,
        event.description
      ].join(" "));

      if (search && !haystack.includes(search)) return false;
      if (region && event.region !== region) return false;
      if (type && event.type !== type) return false;
      if (selectedMonth && !matchesMonth(event, selectedMonth)) return false;

      return true;
    });
  }

  function matchesMonth(event, selectedMonth) {
    const start = event.start_date || "";
    return start.startsWith(selectedMonth);
  }

  function renderEvents(events) {
    if (!eventsGrid || !resultsCount) return;

    resultsCount.textContent = `${events.length} événement(s)`;

    if (!events.length) {
      eventsGrid.innerHTML = `
        <article class="empty-state">
          Aucun événement trouvé.
        </article>
      `;
      return;
    }

    eventsGrid.innerHTML = events.map(renderEventCard).join("");
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
          image
            ? `
              <img
                class="card-image"
                src="${escapeAttribute(image)}"
                alt="${escapeAttribute(event.title || "Événement")}"
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
          </div>

          <h3 class="card-title">
            ${escapeHtml(event.title || "Sans titre")}
          </h3>

          <div class="card-meta">
            <span>📍 ${escapeHtml(event.city || "")}</span>
            <span>📅 ${formatDate(event.start_date)}</span>
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
          </div>
        </div>
      </article>
    `;
  }

  function renderMapMarkers(events) {
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    markerByEventId = {};

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
        icon: createTypeIcon(typeMeta)
      });

      marker.bindPopup(`
        <div class="premium-popup">
          <strong>
            ${group.length} événement(s)
          </strong>

          <br><br>

          ${group.map((event) => `
            <button
              class="popup-focus-btn"
              type="button"
              data-event-id="${escapeAttribute(event.id)}"
              data-event-type="${escapeAttribute(event.type || "")}"
            >
              ${escapeHtml(event.title || "Sans titre")}
            </button>
          `).join("")}
        </div>
      `);

      marker.on("popupopen", () => {
        document.querySelectorAll(".popup-focus-btn").forEach((button) => {
          button.addEventListener("click", () => {
            focusEventFromMap(
              button.dataset.eventId,
              button.dataset.eventType
            );
          });
        });
      });

      marker.addTo(markersLayer);

      group.forEach((event) => {
        markerByEventId[event.id] = marker;
      });
    });
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

    if (window.innerWidth <= 1080 && mapPanel) {
      mapPanel.classList.remove("is-open");

      if (mobileMapToggle) {
        mobileMapToggle.textContent = "Carte";
      }
    }

    setTimeout(() => {
      const target = document.getElementById(`event-${eventId}`);

      if (!target) return;

      document.querySelectorAll(".event-card.is-map-focused").forEach((card) => {
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
    const email = (formData.get("email") || "").toString().trim().toLowerCase();
    const region = (formData.get("region") || "").toString().trim();

    if (!isValidEmail(email)) {
      setNewsletterFeedback("Veuillez saisir une adresse email valide.", "error");
      return;
    }

    const submitButton = newsletterForm.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Inscription…";
    }

    setNewsletterFeedback("Inscription en cours…", "");

    try {
      const payload = {
        email,
        region: region || null
      };

      const { error } = await supabaseClient
        .from("newsletter_subscribers")
        .insert([payload]);

      if (error) {
        if (
          error.code === "23505" ||
          /duplicate|unique/i.test(error.message || "")
        ) {
          setNewsletterFeedback("Vous êtes déjà inscrit à la newsletter.", "success");
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
      setNewsletterFeedback("Impossible de finaliser l’inscription pour le moment.", "error");
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

    const extension = (compressed.name.split(".").pop() || "jpg").toLowerCase();

    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const { error } = await supabaseClient.storage
      .from("event-images")
      .upload(fileName, compressed);

    if (error) throw error;

    const { data } = supabaseClient.storage
      .from("event-images")
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
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(city)}&limit=1&type=municipality`
      );

      const data = await response.json();
      const coords = data.features?.[0]?.geometry?.coordinates;

      if (!coords) return null;

      return {
        lng: Number(coords[0]),
        lat: Number(coords[1])
      };
    } catch {
      return null;
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
        region:
          properties.context ||
          ""
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

    cityInput.addEventListener("change", async () => {
      const coords = await geocodeMunicipality(cityInput.value);

      if (!coords) return;

      cityLatInput.value = coords.lat;
      cityLngInput.value = coords.lng;

      if (cityHelp) cityHelp.textContent = "Ville validée ✔";
    });
  }

  function populateMonthFilter() {
    if (!dateFilter) return;

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
    formFeedback.className = `form-feedback ${type}`;
  }

  function setNewsletterFeedback(message, type) {
    if (!newsletterFeedback) return;

    newsletterFeedback.textContent = message;
    newsletterFeedback.className = type ? type : "";
  }

  function resolveImageUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;

    return `${config.assetsBaseUrl || ""}${path}`;
  }

  function formatDate(value) {
    if (!value) return "";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(value));
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
      .replace(/"/g, "&quot;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/'/g, "&#039;");
  }
})();  const cityLatInput = document.getElementById("city-lat");
  const cityLngInput = document.getElementById("city-lng");
  const cityHelp = document.getElementById("city-help");

  let map;
  let markersLayer;
  let allEvents = [];
  let markerByEventId = {};
  let userPosition = null;
  let selectedPreviewImage = null;

  const TYPE_META = {
    Salon: { className: "type-salon", color: "#3a1c71" },
    Festival: { className: "type-festival", color: "#ff6b35" },
    Dédicace: { className: "type-dedicace", color: "#16803c" },
    Autre: { className: "type-autre", color: "#2f6fed" }
  };

  init();

  function init() {
    bindEvents();
    bindImagePreview();
    populateMonthFilter();
    initMap();
    loadEvents();

    if (window.innerWidth <= 1080 && mapPanel) {
      mapPanel.classList.remove("is-open");
    }
  }

  function bindEvents() {
    document.getElementById("apply-filters")?.addEventListener("click", renderFilteredEvents);
    document.getElementById("reset-filters")?.addEventListener("click", resetFilters);

    form?.addEventListener("submit", handleFormSubmit);
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
      mobileMapToggle.textContent = "Fermer la carte";

      setTimeout(() => {
        map?.invalidateSize();
      }, 300);
    } else {
      mobileMapToggle.textContent = "Carte";
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

      if (pageMode === "salons" && !["Salon", "Festival"].includes(event.type)) {
        return false;
      }

      const haystack = normalize([
        event.title,
        event.city,
        event.region,
        event.description
      ].join(" "));

      if (search && !haystack.includes(search)) return false;
      if (region && event.region !== region) return false;
      if (type && event.type !== type) return false;
      if (selectedMonth && !matchesMonth(event, selectedMonth)) return false;

      return true;
    });
  }

  function matchesMonth(event, selectedMonth) {
    const start = event.start_date || "";
    return start.startsWith(selectedMonth);
  }

  function renderEvents(events) {
    if (!eventsGrid || !resultsCount) return;

    resultsCount.textContent = `${events.length} événement(s)`;

    if (!events.length) {
      eventsGrid.innerHTML = `
        <article class="empty-state">
          Aucun événement trouvé.
        </article>
      `;
      return;
    }

    eventsGrid.innerHTML = events.map(renderEventCard).join("");
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
          image
            ? `
              <img
                class="card-image"
                src="${escapeAttribute(image)}"
                alt="${escapeAttribute(event.title || "Événement")}"
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
          </div>

          <h3 class="card-title">
            ${escapeHtml(event.title || "Sans titre")}
          </h3>

          <div class="card-meta">
            <span>📍 ${escapeHtml(event.city || "")}</span>
            <span>📅 ${formatDate(event.start_date)}</span>
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
          </div>
        </div>
      </article>
    `;
  }

  function renderMapMarkers(events) {
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    markerByEventId = {};

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
        icon: createTypeIcon(typeMeta)
      });

      marker.bindPopup(`
        <div class="premium-popup">
          <strong>
            ${group.length} événement(s)
          </strong>

          <br><br>

          ${group.map((event) => `
            <button
              class="popup-focus-btn"
              type="button"
              data-event-id="${escapeAttribute(event.id)}"
              data-event-type="${escapeAttribute(event.type || "")}"
            >
              ${escapeHtml(event.title || "Sans titre")}
            </button>
          `).join("")}
        </div>
      `);

      marker.on("popupopen", () => {
        document.querySelectorAll(".popup-focus-btn").forEach((button) => {
          button.addEventListener("click", () => {
            focusEventFromMap(
              button.dataset.eventId,
              button.dataset.eventType
            );
          });
        });
      });

      marker.addTo(markersLayer);

      group.forEach((event) => {
        markerByEventId[event.id] = marker;
      });
    });
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

    if (window.innerWidth <= 1080 && mapPanel) {
      mapPanel.classList.remove("is-open");

      if (mobileMapToggle) {
        mobileMapToggle.textContent = "Carte";
      }
    }

    setTimeout(() => {
      const target = document.getElementById(`event-${eventId}`);

      if (!target) return;

      document.querySelectorAll(".event-card.is-map-focused").forEach((card) => {
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

    const extension = (compressed.name.split(".").pop() || "jpg").toLowerCase();

    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const { error } = await supabaseClient.storage
      .from("event-images")
      .upload(fileName, compressed);

    if (error) throw error;

    const { data } = supabaseClient.storage
      .from("event-images")
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
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(city)}&limit=1&type=municipality`
      );

      const data = await response.json();

      const coords = data.features?.[0]?.geometry?.coordinates;

      if (!coords) return null;

      return {
        lng: Number(coords[0]),
        lat: Number(coords[1])
      };
    } catch {
      return null;
    }
  }

  async function reverseGeocodePosition(lat, lng) {
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/reverse/?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      );

      const data = await response.json();
      const properties = data.features?.[0]?.properties || {};

      return {
        city: properties.city || properties.name || "",
        region: properties.context || ""
      };
    } catch {
      return {
        city: "",
        region: ""
      };
    }
  }

  async function trackLocationUsage(position) {
    if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) {
      return;
    }

    const roundedLat = roundCoordinate(position.lat);
    const roundedLng = roundCoordinate(position.lng);

    const place = await reverseGeocodePosition(roundedLat, roundedLng);

    const payload = {
      lat: roundedLat,
      lng: roundedLng,
      city: place.city || null,
      region: place.region || null,
      page: window.location.pathname || "/",
      device: getDeviceType(),
      user_agent: (navigator.userAgent || "").slice(0, 180)
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

  function bindCityAutocomplete() {
    if (!cityInput) return;

    cityInput.addEventListener("change", async () => {
      const coords = await geocodeMunicipality(cityInput.value);

      if (!coords) return;

      cityLatInput.value = coords.lat;
      cityLngInput.value = coords.lng;

      if (cityHelp) {
        cityHelp.textContent = "Ville validée ✔";
      }
    });
  }

  function populateMonthFilter() {
    if (!dateFilter) return;

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
      alert("La géolocalisation n’est pas disponible sur ce navigateur.");
      return;
    }

    locateMeButton.disabled = true;
    locateMeButton.textContent = "Localisation…";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        userPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        map.setView([userPosition.lat, userPosition.lng], 9);

        L.circleMarker([userPosition.lat, userPosition.lng], {
          radius: 8,
          color: "#ff6b35",
          fillColor: "#ff6b35",
          fillOpacity: 0.85
        })
          .bindPopup("Vous êtes ici")
          .addTo(map);

        trackLocationUsage(userPosition);

        locateMeButton.disabled = false;
        locateMeButton.textContent = "Me localiser";
      },
      () => {
        locateMeButton.disabled = false;
        locateMeButton.textContent = "Me localiser";
        alert("Impossible de vous localiser.");
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
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
    formFeedback.className = `form-feedback ${type}`;
  }

  function resolveImageUrl(path) {
    if (!path) return "";

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return `${config.assetsBaseUrl || ""}${path}`;
  }

  function formatDate(value) {
    if (!value) return "";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(value));
  }

  function normalize(value) {
    return (value || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function roundCoordinate(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function getDeviceType() {
    const width = window.innerWidth;

    if (width <= 760) return "mobile";
    if (width <= 1100) return "tablette";

    return "desktop";
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/'/g, "&#039;");
  }
})();
