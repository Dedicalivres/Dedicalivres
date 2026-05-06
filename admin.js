/* =========================================================
   DÉDICALIVRES — ADMIN V10 FIX DESKTOP + MOBILE
========================================================= */

"use strict";

/* CONFIG */

const config = window.DEDICALIVRES_CONFIG;

if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
  alert("Configuration Supabase introuvable.");
  throw new Error("Supabase config missing");
}

const supabaseClient = window.supabase.createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);

/* ELEMENTS */

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

/* MODAL */

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

/* STATE */

let allEvents = [];
let map = null;
let markersLayer = null;
let selectedAdminImageFile = null;

/* INIT */

init();

async function init() {
  bindEvents();
  bindTabs();

  const { data } =
    await supabaseClient.auth.getSession();

  if (data?.session) {
    showDashboard();
    await loadDashboard();
  }
}

/* EVENTS */

function bindEvents() {

  loginForm?.addEventListener(
    "submit",
    handleLogin
  );

  logoutBtn?.addEventListener(
    "click",
    logout
  );

  refreshBtn?.addEventListener(
    "click",
    async () => {
      await loadDashboard();
      showToast("Dashboard actualisé");
    }
  );

  searchInput?.addEventListener(
    "input",
    renderEvents
  );

  filterStatus?.addEventListener(
    "change",
    renderEvents
  );

  filterType?.addEventListener(
    "change",
    renderEvents
  );

  closeEditModalBtn?.addEventListener(
    "click",
    closeEditModal
  );

  saveEditBtn?.addEventListener(
    "click",
    saveEdition
  );

  removeEditImageBtn?.addEventListener(
    "click",
    removeEditImage
  );

  editImageFile?.addEventListener(
    "change",
    handleAdminImagePreview
  );

  editModal?.addEventListener(
    "click",
    (event) => {
      if (event.target === editModal) {
        closeEditModal();
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeEditModal();
      }
    }
  );
}

/* LOGIN */

