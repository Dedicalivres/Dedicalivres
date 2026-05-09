/* =========================================================
   DÉDICALIVRES — ADMIN V10 + ZONES PRIORITAIRES
========================================================= */

"use strict";

const config = window.DEDICALIVRES_CONFIG;

if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
  alert("Configuration Supabase introuvable.");
  throw new Error("Supabase config missing");
}

const supabaseClient = window.supabase.createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);

const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");

const loginForm = document.getElementById("login-form");
const loginFeedback = document.getElementById("login-feedback");

const refreshBtn = document.getElementById("refresh-btn");
const logoutBtn = document.getElementById("logout-btn");

const eventsContainer = document.getElementById("events-container");
const eventsCount = document.getElementById("events-count");

const searchInput = document.getElementById("search-input");
const filterStatus = document.getElementById("filter-status");
const filterType = document.getElementById("filter-type");

const statsEvents = document.getElementById("stats-events");
const statsPending = document.getElementById("stats-pending");
const statsNewsletter = document.getElementById("stats-newsletter");
const statsVisits = document.getElementById("stats-visits");

const priorityCities = document.getElementById("priority-cities");
const priorityDevices = document.getElementById("priority-devices");
const priorityTrend = document.getElementById("priority-trend");

const editModal = document.getElementById("edit-modal");
const editId = document.getElementById("edit-id");
const editTitle = document.getElementById("edit-title");
const editType = document.getElementById("edit-type");
const editCity = document.getElementById("edit-city");
const editRegion = document.getElementById("edit-region");
const editStartDate = document.getElementById("edit-start-date");
const editEndDate = document.getElementById("edit-end-date");
const editWebsite = document.getElementById("edit-website");
const editDescription = document.getElementById("edit-description");
const editImagePreview = document.getElementById("edit-image-preview");
const editImageFile = document.getElementById("edit-image-file");
const editImageUrl = document.getElementById("edit-image-url");
const removeEditImageBtn = document.getElementById("remove-edit-image");
const saveEditBtn = document.getElementById("save-edit-btn");
const closeEditModalBtn = document.getElementById("close-edit-modal");

let allEvents = [];
let locationRows = [];
let map = null;
let markersLayer = null;
let selectedAdminImageFile = null;

init();

async function init() {
  bindEvents();
  bindTabs();

  const { data } = await supabaseClient.auth.getSession();

  if (data?.session) {
    showDashboard();
    await loadDashboard();
  }
}

function bindEvents() {
  loginForm?.addEventListener("submit", handleLogin);
  logoutBtn?.addEventListener("click", logout);

  refreshBtn?.addEventListener("click", async () => {
    await loadDashboard();
    showToast("Dashboard actualisé");
  });

  searchInput?.addEventListener("input", renderEvents);
  filterStatus?.addEventListener("change", renderEvents);
  filterType?.addEventListener("change", renderEvents);

  closeEditModalBtn?.addEventListener("click", closeEditModal);
  saveEditBtn?.addEventListener("click", saveEdition);
  removeEditImageBtn?.addEventListener("click", removeEditImage);
  editImageFile?.addEventListener("change", handleAdminImagePreview);

  editModal?.addEventListener("click", (event) => {
    if (event.target === editModal) closeEditModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeEditModal();
  });
}

/* LOGIN */

async function handleLogin(event) {
  event.preventDefault();

  loginFeedback.textContent = "";

  const email = document.getElementById("email")?.value.trim() || "";
  const password = document.getElementById("password")?.value.trim() || "";

  if (!email || !password) {
    loginFeedback.textContent = "Email et mot de passe obligatoires.";
    return;
  }

  const submitButton = loginForm.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Connexion...";
  }

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    showDashboard();
    await loadDashboard();
    showToast("Connexion réussie");
  } catch (error) {
    console.error(error);
    loginFeedback.textContent = "Connexion impossible.";
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "CONNEXION";
    }
  }
}

