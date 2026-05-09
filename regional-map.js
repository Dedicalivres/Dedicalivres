(function () {
  "use strict";

  const root = document.getElementById("regional-map-app");
  const config = window.DEDICALIVRES_CONFIG;

  if (!root) return;

  const REGIONS = [
    { name: "Bretagne", slug: "bretagne", href: "evenements-litteraires-bretagne.html", color: "#b8efd9", points: "55,205 150,175 190,230 150,285 60,260", label: [128,230], badge: [125,260], description: "Librairies, festivals, salons et rendez-vous bretons" },
    { name: "Normandie", slug: "normandie", href: "evenements-litteraires-normandie.html", color: "#cce6ff", points: "170,110 300,100 340,170 280,215 190,200", label: [250,155], badge: [270,185], description: "Rouen, Caen, littoral normand et rencontres d’auteurs" },
    { name: "Hauts-de-France", slug: "hauts-de-france", href: "evenements-litteraires-hauts-de-france.html", color: "#eadcff", points: "330,55 455,60 485,140 425,185 340,165", label: [405,98], badge: [420,135], description: "Lille, Amiens, salons, dédicaces et festivals littéraires" },
    { name: "Île-de-France", slug: "ile-de-france", href: "evenements-litteraires-ile-de-france.html", color: "#fff1b8", points: "342,190 430,185 455,250 405,295 330,260", label: [390,228], badge: [405,262], description: "Paris, librairies, salons et rendez-vous franciliens" },
    { name: "Grand Est", slug: "grand-est", href: "evenements-litteraires-grand-est.html", color: "#ffd9d2", points: "490,115 650,145 705,250 605,330 470,275 450,185", label: [590,205], badge: [625,240], description: "Strasbourg, Reims, Metz, Nancy et rendez-vous du livre" },
    { name: "Pays de la Loire", slug: "pays-de-la-loire", href: "evenements-litteraires-pays-de-la-loire.html", color: "#ffe4cf", points: "150,280 275,235 330,285 290,400 165,405 90,340", label: [220,325], badge: [245,358], description: "Nantes, Angers, Le Mans et événements autour du livre" },
    { name: "Centre-Val de Loire", slug: "centre-val-de-loire", href: "evenements-litteraires-centre-val-de-loire.html", color: "#d7f4df", points: "320,285 455,280 505,390 415,480 290,405", label: [395,365], badge: [392,402], description: "Tours, Orléans, rencontres et événements littéraires" },
    { name: "Bourgogne-Franche-Comté", slug: "bourgogne-franche-comte", href: "evenements-litteraires-bourgogne-franche-comte.html", color: "#fff2bf", points: "455,305 605,335 620,465 500,530 415,480 505,390", label: [535,405], badge: [535,448], description: "Dijon, Besançon, librairies et rendez-vous du livre" },
    { name: "Nouvelle-Aquitaine", slug: "nouvelle-aquitaine", href: "evenements-litteraires-nouvelle-aquitaine.html", color: "#cde8ff", points: "155,420 290,420 405,505 350,610 205,610 95,520", label: [260,510], badge: [275,555], description: "Bordeaux, littoral, salons et festivals du livre" },
    { name: "Auvergne-Rhône-Alpes", slug: "auvergne-rhone-alpes", href: "evenements-litteraires-auvergne-rhone-alpes.html", color: "#e6d9ff", points: "420,505 525,540 620,520 680,600 560,640 420,615 350,610", label: [520,575], badge: [528,615], description: "Lyon, Grenoble, Clermont-Ferrand et rencontres régionales" },
    { name: "Occitanie", slug: "occitanie", href: "evenements-litteraires-occitanie.html", color: "#ffd8e4", points: "280,510 420,520 420,635 270,650 185,610", label: [330,585], badge: [330,622], description: "Toulouse, Montpellier, festivals et rencontres d’auteurs" },
    { name: "Provence-Alpes-Côte d’Azur", slug: "provence-alpes-cote-azur", href: "evenements-litteraires-provence-alpes-cote-azur.html", color: "#d8ebff", points: "620,525 735,500 755,575 680,635 600,610", label: [675,560], badge: [688,596], description: "Marseille, Nice, Toulon, festivals et dédicaces" },
    { name: "Corse", slug: "corse", href: "evenements-litteraires-corse.html", color: "#ffe7b8", points: "705,610 742,632 722,708 678,688", label: [710,670], badge: [710,704], description: "Ajaccio, Bastia, rencontres insulaires et salons du livre" }
  ];

  const state = {
    counts: Object.fromEntries(REGIONS.map((region) => [region.name, 0])),
    selected: REGIONS.find((region) => region.name === "Occitanie") || REGIONS[0]
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
            <svg class="regional-map-svg" viewBox="0 0 780 720" role="img" aria-labelledby="regional-map-title regional-map-desc">
              <title id="regional-map-title">Carte de France des régions Dédicalivres</title>
              <desc id="regional-map-desc">Chaque région est cliquable et affiche le nombre d'événements littéraires à venir référencés.</desc>
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
    const labelYStart = region.label[1] - ((labelLines.length - 1) * 9);

    return `
      <a class="regional-region-link ${state.selected.name === region.name ? "is-active" : ""}" href="${region.href}" data-region="${escapeAttribute(region.name)}" aria-label="${escapeAttribute(region.name)} — ${count} événement${count > 1 ? "s" : ""}">
        <polygon class="regional-shape" points="${region.points}" fill="${region.color}"></polygon>
        ${labelLines.map((line, index) => `<text class="regional-label" x="${region.label[0]}" y="${labelYStart + index * 22}">${escapeHtml(line)}</text>`).join("")}
        <circle class="regional-count-badge" cx="${region.badge[0]}" cy="${region.badge[1]}" r="18"></circle>
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
    if (name === "Auvergne-Rhône-Alpes") return ["Auvergne-Rhône", "Alpes"];
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
