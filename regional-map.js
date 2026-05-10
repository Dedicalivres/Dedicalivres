(function () {
  "use strict";

  const root = document.getElementById("regional-map-app");
  const config = window.DEDICALIVRES_CONFIG;

  if (!root) return;

  /*
    V7.7.2e — Carte régionale aquarelle + positions corrigées avec compteurs contextualisés par page.
    La carte visuelle utilise un SVG réel des régions de France comme fond,
    avec des points cliquables et compteurs dynamiques par région.
    Source cartographique affichée en attribution dans le bloc.
  */

  const MAP_IMAGE_URL = "https://simplemaps.com/static/svg/country/fr/admin1/fr.svg";

  const eventTypes = (document.body.dataset.eventTypes || document.body.dataset.eventType || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const counterContext = (() => {
    const mode = document.body.dataset.agendaMode || "global";

    if (mode === "salons" || eventTypes.includes("Salon") || eventTypes.includes("Festival")) {
      return {
        labelSingular: "salon/festival",
        labelPlural: "salons/festivals",
        help: "salons du livre et festivals littéraires validés et à venir"
      };
    }

    if (mode === "dedicaces" || eventTypes.includes("Dédicace")) {
      return {
        labelSingular: "dédicace",
        labelPlural: "dédicaces",
        help: "séances de dédicace validées et à venir"
      };
    }

    return {
      labelSingular: "événement",
      labelPlural: "événements",
      help: "événements littéraires validés et à venir"
    };
  })();

  const REGIONS = [
    {
      name: "Île-de-France",
      slug: "ile-de-france",
      color: "#f3d6e9",
      washW: 22,
      washH: 18,
      href: "evenements-litteraires-ile-de-france.html",
      description: "Paris, librairies, salons et rendez-vous franciliens",
      x: 52,
      y: 36
    },
    {
      name: "Auvergne-Rhône-Alpes",
      slug: "auvergne-rhone-alpes",
      color: "#bfe7de",
      washW: 28,
      washH: 24,
      href: "evenements-litteraires-auvergne-rhone-alpes.html",
      description: "Lyon, Grenoble, Clermont-Ferrand et rencontres régionales",
      x: 60,
      y: 66
    },
    {
      name: "Nouvelle-Aquitaine",
      slug: "nouvelle-aquitaine",
      color: "#d8c7ea",
      washW: 28,
      washH: 24,
      href: "evenements-litteraires-nouvelle-aquitaine.html",
      description: "Bordeaux, littoral, salons et festivals du livre",
      x: 37,
      y: 62
    },
    {
      name: "Occitanie",
      slug: "occitanie",
      color: "#f5b9c8",
      washW: 30,
      washH: 20,
      href: "evenements-litteraires-occitanie.html",
      description: "Toulouse, Montpellier, festivals et rencontres d’auteurs",
      x: 49,
      y: 80
    },
    {
      name: "Bretagne",
      slug: "bretagne",
      color: "#b9e1df",
      washW: 22,
      washH: 16,
      href: "evenements-litteraires-bretagne.html",
      description: "Librairies, festivals, salons et rendez-vous bretons",
      x: 24,
      y: 36
    },
    {
      name: "Bourgogne-Franche-Comté",
      slug: "bourgogne-franche-comte",
      color: "#f7c8bd",
      washW: 24,
      washH: 18,
      href: "evenements-litteraires-bourgogne-franche-comte.html",
      description: "Dijon, Besançon, librairies et rendez-vous du livre",
      x: 66,
      y: 48
    },
    {
      name: "Centre-Val de Loire",
      slug: "centre-val-de-loire",
      color: "#f6dfaa",
      washW: 26,
      washH: 18,
      href: "evenements-litteraires-centre-val-de-loire.html",
      description: "Tours, Orléans, rencontres et événements littéraires",
      x: 43,
      y: 47
    },
    {
      name: "Corse",
      slug: "corse",
      color: "#f2b8c7",
      washW: 12,
      washH: 14,
      href: "evenements-litteraires-corse.html",
      description: "Ajaccio, Bastia, rencontres insulaires et salons du livre",
      x: 82,
      y: 86
    },
    {
      name: "Grand Est",
      slug: "grand-est",
      color: "#d8c6eb",
      washW: 27,
      washH: 22,
      href: "evenements-litteraires-grand-est.html",
      description: "Strasbourg, Reims, Metz, Nancy et rendez-vous du livre",
      x: 74,
      y: 30
    },
    {
      name: "Hauts-de-France",
      slug: "hauts-de-france",
      color: "#bfe6ef",
      washW: 22,
      washH: 16,
      href: "evenements-litteraires-hauts-de-france.html",
      description: "Lille, Amiens, salons, dédicaces et festivals littéraires",
      x: 53,
      y: 18
    },
    {
      name: "Normandie",
      slug: "normandie",
      color: "#c9e7c8",
      washW: 25,
      washH: 17,
      href: "evenements-litteraires-normandie.html",
      description: "Rouen, Caen, littoral normand et rencontres d’auteurs",
      x: 34,
      y: 28
    },
    {
      name: "Pays de la Loire",
      slug: "pays-de-la-loire",
      color: "#f6cfbc",
      washW: 24,
      washH: 16,
      href: "evenements-litteraires-pays-de-la-loire.html",
      description: "Nantes, Angers, Le Mans et événements autour du livre",
      x: 33,
      y: 47
    },
    {
      name: "Provence-Alpes-Côte d’Azur",
      slug: "provence-alpes-cote-azur",
      color: "#f7d69a",
      washW: 24,
      washH: 18,
      href: "evenements-litteraires-provence-alpes-cote-azur.html",
      description: "Marseille, Nice, Toulon, festivals et dédicaces",
      x: 73,
      y: 75
    }
  ];

  const state = {
    counts: Object.fromEntries(REGIONS.map((region) => [region.name, 0])),
    selected: REGIONS.find((region) => region.name === "Bretagne") || REGIONS[0]
  };


  function getContextQuery() {
    const mode = document.body.dataset.agendaMode || "global";
    if (mode === "salons" || eventTypes.includes("Salon") || eventTypes.includes("Festival")) {
      return "?types=Salon,Festival";
    }
    if (mode === "dedicaces" || eventTypes.includes("Dédicace")) {
      return "?type=Dédicace";
    }
    return "";
  }

  function regionHref(region) {
    return `${region.href}${getContextQuery()}`;
  }

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
        .select("region,type,start_date,end_date,validated,rejected")
        .eq("validated", true)
        .eq("rejected", false)
        .or(`end_date.is.null,end_date.gte.${today}`);

      if (error) throw error;

      const counts = Object.fromEntries(REGIONS.map((region) => [region.name, 0]));

      (Array.isArray(data) ? data : []).forEach((event) => {
        if (eventTypes.length && !eventTypes.includes(event.type)) return;

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
          <div class="regional-real-map-wrap regional-watercolor-map-wrap" aria-label="Carte aquarelle des régions de France avec compteurs Dédicalivres">
            <div class="regional-watercolor-layer" aria-hidden="true">
              ${REGIONS.map(renderRegionWash).join("")}
            </div>
            <img class="regional-real-map-image regional-watercolor-map-base" src="${MAP_IMAGE_URL}" alt="Carte des régions de France" loading="lazy" />
            <div class="regional-real-map-overlay" aria-label="Régions cliquables">
              ${REGIONS.map(renderRegionMarker).join("")}
            </div>
          </div>

          <div class="regional-map-total regional-map-total-real">
            <span>Total France</span>
            <strong>${total}</strong>
            <small>${total > 1 ? counterContext.labelPlural : counterContext.labelSingular} à venir</small>
          </div>

          <p class="regional-map-attribution">
            Carte aquarelle Dédicalivres — support visuel régional avec contours de référence.
          </p>
        </div>

        <aside class="regional-map-panel" aria-live="polite">
          <div>
            <h3>${escapeHtml(state.selected.name)}</h3>
            <span class="regional-map-selected-count">${selectedCount} ${selectedCount > 1 ? counterContext.labelPlural : counterContext.labelSingular} à venir</span>
            <p>${escapeHtml(state.selected.description)}</p>

            <div class="regional-map-panel-list" aria-label="Régions les plus alimentées">
              ${topRegions.map((region) => `
                <a class="regional-map-mini-row" href="${regionHref(region)}">
                  <strong>${escapeHtml(region.name)}</strong>
                  <span>${state.counts[region.name] || 0}</span>
                </a>
              `).join("")}
            </div>
          </div>

          <div class="regional-map-panel-actions">
            <a class="btn-primary" href="${regionHref(state.selected)}">Voir les événements en ${escapeHtml(state.selected.name)}</a>
            <a class="btn-secondary" href="index.html#soumettre">Proposer un événement</a>
          </div>
        </aside>
      </div>

      <div class="regional-map-help">
        <strong>Comment ça marche ?</strong>
        <p>
          Les compteurs sont mis à jour à partir des ${counterContext.help}.
          Une région peu alimentée reste visible afin d’encourager les lecteurs,
          auteurs, librairies et organisateurs à partager leurs rendez-vous.
        </p>
      </div>

      <div class="regional-map-mobile-list" aria-label="Liste des régions">
        ${REGIONS.map((region) => `
          <a href="${regionHref(region)}">
            <strong>${escapeHtml(region.name)}</strong>
            <span>${state.counts[region.name] || 0}</span>
          </a>
        `).join("")}
      </div>
    `;

    bindInteractions();
  }


  function renderRegionWash(region) {
    const active = state.selected.name === region.name ? " is-active" : "";
    return `
      <span
        class="regional-watercolor-region region-${region.slug}${active}"
        style="--x:${region.x}%;--y:${region.y}%;--w:${region.washW || 24}%;--h:${region.washH || 18}%;--region-color:${region.color || '#d8e7d4'};"
      ></span>
    `;
  }

  function renderRegionMarker(region) {
    const count = state.counts[region.name] || 0;
    const active = state.selected.name === region.name ? " is-active" : "";

    return `
      <a
        class="regional-real-marker region-${region.slug}${active}"
        href="${regionHref(region)}"
        data-region="${escapeAttribute(region.name)}"
        style="--x:${region.x}%;--y:${region.y}%;"
        aria-label="${escapeAttribute(region.name)} — ${count} ${count > 1 ? counterContext.labelPlural : counterContext.labelSingular}"
      >
        <span class="regional-real-marker-name">${escapeHtml(region.name)}</span>
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