async function logout() {
  await supabaseClient.auth.signOut();

  dashboard?.classList.add("hidden");
  loginScreen?.classList.remove("hidden");

  showToast("Déconnecté");
}

function showDashboard() {
  loginScreen?.classList.add("hidden");
  dashboard?.classList.remove("hidden");

  setTimeout(() => {
    map?.invalidateSize();
  }, 300);
}

/* TABS */

function bindTabs() {
  document.addEventListener("click", (event) => {
    const tab = event.target.closest(".admin-tab");

    if (!tab) return;

    const target = tab.dataset.tab;

    document.querySelectorAll(".admin-tab").forEach((item) => {
      item.classList.remove("active");
    });

    document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
      panel.classList.remove("active");
    });

    tab.classList.add("active");

    document
      .getElementById(`tab-${target}`)
      ?.classList.add("active");

    if (target === "overview") {
      setTimeout(() => {
        map?.invalidateSize();
      }, 250);
    }
  });

  // V7.7.0b — swipe tactile désactivé pour éviter les changements d’onglet involontaires sur mobile.
  // bindMobileSwipeTabs();
}

function bindMobileSwipeTabs() {
  const wrapper = document.querySelector(".tabs-wrapper");
  if (!wrapper) return;

  let startX = 0;
  let endX = 0;

  wrapper.addEventListener(
    "touchstart",
    (event) => {
      startX = event.changedTouches[0].screenX;
    },
    { passive: true }
  );

  wrapper.addEventListener(
    "touchend",
    (event) => {
      endX = event.changedTouches[0].screenX;
      handleSwipeTabs();
    },
    { passive: true }
  );

  function handleSwipeTabs() {
    const delta = endX - startX;
    if (Math.abs(delta) < 60) return;

    const tabs = [...document.querySelectorAll(".admin-tab")];
    const activeIndex = tabs.findIndex((tab) =>
      tab.classList.contains("active")
    );

    if (delta < 0) tabs[activeIndex + 1]?.click();
    else tabs[activeIndex - 1]?.click();
  }
}

/* DASHBOARD */

async function loadDashboard() {
  await Promise.all([
    loadEvents(),
    loadNewsletterCount(),
    loadVisitsCount(),
    loadLocationTracking()
  ]);

  updateStats();
  renderEvents();
  renderSocialUpcoming();
  renderPriorityZones();
  initMap();

  setTimeout(() => {
    map?.invalidateSize();
  }, 250);
}

async function loadEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    console.error(error);
    allEvents = [];
    showToast("Erreur chargement événements");
    return;
  }

  allEvents = Array.isArray(data) ? data : [];
}

async function loadNewsletterCount() {
  try {
    const { count } = await supabaseClient
      .from("newsletter_subscribers")
      .select("*", {
        count: "exact",
        head: true
      });

    if (statsNewsletter) statsNewsletter.textContent = count || 0;
  } catch {
    if (statsNewsletter) statsNewsletter.textContent = "0";
  }
}

async function loadVisitsCount() {
  if (statsVisits) {
    statsVisits.textContent =
      localStorage.getItem("dedicalivres_visits") || "0";
  }
}

async function loadLocationTracking() {
  try {
    const { data, error } = await supabaseClient
      .from("location_tracking")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    locationRows = Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn("Tracking localisation indisponible :", error);
    locationRows = [];
  }
}

function updateStats() {
  const pending = allEvents.filter(
    (event) => !event.validated && !event.rejected
  );

  if (statsEvents) statsEvents.textContent = allEvents.length;
  if (statsPending) statsPending.textContent = pending.length;

  if (eventsCount) {
    eventsCount.textContent = `${getFilteredEvents().length} éléments`;
  }
}

/* OBSERVATOIRE TERRITORIAL — V7.7.0b */

function renderPriorityZones() {
  renderTopCities();
  renderDevices();
  renderTrend();
}

function getUpcomingValidatedEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (allEvents || []).filter((event) => {
    if (!event.validated || event.rejected) return false;

    const end = event.end_date || event.start_date;
    if (!end) return true;

    const date = new Date(end);
    if (Number.isNaN(date.getTime())) return true;

    date.setHours(0, 0, 0, 0);
    return date >= today;
  });
}

