"use strict";

const config = window.DEDICALIVRES_CONFIG;

if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
  alert("Configuration Supabase manquante.");
  throw new Error("Configuration Supabase manquante.");
}

const supabaseClient = window.supabase.createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);

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

let events = [];
let typesChart = null;
let visitsChart = null;

init();

async function init() {
  bindEvents();

  const { data } = await supabaseClient.auth.getSession();

  if (data?.session) {
    showDashboard();
    await loadDashboard();
  }
}

function bindEvents() {
  loginBtn?.addEventListener("click", login);
  logoutBtn?.addEventListener("click", logout);
  refreshBtn?.addEventListener("click", loadDashboard);

  passwordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
}

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
    loginFeedback.textContent = "Connexion impossible. Vérifiez vos identifiants.";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "ACCÉDER AU SYSTÈME";
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

async function loadDashboard() {
  await loadEvents();
  await loadStats();
  renderEvents();
  renderCharts();
}

async function loadEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    events = [];
    return;
  }

  events = data || [];
}

async function loadStats() {
  const pending = events.filter((event) => !event.validated && !event.rejected);

  statEvents.textContent = events.length;
  statPending.textContent = pending.length;

  const newsletterCount = await countTable("newsletter_subscribers");
  statNewsletter.textContent = newsletterCount;

  const visits = await loadVisits();
  statVisits.textContent = visits.length;
}

function renderEvents() {
  const pending = events.filter((event) => !event.validated && !event.rejected);
  const validated = events.filter((event) => event.validated && !event.rejected);

  pendingContainer.innerHTML = pending.length
    ? pending.map((event) => createEventCard(event, true)).join("")
    : emptyHTML("Aucun événement à valider.");

  validatedContainer.innerHTML = validated.length
    ? validated.slice(0, 50).map((event) => createEventCard(event, false)).join("")
    : emptyHTML("Aucun événement validé.");

  bindActionButtons();
}

function createEventCard(event, pending = false) {
  return `
    <article class="event-item">
      <div class="event-top">
        <div class="event-title">${escapeHtml(event.title || "Sans titre")}</div>
        <div class="event-type">${escapeHtml(event.type || "Autre")}</div>
      </div>

      <div class="event-meta">
        <span>📍 ${escapeHtml([event.city, event.region].filter(Boolean).join(", "))}</span>
        <span>📅 ${formatDate(event.start_date)}</span>
      </div>

      <div class="event-actions">
        ${
          pending
            ? `
              <button class="action-btn validate" data-action="validate" data-id="${event.id}">Valider</button>
              <button class="action-btn reject" data-action="reject" data-id="${event.id}">Refuser</button>
            `
            : ""
        }

        <button class="action-btn feature" data-action="feature" data-id="${event.id}">
          ${event.featured ? "Retirer mise en avant" : "Mettre en avant"}
        </button>

        <button class="action-btn delete" data-action="delete" data-id="${event.id}">
          Supprimer
        </button>
      </div>
    </article>
  `;
}

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
    if (action === "validate") await validateEvent(id);
    if (action === "reject") await rejectEvent(id);
    if (action === "feature") await toggleFeature(id);

    if (action === "delete") {
      const ok = confirm("Supprimer définitivement cet événement ?");
      if (ok) await deleteEvent(id);
    }

    await loadDashboard();
  } catch (error) {
    console.error(error);
    alert("Erreur pendant l’action.");
  } finally {
    button.disabled = false;
  }
}

async function validateEvent(id) {
  const { error } = await supabaseClient
    .from("events")
    .update({ validated: true, rejected: false })
    .eq("id", id);

  if (error) throw error;
}

async function rejectEvent(id) {
  const { error } = await supabaseClient
    .from("events")
    .update({ validated: false, rejected: true })
    .eq("id", id);

  if (error) throw error;
}

async function toggleFeature(id) {
  const event = events.find((item) => String(item.id) === String(id));
  if (!event) return;

  const { error } = await supabaseClient
    .from("events")
    .update({ featured: !event.featured })
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

async function countTable(tableName) {
  const { count, error } = await supabaseClient
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.warn(`Impossible de compter ${tableName}`, error);
    return 0;
  }

  return count || 0;
}

async function loadVisits() {
  const tables = ["site_visits", "page_views"];

  for (const table of tables) {
    const { data, error } = await supabaseClient
      .from(table)
      .select("created_at,path,page_title")
      .order("created_at", { ascending: true })
      .limit(5000);

    if (!error && Array.isArray(data)) return data;
  }

  return [];
}

async function renderCharts() {
  if (!window.Chart) return;

  renderTypesChart();
  await renderVisitsChart();
}

function renderTypesChart() {
  const canvas = document.getElementById("types-chart");
  if (!canvas) return;

  const typeCounts = {};

  events.forEach((event) => {
    const type = event.type || "Autre";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  if (typesChart) typesChart.destroy();

  typesChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: Object.keys(typeCounts),
      datasets: [{
        data: Object.values(typeCounts),
        backgroundColor: ["#19ff9c", "#00d9ff", "#ff9e44", "#bc7dff"]
      }]
    },
    options: {
      plugins: {
        legend: {
          labels: { color: "#ebfff8" }
        }
      }
    }
  });
}

async function renderVisitsChart() {
  const canvas = document.getElementById("visits-chart");
  if (!canvas) return;

  const visits = await loadVisits();
  const counts = {};

  visits.forEach((visit) => {
    if (!visit.created_at) return;
    const day = visit.created_at.slice(0, 10);
    counts[day] = (counts[day] || 0) + 1;
  });

  const labels = Object.keys(counts).slice(-14);
  const values = labels.map((label) => counts[label]);

  if (visitsChart) visitsChart.destroy();

  visitsChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Visites",
        data: values,
        borderColor: "#19ff9c",
        backgroundColor: "rgba(25,255,156,.12)",
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      scales: {
        x: { ticks: { color: "#ebfff8" } },
        y: { ticks: { color: "#ebfff8" } }
      },
      plugins: {
        legend: {
          labels: { color: "#ebfff8" }
        }
      }
    }
  });
}

function emptyHTML(message) {
  return `<div class="event-item">${escapeHtml(message)}</div>`;
}

function formatDate(value) {
  if (!value) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
