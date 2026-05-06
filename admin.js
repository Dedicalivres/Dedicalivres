/* =========================================================
   DÉDICALIVRES — ADMIN V10 CYBER CONTROL ONGLET + IMAGE MANAGER
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

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const closeEditModalBtn = document.getElementById("close-edit-modal");

let editId = document.getElementById("edit-id");
let editTitle = document.getElementById("edit-title");
let editType = document.getElementById("edit-type");
let editCity = document.getElementById("edit-city");
let editRegion = document.getElementById("edit-region");
let editStartDate = document.getElementById("edit-start-date");
let editEndDate = document.getElementById("edit-end-date");
let editWebsite = document.getElementById("edit-website");
let editDescription = document.getElementById("edit-description");
let editImagePreview = document.getElementById("edit-image-preview");
let editImageFile = document.getElementById("edit-image-file");
let editImageUrl = document.getElementById("edit-image-url");
let removeEditImageBtn = document.getElementById("remove-edit-image");
let saveEditBtn = document.getElementById("save-edit-btn");

/* STATE */

let allEvents = [];
let map = null;
let markersLayer = null;
let selectedAdminImageFile = null;

/* INIT */

init();

async function init() {
  ensureEditFields();
  bindEvents();
  bindTabs();

  const { data } = await supabaseClient.auth.getSession();

  if (data?.session) {
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
    console.error("Erreur connexion admin :", error);
    loginFeedback.textContent = "Connexion impossible. Vérifie tes identifiants.";
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
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur chargement événements :", error);
    showToast("Erreur chargement événements");
    allEvents = [];
    return;
  }

  allEvents = Array.isArray(data) ? data : [];
}

async function loadNewsletterCount() {
  try {
    const { count, error } = await supabaseClient
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    if (statsNewsletter) statsNewsletter.textContent = count || 0;
  } catch (error) {
    console.warn("Newsletter indisponible :", error);
    if (statsNewsletter) statsNewsletter.textContent = "0";
  }
}

async function loadVisitsCount() {
  const tables = ["visits", "site_visits", "page_views"];

  for (const table of tables) {
    try {
      const { count, error } = await supabaseClient
        .from(table)
        .select("*", { count: "exact", head: true });

      if (!error) {
        if (statsVisits) statsVisits.textContent = count || 0;
        return;
      }
    } catch {
      // table suivante
    }
  }

  if (statsVisits) statsVisits.textContent = "0";
}

function updateStats() {
  const pending = allEvents.filter((event) => !event.validated && !event.rejected);

  if (statsEvents) statsEvents.textContent = allEvents.length;
  if (statsPending) statsPending.textContent = pending.length;

  const filteredCount = getFilteredEvents().length;

  if (eventsCount) {
    eventsCount.textContent = `${filteredCount} élément${filteredCount > 1 ? "s" : ""}`;
  }
}

/* ONGLETS ADMIN V10 */

function bindTabs() {
  const tabs = document.querySelectorAll(".admin-tab");
  const panels = document.querySelectorAll(".admin-tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      tabs.forEach((item) => item.classList.remove("active"));
      panels.forEach((panel) => panel.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(`tab-${target}`)?.classList.add("active");

      if (target === "overview") {
        setTimeout(() => {
          map?.invalidateSize();
        }, 250);
      }
    });
  });

  bindMobileSwipeTabs();
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
    const activeIndex = tabs.findIndex((tab) => tab.classList.contains("active"));

    if (delta < 0) tabs[activeIndex + 1]?.click();
    else tabs[activeIndex - 1]?.click();
  }
}

/* FILTERS */