function renderTopCities() {
  if (!priorityCities) return;

  const upcoming = getUpcomingValidatedEvents();

  if (!upcoming.length) {
    priorityCities.innerHTML = `
      <p class="priority-empty">
        Aucun événement validé à venir pour établir une observation territoriale.
      </p>
    `;
    return;
  }

  const cityCounts = countBy(
    upcoming
      .map((event) => cleanLabel(event.city || "Ville non renseignée"))
      .filter(Boolean)
  );

  priorityCities.innerHTML = `
    <div class="priority-context">
      <strong>Top villes événements</strong>
      <small>Basé sur les événements validés à venir.</small>
    </div>
    ${renderRanking(cityCounts, "événement(s) à venir")}
  `;
}

function renderDevices() {
  if (!priorityDevices) return;

  const upcoming = getUpcomingValidatedEvents();

  if (!upcoming.length) {
    priorityDevices.innerHTML = `
      <p class="priority-empty">
        Les régions apparaîtront après validation des prochains événements.
      </p>
    `;
    return;
  }

  const regionCounts = countBy(
    upcoming
      .map((event) => cleanLabel(event.region || "Région non renseignée"))
      .filter(Boolean)
  );

  priorityDevices.innerHTML = `
    <div class="priority-context">
      <strong>Top régions alimentées</strong>
      <small>Répartition des événements publiés par territoire.</small>
    </div>
    ${renderRanking(regionCounts, "événement(s) validé(s)")}
  `;
}

function renderTrend() {
  if (!priorityTrend) return;

  const upcoming = getUpcomingValidatedEvents();
  const missingImages = upcoming.filter((event) => !event.image_url).length;
  const missingCoords = upcoming.filter((event) => {
    return !Number.isFinite(Number(event.lat)) || !Number.isFinite(Number(event.lng));
  }).length;
  const missingWebsite = upcoming.filter((event) => !event.website).length;

  const locatedSearches = (locationRows || []).length;
  const recentSearches = countRecentLocationRows(7);

  priorityTrend.innerHTML = `
    <div class="priority-trend-box observatory-trend-box">
      <strong>${upcoming.length}</strong>
      <span>événement(s) validé(s) à venir</span>
    </div>

    <div class="observatory-kpi-grid">
      <div class="observatory-kpi">
        <b>${missingImages}</b>
        <span>sans image</span>
      </div>
      <div class="observatory-kpi">
        <b>${missingCoords}</b>
        <span>sans coordonnées</span>
      </div>
      <div class="observatory-kpi">
        <b>${missingWebsite}</b>
        <span>sans site officiel</span>
      </div>
      <div class="observatory-kpi">
        <b>${recentSearches}</b>
        <span>localisations 7j</span>
      </div>
    </div>

    <div class="priority-mini">
      ${locatedSearches
        ? `Données visiteurs disponibles : <b>${locatedSearches}</b> localisation(s) enregistrée(s).`
        : `Aucune localisation visiteur pour l’instant : l’observatoire utilise les événements validés pour rester utile.`
      }
    </div>
  `;
}

function countRecentLocationRows(days) {
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(now.getDate() - days);

  return (locationRows || []).filter((row) => {
    if (!row.created_at) return false;
    return new Date(row.created_at) >= limit;
  }).length;
}

function renderRanking(counts, label) {
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  if (!entries.length) {
    return `<p class="priority-empty">Aucune donnée exploitable.</p>`;
  }

  const max = Math.max(...entries.map((entry) => entry[1]));

  return entries
    .map(([name, count]) => {
      const percent = Math.max(8, Math.round((count / max) * 100));

      return `
        <div class="priority-row">
          <div class="priority-row-head">
            <strong>${escapeHtml(name)}</strong>
            <span>${count}</span>
          </div>

          <div class="priority-bar">
            <i style="width:${percent}%"></i>
          </div>

          <small>${escapeHtml(label)}</small>
        </div>
      `;
    })
    .join("");
}