async function handleLogin(event) {

  event.preventDefault();

  loginFeedback.textContent = "";

  const email =
    document.getElementById("email")?.value.trim() || "";

  const password =
    document.getElementById("password")?.value.trim() || "";

  if (!email || !password) {
    loginFeedback.textContent =
      "Email et mot de passe obligatoires.";
    return;
  }

  const submitButton =
    loginForm.querySelector(
      'button[type="submit"]'
    );

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Connexion...";
  }

  try {

    const { error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    showDashboard();

    await loadDashboard();

    showToast("Connexion réussie");

  } catch (error) {

    console.error(error);

    loginFeedback.textContent =
      "Connexion impossible.";

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

/* =========================================================
   ONGLETS DESKTOP + MOBILE
========================================================= */

function bindTabs() {

  document.addEventListener(
    "click",
    (event) => {

      const tab =
        event.target.closest(".admin-tab");

      if (!tab) return;

      const target =
        tab.dataset.tab;

      document
        .querySelectorAll(".admin-tab")
        .forEach((item) => {
          item.classList.remove("active");
        });

      document
        .querySelectorAll(".admin-tab-panel")
        .forEach((panel) => {
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
    }
  );

  bindMobileSwipeTabs();
}

/* SWIPE */

function bindMobileSwipeTabs() {

  const wrapper =
    document.querySelector(".tabs-wrapper");

  if (!wrapper) return;

  let startX = 0;
  let endX = 0;

  wrapper.addEventListener(
    "touchstart",
    (event) => {

      startX =
        event.changedTouches[0].screenX;

    },
    { passive: true }
  );

  wrapper.addEventListener(
    "touchend",
    (event) => {

      endX =
        event.changedTouches[0].screenX;

      handleSwipeTabs();

    },
    { passive: true }
  );

  function handleSwipeTabs() {

    const delta =
      endX - startX;

    if (Math.abs(delta) < 60) return;

    const tabs =
      [...document.querySelectorAll(".admin-tab")];

    const activeIndex =
      tabs.findIndex((tab) =>
        tab.classList.contains("active")
      );

    if (delta < 0) {

      tabs[activeIndex + 1]?.click();

    } else {

      tabs[activeIndex - 1]?.click();
    }
  }
}

/* DASHBOARD */

async function loadDashboard() {

  await Promise.all([
    loadEvents(),
    loadNewsletterCount(),
    loadVisitsCount()
  ]);

  updateStats();

  renderEvents();
  renderSocialUpcoming();

  initMap();

  setTimeout(() => {
    map?.invalidateSize();
  }, 250);
}

async function loadEvents() {

  const { data, error } =
    await supabaseClient
      .from("events")
      .select("*")
      .order("created_at", {
        ascending: false
      });

  if (error) {

    console.error(error);

    allEvents = [];

    showToast("Erreur chargement");

    return;
  }

  allEvents =
    Array.isArray(data) ? data : [];
}

async function loadNewsletterCount() {

  try {

    const { count } =
      await supabaseClient
        .from("newsletter_subscribers")
        .select("*", {
          count: "exact",
          head: true
        });

    statsNewsletter.textContent =
      count || 0;

  } catch {

    statsNewsletter.textContent = "0";
  }
}

async function loadVisitsCount() {

  statsVisits.textContent =
    localStorage.getItem("dedicalivres_visits")
    || "0";
}

function updateStats() {

  const pending =
    allEvents.filter(
      (event) =>
        !event.validated &&
        !event.rejected
    );

  statsEvents.textContent =
    allEvents.length;

  statsPending.textContent =
    pending.length;

  eventsCount.textContent =
    `${getFilteredEvents().length} éléments`;
}

/* FILTER */

function getFilteredEvents() {

  const search =
    normalize(searchInput?.value || "");

  const status =
    filterStatus?.value || "";

  const type =
    filterType?.value || "";

  return allEvents.filter((event) => {

    const haystack =
      normalize([
        event.title,
        event.city,
        event.region,
        event.description
      ].join(" "));

    if (
      search &&
      !haystack.includes(search)
    ) {
      return false;
    }

    if (
      type &&
      event.type !== type
    ) {
      return false;
    }

    if (status === "pending") {
      return !event.validated;
    }

    if (status === "validated") {
      return !!event.validated;
    }

    if (status === "featured") {
      return !!event.featured;
    }

    if (status === "missing-image") {
      return !event.image_url;
    }

    return true;
  });
}

/* RENDER EVENTS */

function renderEvents() {

  if (!eventsContainer) return;

  const events =
    getFilteredEvents();

  if (!events.length) {

    eventsContainer.innerHTML = `
      <article class="event-card">
        Aucun événement trouvé.
      </article>
    `;

    return;
  }

  eventsContainer.innerHTML =
    events.map(renderEventCard).join("");

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

      </div>

      <div class="event-actions">

        <button
          class="event-action validate"
          data-action="validate"
          data-id="${event.id}"
          type="button"
        >
          ✔
        </button>

        <button
          class="event-action reject"
          data-action="reject"
          data-id="${event.id}"
          type="button"
        >
          ✖
        </button>

        <button
          class="event-action featured"
          data-action="featured"
          data-id="${event.id}"
          type="button"
        >
          ★
        </button>

        <button
          class="event-action edit"
          data-action="edit"
          data-id="${event.id}"
          type="button"
        >
          ✎
        </button>

      </div>

    </article>
  `;
}

function bindEventActions() {

  document
    .querySelectorAll("[data-action]")
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          const action =
            button.dataset.action;

          const id =
            button.dataset.id;

          if (!id) return;

          if (action === "validate") {
            await validateEvent(id);
          }

          if (action === "reject") {
            await rejectEvent(id);
          }

          if (action === "featured") {
            await toggleFeatured(id);
          }

          if (action === "edit") {
            openEditModal(id);
          }
        }
      );
    });
}

/* SIMPLE ACTIONS */

async function validateEvent(id) {

  await supabaseClient
    .from("events")
    .update({
      validated: true,
      rejected: false
    })
    .eq("id", id);

  await loadDashboard();

  showToast("Événement validé");
}

async function rejectEvent(id) {

  await supabaseClient
    .from("events")
    .update({
      rejected: true,
      validated: false
    })
    .eq("id", id);

  await loadDashboard();

  showToast("Événement rejeté");
}

async function toggleFeatured(id) {

  const event =
    allEvents.find(
      (item) =>
        String(item.id) === String(id)
    );

  if (!event) return;

  await supabaseClient
    .from("events")
    .update({
      featured: !event.featured
    })
    .eq("id", id);

  await loadDashboard();

  showToast("Mise à jour");
}

/* MAP */

function initMap() {

  if (!window.L) return;

  const mapElement =
    document.getElementById("admin-map");

  if (!mapElement) return;

  if (!map) {

    map = L.map("admin-map")
      .setView([46.6, 1.88], 6);

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          "&copy; OpenStreetMap"
      }
    ).addTo(map);

    markersLayer =
      L.layerGroup().addTo(map);
  }

  markersLayer.clearLayers();

  allEvents.forEach((event) => {

    if (
      !event.lat ||
      !event.lng
    ) return;

    const marker =
      L.circleMarker(
        [event.lat, event.lng],
        {
          radius: 7,
          color: "#19ff9c",
          fillColor: "#19ff9c",
          fillOpacity: .85
        }
      );

    marker.bindPopup(`
      <strong>${escapeHtml(event.title)}</strong>
      <br>
      ${escapeHtml(event.city || "")}
    `);

    marker.addTo(markersLayer);
  });

  setTimeout(() => {
    map.invalidateSize();
  }, 250);
}

/* SOCIAL */

function renderSocialUpcoming() {

  const container =
    document.getElementById("social-upcoming");

  if (!container) return;

  const upcoming =
    [...allEvents]
      .filter(
        (event) =>
          event.validated &&
          event.start_date
      )
      .slice(0, 6);

  container.innerHTML =
    upcoming.map((event) => `
      <div class="social-mini-item">
        <strong>${escapeHtml(event.title)}</strong>
        <span>${formatDate(event.start_date)}</span>
      </div>
    `).join("");
}

/* MODAL */

function openEditModal(id) {

  const event =
    allEvents.find(
      (item) =>
        String(item.id) === String(id)
    );

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

    editImagePreview.innerHTML =
      `<span>Aucune affiche</span>`;

    return;
  }

  editImagePreview.innerHTML = `
    <img src="${escapeHtml(url)}" alt="" />
  `;
}

function handleAdminImagePreview(event) {

  const file =
    event.target.files?.[0];

  if (!file) return;

  selectedAdminImageFile = file;

  const reader =
    new FileReader();

  reader.onload = (e) => {

    renderEditImagePreview(
      e.target.result
    );

  };

  reader.readAsDataURL(file);
}

function removeEditImage() {

  editImageUrl.value = "";

  renderEditImagePreview("");
}

async function saveEdition() {

  showToast(
    "Édition avancée à venir"
  );
}

/* HELPERS */

function showToast(message) {

  const container =
    document.getElementById("toast-container");

  if (!container) return;

  const toast =
    document.createElement("div");

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

    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        day: "numeric",
        month: "long",
        year: "numeric"
      }
    ).format(
      new Date(value)
    );

  } catch {

    return value;
  }
}
