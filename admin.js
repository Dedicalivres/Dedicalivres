/* =========================================================
   DÉDICALIVRES — ADMIN V10.0 / Correctif demandes auteurs
========================================================= */

"use strict";

const config = window.DEDICALIVRES_CONFIG;

if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
  alert("Configuration Supabase introuvable.");
  throw new Error("Supabase config missing");
}

const supabaseClient =
  (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
  window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
  window.DEDICALIVRES_SUPABASE_CLIENT = supabaseClient;
}

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
const filterArchive = document.getElementById("filter-archive");
const filterType = document.getElementById("filter-type");

const statsEvents = document.getElementById("stats-events");
const statsPending = document.getElementById("stats-pending");
const statsNewsletter = document.getElementById("stats-newsletter");
const statsFeatured = document.getElementById("stats-featured");
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

const premiumContainer = document.getElementById("premium-container");
const premiumCount = document.getElementById("premium-count");
const premiumFeaturedCount = document.getElementById("premium-featured-count");
const premiumCandidatesCount = document.getElementById("premium-candidates-count");
const premiumMissingImageCount = document.getElementById("premium-missing-image-count");
const qualityControlCount = document.getElementById("quality-control-count");
const qualityControlGrid = document.getElementById("quality-control-grid");
const qualityControlList = document.getElementById("quality-control-list");
const qualityFocusSelect = document.getElementById("quality-focus-select");
const controlStatsCount = document.getElementById("control-stats-count");
const controlStatsGrid = document.getElementById("control-stats-grid");
const controlRegionList = document.getElementById("control-region-list");
const controlTypeList = document.getElementById("control-type-list");
const controlSecurityGrid = document.getElementById("control-security-grid");

let allEvents = [];
let locationRows = [];
let map = null;
let markersLayer = null;
let selectedAdminImageFile = null;
let adminMapRequested = false;
let adminMapMode = "pending";
let archiveEventsLoaded = false;
let protectedAdminModulesLoaded = false;
let adminBooting = false;

const ADMIN_MODULE_VERSION = "10.6";
const ADMIN_ACTION_LOG_KEY = "dedicalivres_admin_action_log_v1";
const adminModerationCounters = {
  events: 0,
  testimonials: 0,
  authorRequests: 0
};
const adminModerationErrors = new Set();

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
ensureAdminObservatoryStyles();

function ensureAdminObservatoryStyles() {
  if (document.getElementById("admin-observatory-styles")) return;

  const style = document.createElement("style");
  style.id = "admin-observatory-styles";
  style.textContent = `
    .observatory-actions,
    .admin-map-observatory-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }

    .observatory-actions button,
    .admin-map-observatory-controls select {
      border: 1px solid rgba(25,255,156,.22);
      border-radius: 999px;
      padding: 10px 14px;
      background: rgba(255,255,255,.08);
      color: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .admin-map-observatory-controls {
      align-items: center;
      margin-bottom: 14px;
    }

    .admin-map-observatory-controls label {
      font-weight: 900;
      opacity: .82;
    }

    .admin-map-observatory-controls select {
      min-height: 42px;
      color: #111;
      background: #fff;
    }

    .observatory-region-list {
      display: grid;
      gap: 10px;
    }

    .admin-action-priority-panel {
      margin: 0 0 18px;
      padding: 16px;
      border-radius: 20px;
      background:
        radial-gradient(circle at top left, rgba(25,255,156,.12), transparent 36%),
        rgba(255,255,255,.06);
      border: 1px solid rgba(25,255,156,.18);
      box-shadow: 0 12px 28px rgba(0,0,0,.12);
    }

    .admin-action-priority-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .admin-action-priority-head strong {
      font-size: 1.02rem;
      letter-spacing: .03em;
    }

    .admin-action-priority-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }

    .admin-action-priority-card {
      min-height: 92px;
      padding: 12px;
      border-radius: 16px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.10);
      cursor: pointer;
      color: inherit;
      text-align: left;
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .admin-action-priority-card:hover {
      transform: translateY(-2px);
      border-color: rgba(25,255,156,.34);
      background: rgba(255,255,255,.12);
    }

    .admin-action-priority-card b {
      display: block;
      font-size: 1.7rem;
      line-height: 1;
      margin-bottom: 8px;
    }

    .admin-action-priority-card span {
      display: block;
      font-size: .78rem;
      font-weight: 800;
      opacity: .82;
      line-height: 1.25;
    }

    .admin-action-priority-card.is-warning b {
      color: #ffb020;
    }

    .admin-action-priority-card.is-danger b {
      color: #ff6b6b;
    }

    .admin-action-priority-card.is-ok b {
      color: #19ff9c;
    }

    .quality-score {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 28px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .02em;
      border: 1px solid rgba(255,255,255,.12);
    }

    .quality-score.is-good {
      background: rgba(25,255,156,.12);
      color: #19ff9c;
    }

    .quality-score.is-medium {
      background: rgba(255,176,32,.13);
      color: #ffb020;
    }

    .quality-score.is-low {
      background: rgba(255,107,107,.14);
      color: #ff6b6b;
    }

    .event-action.social-copy {
      background: linear-gradient(135deg, rgba(255,107,53,.95), rgba(255,155,98,.95));
      color: #fff;
      border-color: rgba(255,107,53,.35);
    }


    .quality-missing {
      display: block;
      margin-top: 7px;
      font-size: .78rem;
      line-height: 1.35;
      opacity: .78;
    }


    @media (max-width: 980px) {
      .admin-action-priority-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 560px) {
      .admin-action-priority-grid {
        grid-template-columns: 1fr;
      }
    }

  `;
  document.head.appendChild(style);
}



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
  filterArchive?.addEventListener("change", handleArchiveFilterChange);
  filterType?.addEventListener("change", renderEvents);
  qualityFocusSelect?.addEventListener("change", renderQualityControlCenter);

  closeEditModalBtn?.addEventListener("click", closeEditModal);
  saveEditBtn?.addEventListener("click", saveEdition);
  removeEditImageBtn?.addEventListener("click", removeEditImage);
  editImageFile?.addEventListener("change", handleAdminImagePreview);
  adminMapToggle?.addEventListener("click", toggleAdminMap);
  bindAdminExportsPanel();

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
    script.src = `${src}?v=${ADMIN_MODULE_VERSION}`;
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

function updateAdminModerationCounter(source, value, options = {}) {
  if (!Object.prototype.hasOwnProperty.call(adminModerationCounters, source)) {
    return;
  }

  const count = Number(value);
  adminModerationCounters[source] = Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 0;

  if (options.hasError) {
    adminModerationErrors.add(source);
  } else {
    adminModerationErrors.delete(source);
  }

  renderAdminModerationBadge();
}

window.updateAdminModerationCounter = updateAdminModerationCounter;

window.addEventListener("dedicalivres:authorRequestsUpdated", (event) => {
  updateAdminModerationCounter("authorRequests", event.detail?.total || 0, {
    hasError: !!event.detail?.hasError
  });
});

function renderAdminModerationBadge() {
  const moderationTab = document.querySelector('.admin-tab[data-tab="moderation"]');
  if (!moderationTab) return;

  moderationTab
    .querySelectorAll("#testimonials-tab-badge, #author-requests-tab-badge")
    .forEach((badge) => badge.remove());

  let badge = document.getElementById("moderation-tab-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "moderation-tab-badge";
    badge.className = "admin-tab-badge moderation-tab-badge";
    moderationTab.appendChild(badge);
  }

  const total = Object.values(adminModerationCounters)
    .reduce((sum, count) => sum + count, 0);
  const hasError = adminModerationErrors.size > 0;

  badge.textContent = hasError ? "!" : String(total);
  badge.hidden = !hasError && total === 0;
  badge.setAttribute(
    "aria-label",
    hasError
      ? "Compteur de modération partiellement indisponible"
      : `${total} élément${total > 1 ? "s" : ""} à modérer`
  );

  safeAdminStepSync("centre modération", renderModerationCommandCenter);
  safeAdminStepSync("mission du jour", renderAdminMissionControl);
}

