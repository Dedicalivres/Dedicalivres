(function () {
  "use strict";

  const root = document.getElementById("regional-map-app");
  const config = window.DEDICALIVRES_CONFIG;
  const geo = window.DEDICALIVRES_GEO;

  if (!root || !geo) return;

  const pageMode = document.body.dataset.agendaMode || "global";
  const requestedTypes = (() => {
    if (pageMode === "salons") return ["Salon", "Festival"];
    if (pageMode === "dedicaces") return ["Dédicace"];

    return (document.body.dataset.eventTypes || document.body.dataset.eventType || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  })();

  const counterContext = pageMode === "salons"
    ? { singular: "salon/festival", plural: "salons/festivals" }
    : pageMode === "dedicaces"
      ? { singular: "dédicace", plural: "dédicaces" }
      : { singular: "événement", plural: "événements" };

  const COUNTRY_FLAGS = {
    FR: "🇫🇷",
    BE: "🇧🇪",
    LU: "🇱🇺",
    CH: "🇨🇭",
    MC: "🇲🇨"
  };

  const FRANCE_REGIONS = [
    ["Île-de-France", "ile-de-france", 52, 34],
    ["Auvergne-Rhône-Alpes", "auvergne-rhone-alpes", 61, 63],
    ["Nouvelle-Aquitaine", "nouvelle-aquitaine", 36, 61],
    ["Occitanie", "occitanie", 49, 78],
    ["Bretagne", "bretagne", 19, 34],
    ["Bourgogne-Franche-Comté", "bourgogne-franche-comte", 66, 45],
    ["Centre-Val de Loire", "centre-val-de-loire", 43, 44],
    ["Corse", "corse", 82, 86],
    ["Grand Est", "grand-est", 73, 27],
    ["Hauts-de-France", "hauts-de-france", 52, 15],
    ["Normandie", "normandie", 33, 25],
    ["Pays de la Loire", "pays-de-la-loire", 30, 45],
    ["Provence-Alpes-Côte d’Azur", "provence-alpes-cote-azur", 73, 73]
  ].map(([name, slug, x, y]) => ({
    name,
    slug,
    x,
    y,
    href: `evenements-litteraires-${slug}.html`
  }));

  const COUNTRY_MAPS = {
    FR: {
      src: "assets/maps/fr-regions.svg",
      width: 1000,
      height: 960,
      markers: FRANCE_REGIONS
    },
    BE: {
      src: "assets/maps/be-regions.svg",
      width: 1000,
      height: 817,
      markers: [
        ["Bruxelles-Capitale", 48.1, 35.1],
        ["Flandre", 57.6, 22.5],
        ["Wallonie", 71.7, 61.3]
      ].map(toMapMarker)
    },
    LU: {
      src: "assets/maps/lu-cantons.svg",
      width: 1000,
      height: 1000,
      markers: [
        ["Wiltz", 36.8, 34.3],
        ["Clervaux", 42.6, 17.1],
        ["Redange", 31.3, 52.8],
        ["Diekirch", 50.1, 44.4],
        ["Esch-sur-Alzette", 42.2, 87.3],
        ["Echternach", 66.8, 53.6],
        ["Grevenmacher", 68, 68],
        ["Capellen", 37.4, 71.2],
        ["Mersch", 49.8, 58],
        ["Remich", 65, 84.6],
        ["Vianden", 52, 36.3],
        ["Luxembourg", 53.9, 75.1]
      ].map(toMapMarker)
    },
    CH: {
      src: "assets/maps/ch-cantons.svg",
      width: 1000,
      height: 641,
      dense: true,
      markers: [
        ["Valais", 39.1, 78.7],
        ["Tessin", 62, 72.4],
        ["Grisons", 79.9, 56.7],
        ["Schaffhouse", 56.9, 8.3],
        ["Thurgovie", 68, 14.9],
        ["Zurich", 59.4, 23],
        ["Argovie", 49.6, 21.5],
        ["Bâle-Ville", 37.5, 15.7],
        ["Bâle-Campagne", 41.3, 21.5],
        ["Saint-Gall", 72.2, 36.3],
        ["Soleure", 36.5, 31.2],
        ["Jura", 28.1, 24.7],
        ["Genève", 8.4, 77.1],
        ["Vaud", 17.3, 58.2],
        ["Neuchâtel", 21.7, 41.4],
        ["Berne", 38, 51.2],
        ["Lucerne", 47.5, 37.3],
        ["Zoug", 56.5, 34.5],
        ["Uri", 58.4, 50.4],
        ["Schwytz", 60.9, 39.4],
        ["Glaris", 67, 42.9],
        ["Nidwald", 53.8, 44.8],
        ["Fribourg", 27.8, 55.6],
        ["Obwald", 50.1, 48.1],
        ["Appenzell Rhodes-Extérieures", 71.2, 25.4],
        ["Appenzell Rhodes-Intérieures", 73.7, 27.5]
      ].map(toMapMarker)
    },
    MC: {
      src: "assets/maps/mc-outline.svg",
      width: 1000,
      height: 879,
      markers: [["Monaco", 52, 50]].map(toMapMarker)
    }
  };

  const requestedCountry = new URLSearchParams(window.location.search).get("country");
  const initialCountry = geo.normalizeCountryCode(requestedCountry || "FR");
  const requestedSubdivision = new URLSearchParams(window.location.search).get("region") || "";

  const state = {
    countryCode: initialCountry,
    selectedSubdivision: geo.getSubdivisions(initialCountry).includes(requestedSubdivision)
      ? requestedSubdivision
      : "",
    counts: {},
    events: []
  };

  rebuildCounts();
  selectMostActiveSubdivision();
  render();
  loadCounts();

  function toMapMarker([name, x, y]) {
    return {
      name,
      slug: slugify(name),
      x,
      y
    };
  }

  async function loadCounts() {
    if (!config?.supabaseUrl || !config?.supabaseAnonKey || !window.supabase) return;

    try {
      const client =
        (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
        window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await client
        .from("events")
        .select("country_code,region,type,start_date,end_date,validated,rejected")
        .eq("validated", true)
        .eq("rejected", false)
        .or(`end_date.is.null,end_date.gte.${today}`);

      if (error) throw error;

      state.events = (Array.isArray(data) ? data : [])
        .filter(matchesPageMode)
        .filter((event) => (event.end_date || event.start_date || "2999-12-31") >= today);
      rebuildCounts();
      selectMostActiveSubdivision();
      render();
    } catch (error) {
      console.warn("Exploration territoriale indisponible :", error);
    }
  }

  function matchesPageMode(event) {
    if (pageMode === "salons") return ["Salon", "Festival"].includes(event.type);
    if (pageMode === "dedicaces") return event.type === "Dédicace";
    return !requestedTypes.length || requestedTypes.includes(event.type);
  }

  function rebuildCounts() {
    const subdivisions = geo.getSubdivisions(state.countryCode);
    state.counts = Object.fromEntries(subdivisions.map((name) => [name, 0]));

    state.events.forEach((event) => {
      if (geo.getCountryCode(event) !== state.countryCode) return;
      const subdivision = String(event.region || "").trim();
      if (Object.hasOwn(state.counts, subdivision)) {
        state.counts[subdivision] += 1;
      }
    });
  }

  function selectMostActiveSubdivision() {
    const subdivisions = geo.getSubdivisions(state.countryCode);
    const top = [...subdivisions].sort((a, b) => {
      return (state.counts[b] || 0) - (state.counts[a] || 0) || a.localeCompare(b, "fr");
    })[0];

    if (!subdivisions.includes(state.selectedSubdivision)) {
      state.selectedSubdivision = top || subdivisions[0] || "";
    }
  }

  function setCountry(countryCode) {
    state.countryCode = geo.normalizeCountryCode(countryCode);
    state.selectedSubdivision = "";
    rebuildCounts();
    selectMostActiveSubdivision();
    render();
  }

  function setSubdivision(name) {
    state.selectedSubdivision = name;
    render();
  }

  function render() {
    const country = geo.getCountry(state.countryCode);
    const total = Object.values(state.counts).reduce((sum, count) => sum + Number(count || 0), 0);
    const selectedCount = state.counts[state.selectedSubdivision] || 0;

    root.innerHTML = `
      <div class="regional-country-switcher" aria-label="Choisir un pays francophone">
        ${Object.entries(geo.COUNTRIES).map(([code, item]) => `
          <button
            type="button"
            class="${code === state.countryCode ? "is-active" : ""}"
            data-country-code="${code}"
          >
            <span class="regional-country-flag" aria-hidden="true">${COUNTRY_FLAGS[code] || ""}</span>
            <span>${escapeHtml(item.name)}</span>
            <span class="regional-country-flag" aria-hidden="true">${COUNTRY_FLAGS[code] || ""}</span>
          </button>
        `).join("")}
      </div>

      <div class="regional-map-layout regional-map-layout-real">
        <div class="regional-map-card regional-map-card-real">
          ${renderCountryMap(country)}

          <div class="regional-map-total regional-map-total-real">
            <span>Total ${escapeHtml(country.name)}</span>
            <strong>${total}</strong>
            <small>${total > 1 ? counterContext.plural : counterContext.singular} à venir</small>
          </div>

          <p class="regional-map-attribution">
            Contours cartographiques : SimpleMaps.
          </p>
        </div>

        <aside class="regional-map-panel" aria-live="polite">
          <div>
            <span class="category-kicker">${escapeHtml(country.subdivisionLabel)} sélectionné</span>
            <h3>${escapeHtml(state.selectedSubdivision || country.name)}</h3>
            <span class="regional-map-selected-count">
              ${selectedCount} ${selectedCount > 1 ? counterContext.plural : counterContext.singular} à venir
            </span>
            <p>
              Explorez les rendez-vous littéraires de ${escapeHtml(state.selectedSubdivision || country.name)}
              dans l’agenda francophone Dédicalivres.
            </p>

            <label class="regional-subdivision-select-label" for="regional-subdivision-select">
              ${escapeHtml(country.subdivisionLabel)}
            </label>
            <select id="regional-subdivision-select" class="regional-subdivision-select">
              ${country.subdivisions.map((subdivision) => `
                <option
                  value="${escapeAttribute(subdivision)}"
                  ${state.selectedSubdivision === subdivision ? "selected" : ""}
                >
                  ${escapeHtml(subdivision)} — ${state.counts[subdivision] || 0}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="regional-map-panel-actions">
            <a class="btn-primary" href="${getAgendaHref()}">Voir dans l’agenda</a>
            <a class="btn-secondary" href="soumettre.html">Proposer un événement</a>
          </div>
        </aside>
      </div>
    `;

    bindInteractions();
  }

  function renderCountryMap(country) {
    const map = COUNTRY_MAPS[state.countryCode] || COUNTRY_MAPS.FR;
    const markers = map.dense
      ? map.markers.filter((marker) => {
          return marker.name === state.selectedSubdivision || Number(state.counts[marker.name] || 0) > 0;
        })
      : map.markers;

    return `
      <div
        class="regional-real-map-wrap country-${state.countryCode.toLowerCase()}"
        style="--map-aspect:${map.width} / ${map.height};"
        aria-label="Carte des ${escapeAttribute(country.subdivisionLabel.toLowerCase())}s de ${escapeAttribute(country.name)}"
      >
        <img
          class="regional-real-map-image"
          src="${map.src}"
          alt="Carte de ${escapeAttribute(country.name)}"
          width="${map.width}"
          height="${map.height}"
          loading="lazy"
        />
        <div class="regional-real-map-overlay" aria-label="${escapeAttribute(country.subdivisionLabel)}s cliquables">
          ${markers.map((region) => `
            <button
              class="regional-real-marker region-${region.slug}${state.selectedSubdivision === region.name ? " is-active" : ""}"
              type="button"
              data-subdivision="${escapeAttribute(region.name)}"
              style="--x:${region.x}%;--y:${region.y}%;"
              aria-label="${escapeAttribute(`${region.name} — ${state.counts[region.name] || 0} ${counterContext.plural}`)}"
            >
              <span class="regional-real-marker-name">${escapeHtml(region.name)}</span>
              <span class="regional-real-marker-count">${state.counts[region.name] || 0}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function getAgendaHref() {
    const params = new URLSearchParams({
      country: state.countryCode,
      region: state.selectedSubdivision || ""
    });

    const target = pageMode === "salons"
      ? "salons-du-livre.html"
      : pageMode === "dedicaces"
        ? "dedicaces.html"
        : "index.html";

    return `${target}?${params.toString()}#agenda`;
  }

  function bindInteractions() {
    root.querySelectorAll("[data-country-code]").forEach((button) => {
      button.addEventListener("click", () => setCountry(button.dataset.countryCode));
    });

    root.querySelectorAll("[data-subdivision]").forEach((button) => {
      button.addEventListener("click", () => setSubdivision(button.dataset.subdivision));
    });

    root.querySelector("#regional-subdivision-select")?.addEventListener("change", (event) => {
      setSubdivision(event.target.value);
    });
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