function countBy(values) {
  return values.reduce((acc, value) => {
    const key = value || "Inconnu";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function cleanLabel(value) {
  return (value || "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 90);
}

/* FILTER */

function getFilteredEvents() {
  const search = normalize(searchInput?.value || "");
  const status = filterStatus?.value || "";
  const type = filterType?.value || "";

  return allEvents.filter((event) => {
    const haystack = normalize([
      event.title,
      event.city,
      event.region,
      event.description
    ].join(" "));

    if (search && !haystack.includes(search)) return false;
    if (type && event.type !== type) return false;

    if (status === "pending") return !event.validated && !event.rejected;
    if (status === "validated") return !!event.validated;
    if (status === "featured") return !!event.featured;
    if (status === "missing-image") return !event.image_url;

    return true;
  });
}

/* RENDER EVENTS */

function renderEvents() {
  if (!eventsContainer) return;

  const events = getFilteredEvents();

  if (!events.length) {
    eventsContainer.innerHTML = `
      <article class="event-card">
        Aucun événement trouvé.
      </article>
    `;
    return;
  }

  eventsContainer.innerHTML = events.map(renderEventCard).join("");
  bindEventActions();
}

function renderEventCard(event) {
  return `
    <article class="event-card event-card-with-image">

      ${
        event.image_url
          ? `
          <img
            class="event-admin-thumb"
            src="${escapeHtml(event.image_url)}"
            alt=""
          />
        `
          : `
          <div class="event-admin-thumb-placeholder">
            PAS D’IMAGE
          </div>
        `
      }

      <div>
        <div class="event-title">
          ${escapeHtml(event.title || "")}
        </div>

        <div class="event-meta">
          <span>📍 ${escapeHtml(event.city || "")}</span>
          <span>📅 ${formatDate(event.start_date)}</span>
          <span>🏷️ ${escapeHtml(event.type || "")}</span>
        </div>

        <div class="event-badges">
          ${
            !event.validated && !event.rejected
              ? `<span class="badge pending">EN ATTENTE</span>`
              : ""
          }

          ${event.validated ? `<span class="badge">VALIDÉ</span>` : ""}

          ${
            event.rejected
              ? `<span class="badge rejected">REJETÉ</span>`
              : ""
          }

          ${
            event.featured
              ? `<span class="badge featured">MISE EN AVANT</span>`
              : ""
          }

          ${
            !event.image_url
              ? `<span class="badge missing-image">SANS IMAGE</span>`
              : ""
          }
        </div>
      </div>

      <div class="event-actions">
        <button class="event-action validate" data-action="validate" data-id="${event.id}" type="button">✔</button>
        <button class="event-action reject" data-action="reject" data-id="${event.id}" type="button">✖</button>
        <button class="event-action featured" data-action="featured" data-id="${event.id}" type="button">★</button>
        <button class="event-action edit" data-action="edit" data-id="${event.id}" type="button">✎</button>
      </div>

    </article>
  `;
}

function bindEventActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const id = button.dataset.id;

      if (!id) return;

      if (action === "validate") await validateEvent(id);
      if (action === "reject") await rejectEvent(id);
      if (action === "featured") await toggleFeatured(id);
      if (action === "edit") openEditModal(id);
    });
  });
}

/* ACTIONS */

async function validateEvent(id) {
  const { error } = await supabaseClient
    .from("events")
    .update({
      validated: true,
      rejected: false
    })
    .eq("id", id);

  if (error) {
    showToast("Erreur validation");
    return;
  }

  await loadDashboard();
  showToast("Événement validé");
}

async function rejectEvent(id) {
  const { error } = await supabaseClient
    .from("events")
    .update({
      rejected: true,
      validated: false
    })
    .eq("id", id);

  if (error) {
    showToast("Erreur rejet");
    return;
  }

  await loadDashboard();
  showToast("Événement rejeté");
}

