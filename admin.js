/* =========================================================
   DÉDICALIVRES — ADMIN V8.3 / Auth robuste + upload hybride R2
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

const adminMapPanel = document.getElementById("admin-map-panel");
const adminMapToggle = document.getElementById("admin-map-toggle");
const adminMapStatus = document.getElementById("admin-map-status");
const adminMapElement = document.getElementById("admin-map");

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
let adminMapRequested = false;
let protectedAdminModulesLoaded = false;
let adminBooting = false;

const PROTECTED_ADMIN_MODULES = [
  "admin-visits-counter-fix.js",
  "admin-author-requests-robust.js",
  "admin-testimonials.js",
  "admin-quality-control.js",
  "admin-social-generator.js"
];

const ADMIN_EVENTS_COLUMNS = [
  "id",
  "created_at",
  "title",
  "type",
  "city",
  "region",
  "description",
  "start_date",
  "end_date",
  "website",
  "image_url",
  "validated",
  "rejected",
  "featured",
  "verified",
  "lat",
  "lng",
  "price"
].join(", ");

const ADMIN_LOCATION_COLUMNS = [
  "id",
  "created_at",
  "city",
  "region",
  "device",
  "lat",
  "lng"
].join(", ");

init();

async function init() {
  window.DEDICALIVRES_ADMIN_AUTHENTICATED = false;
  lockDashboard();
  bindEvents();
  bindTabs();

  adminBooting = true;

  try {
    const { data } = await supabaseClient.auth.getSession();

    if (data?.session) {
      await unlockAdmin();
    } else {
      lockDashboard();
    }
  } catch (error) {
    console.warn("Session admin non vérifiée :", error);
    lockDashboard();
  } finally {
    adminBooting = false;
  }
}

function bindEvents() {
  loginForm?.addEventListener("submit", handleLogin);
  logoutBtn?.addEventListener("click", logout);

  refreshBtn?.addEventListener("click", async () => {
    if (!(await ensureAdminSession())) return;
    refreshBtn.disabled = true;
    const previousLabel = refreshBtn.textContent;
    refreshBtn.textContent = "Actualisation...";

    try {
      await loadDashboard();
      showToast("Dashboard actualisé");
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = previousLabel || "Actualiser";
    }
  });

  searchInput?.addEventListener("input", renderEvents);
  filterStatus?.addEventListener("change", renderEvents);
  filterType?.addEventListener("change", renderEvents);

  closeEditModalBtn?.addEventListener("click", closeEditModal);
  saveEditBtn?.addEventListener("click", saveEdition);
  removeEditImageBtn?.addEventListener("click", removeEditImage);
  editImageFile?.addEventListener("change", handleAdminImagePreview);
  adminMapToggle?.addEventListener("click", toggleAdminMap);

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

    try {
      await unlockAdmin();
      showToast("Connexion réussie");
    } catch (dashboardError) {
      console.error("Dashboard partiellement chargé :", dashboardError);
      showToast("Connexion réussie · certains modules doivent être actualisés");
    }
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
  window.DEDICALIVRES_ADMIN_AUTHENTICATED = false;
  lockDashboard();
  clearAdminSensitiveState();
  showToast("Déconnecté");
}

function showDashboard() {
  window.DEDICALIVRES_ADMIN_AUTHENTICATED = true;

  if (loginScreen) {
    loginScreen.classList.add("hidden");
    loginScreen.setAttribute("aria-hidden", "true");
    loginScreen.style.display = "none";
  }

  if (dashboard) {
    dashboard.classList.remove("hidden");
    dashboard.hidden = false;
    dashboard.removeAttribute("hidden");
    dashboard.style.display = "";
    dashboard.setAttribute("aria-hidden", "false");
  }

  setTimeout(() => {
    map?.invalidateSize();
  }, 300);
}

function lockDashboard() {
  window.DEDICALIVRES_ADMIN_AUTHENTICATED = false;

  if (dashboard) {
    dashboard.classList.add("hidden");
    dashboard.hidden = true;
    dashboard.setAttribute("hidden", "");
    dashboard.style.display = "none";
    dashboard.setAttribute("aria-hidden", "true");
  }

  if (loginScreen) {
    loginScreen.classList.remove("hidden");
    loginScreen.removeAttribute("aria-hidden");
    loginScreen.style.display = "";
  }
}

async function unlockAdmin() {
  if (!(await ensureAdminSession())) return;

  showDashboard();
  await loadProtectedAdminModules();
  window.dispatchEvent(new CustomEvent("dedicalivres:admin-authenticated"));
  await loadDashboard();
}

async function ensureAdminSession() {
  try {
    const { data } = await supabaseClient.auth.getSession();

    if (!data?.session) {
      lockDashboard();
      if (!adminBooting) showToast("Connexion admin requise");
      return false;
    }

    window.DEDICALIVRES_ADMIN_AUTHENTICATED = true;
    return true;
  } catch (error) {
    console.warn("Session admin indisponible :", error);
    lockDashboard();
    return false;
  }
}

async function loadProtectedAdminModules() {
  if (protectedAdminModulesLoaded) return;
  protectedAdminModulesLoaded = true;

  for (const src of PROTECTED_ADMIN_MODULES) {
    await loadAdminScript(src);
  }
}

function loadAdminScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[data-protected-admin-module="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `${src}?v=8.3`;
    script.defer = true;
    script.dataset.protectedAdminModule = src;
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn(`Module admin non chargé : ${src}`);
      resolve();
    };
    document.body.appendChild(script);
  });
}

function clearAdminSensitiveState() {
  allEvents = [];
  locationRows = [];

  if (eventsContainer) eventsContainer.innerHTML = "";
  if (eventsCount) eventsCount.textContent = "0 élément";
  if (statsEvents) statsEvents.textContent = "0";
  if (statsPending) statsPending.textContent = "0";
  if (statsNewsletter) statsNewsletter.textContent = "0";
  if (statsVisits) statsVisits.textContent = "0";

  document.getElementById("premium-container")?.replaceChildren();
  document.getElementById("testimonials-admin-panel")?.remove();
  document.getElementById("stats-testimonials-card")?.remove();
  document.getElementById("tab-social")?.replaceChildren();
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
    const activeIndex = tabs.findIndex((tab) =>
      tab.classList.contains("active")
    );

    if (delta < 0) tabs[activeIndex + 1]?.click();
    else tabs[activeIndex - 1]?.click();
  }
}

/* DASHBOARD */

