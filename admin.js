"use strict";

/* =========================================================
   DÉDICALIVRES — CYBER DASHBOARD V5
========================================================= */

const config = window.DEDICALIVRES_CONFIG;

if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
  alert("Configuration Supabase manquante.");
  throw new Error("Supabase config missing");
}

const supabaseClient = window.supabase.createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);

/* =========================================================
   ELEMENTS
========================================================= */

const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");

const emailInput = document.getElementById("admin-email");
const passwordInput = document.getElementById("admin-password");

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const refreshBtn = document.getElementById("refresh-btn");

const loginFeedback = document.getElementById("login-feedback");

const statEvents = document.getElementById("stat-events");
const statPending = document.getElementById("stat-pending");
const statVisits = document.getElementById("stat-visits");
const statNewsletter = document.getElementById("stat-newsletter");

const pendingContainer = document.getElementById("pending-events");
const validatedContainer = document.getElementById("validated-events");

/* =========================================================
   INIT
========================================================= */

init();

async function init() {
  bindEvents();

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session) {
    showDashboard();
    await loadDashboard();
  }
}

/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  loginBtn?.addEventListener("click", login);

  logoutBtn?.addEventListener("click", logout);

  refreshBtn?.addEventListener("click", loadDashboard);

  passwordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
}

/* =========================================================
   LOGIN
========================================================= */

async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  loginFeedback.textContent = "";

  if (!email || !password) {
    loginFeedback.textContent = "Veuillez remplir les champs.";
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Connexion...";

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    showDashboard();

    await loadDashboard();
  } catch (error) {
    console.error(error);

    loginFeedback.textContent =
      "Connexion impossible. Vérifiez vos identifiants.";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "ACCÉDER AU DASHBOARD";
  }
}

async function logout() {
  await supabaseClient.auth.signOut();

  dashboard.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {
  try {
    await Promise.all([
      loadStats(),
      loadPendingEvents(),
      loadValidatedEvents()
    ]);
  } catch (error) {
    console.error("Dashboard error:", error);
  }
}

/* =========================================================
   STATS
========================================================= */

async function loadStats() {
  const [
    eventsResponse,
    pendingResponse,
    newsletterResponse,
    trackingResponse
  ] = await Promise.all([
    supabaseClient.from("events").select("*", { count: "exact", head: true }),

    supabaseClient
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("validated", false),

    supabaseClient
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true }),

    supabaseClient
      .from("tracking_stats")
      .select("visits")
  ]);

  statEvents.textContent = eventsResponse.count || 0;
  statPending.textContent = pendingResponse.count || 0;
  statNewsletter.textContent = newsletterResponse.count || 0;

  let visits = 0;

  if (trackingResponse.data?.length) {
    visits = trackingResponse.data.reduce((sum, item) => {
      return sum + (item.visits || 0);
    }, 0);
  }

  statVisits.textContent = formatNumber(visits);
}

/* =========================================================
   PENDING EVENTS
========================================================= */

async function loadPendingEvents() {
  pendingContainer.innerHTML = loadingHTML();

  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .eq("validated", false)
    .eq("rejected", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    pendingContainer.innerHTML = errorHTML();
    return;
  }

  if (!data.length) {
    pendingContainer.innerHTML = emptyHTML("Aucun événement à valider.");
    return;
  }

  pendingContainer.innerHTML = data
    .map((event) => createEventCard(event, true))
    .join("");

  bindActionButtons();
}

/* =========================================================
   VALIDATED EVENTS
========================================================= */

async function loadValidatedEvents() {
  validatedContainer.innerHTML = loadingHTML();

  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .eq("validated", true)
    .order("start_date", { ascending: true })
    .limit(50);

  if (error) {
    console.error(error);
    validatedContainer.innerHTML = errorHTML();
    return;
  }

  if (!data.length) {
    validatedContainer.innerHTML = emptyHTML("Aucun événement validé.");
    return;
  }

  validatedContainer.innerHTML = data
    .map((event) => createEventCard(event, false))
    .join("");

  bindActionButtons();
}

/* =========================================================
   EVENT CARD
========================================================= */

function createEventCard(event, pending = false) {
  return `
    <article class="event-item">

      <div class="event-top">
        <div class="event-title">
          ${escapeHtml(event.title || "Sans titre")}
        </div>

        <div class="event-type">
          ${escapeHtml(event.type || "Autre")}
        </div>
      </div>

      <div class="event-meta">
        <span>📍 ${escapeHtml(event.city || "")}</span>
        <span>📅 ${formatDate(event.start_date)}</span>
      </div>

      <div class="event-actions">

        ${
          pending
            ? `
          <button
            class="action-btn validate"
            data-action="validate"
            data-id="${event.id}">
            Valider
          </button>

          <button
            class="action-btn reject"
            data-action="reject"
            data-id="${event.id}">
            Rejeter
          </button>
        `
            : ""
        }

        <button
          class="action-btn feature"
          data-action="feature"
          data-id="${event.id}">
          ${event.featured ? "Retirer mise en avant" : "Mettre en avant"}
        </button>

        <button
          class="action-btn delete"
          data-action="delete"
          data-id="${event.id}">
          Supprimer
        </button>

      </div>

    </article>
  `;
}

/* =========================================================
   ACTIONS
========================================================= */

function bindActionButtons() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleAction);
  });
}

async function handleAction(event) {
  const button = event.currentTarget;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (!action || !id) return;

  button.disabled = true;

  try {
    if (action === "validate") {
      await validateEvent(id);
    }

    if (action === "reject") {
      await rejectEvent(id);
    }

    if (action === "feature") {
      await toggleFeature(id);
    }

    if (action === "delete") {
      const confirmDelete = confirm(
        "Supprimer définitivement cet événement ?"
      );

      if (confirmDelete) {
        await deleteEvent(id);
      }
    }

    await loadDashboard();
  } catch (error) {
    console.error(error);
    alert("Erreur pendant l'action.");
  } finally {
    button.disabled = false;
  }
}

/* =========================================================
   CRUD
========================================================= */

async function validateEvent(id) {
  const { error } = await supabaseClient
    .from("events")
    .update({
      validated: true,
      rejected: false
    })
    .eq("id", id);

  if (error) throw error;
}

async function rejectEvent(id) {
  const { error } = await supabaseClient
    .from("events")
    .update({
      rejected: true
    })
    .eq("id", id);

  if (error) throw error;
}

async function toggleFeature(id) {
  const { data } = await supabaseClient
    .from("events")
    .select("featured")
    .eq("id", id)
    .single();

  const current = Boolean(data?.featured);

  const { error } = await supabaseClient
    .from("events")
    .update({
      featured: !current
    })
    .eq("id", id);

  if (error) throw error;
}

async function deleteEvent(id) {
  const { error } = await supabaseClient
    .from("events")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

/* =========================================================
   HELPERS
========================================================= */

function loadingHTML() {
  return `
    <div class="event-item">
      Chargement...
    </div>
  `;
}

function emptyHTML(message) {
  return `
    <div class="event-item">
      ${escapeHtml(message)}
    </div>
  `;
}

function errorHTML() {
  return `
    <div class="event-item">
      Erreur de chargement.
    </div>
  `;
}

function formatDate(value) {
  if (!value) return "Date inconnue";

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

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value || 0);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
