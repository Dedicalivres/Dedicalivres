const supabase = window.supabase.createClient(
  window.DEDICALIVRES_CONFIG.supabaseUrl,
  window.DEDICALIVRES_CONFIG.supabaseAnonKey
);

let allEvents = [];
let userPosition = null;

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  populateMonthFilter();
  loadEvents();

  document.getElementById("apply-filters")?.addEventListener("click", renderEvents);
  document.getElementById("reset-filters")?.addEventListener("click", resetFilters);
  document.getElementById("locate-me")?.addEventListener("click", locateUser);

  initNewsletter();
});

/* =========================
   MOIS AUTO (corrige ton bug)
========================= */
function populateMonthFilter() {
  const select = document.getElementById("date-filter");
  if (!select) return;

  if (select.options.length > 1) return;

  const now = new Date();

  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);

    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const label = d.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });

    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;

    select.appendChild(opt);
  }
}

/* =========================
   LOAD EVENTS
========================= */
async function loadEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("validated", true)
    .order("start_date", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  allEvents = data || [];
  renderEvents();
}

/* =========================
   FILTERS
========================= */
function renderEvents() {
  const grid = document.getElementById("events-grid");
  const count = document.getElementById("results-count");

  const search = normalize(document.getElementById("search-input")?.value);
  const region = document.getElementById("region-filter")?.value;
  const type = document.getElementById("type-filter")?.value;
  const month = document.getElementById("date-filter")?.value;

  let filtered = allEvents.filter(e => {
    const text = normalize(`${e.title} ${e.city} ${e.description}`);

    return (
      (!search || text.includes(search)) &&
      (!region || e.region === region) &&
      (!type || e.type === type) &&
      (!month || matchMonth(e, month))
    );
  });

  if (userPosition) {
    filtered.sort((a, b) => distance(a) - distance(b));
  } else {
    filtered.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }

  count.textContent = `${filtered.length} événements`;

  if (!filtered.length) {
    grid.innerHTML = "<p>Aucun résultat</p>";
    return;
  }

  grid.innerHTML = filtered.map(e => card(e)).join("");
}

function matchMonth(e, month) {
  if (!e.start_date) return false;
  return e.start_date.startsWith(month);
}

/* =========================
   CARD
========================= */
function card(e) {
  return `
    <div class="carte">
      <div class="carte-body">
        <h3>${e.title}</h3>
        <p>${formatDate(e.start_date)}</p>
        <p>${e.city || ""}</p>
        <p>${e.description || ""}</p>
      </div>
    </div>
  `;
}

/* =========================
   GEO
========================= */
function locateUser() {
  navigator.geolocation.getCurrentPosition(pos => {
    userPosition = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude
    };

    renderEvents();
  });
}

function distance(e) {
  if (!userPosition || !e.lat) return 999999;

  const R = 6371;
  const dLat = toRad(e.lat - userPosition.lat);
  const dLon = toRad(e.lng - userPosition.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(userPosition.lat)) *
      Math.cos(toRad(e.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(x) {
  return x * Math.PI / 180;
}

/* =========================
   NEWSLETTER (FIX BUG)
========================= */
function initNewsletter() {
  const form = document.getElementById("newsletter-form");
  if (!form) return;

  const feedback = document.getElementById("newsletter-feedback");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = form.email.value;

    feedback.textContent = "Envoi...";

    const { error } = await supabase
      .from("newsletter")
      .insert([{ email }]);

    if (error) {
      if (error.code === "23505") {
        feedback.textContent = "Vous êtes déjà inscrit 👍";
        feedback.className = "success";
      } else {
        feedback.textContent = "Erreur...";
        feedback.className = "error";
      }
    } else {
      feedback.textContent = "Merci, votre inscription est enregistrée 👍";
      feedback.className = "success";
    }
  });
}

/* =========================
   RESET
========================= */
function resetFilters() {
  document.getElementById("search-input").value = "";
  document.getElementById("region-filter").value = "";
  document.getElementById("type-filter").value = "";
  document.getElementById("date-filter").value = "";

  renderEvents();
}

/* =========================
   UTILS
========================= */
function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR");
}