function resetAdminModerationCounters() {
  Object.keys(adminModerationCounters).forEach((key) => {
    adminModerationCounters[key] = 0;
  });
  adminModerationErrors.clear();
  renderAdminModerationBadge();
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
  resetAdminModerationCounters();

  document.getElementById("premium-container")?.replaceChildren();
  document.getElementById("quality-control-grid")?.replaceChildren();
  document.getElementById("quality-control-list")?.replaceChildren();
  document.getElementById("control-stats-grid")?.replaceChildren();
  document.getElementById("control-region-list")?.replaceChildren();
  document.getElementById("control-type-list")?.replaceChildren();
  document.getElementById("control-security-grid")?.replaceChildren();
  document.getElementById("testimonials-admin-panel")?.remove();
  document.getElementById("stats-testimonials-card")?.remove();
  document.getElementById("tab-social")?.replaceChildren();
  resetAdminExportsPanel();
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

    if (target === "exports") {
      loadAdminExportsDashboard();
    }
  });
}



function bindMobileSwipeTabs() {
  // V9.6 : swipe mobile désactivé.
  // Les onglets admin restent accessibles uniquement par clic/tap,
  // pour éviter les changements involontaires lors du défilement.
}

/* DASHBOARD */

async function loadDashboard() {
  if (!(await ensureAdminSession())) return;

  await safeAdminStep("chargement événements", loadEvents);
  await safeAdminStep("chargement indicateur mise en avant", loadNewsletterCount);
  await safeAdminStep("chargement visites", loadVisitsCount);
  // V9.1 : chargement sobre des zones prioritaires.
  // Limité aux 100 dernières lignes pour éviter un tableau de bord coûteux.
  await safeAdminStep("chargement zones prioritaires", loadLocationTracking);
  await safeAdminStep("chargement exports", loadAdminExportsDashboard);

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
  safeAdminStepSync("mission du jour", renderAdminMissionControl);
  safeAdminStepSync("actions prioritaires", renderPriorityActionPanel);
  safeAdminStepSync("historique admin", renderAdminActionHistory);
  safeAdminStepSync("centre modération", renderModerationCommandCenter);
  safeAdminStepSync("liste événements", renderEvents);
  safeAdminStepSync("premium", renderPremiumDashboard);
  safeAdminStepSync("réseaux", renderSocialUpcoming);
  safeAdminStepSync("observatoire", renderPriorityZones);
  safeAdminStepSync("qualité", renderQualityControlCenter);
  safeAdminStepSync("statistiques cockpit", renderStatsControlCenter);
  safeAdminStepSync("sécurité cockpit", renderSecurityControlCenter);
  safeAdminStepSync("diagnostic santé", renderAdminHealthDiagnostics);
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
  const archiveMode = getArchiveMode();
  const includeArchives = archiveMode !== "current";
  const today = new Date().toISOString().slice(0, 10);

  let query = supabaseClient
    .from("events")
    .select(ADMIN_EVENTS_COLUMNS);

  if (!includeArchives) {
    query = query.or(`and(validated.eq.false,rejected.eq.false),start_date.gte.${today},end_date.gte.${today}`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(includeArchives ? 500 : 250);

  if (error) {
    console.error(error);
    allEvents = [];
    showToast("Erreur chargement événements");
    return;
  }

  archiveEventsLoaded = includeArchives;
  allEvents = Array.isArray(data) ? data : [];
}

async function handleArchiveFilterChange() {
  if (!(await ensureAdminSession())) return;

  const archiveMode = getArchiveMode();
  const needsArchives = archiveMode !== "current";

  if (needsArchives !== archiveEventsLoaded) {
    await safeAdminStep("chargement archives événements", loadEvents);
    refreshAdminViews();

    if (adminMapRequested) {
      safeAdminStepSync("carte admin", initMap);
    }

    showToast(needsArchives ? "Archives événements chargées" : "Archives repliées");
    return;
  }

  renderEvents();
}

function getArchiveMode() {
  return filterArchive?.value || "current";
}

function isPendingEvent(event) {
  return !event?.validated && !event?.rejected;
}

function isPastEvent(event) {
  const dateValue = event?.end_date || event?.start_date || "";
  if (!dateValue) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDate = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(eventDate.getTime())) return false;

  return eventDate < today;
}

function isCurrentAdminEvent(event) {
  return isPendingEvent(event) || !isPastEvent(event);
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
      .select(ADMIN_LOCATION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    locationRows = Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn("Zones prioritaires indisponibles :", error);
    locationRows = [];
  }
}

function updateStats() {
  const pending = allEvents.filter(
    (event) => !event.validated && !event.rejected
  );

  if (statsEvents) statsEvents.textContent = allEvents.length;
  if (statsPending) statsPending.textContent = pending.length;
  updateAdminModerationCounter("events", pending.length);
  if (statsFeatured) statsFeatured.textContent = String((allEvents || []).filter((event) => !!event.featured).length);
if (eventsCount) {
    eventsCount.textContent = `${getFilteredEvents().length} éléments`;
  }
}

/* MISSION DU JOUR / MODÉRATION UNIFIÉE */

function getAdminModerationTotal() {
  return Object.values(adminModerationCounters)
    .reduce((sum, count) => sum + Number(count || 0), 0);
}

function renderAdminMissionControl() {
  const overviewPanel = document.getElementById("tab-overview");
  const statsGrid = overviewPanel?.querySelector(".stats-grid");

  if (!overviewPanel || !statsGrid) return;

  let panel = document.getElementById("admin-mission-panel");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "admin-mission-panel";
    panel.className = "admin-panel admin-mission-panel";
    statsGrid.insertAdjacentElement("afterend", panel);
  }

  const buckets = getControlBuckets();
  const moderationTotal = getAdminModerationTotal();
  const criticalTotal = buckets.missingCoords.length + buckets.featuredPast.length + buckets.qualityLow.length;
  const nextAction = getAdminMissionNextAction(buckets, moderationTotal);

  panel.innerHTML = `
    <div class="admin-mission-copy">
      <span class="admin-mission-kicker">Mission du jour</span>
      <h3>${escapeHtml(nextAction.title)}</h3>
      <p>${escapeHtml(nextAction.text)}</p>
    </div>

    <div class="admin-mission-grid" aria-label="Synthèse du centre de contrôle">
      ${renderMissionTile("Modération", moderationTotal, "events", moderationTotal ? "warning" : "ok")}
      ${renderMissionTile("Qualité", buckets.qualityLow.length, "quality-low", buckets.qualityLow.length ? "danger" : "ok")}
      ${renderMissionTile("GPS", buckets.missingCoords.length, "missing-coords", buckets.missingCoords.length ? "danger" : "ok")}
      ${renderMissionTile("Publication", buckets.soon.length, "soon", buckets.soon.length ? "info" : "neutral")}
      ${renderMissionTile("Santé", criticalTotal, "settings", criticalTotal ? "warning" : "ok")}
    </div>
  `;

  panel.querySelectorAll("[data-mission-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.missionAction || "";

      if (action === "events") {
        switchAdminTab("moderation");
        return;
      }

      if (action === "settings") {
        switchAdminTab("settings");
        return;
      }

      if (["quality-low", "missing-coords", "soon"].includes(action)) {
        switchAdminTab("quality");
        if (qualityFocusSelect) qualityFocusSelect.value = action;
        renderQualityControlCenter();
        return;
      }

      switchAdminTab("overview");
    });
  });
}

function getAdminMissionNextAction(buckets, moderationTotal) {
  if (moderationTotal > 0) {
    return {
      title: "Commencer par la modération",
      text: `${moderationTotal} élément${moderationTotal > 1 ? "s" : ""} attendent une décision.`
    };
  }

  if (buckets.missingCoords.length > 0) {
    const count = buckets.missingCoords.length;
    return {
      title: "Sécuriser la carte",
      text: `${count} fiche${count > 1 ? "s" : ""} validée${count > 1 ? "s" : ""} manque${count > 1 ? "nt" : ""} de coordonnées.`
    };
  }

  if (buckets.qualityLow.length > 0) {
    return {
      title: "Renforcer les fiches faibles",
      text: `${buckets.qualityLow.length} événement${buckets.qualityLow.length > 1 ? "s" : ""} peuvent gagner en lisibilité.`
    };
  }

  if (buckets.soon.length > 0) {
    return {
      title: "Préparer les prochaines publications",
      text: `${buckets.soon.length} événement${buckets.soon.length > 1 ? "s" : ""} arrivent sous 14 jours.`
    };
  }

  return {
    title: "Centre de contrôle stable",
    text: "Aucune urgence détectée sur les données chargées."
  };
}