async function toggleFeatured(id) {
  const event = allEvents.find((item) => String(item.id) === String(id));

  if (!event) return;

  const { error } = await supabaseClient
    .from("events")
    .update({
      featured: !event.featured
    })
    .eq("id", id);

  if (error) {
    showToast("Erreur mise en avant");
    return;
  }

  await loadDashboard();
  showToast("Mise à jour");
}

/* MAP */

function initMap() {
  if (!window.L) return;

  const mapElement = document.getElementById("admin-map");
  if (!mapElement) return;

  if (!map) {
    map = L.map("admin-map").setView([46.6, 1.88], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
  }

  if (!markersLayer) {
    markersLayer = L.layerGroup().addTo(map);
  }

  markersLayer.clearLayers();

  const eventsWithCoordinates = (allEvents || []).filter((event) => {
    return Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng));
  });

  const groupedEvents = groupEventsByCoordinates(eventsWithCoordinates);

  Object.values(groupedEvents).forEach((group) => {
    const first = group[0];
    const lat = Number(first.lat);
    const lng = Number(first.lng);
    const typeMeta = getAdminTypeMeta(first.type);

    const marker = L.marker([lat, lng], {
      icon: createAdminEventIcon(typeMeta, group.length)
    });

    marker.bindPopup(renderAdminMapEventPopup(group));
    marker.addTo(markersLayer);
  });

  (locationRows || []).forEach((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const marker = L.marker([lat, lng], {
      icon: createAdminUserSearchIcon()
    });

    marker.bindPopup(`
      <div class="admin-map-popup">
        <strong>Recherche utilisateur</strong>
        <span>${escapeHtml(row.city || row.region || "Zone inconnue")}</span>
        ${row.device ? `<small>${escapeHtml(row.device)}</small>` : ""}
      </div>
    `);

    marker.addTo(markersLayer);
  });

  setTimeout(() => {
    map.invalidateSize();
  }, 250);
}

function groupEventsByCoordinates(events) {
  return (events || []).reduce((acc, event) => {
    if (!Number.isFinite(Number(event.lat)) || !Number.isFinite(Number(event.lng))) {
      return acc;
    }

    const key = `${Number(event.lat).toFixed(5)},${Number(event.lng).toFixed(5)}`;

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(event);
    return acc;
  }, {});
}

function getAdminTypeMeta(type) {
  const map = {
    Salon: { className: "type-salon", color: "#3a1c71", label: "Salon" },
    Festival: { className: "type-festival", color: "#ff6b35", label: "Festival" },
    Dédicace: { className: "type-dedicace", color: "#16803c", label: "Dédicace" },
    Autre: { className: "type-autre", color: "#2f6fed", label: "Autre" }
  };

  return map[type] || map.Autre;
}

function createAdminEventIcon(typeMeta, count) {
  const countBadge = count > 1 ? `<em>${count}</em>` : "";

  return L.divIcon({
    className: `admin-event-marker-v5 ${typeMeta.className}`,
    html: `<span style="--marker-color:${typeMeta.color}">${countBadge}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -28]
  });
}

function createAdminUserSearchIcon() {
  return L.divIcon({
    className: "admin-user-search-marker-v5",
    html: `<span></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -20]
  });
}

function renderAdminMapEventPopup(group) {
  const title = group.length > 1
    ? `${group.length} événements à ce lieu`
    : "Événement";

  return `
    <div class="admin-map-popup admin-map-popup-events">
      <strong>${escapeHtml(title)}</strong>

      ${group.map((event) => `
        <article class="admin-map-popup-event">
          <b>${escapeHtml(event.title || "Sans titre")}</b>
          <span>${escapeHtml([event.city, event.region].filter(Boolean).join(", ") || "Lieu non précisé")}</span>
          <small>${escapeHtml(formatDate(event.start_date) || "Date non précisée")} · ${escapeHtml(event.type || "Type non précisé")}</small>
          <a href="event.html?id=${encodeURIComponent(event.id)}" target="_blank" rel="noopener noreferrer">Voir la fiche</a>
        </article>
      `).join("")}
    </div>
  `;
}

