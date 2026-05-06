/* =========================================================
   DÉDICALIVRES — ADMIN V7 CYBER DASHBOARD
========================================================= */

(() => {

  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (
    !config ||
    !config.supabaseUrl ||
    !config.supabaseAnonKey ||
    !window.supabase
  ) {
    alert("Configuration Supabase manquante.");
    return;
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

  const searchInput = document.getElementById("admin-search");
  const typeFilter = document.getElementById("admin-filter-type");
  const statusFilter = document.getElementById("admin-filter-status");

  let events = [];

  let typesChart = null;
  let visitsChart = null;

  /* =========================================================
     INIT
  ========================================================= */

  init();

  async function init() {

    bindEvents();

    const { data } = await supabaseClient.auth.getSession();

    if (data?.session) {

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

    passwordInput?.addEventListener("keydown", (event) => {

      if (event.key === "Enter") login();
    });

    searchInput?.addEventListener("input", renderEvents);

    typeFilter?.addEventListener("change", renderEvents);

    statusFilter?.addEventListener("change", renderEvents);
  }

  /* =========================================================
     LOGIN
  ========================================================= */

  async function login() {

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    loginFeedback.textContent = "";

    if (!email || !password) {

      loginFeedback.textContent =
        "Veuillez remplir les champs.";

      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion...";

    try {

      const { error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      showDashboard();

      await loadDashboard();

    } catch (error) {

      console.error(error);

      loginFeedback.textContent =
        "Connexion impossible.";

    } finally {

      loginBtn.disabled = false;
      loginBtn.textContent =
        "ACCÉDER AU SYSTÈME";
    }
  }

  async function logout() {

    await supabaseClient.auth.signOut();

    location.reload();
  }

  function showDashboard() {

    loginScreen.classList.add("hidden");

    dashboard.classList.remove("hidden");
  }

  /* =========================================================
     DASHBOARD
  ========================================================= */

  async function loadDashboard() {

    await loadEvents();

    await loadStats();

    renderEvents();

    renderCharts();
  }

  /* =========================================================
     LOAD EVENTS
  ========================================================= */

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

      events = [];

      return;
    }

    events = data || [];
  }

  /* =========================================================
     STATS
  ========================================================= */

  async function loadStats() {

    const pending =
      events.filter(
        (event) =>
          !event.validated &&
          !event.rejected
      );

    statEvents.textContent =
      events.length;

    statPending.textContent =
      pending.length;

    const newsletterCount =
      await countTable(
        "newsletter_subscribers"
      );

    statNewsletter.textContent =
      newsletterCount;

    const visits =
      await loadVisits();

    statVisits.textContent =
      visits.length;
  }

  /* =========================================================
     FILTERS
  ========================================================= */

  function getFilteredEvents() {

    const search =
      normalize(searchInput?.value || "");

    const type =
      typeFilter?.value || "";

    const status =
      statusFilter?.value || "";

    return events.filter((event) => {

      const searchable =
        normalize([
          event.title,
          event.city,
          event.region,
          event.type
        ].join(" "));

      const matchSearch =
        !search ||
        searchable.includes(search);

      const matchType =
        !type ||
        event.type === type;

      let matchStatus = true;

      if (status === "pending") {
        matchStatus =
          !event.validated &&
          !event.rejected;
      }

      if (status === "validated") {
        matchStatus =
          event.validated;
      }

      if (status === "featured") {
        matchStatus =
          event.featured;
      }

      return (
        matchSearch &&
        matchType &&
        matchStatus
      );
    });
  }

  /* =========================================================
     RENDER EVENTS
  ========================================================= */

  function renderEvents() {

    const filtered =
      getFilteredEvents();

    const pending =
      filtered.filter(
        (event) =>
          !event.validated &&
          !event.rejected
      );

    const validated =
      filtered.filter(
        (event) =>
          event.validated &&
          !event.rejected
      );

    pendingContainer.innerHTML =
      pending.length
        ? pending
            .map((event) =>
              createEventCard(
                event,
                true
              )
            )
            .join("")
        : emptyHTML(
            "Aucun événement."
          );

    validatedContainer.innerHTML =
      validated.length
        ? validated
            .slice(0, 100)
            .map((event) =>
              createEventCard(
                event,
                false
              )
            )
            .join("")
        : emptyHTML(
            "Aucun événement."
          );

    bindActionButtons();
  }

  /* =========================================================
     EVENT CARD
  ========================================================= */

  function createEventCard(
    event,
    pending = false
  ) {

    const quality =
      getQualityScore(event);

    const duplicates =
      detectDuplicates(event);

    return `
      <article class="event-item">

        <div class="event-top">

          <div>

            <div class="event-title">
              ${escapeHtml(
                event.title || "Sans titre"
              )}
            </div>

            <div class="event-meta">
              📍 ${escapeHtml(
                [
                  event.city,
                  event.region
                ]
                .filter(Boolean)
                .join(", ")
              )}
            </div>

          </div>

          <div class="event-type">
            ${escapeHtml(
              event.type || "Autre"
            )}
          </div>

        </div>

        <div class="event-meta">

          <span>
            📅 ${formatDate(
              event.start_date
            )}
          </span>

          <span>
            ⭐ Score :
            ${quality}/100
          </span>

          ${
            duplicates
              ? `
                <span style="color:#ff9e44">
                  ⚠ Doublon probable
                </span>
              `
              : ""
          }

          ${
            event.featured
              ? `
                <span style="color:#19ff9c">
                  ★ Featured
                </span>
              `
              : ""
          }

        </div>

        <div class="event-actions">

          ${
            pending
              ? `
                <button
                  class="action-btn validate"
                  data-action="validate"
                  data-id="${event.id}"
                >
                  ✔ Valider
                </button>

                <button
                  class="action-btn reject"
                  data-action="reject"
                  data-id="${event.id}"
                >
                  ✖ Refuser
                </button>
              `
              : ""
          }

          <button
            class="action-btn feature"
            data-action="feature"
            data-id="${event.id}"
          >
            ${
              event.featured
                ? "★ Retirer"
                : "★ Mettre en avant"
            }
          </button>

          <button
            class="action-btn delete"
            data-action="delete"
            data-id="${event.id}"
          >
            🗑 Supprimer
          </button>

        </div>

      </article>
    `;
  }

  function bindActionButtons() {

    document
      .querySelectorAll("[data-action]")
      .forEach((button) => {

        button.addEventListener(
          "click",
          handleAction
        );
      });
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  async function handleAction(event) {

    const button =
      event.currentTarget;

    const action =
      button.dataset.action;

    const id =
      button.dataset.id;

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

        const confirmed =
          confirm(
            "Supprimer définitivement ?"
          );

        if (confirmed) {
          await deleteEvent(id);
        }
      }

      await loadDashboard();

    } catch (error) {

      console.error(error);

      alert("Erreur.");

    } finally {

      button.disabled = false;
    }
  }

  async function validateEvent(id) {

    await supabaseClient
      .from("events")
      .update({
        validated: true,
        rejected: false
      })
      .eq("id", id);
  }

  async function rejectEvent(id) {

    await supabaseClient
      .from("events")
      .update({
        rejected: true
      })
      .eq("id", id);
  }

  async function toggleFeature(id) {

    const event =
      events.find(
        (item) =>
          String(item.id) ===
          String(id)
      );

    if (!event) return;

    await supabaseClient
      .from("events")
      .update({
        featured: !event.featured
      })
      .eq("id", id);
  }

  async function deleteEvent(id) {

    await supabaseClient
      .from("events")
      .delete()
      .eq("id", id);
  }

  /* =========================================================
     QUALITY SCORE
  ========================================================= */

  function getQualityScore(event) {

    let score = 0;

    if (event.title) score += 20;

    if (event.description) score += 20;

    if (event.image_url) score += 20;

    if (event.website) score += 10;

    if (event.city) score += 10;

    if (event.region) score += 10;

    if (event.start_date) score += 10;

    return score;
  }

  /* =========================================================
     DUPLICATES
  ========================================================= */

  function detectDuplicates(event) {

    return events.some((other) => {

      if (
        String(other.id) ===
        String(event.id)
      ) {
        return false;
      }

      return (
        normalize(other.title) ===
        normalize(event.title)
      );
    });
  }

  /* =========================================================
     CHARTS
  ========================================================= */

  function renderCharts() {

    if (!window.Chart) return;

    renderTypesChart();

    renderVisitsChart();
  }

  function renderTypesChart() {

    const canvas =
      document.getElementById(
        "types-chart"
      );

    if (!canvas) return;

    const counts = {};

    events.forEach((event) => {

      const type =
        event.type || "Autre";

      counts[type] =
        (counts[type] || 0) + 1;
    });

    if (typesChart) {
      typesChart.destroy();
    }

    typesChart = new Chart(canvas, {

      type: "doughnut",

      data: {

        labels: Object.keys(counts),

        datasets: [{
          data: Object.values(counts),

          backgroundColor: [
            "#19ff9c",
            "#00d9ff",
            "#ff9e44",
            "#bc7dff"
          ]
        }]
      },

      options: {
        plugins: {
          legend: {
            labels: {
              color: "#ebfff8"
            }
          }
        }
      }
    });
  }

  async function renderVisitsChart() {

    const canvas =
      document.getElementById(
        "visits-chart"
      );

    if (!canvas) return;

    const visits =
      await loadVisits();

    const perDay = {};

    visits.forEach((visit) => {

      if (!visit.created_at) return;

      const day =
        visit.created_at.slice(0,10);

      perDay[day] =
        (perDay[day] || 0) + 1;
    });

    const labels =
      Object.keys(perDay).slice(-14);

    const values =
      labels.map(
        (label) => perDay[label]
      );

    if (visitsChart) {
      visitsChart.destroy();
    }

    visitsChart = new Chart(canvas, {

      type: "line",

      data: {

        labels,

        datasets: [{

          label: "Visites",

          data: values,

          borderColor: "#19ff9c",

          backgroundColor:
            "rgba(25,255,156,.12)",

          fill: true,

          tension: .35
        }]
      },

      options: {

        scales: {

          x: {
            ticks: {
              color: "#ebfff8"
            }
          },

          y: {
            ticks: {
              color: "#ebfff8"
            }
          }
        },

        plugins: {
          legend: {
            labels: {
              color: "#ebfff8"
            }
          }
        }
      }
    });
  }

  /* =========================================================
     VISITS
  ========================================================= */

  async function loadVisits() {

    const tables = [
      "page_views",
      "site_visits"
    ];

    for (const table of tables) {

      const { data, error } =
        await supabaseClient
          .from(table)
          .select("*")
          .order("created_at", {
            ascending: true
          })
          .limit(5000);

      if (
        !error &&
        Array.isArray(data)
      ) {
        return data;
      }
    }

    return [];
  }

  /* =========================================================
     HELPERS
  ========================================================= */

  async function countTable(table) {

    const { count } =
      await supabaseClient
        .from(table)
        .select("*", {
          count: "exact",
          head: true
        });

    return count || 0;
  }

  function emptyHTML(message) {

    return `
      <div class="event-item">
        ${escapeHtml(message)}
      </div>
    `;
  }

  function normalize(value) {

    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function formatDate(value) {

    if (!value) {
      return "Date inconnue";
    }

    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        day: "numeric",
        month: "long",
        year: "numeric"
      }
    ).format(new Date(value));
  }

  function escapeHtml(value) {

    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

})();