function renderMissionTile(label, value, action, tone) {
  return `
    <button class="admin-mission-tile is-${escapeHtml(tone || "neutral")}" type="button" data-mission-action="${escapeHtml(action)}">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderModerationCommandCenter() {
  const moderationTab = document.getElementById("tab-moderation");
  if (!moderationTab) return;

  let panel = document.getElementById("admin-moderation-command-center");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "admin-moderation-command-center";
    panel.className = "admin-panel admin-moderation-command-center";
    moderationTab.prepend(panel);
  }

  const pendingEvents = adminModerationCounters.events || 0;
  const pendingTestimonials = adminModerationCounters.testimonials || 0;
  const pendingAuthorRequests = adminModerationCounters.authorRequests || 0;
  const total = pendingEvents + pendingTestimonials + pendingAuthorRequests;
  const hasError = adminModerationErrors.size > 0;

  panel.innerHTML = `
    <div class="section-head">
      <h3>FILE DE MODÉRATION</h3>
      <span>${hasError ? "Un compteur est indisponible" : `${total} élément${total > 1 ? "s" : ""} à traiter`}</span>
    </div>

    <div class="moderation-command-grid">
      ${renderModerationCommandCard("Événements", pendingEvents, "pending-events", pendingEvents ? "warning" : "ok", "Nouvelles propositions")}
      ${renderModerationCommandCard("Demandes auteurs", pendingAuthorRequests, "author-requests", pendingAuthorRequests ? "warning" : "ok", "Présence déclarée")}
      ${renderModerationCommandCard("Témoignages", pendingTestimonials, "testimonials", pendingTestimonials ? "warning" : "ok", "Souvenirs à publier")}
      ${renderModerationCommandCard("Total", hasError ? "!" : total, "all", hasError ? "danger" : total ? "warning" : "ok", hasError ? "À vérifier" : "Vue globale")}
    </div>
  `;

  panel.querySelectorAll("[data-moderation-action]").forEach((button) => {
    button.addEventListener("click", () => {
      handleModerationCommand(button.dataset.moderationAction || "all");
    });
  });
}

function renderModerationCommandCard(label, value, action, tone, detail) {
  return `
    <button class="moderation-command-card is-${escapeHtml(tone || "neutral")}" type="button" data-moderation-action="${escapeHtml(action)}">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(detail || "")}</small>
    </button>
  `;
}

function handleModerationCommand(action) {
  if (action === "pending-events") {
    applyPriorityAction("pending");
    return;
  }

  if (action === "author-requests") {
    switchAdminTab("moderation");
    scrollToAdminPanel("author-requests-admin-panel");
    return;
  }

  if (action === "testimonials") {
    switchAdminTab("moderation");
    scrollToAdminPanel("testimonials-admin-panel");
    return;
  }

  switchAdminTab("moderation");
}

function switchAdminTab(target) {
  document.querySelector(`.admin-tab[data-tab="${target}"]`)?.click();
}

function scrollToAdminPanel(id) {
  const panel = document.getElementById(id);

  if (!panel) {
    showToast("Module en cours de chargement");
    return;
  }

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* ACTIONS PRIORITAIRES */

function renderPriorityActionPanel() {
  const overviewPanel = document.getElementById("tab-overview");
  const statsGrid = overviewPanel?.querySelector(".stats-grid");

  if (!overviewPanel || !statsGrid) return;

  let panel = document.getElementById("admin-action-priority-panel");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "admin-action-priority-panel";
    panel.className = "admin-action-priority-panel";
    (document.getElementById("admin-mission-panel") || statsGrid).insertAdjacentElement("afterend", panel);
  }

  const pending = allEvents.filter((event) => isPendingEvent(event));
  const upcoming = allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event));
  const missingImage = upcoming.filter((event) => !event.image_url);
  const missingCoords = upcoming.filter((event) => !hasEventCoords(event));
  const soon = upcoming.filter((event) => isUpcomingWithinDays(event, 14));
  const featuredPast = allEvents.filter((event) => event.featured && isPastEvent(event));

  panel.innerHTML = `
    <div class="admin-action-priority-head">
      <strong>À traiter maintenant</strong>
      <small>Raccourcis éditoriaux sans charger d’images</small>
    </div>

    <div class="admin-action-priority-grid">
      ${renderPriorityActionCard("pending", pending.length, "Événements en attente", pending.length ? "is-warning" : "is-ok")}
      ${renderPriorityActionCard("missing-image", missingImage.length, "Validés sans image", missingImage.length ? "is-warning" : "is-ok")}
      ${renderPriorityActionCard("missing-coords", missingCoords.length, "Validés sans coordonnées", missingCoords.length ? "is-danger" : "is-ok")}
      ${renderPriorityActionCard("soon", soon.length, "Dans les 14 jours", soon.length ? "is-warning" : "is-ok")}
      ${renderPriorityActionCard("featured-past", featuredPast.length, "Mis en avant passés", featuredPast.length ? "is-danger" : "is-ok")}
      ${renderPriorityActionCard("quality-low", upcoming.filter((event) => getEventQuality(event).score < 55).length, "Qualité faible", upcoming.filter((event) => getEventQuality(event).score < 55).length ? "is-danger" : "is-ok")}
      ${renderPriorityActionCard("communication", upcoming.filter((event) => isUpcomingWithinDays(event, 30) && getEventQuality(event).score >= 55).length, "Posts à préparer", upcoming.filter((event) => isUpcomingWithinDays(event, 30) && getEventQuality(event).score >= 55).length ? "is-warning" : "is-ok")}
    </div>
  `;

  panel.querySelectorAll("[data-priority-action]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPriorityAction(button.dataset.priorityAction);
    });
  });
}

function renderPriorityActionCard(action, count, label, className) {
  return `
    <button
      type="button"
      class="admin-action-priority-card ${className || ""}"
      data-priority-action="${escapeHtml(action)}"
    >
      <b>${count}</b>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function applyPriorityAction(action) {
  const eventsTab = document.querySelector('.admin-tab[data-tab="events"]');
  eventsTab?.click();

  if (filterArchive) {
    filterArchive.value = "current";
  }

  if (filterType) {
    filterType.value = "";
  }

  if (searchInput) {
    searchInput.value = "";
  }

  if (filterStatus) {
    if (action === "pending") {
      filterStatus.value = "pending";
    } else if (action === "missing-image") {
      filterStatus.value = "missing-image";
    } else if (action === "featured-past") {
      filterStatus.value = "featured";
      if (filterArchive) filterArchive.value = "past";
    } else {
      filterStatus.value = "";
    }
  }

  if (action === "missing-coords") {
    renderCustomAdminEventList(
      allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event) && !hasEventCoords(event)),
      "Événements validés sans coordonnées"
    );
    return;
  }

  if (action === "soon") {
    renderCustomAdminEventList(
      allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event) && isUpcomingWithinDays(event, 14)),
      "Événements dans les 14 prochains jours"
    );
    return;
  }

  if (action === "featured-past") {
    renderCustomAdminEventList(
      allEvents.filter((event) => event.featured && isPastEvent(event)),
      "Événements mis en avant déjà passés"
    );
    return;
  }

  if (action === "quality-low") {
    renderCustomAdminEventList(
      allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event) && getEventQuality(event).score < 55),
      "Événements à qualité faible"
    );
    return;
  }

  if (action === "communication") {
    renderCustomAdminEventList(
      allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event) && isUpcomingWithinDays(event, 30) && getEventQuality(event).score >= 55),
      "Posts réseaux à préparer"
    );
    return;
  }

  renderEvents();

  document.getElementById("tab-events")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderCustomAdminEventList(events, label) {
  if (!eventsContainer) return;

  if (eventsCount) {
    eventsCount.textContent =
      `${events.length} élément${events.length > 1 ? "s" : ""} · ${label}`;
  }

  if (!events.length) {
    eventsContainer.innerHTML = `
      <article class="event-card">
        Aucun élément pour ce raccourci.
      </article>
    `;
    return;
  }

  eventsContainer.innerHTML = events.map(renderEventCard).join("");
  bindEventActions();

  document.getElementById("tab-events")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* CENTRE DE CONTRÔLE */

function getControlBuckets() {
  const upcoming = allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event));
  const pending = allEvents.filter((event) => isPendingEvent(event));
  const rejected = allEvents.filter((event) => event.rejected);
  const missingImage = upcoming.filter((event) => !event.image_url);
  const missingCoords = upcoming.filter((event) => !hasEventCoords(event));
  const soon = upcoming.filter((event) => isUpcomingWithinDays(event, 14));
  const featured = allEvents.filter((event) => event.featured && !event.rejected);
  const featuredPast = allEvents.filter((event) => event.featured && isPastEvent(event));
  const qualityLow = upcoming.filter((event) => getEventQuality(event).score < 55);
  const noWebsite = upcoming.filter((event) => !event.website);

  return {
    upcoming,
    pending,
    rejected,
    missingImage,
    missingCoords,
    soon,
    featured,
    featuredPast,
    qualityLow,
    noWebsite
  };
}

