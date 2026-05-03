(function () {
  const config = window.DEDICALIVRES_CONFIG;
  if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
    console.error("Configuration Supabase manquante.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  // ELEMENTS DOM
  const eventsGrid = document.getElementById("events-grid");
  const resultsCount = document.getElementById("results-count");
  const form = document.getElementById("submission-form");
  const formFeedback = document.getElementById("form-feedback");

  const searchInput = document.getElementById("search-input");
  const regionFilter = document.getElementById("region-filter");
  const typeFilter = document.getElementById("type-filter");
  const dateFilter = document.getElementById("date-filter");

  const locateMeButton = document.getElementById("locate-me");

  // NEWSLETTER
  let newsletterSubmitting = false;

  // DATA
  let allEvents = [];
  let userPosition = null;

  init();

  function init() {
    bindEvents();
    bindNewsletterForm(); // ✅ IMPORTANT
    populateMonthFilter();
    loadEvents();
  }

  /* =========================
     EVENTS
  ========================= */

  function bindEvents() {
    document
      .getElementById("apply-filters")
      ?.addEventListener("click", renderFilteredEvents);

    document
      .getElementById("reset-filters")
      ?.addEventListener("click", resetFilters);

    form?.addEventListener("submit", handleFormSubmit);

    locateMeButton?.addEventListener("click", locateUser);
  }

  async function loadEvents() {
    setLoadingState();

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabaseClient
      .from("events")
      .select("*")
      .eq("validated", true)
      .eq("rejected", false)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("featured", { ascending: false })
      .order("start_date", { ascending: true });

    if (error) {
      console.error(error);
      setErrorState("Erreur chargement événements");
      return;
    }

    allEvents = data || [];
    renderFilteredEvents();
  }

  function renderFilteredEvents() {
    let filtered = filterEvents(allEvents);

    if (userPosition) {
      filtered.sort((a, b) => distance(a) - distance(b));
    }

    renderEvents(filtered);
  }

  function filterEvents(events) {
    const search = normalize(searchInput?.value);
    const region = regionFilter?.value;
    const type = typeFilter?.value;
    const month = dateFilter?.value;

    return events.filter((e) => {
      const text = normalize(
        `${e.title} ${e.city} ${e.description}`
      );

      return (
        (!search || text.includes(search)) &&
        (!region || e.region === region) &&
        (!type || e.type === type) &&
        (!month || e.start_date?.startsWith(month))
      );
    });
  }

  function renderEvents(events) {
    if (!eventsGrid || !resultsCount) return;

    resultsCount.textContent = `${events.length} événements`;

    if (!events.length) {
      eventsGrid.innerHTML = "<p>Aucun résultat</p>";
      return;
    }

    eventsGrid.innerHTML = events
      .map((e) => {
        return `
          <article class="event-card">
            <h3>${e.title}</h3>
            <p>${e.city || ""}</p>
          </article>
        `;
      })
      .join("");
  }

  /* =========================
     GEO
  ========================= */

  function locateUser() {
    navigator.geolocation.getCurrentPosition((pos) => {
      userPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      renderFilteredEvents();
    });
  }

  function distance(e) {
    if (!userPosition || !e.lat) return 999999;

    const R = 6371;
    const dLat = toRad(e.lat - userPosition.lat);
    const dLon = toRad(e.lng - userPosition.lng);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(userPosition.lat)) *
        Math.cos(toRad(e.lat)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function toRad(x) {
    return (x * Math.PI) / 180;
  }

  /* =========================
     NEWSLETTER (FIX)
  ========================= */

  function bindNewsletterForm() {
    const form = document.getElementById("newsletter-form");
    if (!form) return;

    form.addEventListener("submit", handleNewsletterSubmit);
  }

  async function handleNewsletterSubmit(event) {
    event.preventDefault();

    if (newsletterSubmitting) return;
    newsletterSubmitting = true;

    const formData = new FormData(event.currentTarget);
    const feedback = document.getElementById("newsletter-feedback");
    const email = formData.get("email");
    const region = formData.get("region");

    try {
      feedback.textContent = "Inscription...";

 const { error } = await supabaseClient
  .from("newsletter_subscribers")
  .insert([{ email, region }]);

      if (error) throw error;

      event.currentTarget.reset();

      feedback.textContent =
        "Merci, votre inscription est enregistrée 👍";
      feedback.className = "success";
    } catch (error) {
      if (error.code === "23505") {
        feedback.textContent =
          "Vous êtes déjà inscrit 👍";
        feedback.className = "success";
      } else {
        feedback.textContent = "Erreur...";
        feedback.className = "error";
      }
    } finally {
      newsletterSubmitting = false;
    }
  }

  /* =========================
     FORM EVENT
  ========================= */

  async function handleFormSubmit(e) {
    e.preventDefault();

    const data = new FormData(form);

    const payload = {
      title: data.get("title"),
      city: data.get("city"),
      region: data.get("region"),
      start_date: data.get("start_date"),
      validated: false,
    };

    await supabaseClient.from("events").insert([payload]);

    form.reset();
    alert("Envoyé !");
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

  function populateMonthFilter() {
    if (!dateFilter) return;

    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(
        d.getMonth() + 1
      ).padStart(2, "0")}`;

      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = d.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      });

      dateFilter.appendChild(opt);
    }
  }

  function resetFilters() {
    searchInput.value = "";
    regionFilter.value = "";
    typeFilter.value = "";
    dateFilter.value = "";

    renderFilteredEvents();
  }

  function setLoadingState() {
    if (eventsGrid)
      eventsGrid.innerHTML = "<p>Chargement...</p>";
  }

  function setErrorState(msg) {
    if (eventsGrid) eventsGrid.innerHTML = `<p>${msg}</p>`;
  }
})();
