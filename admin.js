/* =========================================================
   DÉDICALIVRES — ADMIN V8 CYBER CONTROL
========================================================= */

"use strict";

/* CONFIG */

const config = window.DEDICALIVRES_CONFIG;

if (!config || !window.supabase) {
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

const saveEditBtn = document.getElementById("save-edit-btn");
const closeEditModalBtn = document.getElementById("close-edit-modal");

/* STATE */

let allEvents = [];
let map;
let markersLayer;

/* INIT */

init();

async function init() {
  bindEvents();

  const session = await supabaseClient.auth.getSession();

  if (session?.data?.session) {
    showDashboard();
    await loadDashboard();
  }
}

/* EVENTS */

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
}

/* LOGIN */

async function handleLogin(event) {
  event.preventDefault();

  loginFeedback.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

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

    loginFeedback.textContent =
      "Connexion impossible.";
  }
}

async function logout() {
  await supabaseClient.auth.signOut();

  dashboard.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  showToast("Déconnecté");
}

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

/* DASHBOARD */

async function loadDashboard() {
  await Promise.all([
    loadEvents(),
    loadNewsletterCount(),
    loadVisitsCount()
  ]);

  renderEvents();
  initMap();
}

async function loadEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    showToast("Erreur chargement événements");
    return;
  }

  allEvents = data || [];

  updateStats();
}

async function loadNewsletterCount() {
  try {
    const { count } = await supabaseClient
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true });

    statsNewsletter.textContent = count || 0;

  } catch (error) {
    console.error(error);
  }
}

async function loadVisitsCount() {
  try {
    const { count } = await supabaseClient
      .from("visits")
      .select("*", { count: "exact", head: true });

    statsVisits.textContent = count || 0;

  } catch (error) {
    statsVisits.textContent = "0";
  }
}

function updateStats() {
  statsEvents.textContent = allEvents.length;

  statsPending.textContent =
    allEvents.filter(event => !event.validated).length;

  eventsCount.textContent =
    `${allEvents.length} événements`;
}

/* FILTERS */

function getFilteredEvents() {
  const search =
    (searchInput?.value || "").toLowerCase();

  const status =
    filterStatus?.value || "";

  const type =
    filterType?.value || "";

  return allEvents.filter(event => {

    const matchSearch =
      !search ||
      `${event.title} ${event.city} ${event.region}`
        .toLowerCase()
        .includes(search);

    const matchType =
      !type ||
      event.type === type;

    let matchStatus = true;

    if (status === "pending") {
      matchStatus = !event.validated;
    }

    if (status === "validated") {
      matchStatus = event.validated;
    }

    if (status === "featured") {
      matchStatus = event.featured;
    }

    return matchSearch &&
      matchType &&
      matchStatus;
  });
}

/* RENDER */

function renderEvents() {
  const events = getFilteredEvents();

  eventsContainer.innerHTML =
    events.map(renderEventCard).join("");

  bindEventActions();

  renderMapMarkers(events);
}

function renderEventCard(event) {
  return `
    <article class="event-card">

      <div>

        <div class="event-title">
          ${escapeHtml(event.title || "Sans titre")}
        </div>

        <div class="event-meta">
          <span>${escapeHtml(event.city || "")}</span>
          <span>${escapeHtml(event.region || "")}</span>
          <span>${escapeHtml(event.type || "")}</span>
        </div>

        <div class="event-badges">

          ${
            event.validated
              ? `<span class="badge">VALIDÉ</span>`
              : `<span class="badge pending">EN ATTENTE</span>`
          }

          ${
            event.featured
              ? `<span class="badge featured">FEATURED</span>`
              : ""
          }

        </div>

      </div>

      <div class="event-actions">

        <button
          class="event-action validate"
          data-action="validate"
          data-id="${event.id}"
        >
          ✔
        </button>

        <button
          class="event-action reject"
          data-action="reject"
          data-id="${event.id}"
        >
          ✖
        </button>

        <button
          class="event-action featured"
          data-action="featured"
          data-id="${event.id}"
        >
          ★
        </button>

        <button
          class="event-action edit"
          data-action="edit"
          data-id="${event.id}"
        >
          ✎
        </button>

      </div>

    </article>
  `;
}

/* ACTIONS */

function bindEventActions() {
  document
    .querySelectorAll(".event-action")
    .forEach(button => {

      button.addEventListener("click", async () => {

        const action =
          button.dataset.action;

        const id =
          button.dataset.id;

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
      });
    });
}

async function validateEvent(id) {
  await supabaseClient
    .from("events")
    .update({
      validated: true,
      rejected: false
    })
    .eq("id", id);

  showToast("Événement validé");

  await loadDashboard();
}

async function rejectEvent(id) {
  await supabaseClient
    .from("events")
    .update({
      rejected: true
    })
    .eq("id", id);

  showToast("Événement rejeté");

  await loadDashboard();
}

async function toggleFeatured(id) {
  const current =
    allEvents.find(event =>
      String(event.id) === String(id)
    );

  if (!current) return;

  await supabaseClient
    .from("events")
    .update({
      featured: !current.featured
    })
    .eq("id", id);

  showToast("Featured mis à jour");

  await loadDashboard();
}

/* EDITION */

function openEditModal(id) {
  const event =
    allEvents.find(item =>
      String(item.id) === String(id)
    );

  if (!event) return;

  editId.value = event.id || "";
  editTitle.value = event.title || "";
  editType.value = event.type || "Autre";
  editCity.value = event.city || "";
  editRegion.value = event.region || "";
  editStartDate.value = event.start_date || "";
  editEndDate.value = event.end_date || "";
  editWebsite.value = event.website || "";
  editDescription.value = event.description || "";

  editModal.classList.remove("hidden");
}

function closeEditModal() {
  editModal.classList.add("hidden");
}

async function saveEdition() {
  const id = editId.value;

  try {

    await supabaseClient
      .from("events")
      .update({
        title: editTitle.value,
        type: editType.value,
        city: editCity.value,
        region: editRegion.value,
        start_date: editStartDate.value,
        end_date: editEndDate.value,
        website: editWebsite.value,
        description: editDescription.value
      })
      .eq("id", id);

    showToast("Événement modifié");

    closeEditModal();

    await loadDashboard();

  } catch (error) {
    console.error(error);

    showToast("Erreur modification");
  }
}

/* MAP */

function initMap() {
  if (!document.getElementById("admin-map")) return;

  if (!map) {

    map = L.map("admin-map")
      .setView([46.603354, 1.888334], 6);

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "&copy; OpenStreetMap"
      }
    ).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
  }

  renderMapMarkers(getFilteredEvents());
}

function renderMapMarkers(events) {
  if (!map || !markersLayer) return;

  markersLayer.clearLayers();

  events.forEach(event => {

    if (
      !Number.isFinite(Number(event.lat)) ||
      !Number.isFinite(Number(event.lng))
    ) return;

    const marker = L.marker([
      Number(event.lat),
      Number(event.lng)
    ]);

    marker.bindPopup(`
      <strong>${escapeHtml(event.title || "")}</strong>
      <br>
      ${escapeHtml(event.city || "")}
    `);

    markersLayer.addLayer(marker);
  });
}

/* TOAST */

function showToast(message) {
  const container =
    document.getElementById("toast-container");

  const toast =
    document.createElement("div");

  toast.className = "toast";
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/* HELPERS */

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