function renderControlMetric(label, value, tone, detail = "") {
  return `
    <article class="cockpit-status-cell is-${escapeHtml(tone || "neutral")}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </article>
  `;
}

function renderQualityControlCenter() {
  if (!qualityControlGrid || !qualityControlList) return;

  const buckets = getControlBuckets();
  const focus = qualityFocusSelect?.value || "all";
  const qualityReady = buckets.upcoming.length - buckets.qualityLow.length;

  if (qualityControlCount) {
    qualityControlCount.textContent =
      `${buckets.pending.length} à modérer · ${buckets.qualityLow.length} qualité faible`;
  }

  qualityControlGrid.innerHTML = [
    renderControlMetric("En attente", buckets.pending.length, buckets.pending.length ? "warning" : "ok", "à valider"),
    renderControlMetric("Sans image", buckets.missingImage.length, buckets.missingImage.length ? "purple" : "ok", "validés à compléter"),
    renderControlMetric("Sans GPS", buckets.missingCoords.length, buckets.missingCoords.length ? "danger" : "ok", "carte et SEO local"),
    renderControlMetric("Qualité faible", buckets.qualityLow.length, buckets.qualityLow.length ? "danger" : "ok", `${qualityReady} fiches solides`),
    renderControlMetric("Sous 14 jours", buckets.soon.length, buckets.soon.length ? "info" : "neutral", "priorité publication"),
    renderControlMetric("Mis en avant passés", buckets.featuredPast.length, buckets.featuredPast.length ? "warning" : "ok", "à nettoyer")
  ].join("");

  if (focus === "all") {
    const rows = [
      ["pending", "Événements en attente", buckets.pending.length, "Modération prioritaire", "warning"],
      ["missing-image", "Validés sans image", buckets.missingImage.length, "Impact visuel et réseaux", "purple"],
      ["missing-coords", "Validés sans coordonnées", buckets.missingCoords.length, "Carte et pages régionales", "danger"],
      ["quality-low", "Qualité faible", buckets.qualityLow.length, "Titre, image, description, lien", "danger"],
      ["soon", "À venir sous 14 jours", buckets.soon.length, "Communication rapide", "info"],
      ["featured-past", "Mis en avant passés", buckets.featuredPast.length, "Nettoyage premium", "warning"]
    ];

    qualityControlList.innerHTML = rows.map(([action, label, count, detail, tone]) => `
      <button class="cockpit-focus-row is-${escapeHtml(tone)}" type="button" data-quality-action="${escapeHtml(action)}">
        <b>${escapeHtml(count)}</b>
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(detail)}</small>
      </button>
    `).join("");
  } else {
    const rows = getQualityFocusRows(focus);

    if (!rows.length) {
      qualityControlList.innerHTML = `
        <div class="cockpit-empty-state">
          Aucun élément dans cette vue.
        </div>
      `;
    } else {
      qualityControlList.innerHTML = `
        <div class="cockpit-focus-toolbar">
          <strong>${rows.length} élément${rows.length > 1 ? "s" : ""}</strong>
          <button class="cyber-btn-secondary" type="button" data-quality-action="${escapeHtml(focus)}">
            Ouvrir dans événements
          </button>
        </div>
        ${rows.slice(0, 24).map(renderQualityPreviewRow).join("")}
      `;
    }
  }

  qualityControlList.querySelectorAll("[data-quality-action]").forEach((button) => {
    button.addEventListener("click", () => {
      applyQualityFocusAction(button.dataset.qualityAction || "all");
    });
  });
}

function getQualityFocusRows(focus) {
  const buckets = getControlBuckets();

  if (focus === "pending") return buckets.pending;
  if (focus === "missing-image") return buckets.missingImage;
  if (focus === "missing-coords") return buckets.missingCoords;
  if (focus === "quality-low") return buckets.qualityLow;
  if (focus === "soon") return buckets.soon;
  if (focus === "featured-past") return buckets.featuredPast;

  return [];
}

function renderQualityPreviewRow(event) {
  const quality = getEventQuality(event);

  return `
    <article class="cockpit-preview-row is-${escapeHtml(quality.level)}">
      <div>
        <strong>${escapeHtml(event.title || "Sans titre")}</strong>
        <span>${escapeHtml(event.city || "Ville inconnue")} · ${formatDate(event.start_date)} · ${escapeHtml(event.type || "Type inconnu")}</span>
      </div>
      <b>${quality.score}%</b>
    </article>
  `;
}

function applyQualityFocusAction(action) {
  const rows = getQualityFocusRows(action);

  if (!rows.length) {
    applyPriorityAction(action);
    return;
  }

  document.querySelector('.admin-tab[data-tab="events"]')?.click();
  renderCustomAdminEventList(rows, getQualityFocusLabel(action));
}

function getQualityFocusLabel(action) {
  const labels = {
    pending: "Événements en attente",
    "missing-image": "Événements validés sans image",
    "missing-coords": "Événements validés sans coordonnées",
    "quality-low": "Événements à qualité faible",
    soon: "Événements dans les 14 prochains jours",
    "featured-past": "Événements mis en avant déjà passés"
  };

  return labels[action] || "Vue qualité";
}

function renderStatsControlCenter() {
  if (!controlStatsGrid || !controlRegionList || !controlTypeList) return;

  const buckets = getControlBuckets();
  const total = allEvents.length;
  const completion = buckets.upcoming.length
    ? Math.round(((buckets.upcoming.length - buckets.qualityLow.length) / buckets.upcoming.length) * 100)
    : 100;

  if (controlStatsCount) {
    controlStatsCount.textContent = `${total} événements analysés`;
  }

  controlStatsGrid.innerHTML = [
    renderControlMetric("Total", total, "neutral", "chargés admin"),
    renderControlMetric("À venir", buckets.upcoming.length, "ok", "publics actifs"),
    renderControlMetric("Rejetés", buckets.rejected.length, buckets.rejected.length ? "danger" : "neutral", "historique"),
    renderControlMetric("Mis en avant", buckets.featured.length, buckets.featured.length ? "purple" : "neutral", "sélection éditoriale"),
    renderControlMetric("Complétude", `${completion}%`, completion >= 80 ? "ok" : completion >= 55 ? "warning" : "danger", "qualité des fiches"),
    renderControlMetric("Localisations", locationRows.length, locationRows.length ? "info" : "neutral", "signaux récents")
  ].join("");

  controlRegionList.innerHTML = renderCockpitRanking(countByField(allEvents, "region"), "Aucune région");
  controlTypeList.innerHTML = renderCockpitRanking(countByField(allEvents, "type"), "Aucun type");
}