/* SOCIAL */

function renderSocialUpcoming() {
  const container = document.getElementById("social-upcoming");
  if (!container) return;

  const upcoming = [...allEvents]
    .filter((event) => event.validated && event.start_date)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 6);

  if (!upcoming.length) {
    container.innerHTML = `<p class="priority-empty">Aucun événement à venir.</p>`;
    return;
  }

  container.innerHTML = upcoming
    .map((event) => `
      <div class="social-mini-item">
        <strong>${escapeHtml(event.title)}</strong>
        <span>${formatDate(event.start_date)}</span>
      </div>
    `)
    .join("");
}

/* MODAL */

function openEditModal(id) {
  const event = allEvents.find((item) => String(item.id) === String(id));
  if (!event) return;

  editId.value = event.id || "";
  editTitle.value = event.title || "";
  editType.value = event.type || "";
  editCity.value = event.city || "";
  editRegion.value = event.region || "";
  editStartDate.value = event.start_date || "";
  editEndDate.value = event.end_date || "";
  editWebsite.value = event.website || "";
  editDescription.value = event.description || "";
  editImageUrl.value = event.image_url || "";

  renderEditImagePreview(event.image_url);
  editModal.classList.remove("hidden");
}

function closeEditModal() {
  editModal.classList.add("hidden");
}

function renderEditImagePreview(url) {
  if (!url) {
    editImagePreview.innerHTML = `<span>Aucune affiche</span>`;
    return;
  }

  editImagePreview.innerHTML = `
    <img src="${escapeHtml(url)}" alt="" />
  `;
}

function handleAdminImagePreview(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  selectedAdminImageFile = file;

  const reader = new FileReader();

  reader.onload = (e) => {
    renderEditImagePreview(e.target.result);
  };

  reader.readAsDataURL(file);
}

function removeEditImage() {
  editImageUrl.value = "";
  selectedAdminImageFile = null;
  renderEditImagePreview("");
}

async function saveEdition() {
  const id = editId.value;
  if (!id) return;

  if (saveEditBtn) {
    saveEditBtn.disabled = true;
    saveEditBtn.textContent = "ENREGISTREMENT...";
  }

  try {
    let imageUrl = editImageUrl.value.trim() || null;

    if (selectedAdminImageFile) {
      imageUrl = await uploadAdminEventImage(id, selectedAdminImageFile);
      editImageUrl.value = imageUrl || "";
    }

    const payload = {
      title: editTitle.value.trim(),
      type: editType.value,
      city: editCity.value.trim(),
      region: editRegion.value.trim(),
      start_date: editStartDate.value || null,
      end_date: editEndDate.value || null,
      website: editWebsite.value.trim(),
      description: editDescription.value.trim(),
      image_url: imageUrl
    };

    const { error } = await supabaseClient
      .from("events")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    selectedAdminImageFile = null;
    if (editImageFile) editImageFile.value = "";

    closeEditModal();
    await loadDashboard();
    showToast("Événement modifié");
  } catch (error) {
    console.error("Erreur édition événement :", error);
    showToast(error?.message || "Erreur édition");
  } finally {
    if (saveEditBtn) {
      saveEditBtn.disabled = false;
      saveEditBtn.textContent = "ENREGISTRER";
    }
  }
}

async function uploadAdminEventImage(eventId, file) {
  if (!file) return editImageUrl.value.trim() || null;

  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Le fichier sélectionné n’est pas une image.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image trop lourde : 5 Mo maximum.");
  }

  const extension = (file.name.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "jpg";

  const path = `admin/${eventId}-${Date.now()}.${extension}`;

  const { error } = await supabaseClient.storage
    .from("event-images")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true
    });

  if (error) throw error;

  const { data } = supabaseClient.storage
    .from("event-images")
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error("URL publique de l’image introuvable.");
  }

  return data.publicUrl;
}

/* HELPERS */

function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function normalize(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