function getFilteredEvents() {
  const search = normalize(searchInput?.value || "");
  const status = filterStatus?.value || "";
  const type = filterType?.value || "";

  return allEvents.filter((event) => {
    const haystack = normalize([
      event.title,
      event.city,
      event.region,
      event.description,
      event.type
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
  updateStats();

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
  const image = event.image_url
    ? `
      <img
        class="event-admin-thumb"
        src="${escapeHtml(event.image_url)}"
        alt="${escapeHtml(event.title || "Événement")}"
      />
    `
    : `
      <div class="event-admin-thumb-placeholder">
        PAS D’IMAGE
      </div>
    `;

  return `
    <article class="event-card event-card-with-image">

      ${image}

      <div>
        <div class="event-title">
          ${escapeHtml(event.title || "Sans titre")}
        </div>

        <div class="event-meta">
          <span>📍 ${escapeHtml(event.city || "Ville inconnue")}</span>
          <span>📅 ${formatDate(event.start_date)}</span>
          <span>🏷️ ${escapeHtml(event.type || "Autre")}</span>
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
        <button class="event-action validate" data-action="validate" data-id="${event.id}">
          ✔ Valider
        </button>

        <button class="event-action reject" data-action="reject" data-id="${event.id}">
          ✖ Rejeter
        </button>

        <button class="event-action featured" data-action="featured" data-id="${event.id}">
          ★ Feature
        </button>

        <button class="event-action edit" data-action="edit" data-id="${event.id}">
          ✎ Modifier
        </button>
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
    console.error(error);
    showToast("Erreur validation");
    return;
  }

  await loadDashboard();
  showToast("Événement validé");
}

async function rejectEvent(id) {
  const confirmed = confirm("Rejeter cet événement ?");
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("events")
    .update({
      rejected: true,
      validated: false
    })
    .eq("id", id);

  if (error) {
    console.error(error);
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
    console.error(error);
    showToast("Erreur feature");
    return;
  }

  await loadDashboard();
  showToast(!event.featured ? "Événement mis en avant" : "Mise en avant retirée");
}

/* MAP */

function initMap() {
  if (!window.L) return;

  const mapElement = document.getElementById("admin-map");
  if (!mapElement) return;

  if (!map) {
    map = L.map("admin-map").setView([46.603354, 1.888334], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
  }

  markersLayer.clearLayers();

  allEvents.forEach((event) => {
    if (
      !Number.isFinite(Number(event.lat)) ||
      !Number.isFinite(Number(event.lng))
    ) {
      return;
    }

    const marker = L.circleMarker([Number(event.lat), Number(event.lng)], {
      radius: 7,
      color: getMarkerColor(event),
      fillColor: getMarkerColor(event),
      fillOpacity: 0.85
    });

    marker.bindPopup(`
      <strong>${escapeHtml(event.title || "Événement")}</strong>
      <br>
      ${escapeHtml(event.city || "")}
      <br>
      ${escapeHtml(event.type || "")}
    `);

    marker.addTo(markersLayer);
  });

  setTimeout(() => {
    map.invalidateSize();
  }, 250);
}

function getMarkerColor(event) {
  if (event.type === "Salon") return "#bc7dff";
  if (event.type === "Festival") return "#ff9e44";
  if (event.type === "Dédicace") return "#19ff9c";
  return "#00dcff";
}

/* EDITION */

function openEditModal(id) {
  ensureEditFields();

  const event = allEvents.find((item) => String(item.id) === String(id));
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
  editImageUrl.value = event.image_url || "";

  selectedAdminImageFile = null;
  renderEditImagePreview(event.image_url);

  editModal?.classList.remove("hidden");
}

function closeEditModal() {
  editModal?.classList.add("hidden");
  selectedAdminImageFile = null;

  if (editImageFile) editImageFile.value = "";
}

function renderEditImagePreview(url) {
  if (!editImagePreview) return;

  if (!url) {
    editImagePreview.innerHTML = `<span>Aucune affiche</span>`;
    return;
  }

  editImagePreview.innerHTML = `
    <img src="${escapeHtml(url)}" alt="Affiche événement" />
  `;
}

function handleAdminImagePreview(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Fichier image invalide");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast("Image trop lourde (5 Mo max)");
    return;
  }

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

  if (editImageFile) editImageFile.value = "";

  renderEditImagePreview("");
}

async function saveEdition() {
  const id = editId.value;

  if (!id) return;

  saveEditBtn.disabled = true;
  saveEditBtn.textContent = "Enregistrement...";

  try {
    let imageUrl = editImageUrl.value.trim();

    if (selectedAdminImageFile) {
      imageUrl = await uploadAdminImage(selectedAdminImageFile);
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
      image_url: imageUrl || null
    };

    const { error } = await supabaseClient
      .from("events")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    await loadDashboard();
    closeEditModal();
    showToast("Événement modifié");
  } catch (error) {
    console.error(error);
    showToast("Erreur pendant l’enregistrement");
  } finally {
    saveEditBtn.disabled = false;
    saveEditBtn.textContent = "ENREGISTRER";
  }
}

/* IMAGE UPLOAD */

async function uploadAdminImage(file) {
  const compressed = await compressImage(file);

  const fileName = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`;

  const { error } = await supabaseClient
    .storage
    .from("event-images")
    .upload(fileName, compressed, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabaseClient
    .storage
    .from("event-images")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

async function compressImage(file) {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      const maxWidth = 1600;
      const ratio = Math.min(1, maxWidth / image.width);

      canvas.width = image.width * ratio;
      canvas.height = image.height * ratio;

      const ctx = canvas.getContext("2d");

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          resolve(
            new File([blob], "event-image.jpg", {
              type: "image/jpeg"
            })
          );
        },
        "image/jpeg",
        0.86
      );
    };

    image.src = URL.createObjectURL(file);
  });
}

/* SOCIAL TAB */

function renderSocialUpcoming() {
  const container = document.getElementById("social-upcoming");
  if (!container) return;

  const upcoming = [...allEvents]
    .filter((event) => event.validated && !event.rejected && event.start_date)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 6);

  if (!upcoming.length) {
    container.innerHTML = `<p class="muted">Aucun événement à venir.</p>`;
    return;
  }

  container.innerHTML = upcoming
    .map((event) => `
      <div class="social-mini-item">
        <strong>${escapeHtml(event.title || "Sans titre")}</strong>
        <span>${formatDate(event.start_date)} — ${escapeHtml(event.city || "")}</span>
      </div>
    `)
    .join("");
}