async function loadDashboard() {
  if (!(await ensureAdminSession())) return;

  await safeAdminStep("chargement événements", loadEvents);
  await safeAdminStep("chargement indicateur mise en avant", loadNewsletterCount);
  await safeAdminStep("chargement visites", loadVisitsCount);
  // Anti-egress : le module localisation est désactivé par défaut car il ne remonte pas de données utiles actuellement.
  locationRows = [];

  refreshAdminViews();

  if (adminMapRequested) {
    safeAdminStepSync("carte admin", initMap);
  } else {
    collapseAdminMap();
  }

  window.dispatchEvent(new CustomEvent("dedicalivres:admin-dashboard-refreshed"));
  window.dispatchEvent(new CustomEvent("dedicalivres:testimonials-refresh"));

  // Sécurité affichage : certains modules secondaires se chargent juste après l'authentification.
  // Ce second passage évite d'avoir à cliquer deux fois sur Actualiser pour voir les compteurs.
  setTimeout(() => {
    refreshAdminViews();
    if (adminMapRequested) map?.invalidateSize();
  }, 350);
}

function refreshAdminViews() {
  safeAdminStepSync("statistiques", updateStats);
  safeAdminStepSync("liste événements", renderEvents);
  safeAdminStepSync("premium", renderPremiumDashboard);
  safeAdminStepSync("réseaux", renderSocialUpcoming);
  safeAdminStepSync("observatoire", renderPriorityZones);
}

async function safeAdminStep(label, fn) {
  try {
    await fn();
  } catch (error) {
    console.warn(`Admin : ${label} indisponible`, error);
  }
}

function safeAdminStepSync(label, fn) {
  try {
    fn();
  } catch (error) {
    console.warn(`Admin : ${label} indisponible`, error);
  }
}

async function loadEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select(ADMIN_EVENTS_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);

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
  // Module volontairement neutralisé pour réduire les requêtes admin.
  // À réactiver plus tard si les compteurs de localisation sont de nouveau utiles.
  locationRows = [];
}

function updateStats() {
  const pending = allEvents.filter(
    (event) => !event.validated && !event.rejected
  );

  if (statsEvents) statsEvents.textContent = allEvents.length;
  if (statsPending) statsPending.textContent = pending.length;
  if (statsFeatured) statsFeatured.textContent = String((allEvents || []).filter((event) => !!event.featured).length);
if (eventsCount) {
    eventsCount.textContent = `${getFilteredEvents().length} éléments`;
  }
}

/* PRIORITY ZONES */

function renderPriorityZones() {
  // Anti-egress : affichage neutre sans requête location_tracking.
  renderLocationDisabledPanels();
}

