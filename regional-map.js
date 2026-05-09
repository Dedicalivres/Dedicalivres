(function () {
  "use strict";

  const root = document.getElementById("regional-map-app");
  const config = window.DEDICALIVRES_CONFIG;

  if (!root) return;

  /*
    V7.6.7d — Carte régionale premium ordonnée
    Carte volontairement semi-schématique : elle privilégie la lisibilité,
    la navigation mobile et les compteurs dynamiques plutôt qu'une précision IGN.
  */
  const REGIONS = [
    {
      name: "Bretagne",
      slug: "bretagne",
      href: "evenements-litteraires-bretagne.html",
      color: "#b7efd8",
      points: "50,210 160,178 220,235 165,296 58,270",
      label: [135,230],
      badge: [137,264],
      description: "Librairies, festivals, salons et rendez-vous bretons"
    },
    {
      name: "Normandie",
      slug: "normandie",
      href: "evenements-litteraires-normandie.html",
      color: "#cfe7ff",
      points: "180,120 330,102 378,168 318,224 198,206",
      label: [278,158],
      badge: [296,190],
      description: "Rouen, Caen, littoral normand et rencontres d’auteurs"
    },
    {
      name: "Hauts-de-France",
      slug: "hauts-de-france",
      href: "evenements-litteraires-hauts-de-france.html",
      color: "#eadfff",
      points: "390,48 535,52 565,132 510,190 398,165",
      label: [472,98],
      badge: [486,134],
      description: "Lille, Amiens, salons, dédicaces et festivals littéraires"
    },
    {
      name: "Île-de-France",
      slug: "ile-de-france",
      href: "evenements-litteraires-ile-de-france.html",
      color: "#fff0b8",
      points: "392,205 505,190 535,265 468,325 378,282",
      label: [455,240],
      badge: [462,276],
      description: "Paris, librairies, salons et rendez-vous franciliens"
    },
    {
      name: "Grand Est",
      slug: "grand-est",
      href: "evenements-litteraires-grand-est.html",
      color: "#ffd7cf",
      points: "575,122 770,150 832,254 724,348 565,292 535,190",
      label: [688,210],
      badge: [715,252],
      description: "Strasbourg, Reims, Metz, Nancy et rendez-vous du livre"
    },
    {
      name: "Pays de la Loire",
      slug: "pays-de-la-loire",
      href: "evenements-litteraires-pays-de-la-loire.html",
      color: "#ffe5d0",
      points: "158,316 315,256 382,318 338,430 188,438 98,368",
      label: [252,346],
      badge: [274,382],
      description: "Nantes, Angers, Le Mans et événements autour du livre"
    },
    {
      name: "Centre-Val de Loire",
      slug: "centre-val-de-loire",
      href: "evenements-litteraires-centre-val-de-loire.html",
      color: "#d8f3df",
      points: "392,316 545,306 590,430 500,512 348,440",
      label: [470,388],
      badge: [468,430],
      description: "Tours, Orléans, rencontres et événements littéraires"
    },
    {
      name: "Bourgogne-Franche-Comté",
      slug: "bourgogne-franche-comte",
      href: "evenements-litteraires-bourgogne-franche-comte.html",
      color: "#fff2bf",
      points: "565,328 728,360 735,502 598,570 500,512 590,430",
      label: [640,426],
      badge: [642,474],
      description: "Dijon, Besançon, librairies et rendez-vous du livre"
    },
    {
      name: "Nouvelle-Aquitaine",
      slug: "nouvelle-aquitaine",
      href: "evenements-litteraires-nouvelle-aquitaine.html",
      color: "#cfe8ff",
      points: "150,468 338,458 475,548 392,658 190,650 70,552",
      label: [275,545],
      badge: [296,590],
      description: "Bordeaux, littoral, salons et festivals du livre"
    },
    {
      name: "Occitanie",
      slug: "occitanie",
      href: "evenements-litteraires-occitanie.html",
      color: "#ffd7e5",
      points: "326,570 488,540 594,606 535,710 352,718 240,650",
      label: [415,626],
      badge: [416,668],
      description: "Toulouse, Montpellier, festivals et rencontres d’auteurs"
    },
    {
      name: "Auvergne-Rhône-Alpes",
      slug: "auvergne-rhone-alpes",
      href: "evenements-litteraires-auvergne-rhone-alpes.html",
      color: "#e6d9ff",
      points: "528,538 675,548 760,624 680,720 535,710 594,606",
      label: [650,622],
      badge: [650,672],
      description: "Lyon, Grenoble, Clermont-Ferrand et rencontres régionales"
    },
    {
      name: "Provence-Alpes-Côte d’Azur",
      slug: "provence-alpes-cote-azur",
      href: "evenements-litteraires-provence-alpes-cote-azur.html",
      color: "#d8ebff",
      points: "705,538 860,510 882,604 762,680 680,624",
      label: [782,592],
      badge: [782,638],
      description: "Marseille, Nice, Toulon, festivals et dédicaces"
    },
    {
      name: "Corse",
      slug: "corse",
      href: "evenements-litteraires-corse.html",
      color: "#ffe8b8",
      points: "820,655 865,682 846,754 795,732",
      label: [832,708],
      badge: [832,744],
      description: "Ajaccio, Bastia, rencontres insulaires et salons du livre"
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
      console.warn("Carte régionale : compteurs indisponibles", error);
    }
  }

  function render() {
    const total = Object.values(state.counts).reduce((sum, count) => sum + Number(count || 0), 0);
    const selectedCount = state.counts[state.selected.name] || 0;
    const topRegions = [...REGIONS]
      .sort((a, b) => (state.counts[b.name] || 0) - (state.counts[a.name] || 0))
      .slice(0, 5);

    root.innerHTML = `
      <div class="regional-map-layout">
        <div class="regional-map-card">
          <div class="regional-map-svg-wrap" aria-label="Carte de France des événements littéraires par région">
            <svg class="regional-map-svg" viewBox="0 0 920 760" role="img" aria-label="Carte de France des régions Dédicalivres avec compteurs d’événements">
              ${REGIONS.map(renderRegion).join("")}
            </svg>
          </div>

          <div class="regional-map-total">
            <span>Total France</span>
            <strong>${total}</strong>
            <small>événement${total > 1 ? "s" : ""} à venir</small>
          </div>
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

  function renderRegion(region) {
    const count = state.counts[region.name] || 0;
    const labelLines = splitRegionName(region.name);
    const labelYStart = region.label[1] - ((labelLines.length - 1) * 10);

    return `
      <a class="regional-region-link ${state.selected.name === region.name ? "is-active" : ""}" href="${region.href}" data-region="${escapeAttribute(region.name)}" aria-label="${escapeAttribute(region.name)} — ${count} événement${count > 1 ? "s" : ""}">
        <polygon class="regional-shape" points="${region.points}" fill="${region.color}"></polygon>
        ${labelLines.map((line, index) => `<text class="regional-label" x="${region.label[0]}" y="${labelYStart + index * 21}">${escapeHtml(line)}</text>`).join("")}
        <circle class="regional-count-badge" cx="${region.badge[0]}" cy="${region.badge[1]}" r="16"></circle>
        <text class="regional-count-text" x="${region.badge[0]}" y="${region.badge[1]}">${count}</text>
      </a>
    `;
  }

  function bindInteractions() {
    root.querySelectorAll(".regional-region-link").forEach((link) => {
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

  function splitRegionName(name) {
    if (name === "Auvergne-Rhône-Alpes") return ["Auvergne-", "Rhône-Alpes"];
    if (name === "Bourgogne-Franche-Comté") return ["Bourgogne-", "Franche-Comté"];
    if (name === "Centre-Val de Loire") return ["Centre-Val", "de Loire"];
    if (name === "Nouvelle-Aquitaine") return ["Nouvelle-", "Aquitaine"];
    if (name === "Provence-Alpes-Côte d’Azur") return ["Provence-Alpes-", "Côte d’Azur"];
    if (name === "Hauts-de-France") return ["Hauts-de-France"];
    if (name === "Pays de la Loire") return ["Pays de la Loire"];
    if (name === "Île-de-France") return ["Île-de-France"];
    return [name];
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