/* FALLBACK EDIT FIELDS */

function ensureEditFields() {
  if (!editForm) return;

  if (!document.getElementById("edit-title")) {
    editForm.insertAdjacentHTML(
      "beforeend",
      `
      <div class="form-grid">
        <input id="edit-title" placeholder="Titre" />

        <select id="edit-type">
          <option>Salon</option>
          <option>Festival</option>
          <option>Dédicace</option>
          <option>Autre</option>
        </select>

        <input id="edit-city" placeholder="Ville" />
        <input id="edit-region" placeholder="Région" />

        <input id="edit-start-date" type="date" />
        <input id="edit-end-date" type="date" />

        <input id="edit-website" placeholder="Site officiel" />
      </div>

      <textarea id="edit-description" rows="6" placeholder="Description"></textarea>

      <div class="edit-actions">
        <button type="button" id="save-edit-btn" class="cyber-btn-primary">
          ENREGISTRER
        </button>
      </div>
      `
    );
  }

  editId = document.getElementById("edit-id");
  editTitle = document.getElementById("edit-title");
  editType = document.getElementById("edit-type");
  editCity = document.getElementById("edit-city");
  editRegion = document.getElementById("edit-region");
  editStartDate = document.getElementById("edit-start-date");
  editEndDate = document.getElementById("edit-end-date");
  editWebsite = document.getElementById("edit-website");
  editDescription = document.getElementById("edit-description");
  editImagePreview = document.getElementById("edit-image-preview");
  editImageFile = document.getElementById("edit-image-file");
  editImageUrl = document.getElementById("edit-image-url");
  removeEditImageBtn = document.getElementById("remove-edit-image");
  saveEditBtn = document.getElementById("save-edit-btn");

  saveEditBtn?.removeEventListener("click", saveEdition);
  saveEditBtn?.addEventListener("click", saveEdition);
}

/* TOAST */

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

/* HELPERS */

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

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
