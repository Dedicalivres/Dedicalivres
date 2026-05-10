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
  let userMarker = null;
  let currentMarkerBounds = null;

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

    if (mobileMapToggle) {
      mobileMapToggle.textContent = "Carte en direct";
    }

    if (mapPanel) {
      mapPanel.classList.remove("is-open");
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
      mobileMapToggle.setAttribute("aria-expanded", "true");

      refreshMapSizeAndBounds();
    } else {
      mobileMapToggle.textContent = "Carte en direct";
      mobileMapToggle.setAttribute("aria-expanded", "false");
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

  function renderPopupEventItem(event) {
    const authors = event._authors || [];

    return `
      <div class="popup-event-item">
        <button
          class="popup-focus-btn"
          type="button"
          data-event-id="${escapeAttribute(event.id)}"
          data-event-type="${escapeAttribute(event.type || "")}"
        >
          ${escapeHtml(event.title || "Sans titre")}
        </button>

        <div class="popup-event-meta">
          ${event.start_date ? `📅 ${formatDateRange(event.start_date, event.end_date)}` : ""}
          ${event.city ? ` · 📍 ${escapeHtml(event.city)}` : ""}
        </div>

        ${authors.length ? `
          <div class="popup-authors">
            <strong>Auteur${authors.length > 1 ? "s" : ""} présent${authors.length > 1 ? "s" : ""}</strong>
            ${authors.map((author) => {
              const name = escapeHtml(author.pseudo || "Auteur");
              return author.website
                ? `<a href="${escapeAttribute(author.website)}" target="_blank" rel="noopener noreferrer">${name}</a>`
                : `<span>${name}</span>`;
            }).join("")}
          </div>
        ` : ""}

        <a class="popup-detail-link" href="event.html?id=${encodeURIComponent(event.id)}">
          Voir la fiche
        </a>
      </div>
    `;
  }

  function renderMapMarkers(events) {
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    markerByEventId = {};
    currentMarkerBounds = null;

    const grouped = {};
    const markerPositions = [];

    events.forEach((event) => {
      const lat = Number(event.lat);
      const lng = Number(event.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push({
        ...event,
        lat,
        lng
      });
    });

    Object.values(grouped).forEach((group) => {
      const first = group[0];
      const typeMeta = TYPE_META[first.type] || TYPE_META.Autre;
      markerPositions.push([first.lat, first.lng]);

      const marker = L.marker([first.lat, first.lng], {
        icon: createTypeIcon(typeMeta, group.length)
      });

      marker.bindPopup(`
        <div class="premium-popup">
          <strong>${group.length} événement${group.length > 1 ? "s" : ""} à ce lieu</strong>
          <br><br>

          ${group.map(renderPopupEventItem).join("")}
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

    if (markerPositions.length) {
      currentMarkerBounds = L.latLngBounds(markerPositions);
    }

    if (mapPanel?.classList.contains("is-open")) {
      refreshMapSizeAndBounds();
    }
  }

  function refreshMapSizeAndBounds() {
    if (!map) return;

    window.setTimeout(() => {
      map.invalidateSize(false);

      if (currentMarkerBounds && currentMarkerBounds.isValid()) {
        map.fitBounds(currentMarkerBounds, {
          padding: [24, 24],
          maxZoom: 8
        });
      } else {
        map.setView([46.603354, 1.888334], 5);
      }
    }, 120);

    window.setTimeout(() => {
      map.invalidateSize(false);
    }, 420);
  }

  function createTypeIcon(typeMeta, count = 1) {
    const countBadge = count > 1 ? `<em>${count}</em>` : "";

    return L.divIcon({
      className: "event-marker-v5",
      html: `<span style="--marker-color:${typeMeta.color}">${countBadge}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -26]
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

    const datalist = document.getElementById("city-suggestions");
    const suggestionsByLabel = new Map();
    let debounceTimer = null;

    cityInput.addEventListener("input", () => {
      const query = cityInput.value.trim();

      if (cityLatInput) cityLatInput.value = "";
      if (cityLngInput) cityLngInput.value = "";

      if (query.length < 2) {
        if (datalist) datalist.innerHTML = "";
        return;
      }

      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        loadCitySuggestions(query, datalist, suggestionsByLabel);
      }, 220);
    });

    cityInput.addEventListener("change", async () => {
      const label = cityInput.value.trim();
      const suggestion = suggestionsByLabel.get(label);

      if (suggestion) {
        applyCitySuggestion(suggestion);
        return;
      }

      const coords = await geocodeMunicipality(label);

      if (!coords) {
        if (cityHelp) {
          cityHelp.textContent = "Sélectionnez une ville proposée pour placer correctement l’événement sur la carte.";
          cityHelp.classList.remove("success");
          cityHelp.classList.add("error");
        }
        return;
      }

      if (cityLatInput) cityLatInput.value = coords.lat;
      if (cityLngInput) cityLngInput.value = coords.lng;

      if (cityHelp) {
        cityHelp.textContent = "Ville validée ✔";
        cityHelp.classList.remove("error");
        cityHelp.classList.add("success");
      }
    });
  }

  async function loadCitySuggestions(query, datalist, suggestionsByLabel) {
    if (!datalist) return;

    cityInput?.classList.add("loading");

    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=8&type=municipality`
      );

      const data = await response.json();
      suggestionsByLabel.clear();
      datalist.innerHTML = "";

      (data.features || []).forEach((feature) => {
        const properties = feature.properties || {};
        const coordinates = feature.geometry?.coordinates || [];
        const city = properties.city || properties.name || properties.label || "";
        const postcode = properties.postcode || "";
        const context = properties.context || "";
        const label = [city, postcode, context].filter(Boolean).join(" — ");

        if (!city || !Number.isFinite(Number(coordinates[0])) || !Number.isFinite(Number(coordinates[1]))) {
          return;
        }

        suggestionsByLabel.set(label, {
          label,
          city,
          lng: Number(coordinates[0]),
          lat: Number(coordinates[1])
        });

        const option = document.createElement("option");
        option.value = label;
        datalist.appendChild(option);
      });
    } catch (error) {
      console.warn("Suggestions villes indisponibles :", error);
    } finally {
      cityInput?.classList.remove("loading");
    }
  }

  function applyCitySuggestion(suggestion) {
    if (!suggestion) return;

    if (cityInput) cityInput.value = suggestion.city;
    if (cityLatInput) cityLatInput.value = suggestion.lat;
    if (cityLngInput) cityLngInput.value = suggestion.lng;

    if (cityHelp) {
      cityHelp.textContent = `Ville validée : ${suggestion.city} ✔`;
      cityHelp.classList.remove("error");
      cityHelp.classList.add("success");
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