function countByField(rows, key) {
  const counts = new Map();

  rows.forEach((row) => {
    const label = String(row?.[key] || "Non renseigné").trim() || "Non renseigné";
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}

function renderCockpitRanking(rows, emptyLabel) {
  if (!rows.length) {
    return `<div class="cockpit-empty-state">${escapeHtml(emptyLabel)}</div>`;
  }

  const max = Math.max(...rows.map((row) => row.count), 1);

  return rows.slice(0, 10).map((row) => `
    <div class="cockpit-ranking-row">
      <div>
        <strong>${escapeHtml(row.label)}</strong>
        <span>${row.count} événement${row.count > 1 ? "s" : ""}</span>
      </div>
      <i style="--rank-width:${Math.max(8, Math.round((row.count / max) * 100))}%"></i>
    </div>
  `).join("");
}

function renderSecurityControlCenter() {
  if (!controlSecurityGrid) return;

  controlSecurityGrid.innerHTML = [
    renderControlMetric("Backup", "OK", "ok", "local vérifié"),
    renderControlMetric("RLS", "OK", "ok", "policies durcies"),
    renderControlMetric("Storage", "OK", "ok", "uploads limités"),
    renderControlMetric("Admin", "OK", "ok", "helper privé"),
    renderControlMetric("À finir", "2", "warning", "unaccent + Auth password"),
    renderControlMetric("Rollback", "Prêt", "info", "SQL exporté")
  ].join("");
}

function renderAdminHealthDiagnostics() {
  const settingsPanel = document.getElementById("tab-settings");
  if (!settingsPanel) return;

  let panel = document.getElementById("admin-health-diagnostics");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "admin-health-diagnostics";
    panel.className = "admin-panel admin-health-diagnostics";
    settingsPanel.appendChild(panel);
  }

  const buckets = getControlBuckets();
  const checks = [
    {
      label: "Événements passés mis en avant",
      value: buckets.featuredPast.length,
      tone: buckets.featuredPast.length ? "warning" : "ok",
      detail: buckets.featuredPast.length ? "À retirer ou renouveler" : "Aucun nettoyage urgent"
    },
    {
      label: "Fiches publiques sans image",
      value: buckets.missingImage.length,
      tone: buckets.missingImage.length ? "purple" : "ok",
      detail: "Impact visuel"
    },
    {
      label: "Fiches publiques sans GPS",
      value: buckets.missingCoords.length,
      tone: buckets.missingCoords.length ? "danger" : "ok",
      detail: "Carte et recherche régionale"
    },
    {
      label: "Sites officiels manquants",
      value: buckets.noWebsite.length,
      tone: buckets.noWebsite.length ? "warning" : "ok",
      detail: "Confiance utilisateur"
    },
    {
      label: "Qualité faible",
      value: buckets.qualityLow.length,
      tone: buckets.qualityLow.length ? "danger" : "ok",
      detail: "À compléter avant diffusion"
    },
    {
      label: "Modération",
      value: getAdminModerationTotal(),
      tone: getAdminModerationTotal() ? "warning" : "ok",
      detail: "File visiteurs"
    }
  ];

  panel.innerHTML = `
    <div class="section-head">
      <h3>DIAGNOSTIC SANTÉ DU SITE</h3>
      <span>Contrôles calculés sans modifier Supabase</span>
    </div>

    <div class="cockpit-status-grid">
      ${checks.map((check) => renderControlMetric(check.label, check.value, check.tone, check.detail)).join("")}
    </div>

    <div class="admin-health-actions">
      <button class="cyber-btn-secondary" type="button" data-health-action="missing-image">Voir sans image</button>
      <button class="cyber-btn-secondary" type="button" data-health-action="missing-coords">Voir sans GPS</button>
      <button class="cyber-btn-secondary" type="button" data-health-action="featured-past">Nettoyer mis en avant</button>
    </div>
  `;

  panel.querySelectorAll("[data-health-action]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPriorityAction(button.dataset.healthAction || "");
    });
  });
}

function getAdminActionLog() {
  try {
    const rows = JSON.parse(localStorage.getItem(ADMIN_ACTION_LOG_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function recordAdminAction(label, detail = "") {
  const rows = getAdminActionLog();
  const next = [
    {
      label: String(label || "Action admin"),
      detail: String(detail || ""),
      created_at: new Date().toISOString()
    },
    ...rows
  ].slice(0, 20);

  localStorage.setItem(ADMIN_ACTION_LOG_KEY, JSON.stringify(next));
  renderAdminActionHistory();
}

function renderAdminActionHistory() {
  const overviewPanel = document.getElementById("tab-overview");
  const anchor = document.getElementById("admin-action-priority-panel") || document.getElementById("admin-mission-panel");

  if (!overviewPanel || !anchor) return;

  let panel = document.getElementById("admin-action-history-panel");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "admin-action-history-panel";
    panel.className = "admin-panel admin-action-history-panel";
    anchor.insertAdjacentElement("afterend", panel);
  }

  const rows = getAdminActionLog().slice(0, 6);

  panel.innerHTML = `
    <div class="section-head">
      <h3>DERNIÈRES ACTIONS</h3>
      <span>Historique local de ce navigateur</span>
    </div>

    ${
      rows.length
        ? `<div class="admin-action-history-list">${rows.map(renderAdminActionHistoryRow).join("")}</div>`
        : `<p class="priority-empty">Les validations, refus, modifications et mises en avant apparaîtront ici.</p>`
    }
  `;
}

function renderAdminActionHistoryRow(row) {
  return `
    <article class="admin-action-history-row">
      <div>
        <strong>${escapeHtml(row.label)}</strong>
        ${row.detail ? `<span>${escapeHtml(row.detail)}</span>` : ""}
      </div>
      <time>${escapeHtml(formatRelativeAdminTime(row.created_at))}</time>
    </article>
  `;
}

function formatRelativeAdminTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date inconnue";

  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));

  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}


/* PRIORITY ZONES */

function renderPriorityZones() {
  renderTerritorialCoverage();
  renderEditorialPriorities();
  renderVisitorSignals();
  bindObservatoryActions();
}


function renderTerritorialCoverage() {
  if (!priorityCities) return;

  const regions = getKnownRegions();
  const rows = regions.map((region) => {
    const regionEvents = allEvents.filter((event) => cleanLabel(event.region) === region);
    const upcoming = regionEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event));
    const pending = regionEvents.filter((event) => isPendingEvent(event));
    const missingImage = upcoming.filter((event) => !event.image_url);
    const missingCoords = upcoming.filter((event) => !hasEventCoords(event));

    return {
      region,
      upcoming: upcoming.length,
      pending: pending.length,
      missingImage: missingImage.length,
      missingCoords: missingCoords.length,
      score: upcoming.length + pending.length
    };
  }).sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.region.localeCompare(b.region, "fr");
  });

  const empty = rows.filter((row) => row.upcoming === 0 && row.pending === 0);
  const weak = rows.filter((row) => row.upcoming > 0 && row.upcoming <= 2);
  const covered = rows.filter((row) => row.upcoming > 2);

  priorityCities.innerHTML = `
    <div class="priority-trend-box">
      <strong>${covered.length}/${regions.length}</strong>
      <span>régions bien couvertes</span>
    </div>

    <div class="priority-mini">
      <b>${empty.length}</b> région(s) sans événement à venir ou en attente.
    </div>

    ${renderRegionTable(rows.slice(0, 7))}
  `;
}

function renderEditorialPriorities() {
  if (!priorityDevices) return;

  const pending = allEvents.filter((event) => isPendingEvent(event));
  const upcoming = allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event));
  const missingImage = upcoming.filter((event) => !event.image_url);
  const missingCoords = upcoming.filter((event) => !hasEventCoords(event));
  const noWebsite = upcoming.filter((event) => !event.website);

  priorityDevices.innerHTML = `
    <div class="priority-trend-box">
      <strong>${pending.length}</strong>
      <span>événement(s) en attente</span>
    </div>

    <div class="priority-mini">
      <b>${missingImage.length}</b> sans image ·
      <b>${missingCoords.length}</b> sans coordonnées ·
      <b>${noWebsite.length}</b> sans site officiel
    </div>

    <div class="observatory-actions">
      <button type="button" data-observatory-map="pending">Carte des attentes</button>
      <button type="button" data-observatory-map="missing-image">Sans image</button>
      <button type="button" data-observatory-map="missing-coords">Sans coordonnées</button>
    </div>
  `;
}