function renderLocationDisabledPanels() {
  const message = `<p class="priority-empty">Module localisation désactivé pour réduire la consommation Supabase.</p>`;
  if (priorityCities) priorityCities.innerHTML = message;
  if (priorityDevices) priorityDevices.innerHTML = message;
  if (priorityTrend) priorityTrend.innerHTML = `
    <p class="priority-empty">
      Les compteurs de localisation sont temporairement désactivés car ils ne remontaient pas de données utiles.
    </p>
  `;
}

function renderTopCities() {
  if (!priorityCities) return;

  if (!locationRows.length) {
    priorityCities.innerHTML = `<p class="priority-empty">Aucune donnée pour l’instant.</p>`;
    return;
  }

  const cityCounts = countBy(
    locationRows
      .map((row) => cleanLabel(row.city || row.region || "Zone inconnue"))
      .filter(Boolean)
  );

  priorityCities.innerHTML = renderRanking(cityCounts, "localisation");
}

function renderDevices() {
  if (!priorityDevices) return;

  if (!locationRows.length) {
    priorityDevices.innerHTML = `<p class="priority-empty">Aucune donnée pour l’instant.</p>`;
    return;
  }

  const deviceCounts = countBy(
    locationRows.map((row) => cleanLabel(row.device || "inconnu"))
  );

  priorityDevices.innerHTML = renderRanking(deviceCounts, "appareil");
}

function renderTrend() {
  if (!priorityTrend) return;

  if (!locationRows.length) {
    priorityTrend.innerHTML = `
      <p class="priority-empty">
        Les tendances apparaîtront après les premiers clics sur “Me localiser”.
      </p>
    `;
    return;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const recent = locationRows.filter((row) => {
    if (!row.created_at) return false;
    return new Date(row.created_at) >= sevenDaysAgo;
  });

  const topCityCounts = countBy(
    recent
      .map((row) => cleanLabel(row.city || row.region || "Zone inconnue"))
      .filter(Boolean)
  );

  const topCity = Object.entries(topCityCounts)
    .sort((a, b) => b[1] - a[1])[0];

  priorityTrend.innerHTML = `
    <div class="priority-trend-box">
      <strong>${recent.length}</strong>
      <span>localisation(s) sur 7 jours</span>
    </div>

    ${
      topCity
        ? `
          <div class="priority-mini">
            Zone la plus active :
            <b>${escapeHtml(topCity[0])}</b>
          </div>
        `
        : `
          <div class="priority-mini">
            Pas encore assez de données récentes.
          </div>
        `
    }
  `;
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
    if (status === "rejected") return !!event.rejected;
    if (status === "featured") return !!event.featured;
    if (status === "premium-ready") return isPremiumCandidate(event);
    if (status === "missing-image") return !event.image_url;

    return true;
  });
}

/* RENDER EVENTS */

function renderEvents() {
  if (!eventsContainer) return;

  const events = getFilteredEvents();
  if (eventsCount) eventsCount.textContent = `${events.length} élément${events.length > 1 ? "s" : ""}`;

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
          <div class="event-admin-thumb-placeholder" title="Image disponible, non chargée automatiquement pour économiser Supabase">
            IMAGE DISPONIBLE
          </div>
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
        <button class="event-action validate" data-action="validate" data-id="${event.id}" type="button" title="Valider">✔ <span>Valider</span></button>
        <button class="event-action reject" data-action="reject" data-id="${event.id}" type="button" title="Refuser">✖ <span>Refuser</span></button>
        <button class="event-action featured" data-action="featured" data-id="${event.id}" type="button" title="${event.featured ? "Retirer la mise en avant" : "Mettre en avant"}">★ <span>${event.featured ? "Retirer" : "Avant"}</span></button>
        <button class="event-action edit" data-action="edit" data-id="${event.id}" type="button" title="Modifier">✎ <span>Modifier</span></button>
        <a class="event-action view" href="event.html?id=${encodeURIComponent(event.id)}" target="_blank" rel="noopener noreferrer" title="Voir la fiche">↗ <span>Voir</span></a>
        ${event.image_url ? `<a class="event-action view" href="${escapeHtml(event.image_url)}" target="_blank" rel="noopener noreferrer" title="Voir l’image">🖼 <span>Image</span></a>` : ""}
        ${
          event.rejected
            ? `<button class="event-action delete" data-action="delete" data-id="${event.id}" type="button" title="Supprimer définitivement">🗑 <span>Suppr.</span></button>`
            : ""
        }
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
      if (action === "delete") await deleteRejectedEvent(id);
    });
  });
}

/* ACTIONS */

