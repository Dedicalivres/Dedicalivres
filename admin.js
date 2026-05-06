(() => {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config?.supabaseUrl || !config?.supabaseAnonKey || !window.supabase) {
    alert("Configuration Supabase manquante.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const ADMIN_EMAIL = "admin@dedicalivres.fr";

  // LOGIN
  const loginScreen = document.getElementById("login-screen");
  const dashboard = document.getElementById("dashboard");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");
  const feedback = document.getElementById("login-feedback");

  // DASHBOARD
  const pendingList = document.getElementById("pending-events");
  const validatedList = document.getElementById("validated-events");

  const statPending = document.getElementById("stat-pending");
  const statValidated = document.getElementById("stat-validated");
  const statViews = document.getElementById("stat-views");
  const statSubscribers = document.getElementById("stat-subscribers");

  let events = [];

  init();

  async function init() {
    bindEvents();
    await restoreSession();
  }

  function bindEvents() {
    loginBtn?.addEventListener("click", login);
    logoutBtn?.addEventListener("click", logout);
  }

  async function restoreSession() {
    const { data } = await supabaseClient.auth.getSession();

    if (data?.session) {
      showDashboard();
      await loadDashboard();
    }
  }

  async function login() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      feedback.textContent = "Veuillez remplir tous les champs.";
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Connexion...";

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      feedback.textContent = error.message;
      loginBtn.disabled = false;
      loginBtn.textContent = "Connexion";
      return;
    }

    if (data?.user?.email !== ADMIN_EMAIL) {
      await supabaseClient.auth.signOut();
      feedback.textContent = "Accès refusé.";
      loginBtn.disabled = false;
      loginBtn.textContent = "Connexion";
      return;
    }

    showDashboard();

    await loadDashboard();

    loginBtn.disabled = false;
    loginBtn.textContent = "Connexion";
  }

  async function logout() {
    await supabaseClient.auth.signOut();
    location.reload();
  }

  function showDashboard() {
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
  }

  async function loadDashboard() {
    await Promise.all([
      loadEvents(),
      loadStats(),
      loadCharts()
    ]);
  }

  async function loadEvents() {
    const { data, error } = await supabaseClient
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    events = data || [];

    const pending = events.filter(e => !e.validated && !e.rejected);
    const validated = events.filter(e => e.validated);

    renderEvents(pendingList, pending, true);
    renderEvents(validatedList, validated, false);

    statPending.textContent = pending.length;
    statValidated.textContent = validated.length;
  }

  function renderEvents(container, items, moderationMode) {
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `
        <div class="event-item">
          Aucun événement.
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(event => `
      <article class="event-item">

        <div class="event-top">
          <div>
            <div class="event-title">
              ${escapeHtml(event.title || "Sans titre")}
            </div>

            <div class="event-type">
              ${escapeHtml(event.type || "Autre")}
            </div>
          </div>

          ${event.featured ? `
            <div class="event-type">
              ★ FEATURED
            </div>
          ` : ""}
        </div>

        <div class="event-meta">
          <span>📍 ${escapeHtml(event.city || "")}</span>
          <span>📅 ${formatDate(event.start_date)}</span>
          <span>🧭 ${escapeHtml(event.region || "")}</span>
        </div>

        <div class="event-actions">

          ${
            moderationMode
              ? `
                <button
                  class="action-btn validate"
                  onclick="window.validateEvent('${event.id}')"
                >
                  ✔ Valider
                </button>

                <button
                  class="action-btn reject"
                  onclick="window.rejectEvent('${event.id}')"
                >
                  ✖ Refuser
                </button>
              `
              : ""
          }

          <button
            class="action-btn feature"
            onclick="window.toggleFeatured('${event.id}')"
          >
            ${event.featured ? "★ Retirer" : "★ Mettre en avant"}
          </button>

          <button
            class="action-btn delete"
            onclick="window.deleteEvent('${event.id}')"
          >
            🗑 Supprimer
          </button>

        </div>
      </article>
    `).join("");
  }

  async function loadStats() {

    // VISITES
    const { count: viewsCount } = await supabaseClient
      .from("page_views")
      .select("*", { count: "exact", head: true });

    statViews.textContent = viewsCount || 0;

    // NEWSLETTER
    const { count: subscribersCount } = await supabaseClient
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true });

    statSubscribers.textContent = subscribersCount || 0;
  }

  async function loadCharts() {

    if (!window.Chart) return;

    const visitsCtx = document.getElementById("visits-chart");
    const eventsCtx = document.getElementById("events-chart");

    // VISITS
    const { data: viewsData } = await supabaseClient
      .from("page_views")
      .select("created_at");

    const viewsPerDay = {};

    (viewsData || []).forEach(v => {
      const day = v.created_at.slice(0,10);
      viewsPerDay[day] = (viewsPerDay[day] || 0) + 1;
    });

    new Chart(visitsCtx, {
      type: "line",
      data: {
        labels: Object.keys(viewsPerDay),
        datasets: [{
          label: "Visites",
          data: Object.values(viewsPerDay),
          borderColor: "#19ff9c",
          backgroundColor: "rgba(25,255,156,.12)",
          tension: .35,
          fill: true
        }]
      }
    });

    // EVENTS
    const eventTypes = {};

    events.forEach(e => {
      const type = e.type || "Autre";
      eventTypes[type] = (eventTypes[type] || 0) + 1;
    });

    new Chart(eventsCtx, {
      type: "doughnut",
      data: {
        labels: Object.keys(eventTypes),
        datasets: [{
          data: Object.values(eventTypes),
          backgroundColor: [
            "#19ff9c",
            "#00d9ff",
            "#ff9e44",
            "#bc7dff"
          ]
        }]
      }
    });
  }

  // ACTIONS

  window.validateEvent = async (id) => {

    await supabaseClient
      .from("events")
      .update({
        validated: true,
        rejected: false
      })
      .eq("id", id);

    await loadDashboard();
  };

  window.rejectEvent = async (id) => {

    await supabaseClient
      .from("events")
      .update({
        rejected: true
      })
      .eq("id", id);

    await loadDashboard();
  };

  window.toggleFeatured = async (id) => {

    const event = events.find(e => String(e.id) === String(id));

    if (!event) return;

    await supabaseClient
      .from("events")
      .update({
        featured: !event.featured
      })
      .eq("id", id);

    await loadDashboard();
  };

  window.deleteEvent = async (id) => {

    const confirmed = confirm(
      "Supprimer définitivement cet événement ?"
    );

    if (!confirmed) return;

    await supabaseClient
      .from("events")
      .delete()
      .eq("id", id);

    await loadDashboard();
  };

  // HELPERS

  function formatDate(value) {

    if (!value) return "Date inconnue";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
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

})();