function renderVisitorSignals() {
  if (!priorityTrend) return;

  const recent = getRecentLocationRows(7);
  const topCities = countBy(
    recent
      .map((row) => cleanLabel(row.city || row.region || "Zone inconnue"))
      .filter(Boolean)
  );

  const topCity = Object.entries(topCities)
    .sort((a, b) => b[1] - a[1])[0];

  const deviceCounts = countBy(
    locationRows.map((row) => cleanLabel(row.device || "inconnu"))
  );

  const deviceSummary = Object.entries(deviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${escapeHtml(name)} : ${count}`)
    .join(" · ");

  priorityTrend.innerHTML = `
    <div class="priority-trend-box">
      <strong>${recent.length}</strong>
      <span>localisation(s) sur 7 jours</span>
    </div>

    ${
      topCity
        ? `
          <div class="priority-mini">
            Zone visiteur la plus active :
            <b>${escapeHtml(topCity[0])}</b>
          </div>
        `
        : `
          <div class="priority-mini">
            Les signaux visiteurs apparaîtront après les clics sur “Me localiser”.
          </div>
        `
    }

    <div class="priority-mini">
      ${deviceSummary || "Aucune donnée appareil exploitable pour le moment."}
    </div>

    <div class="observatory-actions">
      <button type="button" data-observatory-map="visitors">Carte visiteurs</button>
      <button type="button" data-observatory-map="upcoming">Carte événements à venir</button>
    </div>
  `;
}

function renderRegionTable(rows) {
  if (!rows.length) {
    return `<p class="priority-empty">Aucune région à analyser.</p>`;
  }

  return `
    <div class="observatory-region-list">
      ${rows.map((row) => `
        <div class="priority-row">
          <div class="priority-row-head">
            <strong>${escapeHtml(row.region)}</strong>
            <span>${row.upcoming} à venir</span>
          </div>
          <div class="priority-mini">
            ${row.pending} en attente · ${row.missingImage} sans image · ${row.missingCoords} sans GPS
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function bindObservatoryActions() {
  document.querySelectorAll("[data-observatory-map]").forEach((button) => {
    button.addEventListener("click", () => {
      adminMapMode = button.dataset.observatoryMap || "pending";

      if (!adminMapRequested) {
        expandAdminMap();
      } else {
        initMap();
        if (adminMapStatus) adminMapStatus.textContent = getAdminMapModeLabel();
      }

      adminMapPanel?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  });
}

function getKnownRegions() {
  const defaults = [
    "Auvergne-Rhône-Alpes",
    "Bourgogne-Franche-Comté",
    "Bretagne",
    "Centre-Val de Loire",
    "Corse",
    "Grand Est",
    "Hauts-de-France",
    "Île-de-France",
    "Normandie",
    "Nouvelle-Aquitaine",
    "Occitanie",
    "Pays de la Loire",
    "Provence-Alpes-Côte d’Azur"
  ];

  const fromEvents = allEvents
    .map((event) => cleanLabel(event.region))
    .filter(Boolean);

  return Array.from(new Set([...defaults, ...fromEvents]))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

function hasEventCoords(event) {
  return (
    Number.isFinite(Number(event?.lat)) &&
    Number.isFinite(Number(event?.lng))
  );
}

function getRecentLocationRows(days = 7) {
  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - days);

  return locationRows.filter((row) => {
    if (!row.created_at) return false;
    return new Date(row.created_at) >= since;
  });
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
  const archiveMode = getArchiveMode();
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

    if (archiveMode === "current" && !isCurrentAdminEvent(event)) return false;
    if (archiveMode === "past" && (!isPastEvent(event) || isPendingEvent(event))) return false;

    if (status === "pending") return !event.validated && !event.rejected;
    if (status === "validated") return !!event.validated;
    if (status === "rejected") return !!event.rejected;
    if (status === "featured") return !!event.featured;
    if (status === "premium-ready") return isPremiumCandidate(event);
    if (status === "missing-image") return !event.image_url;

    return true;
  });
}


/* SCORE QUALITÉ ÉVÉNEMENT */

function getEventQuality(event) {
  const checks = [
    {
      key: "title",
      label: "titre",
      ok: String(event?.title || "").trim().length >= 5,
      points: 15
    },
    {
      key: "date",
      label: "date",
      ok: !!event?.start_date,
      points: 15
    },
    {
      key: "location",
      label: "ville/région",
      ok: !!event?.city && !!event?.region,
      points: 15
    },
    {
      key: "coords",
      label: "coordonnées",
      ok: hasEventCoords(event),
      points: 15
    },
    {
      key: "image",
      label: "image",
      ok: !!event?.image_url,
      points: 15
    },
    {
      key: "description",
      label: "description",
      ok: String(event?.description || "").trim().length >= 120,
      points: 15
    },
    {
      key: "website",
      label: "site officiel",
      ok: !!event?.website,
      points: 10
    }
  ];

  const score = checks.reduce((total, check) => {
    return total + (check.ok ? check.points : 0);
  }, 0);

  const missing = checks
    .filter((check) => !check.ok)
    .map((check) => check.label);

  const level =
    score >= 80
      ? "good"
      : score >= 55
        ? "medium"
        : "low";

  const label =
    level === "good"
      ? "Complet"
      : level === "medium"
        ? "À compléter"
        : "Faible";

  return {
    score,
    missing,
    level,
    label
  };
}

function renderEventQuality(event) {
  const quality = getEventQuality(event);

  return `
    <div class="quality-score is-${quality.level}">
      Qualité ${quality.score}% · ${escapeHtml(quality.label)}
    </div>
    ${
      quality.missing.length
        ? `<small class="quality-missing">Manque : ${escapeHtml(quality.missing.join(", "))}</small>`
        : ""
    }
  `;
}

function renderEventChecklist(event) {
  const descriptionLength = String(event?.description || "").trim().length;
  const checks = [
    ["Date", !!event?.start_date],
    ["Lieu", !!event?.city && !!event?.region],
    ["GPS", hasEventCoords(event)],
    ["Image", !!event?.image_url],
    ["Texte", descriptionLength >= 120],
    ["Site", !!event?.website]
  ];

  return `
    <div class="event-admin-checklist" aria-label="Checklist qualité événement">
      ${checks.map(([label, ok]) => renderEventChecklistChip(label, ok)).join("")}
    </div>
  `;
}

function renderEventChecklistChip(label, ok) {
  return `
    <span class="event-admin-check ${ok ? "is-ok" : "is-missing"}">
      <i aria-hidden="true">${ok ? "✓" : "!"}</i>
      ${escapeHtml(label)}
    </span>
  `;
}


/* RENDER EVENTS */

function renderEvents() {
  if (!eventsContainer) return;

  const events = getFilteredEvents();
  if (eventsCount) {
    const archiveMode = getArchiveMode();
    const archiveLabel = archiveMode === "all"
      ? " · archives incluses"
      : archiveMode === "past"
        ? " · passés uniquement"
        : " · actifs + en attente";
    eventsCount.textContent = `${events.length} élément${events.length > 1 ? "s" : ""}${archiveLabel}`;
  }

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
    <article class="${getEventCardClasses(event)}">

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

        ${renderEventQuality(event)}
        ${renderEventChecklist(event)}
      </div>

      <div class="event-actions">
        <button class="event-action validate" data-action="validate" data-id="${event.id}" type="button" title="Valider">✔ <span>Valider</span></button>
        <button class="event-action reject" data-action="reject" data-id="${event.id}" type="button" title="Refuser">✖ <span>Refuser</span></button>
        <button class="event-action featured" data-action="featured" data-id="${event.id}" type="button" title="${event.featured ? "Retirer la mise en avant" : "Mettre en avant"}">★ <span>${event.featured ? "Retirer" : "Avant"}</span></button>
        <button class="event-action edit" data-action="edit" data-id="${event.id}" type="button" title="Modifier">✎ <span>Modifier</span></button>
        <a class="event-action view" href="event.html?id=${encodeURIComponent(event.id)}" target="_blank" rel="noopener noreferrer" title="Voir la fiche">↗ <span>Voir</span></a>
        <button class="event-action social-copy" data-action="copy-social" data-id="${event.id}" type="button" title="Copier un texte réseaux">📣 <span>Com.</span></button>
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

function getEventCardClasses(event) {
  const classes = ["event-card", "event-card-with-image"];

  if (isPendingEvent(event)) classes.push("is-status-pending");
  if (event?.validated) classes.push("is-status-validated");
  if (event?.rejected) classes.push("is-status-rejected");
  if (event?.featured) classes.push("is-status-featured");
  if (!event?.image_url) classes.push("is-status-missing-image");
  if (event && isPastEvent(event)) classes.push("is-status-past");

  const quality = getEventQuality(event);
  classes.push(`is-quality-${quality.level}`);

  return classes.join(" ");
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
      if (action === "copy-social") await copySocialPost(id);
      if (action === "delete") await deleteRejectedEvent(id);
    });
  });
}


/* COMMUNICATION RÉSEAUX */

async function copySocialPost(id) {
  const event = allEvents.find((item) => String(item.id) === String(id));

  if (!event) {
    showToast("Événement introuvable");
    return;
  }

  const text = buildSocialPostText(event);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("Texte réseaux copié");
      return;
    }

    fallbackCopyText(text);
    showToast("Texte réseaux copié");
  } catch (error) {
    console.warn("Copie presse-papiers indisponible :", error);
    fallbackCopyText(text);
    showToast("Texte prêt à copier");
  }
}

function buildSocialPostText(event) {
  const title = cleanLabel(event.title || "Événement littéraire");
  const city = cleanLabel(event.city || "");
  const region = cleanLabel(event.region || "");
  const type = cleanLabel(event.type || "Rencontre littéraire");
  const date = formatDate(event.start_date);
  const location = [city, region].filter(Boolean).join(", ");
  const url = `https://dedicalivres.fr/event.html?id=${encodeURIComponent(event.id)}`;

  const prefix =
    event.type === "Dédicace"
      ? "📚 Dédicace à venir"
      : ["Salon", "Festival"].includes(event.type)
        ? "📚 Rendez-vous littéraire à venir"
        : "📚 Événement littéraire à venir";

  return `${prefix}

${title}

${date ? `📅 ${date}` : ""}
${location ? `📍 ${location}` : ""}
${type ? `🏷️ ${type}` : ""}

Retrouvez les informations complètes sur Dédicalivres :
${url}

#Dédicalivres #Livre #Lecture #AgendaLittéraire #Dédicace #SalonDuLivre`;
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
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
  recordAdminAction("Événement validé", eventActionLabel(id));
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
  recordAdminAction("Événement refusé", eventActionLabel(id));
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
  recordAdminAction(event.featured ? "Mise en avant retirée" : "Mise en avant ajoutée", eventActionLabel(id));
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
  recordAdminAction("Événement refusé supprimé", event.title || "Sans titre");
  showToast("Événement refusé supprimé");
}

function eventActionLabel(id) {
  const event = allEvents.find((item) => String(item.id) === String(id));
  return event?.title || "Événement";
}


/* MAP */


function ensureAdminMapControls() {
  if (!adminMapPanel || document.getElementById("admin-map-mode")) return;

  const controls = document.createElement("div");
  controls.className = "admin-map-observatory-controls";
  controls.innerHTML = `
    <label for="admin-map-mode">Affichage carte</label>
    <select id="admin-map-mode">
      <option value="pending">Événements en attente</option>
      <option value="missing-image">Événements sans image</option>
      <option value="missing-coords">Événements sans coordonnées</option>
      <option value="upcoming">Événements à venir</option>
      <option value="visitors">Localisations visiteurs</option>
      <option value="all">Tous les événements chargés</option>
    </select>
  `;

  adminMapToggle?.insertAdjacentElement("afterend", controls);

  const select = controls.querySelector("#admin-map-mode");
  if (select) {
    select.value = adminMapMode;
    select.addEventListener("change", () => {
      adminMapMode = select.value || "pending";
      initMap();
      if (adminMapStatus) adminMapStatus.textContent = getAdminMapModeLabel();
    });
  }
}

function getAdminMapModeLabel() {
  const labels = {
    pending: "Carte analytique · événements en attente",
    "missing-image": "Carte analytique · événements sans image",
    "missing-coords": "Carte analytique · événements sans coordonnées",
    upcoming: "Carte analytique · événements à venir",
    visitors: "Carte analytique · localisations visiteurs",
    all: "Carte analytique · tous les événements chargés"
  };

  return labels[adminMapMode] || labels.pending;
}

function getAdminMapEvents() {
  const upcoming = allEvents.filter((event) => event.validated && !event.rejected && !isPastEvent(event));

  if (adminMapMode === "pending") {
    return allEvents.filter((event) => isPendingEvent(event) && hasEventCoords(event));
  }

  if (adminMapMode === "missing-image") {
    return upcoming.filter((event) => !event.image_url && hasEventCoords(event));
  }

  if (adminMapMode === "missing-coords") {
    return [];
  }

  if (adminMapMode === "upcoming") {
    return upcoming.filter((event) => hasEventCoords(event));
  }

  if (adminMapMode === "all") {
    return allEvents.filter((event) => hasEventCoords(event));
  }

  return [];
}

function getAdminMapColor(event) {
  if (isPendingEvent(event)) return "#ffb020";
  if (!event.image_url) return "#ff6b35";
  if (event.type === "Dédicace") return "#16803c";
  if (event.type === "Festival") return "#ff6b35";
  if (event.type === "Salon") return "#3a1c71";
  return "#2f6fed";
}


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
    adminMapStatus.textContent = "Observatoire prioritaire · carte analytique chargée uniquement à la demande";
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
    adminMapStatus.textContent = getAdminMapModeLabel();
  }

  ensureAdminMapControls();
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

  ensureAdminMapControls();

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

  if (adminMapStatus) {
    adminMapStatus.textContent = getAdminMapModeLabel();
  }

  if (adminMapMode === "visitors") {
    locationRows
      .filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
      .forEach((row) => {
        const marker = L.circleMarker([Number(row.lat), Number(row.lng)], {
          radius: 7,
          color: "#19ff9c",
          fillColor: "#19ff9c",
          fillOpacity: 0.78
        });

        marker.bindPopup(`
          <strong>${escapeHtml(row.city || row.region || "Localisation visiteur")}</strong>
          <br>
          ${escapeHtml(row.device || "Appareil inconnu")}
          <br>
          ${escapeHtml(formatDate(row.created_at))}
        `);

        marker.addTo(markersLayer);
      });

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return;
  }

  if (adminMapMode === "missing-coords") {
    const missing = allEvents
      .filter((event) => event.validated && !event.rejected && !isPastEvent(event) && !hasEventCoords(event))
      .slice(0, 12);

    if (adminMapStatus) {
      adminMapStatus.textContent =
        missing.length
          ? `${missing.length} événement(s) sans coordonnées à compléter dans la liste`
          : "Aucun événement à venir sans coordonnées";
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return;
  }

  getAdminMapEvents().forEach((event) => {
    const color = getAdminMapColor(event);

    const marker = L.circleMarker([Number(event.lat), Number(event.lng)], {
      radius: isPendingEvent(event) ? 9 : 7,
      color,
      fillColor: color,
      fillOpacity: 0.85
    });

    marker.bindPopup(`
      <strong>${escapeHtml(event.title)}</strong>
      <br>
      ${escapeHtml([event.city, event.region].filter(Boolean).join(", "))}
      <br>
      ${escapeHtml(event.type || "")}
      <br>
      <a href="event.html?id=${encodeURIComponent(event.id)}" target="_blank" rel="noopener noreferrer">Voir la fiche</a>
    `);

    marker.addTo(markersLayer);
  });

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
        <button class="event-action social-copy" data-action="copy-social" data-id="${event.id}" type="button" title="Copier un texte réseaux">📣 <span>Com.</span></button>
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
    recordAdminAction("Événement modifié", payload.title || "Sans titre");
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
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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


/* =========================================================
   EXPORTS — Pack 3B : exploitation des fichiers classés
========================================================= */

const DEFAULT_EXPORTS_BASE_URL = "https://dedicalivres-daily-export.dedicalivres.workers.dev/exports";

let adminExportsLoadedAt = null;
let adminExportsLastPreview = "";
let adminExportsCache = {
  global: null,
  dedicaces: null,
  salons: null,
  autres: null
};

function getExportsBaseUrl() {
  return String(config.exportsBaseUrl || DEFAULT_EXPORTS_BASE_URL).replace(/\/+$/, "");
}

function getExportFileUrl(filename) {
  return `${getExportsBaseUrl()}/${String(filename).replace(/^\/+/, "")}`;
}

function bindAdminExportsPanel() {
  document.getElementById("exports-refresh-btn")?.addEventListener("click", async () => {
    if (!(await ensureAdminSession())) return;
    await loadAdminExportsDashboard(true);
  });

  document.getElementById("exports-preview-select")?.addEventListener("change", async () => {
    if (!(await ensureAdminSession())) return;
    await loadAdminExportPreview();
  });

  document.getElementById("exports-copy-preview-btn")?.addEventListener("click", async () => {
    if (!adminExportsLastPreview) {
      showToast("Aucun aperçu à copier");
      return;
    }

    try {
      await navigator.clipboard.writeText(adminExportsLastPreview);
      showToast("Aperçu copié");
    } catch (error) {
      fallbackCopyText(adminExportsLastPreview);
      showToast("Aperçu copié");
    }
  });

  hydrateAdminExportLinks();
  bindAdminExternalExportLinks();
}

function hydrateAdminExportLinks() {
  const links = {
    "exports-json-link": "events-latest.json",
    "exports-csv-link": "events-latest.csv",
    "exports-publications-link": "publications-latest.md",
    "exports-dedicaces-link": "dedicaces-latest.md",
    "exports-salons-link": "salons-latest.md",
    "exports-autres-link": "autres-evenements-latest.md",
    "exports-planning-link": "planning-publication-latest.md",
    "exports-weekend-link": "weekend-par-region-latest.md",
    "exports-instagram-all-link": "instagram/tous-evenements-latest.html",
    "exports-instagram-dedicaces-link": "instagram/dedicaces-latest.html",
    "exports-instagram-salons-link": "instagram/salons-latest.html",
    "exports-instagram-weekend-link": "instagram/weekend-regions-latest.html",
    "exports-design-story-dedicaces-link": "designs/story-dedicaces-latest.html",
    "exports-design-story-salons-link": "designs/story-salons-latest.html",
    "exports-design-square-dedicaces-link": "designs/square-dedicaces-latest.html",
    "exports-design-square-salons-link": "designs/square-salons-latest.html",
    "exports-design-wide-link": "designs/wide-evenements-latest.html"
  };

  for (const [id, filename] of Object.entries(links)) {
    const element = document.getElementById(id);
    if (element) {
      element.href = getExportFileUrl(filename);
      element.target = "_blank";
      element.rel = "noopener noreferrer";
      element.dataset.externalExportLink = "true";
    }
  }
}


function bindAdminExternalExportLinks() {
  document.querySelectorAll('[data-external-export-link="true"]').forEach((link) => {
    if (link.dataset.exportClickBound === "true") return;
    link.dataset.exportClickBound = "true";

    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href") || "";
      if (!href || href === "#") return;
      event.preventDefault();
      event.stopPropagation();
      window.open(href, "_blank", "noopener,noreferrer");
    });
  });
}

function resetAdminExportsPanel() {
  adminExportsLoadedAt = null;
  adminExportsLastPreview = "";
  adminExportsCache = {
    global: null,
    dedicaces: null,
    salons: null,
    autres: null
  };

  const ids = [
    "exports-total-count",
    "exports-dedicaces-count",
    "exports-salons-count",
    "exports-autres-count"
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.textContent = "—";
  });

  const generated = document.getElementById("exports-generated-at");
  if (generated) generated.textContent = "—";

  const status = document.getElementById("exports-status");
  if (status) status.textContent = "En attente de vérification";

  const preview = document.getElementById("exports-preview");
  if (preview) preview.textContent = "Sélectionne “Vérifier les exports” pour charger l’aperçu.";
}