async function validateEvent(id) {
  if (!(await ensureAdminSession())) return;
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
  if (!(await ensureAdminSession())) return;
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
  if (!(await ensureAdminSession())) return;
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


async function deleteRejectedEvent(id) {
  if (!(await ensureAdminSession())) return;
  const event = allEvents.find((item) => String(item.id) === String(id));

  if (!event) {
    showToast("Événement introuvable");
    return;
  }

  if (!event.rejected) {
    showToast("Suppression réservée aux événements refusés");
    return;
  }

  const confirmed = window.confirm(
    `Supprimer définitivement l’événement refusé :\n\n${event.title || "Sans titre"}\n\nCette action est irréversible.`
  );

  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("events")
    .delete()
    .eq("id", id)
    .eq("rejected", true);

  if (error) {
    console.error(error);
    showToast("Erreur suppression");
    return;
  }

  await loadDashboard();
  showToast("Événement refusé supprimé");
}


/* MAP */

function collapseAdminMap() {
  adminMapRequested = false;

  if (adminMapElement) {
    adminMapElement.hidden = true;
    adminMapElement.style.display = "none";
  }

  adminMapPanel?.classList.add("is-collapsed");

  if (adminMapToggle) {
    adminMapToggle.textContent = "Afficher la carte live";
    adminMapToggle.setAttribute("aria-expanded", "false");
  }

  if (adminMapStatus) {
    adminMapStatus.textContent = "Carte repliée par défaut pour limiter les chargements";
  }
}

function expandAdminMap() {
  adminMapRequested = true;

  if (adminMapElement) {
    adminMapElement.hidden = false;
    adminMapElement.style.display = "";
  }

  adminMapPanel?.classList.remove("is-collapsed");

  if (adminMapToggle) {
    adminMapToggle.textContent = "Masquer la carte live";
    adminMapToggle.setAttribute("aria-expanded", "true");
  }

  if (adminMapStatus) {
    adminMapStatus.textContent = "Carte chargée à la demande";
  }

  initMap();

  setTimeout(() => {
    map?.invalidateSize();
  }, 250);
}

function toggleAdminMap() {
  if (!(window.DEDICALIVRES_ADMIN_AUTHENTICATED === true)) return;

  if (adminMapRequested) {
    collapseAdminMap();
    return;
  }

  expandAdminMap();
}

function initMap() {
  if (!window.L) return;
  if (!adminMapRequested) return;

  const mapElement = adminMapElement || document.getElementById("admin-map");
  if (!mapElement) return;

  if (!map) {
    map = L.map("admin-map").setView([46.6, 1.88], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
  }

  markersLayer.clearLayers();

  allEvents.forEach((event) => {
    if (!event.lat || !event.lng) return;

    const marker = L.circleMarker([event.lat, event.lng], {
      radius: 7,
      color: "#19ff9c",
      fillColor: "#19ff9c",
      fillOpacity: 0.85
    });

    marker.bindPopup(`
      <strong>${escapeHtml(event.title)}</strong>
      <br>
      ${escapeHtml(event.city || "")}
    `);

    marker.addTo(markersLayer);
  });

  // Marqueurs de recherches utilisateurs désactivés pour réduire les requêtes localisation.

  setTimeout(() => {
    map.invalidateSize();
  }, 250);
}


/* PREMIUM */

function isPremiumCandidate(event) {
  if (!event || event.rejected) return false;

  const hasCore = !!event.validated && !!event.start_date;
  const hasPublicValue = !!event.website || !!event.image_url || String(event.description || "").length > 160;
  const premiumType = ["Salon", "Festival", "Dédicace"].includes(event.type);
  const upcomingSoon = isUpcomingWithinDays(event, 60);

  return hasCore && premiumType && (hasPublicValue || upcomingSoon);
}

function isUpcomingWithinDays(event, days) {
  if (!event?.start_date) return false;

  const start = new Date(event.start_date);
  if (Number.isNaN(start.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const limit = new Date(today);
  limit.setDate(today.getDate() + days);

  return start >= today && start <= limit;
}

function renderPremiumDashboard() {
  if (!premiumContainer) return;

  const featured = (allEvents || []).filter((event) => !!event.featured && !event.rejected);
  const candidates = (allEvents || []).filter((event) => isPremiumCandidate(event) && !event.featured);
  const missingImage = (allEvents || []).filter((event) => event.validated && !event.rejected && !event.image_url);

  if (premiumFeaturedCount) premiumFeaturedCount.textContent = String(featured.length);
  if (premiumCandidatesCount) premiumCandidatesCount.textContent = String(candidates.length);
  if (premiumMissingImageCount) premiumMissingImageCount.textContent = String(missingImage.length);
  if (premiumCount) {
    premiumCount.textContent =
      `${featured.length} mis en avant · ${candidates.length} potentiel${candidates.length > 1 ? "s" : ""}`;
  }

  const rows = [...featured, ...candidates]
    .filter(Boolean)
    .filter((event, index, arr) => arr.findIndex((item) => String(item.id) === String(event.id)) === index)
    .sort((a, b) => {
      if (!!b.featured !== !!a.featured) return Number(!!b.featured) - Number(!!a.featured);
      return new Date(a.start_date || "2999-12-31") - new Date(b.start_date || "2999-12-31");
    })
    .slice(0, 40);

  if (!rows.length) {
    premiumContainer.innerHTML = `
      <article class="event-card">
        Aucun événement premium ou potentiel premium pour le moment.
      </article>
    `;
    return;
  }

  premiumContainer.innerHTML = rows.map(renderPremiumCard).join("");
  bindEventActions();
}

function renderPremiumCard(event) {
  const reason = event.featured
    ? "Mis en avant actif"
    : !event.image_url
      ? "Potentiel à compléter : image manquante"
      : isUpcomingWithinDays(event, 60)
        ? "Événement proche à valoriser"
        : "Potentiel éditorial";

  return `
    <article class="event-card event-card-with-image premium-admin-card">
      ${
        event.image_url
          ? `<div class="event-admin-thumb-placeholder" title="Image disponible, non chargée automatiquement pour économiser Supabase">IMAGE DISPONIBLE</div>`
          : `<div class="event-admin-thumb-placeholder">PAS D’IMAGE</div>`
      }

      <div>
        <div class="event-title">${escapeHtml(event.title || "")}</div>
        <div class="event-meta">
          <span>📍 ${escapeHtml([event.city, event.region].filter(Boolean).join(", "))}</span>
          <span>📅 ${formatDate(event.start_date)}</span>
          <span>🏷️ ${escapeHtml(event.type || "")}</span>
        </div>
        <div class="event-badges">
          ${event.featured ? `<span class="badge featured">MIS EN AVANT</span>` : `<span class="badge pending">POTENTIEL PREMIUM</span>`}
          ${!event.image_url ? `<span class="badge missing-image">SANS IMAGE</span>` : ""}
          <span class="badge">${escapeHtml(reason)}</span>
        </div>
      </div>

      <div class="event-actions">
        <button class="event-action featured" data-action="featured" data-id="${event.id}" type="button">
          ★ <span>${event.featured ? "Retirer" : "Avant"}</span>
        </button>
        <button class="event-action edit" data-action="edit" data-id="${event.id}" type="button">
          ✎ <span>Modifier</span>
        </button>
        <a class="event-action view" href="event.html?id=${encodeURIComponent(event.id)}" target="_blank" rel="noopener noreferrer">
          ↗ <span>Voir</span>
        </a>
        ${event.image_url ? `<a class="event-action view" href="${escapeHtml(event.image_url)}" target="_blank" rel="noopener noreferrer" title="Voir l’image">🖼 <span>Image</span></a>` : ""}
      </div>
    </article>
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
    <img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" />
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
  if (!(await ensureAdminSession())) return;

  const id = editId.value;
  if (!id) return;

  const submitButton = saveEditBtn;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Enregistrement...";
  }

  try {
    let imageUrl = editImageUrl.value.trim() || null;

    if (selectedAdminImageFile) {
      imageUrl = await uploadAdminImage(selectedAdminImageFile);
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
    closeEditModal();
    await loadDashboard();
    showToast("Événement modifié");
  } catch (error) {
    console.error("Erreur édition admin :", error);
    showToast("Erreur édition");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "ENREGISTRER";
    }
  }
}

async function uploadAdminImage(file) {
  const compressed = await compressImage(file, 1200, 0.74);

  if (shouldUseR2Upload()) {
    try {
      return await uploadImageToR2(compressed, "event-images");
    } catch (error) {
      console.warn("Upload R2 admin indisponible, bascule Supabase :", error);
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
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(bucket)
    .upload(fileName, file, {
      cacheControl: "2592000",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

function compressImage(file, maxWidth = 1200, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Lecture image impossible."));
    reader.onload = (event) => {
      img.onload = () => {
        const ratio = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Compression image impossible."));
              return;
            }

            const safeName = `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
            resolve(new File([blob], safeName, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Image invalide."));
      img.src = event.target.result;
    };

    reader.readAsDataURL(file);
  });
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
