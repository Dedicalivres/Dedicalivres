(function () {
  "use strict";

  const root = document.getElementById("regional-map-app");
  const config = window.DEDICALIVRES_CONFIG;

  if (!root) return;

  /*
    V7.6.7e — Carte régionale réelle.
    La carte visuelle utilise un SVG réel des régions de France comme fond,
    avec des points cliquables et compteurs dynamiques par région.
    Source cartographique affichée en attribution dans le bloc.
  */

  const MAP_IMAGE_URL = "https://simplemaps.com/static/svg/country/fr/admin1/fr.svg";

  const REGIONS = [
    {
      name: "Île-de-France",
      slug: "ile-de-france",
      href: "evenements-litteraires-ile-de-france.html",
      description: "Paris, librairies, salons et rendez-vous franciliens",
      x: 52,
      y: 34
    },
    {
      name: "Auvergne-Rhône-Alpes",
      slug: "auvergne-rhone-alpes",
      href: "evenements-litteraires-auvergne-rhone-alpes.html",
      description: "Lyon, Grenoble, Clermont-Ferrand et rencontres régionales",
      x: 61,
      y: 63
    },
    {
      name: "Nouvelle-Aquitaine",
      slug: "nouvelle-aquitaine",
      href: "evenements-litteraires-nouvelle-aquitaine.html",
      description: "Bordeaux, littoral, salons et festivals du livre",
      x: 36,
      y: 61
    },
    {
      name: "Occitanie",
      slug: "occitanie",
      href: "evenements-litteraires-occitanie.html",
      description: "Toulouse, Montpellier, festivals et rencontres d’auteurs",
      x: 49,
      y: 78
    },
    {
      name: "Bretagne",
      slug: "bretagne",
      href: "evenements-litteraires-bretagne.html",
      description: "Librairies, festivals, salons et rendez-vous bretons",
      x: 19,
      y: 34
    },
    {
      name: "Bourgogne-Franche-Comté",
      slug: "bourgogne-franche-comte",
      href: "evenements-litteraires-bourgogne-franche-comte.html",
      description: "Dijon, Besançon, librairies et rendez-vous du livre",
      x: 66,
      y: 45
    },
    {
      name: "Centre-Val de Loire",
      slug: "centre-val-de-loire",
      href: "evenements-litteraires-centre-val-de-loire.html",
      description: "Tours, Orléans, rencontres et événements littéraires",
      x: 43,
      y: 44
    },
    {
      name: "Corse",
      slug: "corse",
      href: "evenements-litteraires-corse.html",
      description: "Ajaccio, Bastia, rencontres insulaires et salons du livre",
      x: 82,
      y: 86
    },
    {
      name: "Grand Est",
      slug: "grand-est",
      href: "evenements-litteraires-grand-est.html",
      description: "Strasbourg, Reims, Metz, Nancy et rendez-vous du livre",
      x: 73,
      y: 27
    },
    {
      name: "Hauts-de-France",
      slug: "hauts-de-france",
      href: "evenements-litteraires-hauts-de-france.html",
      description: "Lille, Amiens, salons, dédicaces et festivals littéraires",
      x: 52,
      y: 15
    },
    {
      name: "Normandie",
      slug: "normandie",
      href: "evenements-litteraires-normandie.html",
      description: "Rouen, Caen, littoral normand et rencontres d’auteurs",
      x: 33,
      y: 25
    },
    {
      name: "Pays de la Loire",
      slug: "pays-de-la-loire",
      href: "evenements-litteraires-pays-de-la-loire.html",
      description: "Nantes, Angers, Le Mans et événements autour du livre",
      x: 30,
      y: 45
    },
    {
      name: "Provence-Alpes-Côte d’Azur",
      slug: "provence-alpes-cote-azur",
      href: "evenements-litteraires-provence-alpes-cote-azur.html",
      description: "Marseille, Nice, Toulon, festivals et dédicaces",
      x: 73,
      y: 73
    }
  ];

  const state = {
    counts: Object.fromEntries(REGIONS.map((region) => [region.name, 0])),
    selected: REGIONS.find((region) => region.name === "Bretagne") || REGIONS[0]
  };

  render();
  loadCounts();

  async function loadCounts() {
    if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
      return;
    }

    try {
      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const today = new Date().toISOString().slice(0, 10);

      const { data, error } = await client
        .from("events")
        .select("region,start_date,end_date,validated,rejected")
        .eq("validated", true)
        .eq("rejected", false)
        .or(`end_date.is.null,end_date.gte.${today}`);

      if (error) throw error;

      const counts = Object.fromEntries(REGIONS.map((region) => [region.name, 0]));

      (Array.isArray(data) ? data : []).forEach((event) => {
        const region = String(event.region || "").trim();
        if (!region || !(region in counts)) return;

        const start = event.start_date || "2999-12-31";
        const end = event.end_date || start;
        if (end < today) return;

        counts[region] += 1;
      });

      state.counts = counts;

      const topRegion = [...REGIONS]
        .sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0))[0];

      if (topRegion && (counts[topRegion.name] || 0) > 0) {
        state.selected = topRegion;
      }

      render();
    } catch (error) {
      console.warn("Carte régionale réelle : compteurs indisponibles", error);
    }
  }

  function render() {
    const total = Object.values(state.counts).reduce((sum, count) => sum + Number(count || 0), 0);
    const selectedCount = state.counts[state.selected.name] || 0;
    const topRegions = [...REGIONS]
      .sort((a, b) => (state.counts[b.name] || 0) - (state.counts[a.name] || 0))
      .slice(0, 5);

    root.innerHTML = `
      <div class="regional-map-layout regional-map-layout-real">
        <div class="regional-map-card regional-map-card-real">
          <div class="regional-real-map-wrap" aria-label="Carte réelle des régions de France avec compteurs Dédicalivres">
            <img class="regional-real-map-image" src="${MAP_IMAGE_URL}" alt="Carte des régions de France" loading="lazy" />
            <div class="regional-real-map-overlay" aria-label="Régions cliquables">
              ${REGIONS.map(renderRegionMarker).join("")}
            </div>
          </div>

          <div class="regional-map-total regional-map-total-real">
            <span>Total France</span>
            <strong>${total}</strong>
            <small>événement${total > 1 ? "s" : ""} à venir</small>
          </div>

          <p class="regional-map-attribution">
            Carte de référence : SimpleMaps — contours régionaux utilisés comme support visuel.
          </p>
        </div>

        <aside class="regional-map-panel" aria-live="polite">
          <div>
            <h3>${escapeHtml(state.selected.name)}</h3>
            <span class="regional-map-selected-count">${selectedCount} événement${selectedCount > 1 ? "s" : ""} à venir</span>
            <p>${escapeHtml(state.selected.description)}</p>

            <div class="regional-map-panel-list" aria-label="Régions les plus alimentées">
              ${topRegions.map((region) => `
                <a class="regional-map-mini-row" href="${region.href}">
                  <strong>${escapeHtml(region.name)}</strong>
                  <span>${state.counts[region.name] || 0}</span>
                </a>
              `).join("")}
            </div>
          </div>

          <div class="regional-map-panel-actions">
            <a class="btn-primary" href="${state.selected.href}">Voir les événements en ${escapeHtml(state.selected.name)}</a>
            <a class="btn-secondary" href="index.html#soumettre">Proposer un événement</a>
          </div>
        </aside>
      </div>

      <div class="regional-map-help">
        <strong>Comment ça marche ?</strong>
        <p>
          Les compteurs sont mis à jour à partir des événements validés et à venir.
          Une région peu alimentée reste visible afin d’encourager les lecteurs,
          auteurs, librairies et organisateurs à partager leurs rendez-vous.
        </p>
      </div>

      <div class="regional-map-mobile-list" aria-label="Liste des régions">
        ${REGIONS.map((region) => `
          <a href="${region.href}">
            <strong>${escapeHtml(region.name)}</strong>
            <span>${state.counts[region.name] || 0}</span>
          </a>
        `).join("")}
      </div>
    `;

    bindInteractions();
  }

  function renderRegionMarker(region) {
    const count = state.counts[region.name] || 0;
    const active = state.selected.name === region.name ? " is-active" : "";

    return `
      <a
        class="regional-real-marker${active}"
        href="${region.href}"
        data-region="${escapeAttribute(region.name)}"
        style="--x:${region.x}%;--y:${region.y}%;"
        aria-label="${escapeAttribute(region.name)} — ${count} événement${count > 1 ? "s" : ""}"
      >
        <span class="regional-real-marker-name">${escapeHtml(shortRegionName(region.name))}</span>
        <span class="regional-real-marker-count">${count}</span>
      </a>
    `;
  }

  function bindInteractions() {
    root.querySelectorAll(".regional-real-marker").forEach((link) => {
      const regionName = link.dataset.region;
      const region = REGIONS.find((item) => item.name === regionName);

      ["mouseenter", "focus"].forEach((eventName) => {
        link.addEventListener(eventName, () => {
          if (!region || state.selected.name === region.name) return;
          state.selected = region;
          render();
        });
      });
    });
  }

  function shortRegionName(name) {
    if (name === "Provence-Alpes-Côte d’Azur") return "PACA";
    if (name === "Auvergne-Rhône-Alpes") return "AURA";
    if (name === "Bourgogne-Franche-Comté") return "BFC";
    if (name === "Centre-Val de Loire") return "Centre";
    if (name === "Nouvelle-Aquitaine") return "N.-Aquitaine";
    if (name === "Hauts-de-France") return "Hauts-de-F.";
    if (name === "Pays de la Loire") return "P. de la Loire";
    if (name === "Île-de-France") return "Île-de-F.";
    return name;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