async function loadAdminExportsDashboard(force = false) {
  if (!window.DEDICALIVRES_ADMIN_AUTHENTICATED) return;
  if (adminExportsLoadedAt && !force && Date.now() - adminExportsLoadedAt < 60000) return;

  hydrateAdminExportLinks();

  const status = document.getElementById("exports-status");
  const refreshButton = document.getElementById("exports-refresh-btn");

  if (status) status.textContent = "Chargement des exports...";
  if (refreshButton) refreshButton.disabled = true;

  try {
    const [global, dedicaces, salons, autres] = await Promise.all([
      fetchAdminExportJson("events-latest.json"),
      fetchAdminExportJson("dedicaces-latest.json"),
      fetchAdminExportJson("salons-latest.json"),
      fetchAdminExportJson("autres-evenements-latest.json")
    ]);

    adminExportsCache = { global, dedicaces, salons, autres };
    adminExportsLoadedAt = Date.now();

    renderAdminExportsDashboard();
    await loadAdminExportPreview();

    if (status) status.textContent = "Exports disponibles";
    showToast("Exports chargés");
  } catch (error) {
    console.warn("Exports indisponibles", error);
    if (status) status.textContent = "Exports indisponibles";
    const preview = document.getElementById("exports-preview");
    if (preview) {
      preview.textContent = `Chargement impossible.\n\nVérifie que le Worker sert bien les fichiers /exports/*.\n\nDétail : ${error.message || error}`;
    }
    showToast("Erreur chargement exports");
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

async function fetchAdminExportJson(filename) {
  const response = await fetch(`${getExportFileUrl(filename)}?t=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`${filename} : HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchAdminExportText(filename) {
  const response = await fetch(`${getExportFileUrl(filename)}?t=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`${filename} : HTTP ${response.status}`);
  }

  return response.text();
}

function getExportEvents(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function renderAdminExportsDashboard() {
  const globalEvents = getExportEvents(adminExportsCache.global);
  const dedicaces = getExportEvents(adminExportsCache.dedicaces);
  const salons = getExportEvents(adminExportsCache.salons);
  const autres = getExportEvents(adminExportsCache.autres);

  setText("exports-total-count", String(adminExportsCache.global?.count ?? globalEvents.length));
  setText("exports-dedicaces-count", String(adminExportsCache.dedicaces?.count ?? dedicaces.length));
  setText("exports-salons-count", String(adminExportsCache.salons?.count ?? salons.length));
  setText("exports-autres-count", String(adminExportsCache.autres?.count ?? autres.length));
  setText("exports-dedicaces-mini", `${dedicaces.length} éléments`);
  setText("exports-salons-mini", `${salons.length} éléments`);

  const generated = adminExportsCache.global?.generated_at || adminExportsCache.global?.generatedAt;
  setText("exports-generated-at", generated ? formatExportDateTime(generated) : "—");

  const filter = adminExportsCache.global?.filter || "future_or_current_only";
  setText("exports-filter-label", filter === "future_or_current_only" ? "événements à venir uniquement" : filter);

  renderAdminExportMiniList("exports-dedicaces-list", dedicaces.slice(0, 8));
  renderAdminExportMiniList("exports-salons-list", salons.slice(0, 8));
  renderAdminExportPriorityList(globalEvents);
}

function renderAdminExportMiniList(containerId, events) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!events.length) {
    container.innerHTML = `<p class="priority-empty">Aucun élément.</p>`;
    return;
  }

  container.innerHTML = events.map((event) => {
    const date = event.date ? formatDate(event.date) : "Date à préciser";
    const title = escapeHtml(event.title || "Sans titre");
    const city = escapeHtml(event.city || "Ville non précisée");
    const url = event.event_url || event.url || "#";

    return `
      <a class="exports-mini-item" href="${escapeAttr(url)}" target="_blank" rel="noopener">
        <strong>${title}</strong>
        <span>${date} · ${city}</span>
      </a>
    `;
  }).join("");
}

function renderAdminExportPriorityList(events) {
  const container = document.getElementById("exports-priority-list");
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prioritized = events
    .map((event) => ({
      ...event,
      daysUntil: getDaysUntil(event.date, today)
    }))
    .filter((event) => Number.isFinite(event.daysUntil) && event.daysUntil >= 0 && event.daysUntil <= 21)
    .sort((a, b) => a.daysUntil - b.daysUntil || String(a.title || "").localeCompare(String(b.title || "")))
    .slice(0, 10);

  if (!prioritized.length) {
    container.innerHTML = `<p class="priority-empty">Aucune priorité J-21.</p>`;
    return;
  }

  container.innerHTML = prioritized.map((event) => {
    const badge = event.daysUntil <= 3 ? "Priorité haute" : event.daysUntil <= 7 ? "Cette semaine" : "À préparer";
    const title = escapeHtml(event.title || "Sans titre");
    const city = escapeHtml(event.city || "Ville non précisée");
    const url = event.event_url || event.url || "#";

    return `
      <a class="exports-mini-item exports-priority-item" href="${escapeAttr(url)}" target="_blank" rel="noopener">
        <strong>${title}</strong>
        <span>J-${event.daysUntil} · ${city} · ${badge}</span>
      </a>
    `;
  }).join("");
}

async function loadAdminExportPreview() {
  const select = document.getElementById("exports-preview-select");
  const preview = document.getElementById("exports-preview");
  if (!select || !preview) return;

  const filename = select.value || "publications-par-categorie-latest.md";
  preview.textContent = "Chargement de l’aperçu...";

  try {
    const text = await fetchAdminExportText(filename);
    adminExportsLastPreview = text;
    preview.textContent = text.slice(0, 16000) + (text.length > 16000 ? "\n\n… Aperçu tronqué. Ouvre le fichier complet pour la suite." : "");
  } catch (error) {
    adminExportsLastPreview = "";
    preview.textContent = `Aperçu indisponible : ${error.message || error}`;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatExportDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function getDaysUntil(dateValue, today) {
  if (!dateValue) return Number.NaN;
  const eventDate = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(eventDate.getTime())) return Number.NaN;
  return Math.round((eventDate.getTime() - today.getTime()) / 86400000);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
