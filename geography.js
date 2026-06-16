(function () {
  "use strict";

  const COUNTRIES = {
    FR: {
      name: "France",
      adjective: "français",
      subdivisionLabel: "Région",
      subdivisions: [
        "Auvergne-Rhône-Alpes",
        "Bourgogne-Franche-Comté",
        "Bretagne",
        "Centre-Val de Loire",
        "Corse",
        "Grand Est",
        "Hauts-de-France",
        "Île-de-France",
        "Normandie",
        "Nouvelle-Aquitaine",
        "Occitanie",
        "Pays de la Loire",
        "Provence-Alpes-Côte d’Azur"
      ],
      center: [46.603354, 1.888334],
      zoom: 6,
      hashtags: ["#France", "#CultureFrance", "#LivreFrance"]
    },
    BE: {
      name: "Belgique",
      adjective: "belge",
      subdivisionLabel: "Région",
      subdivisions: [
        "Bruxelles-Capitale",
        "Flandre",
        "Wallonie"
      ],
      center: [50.64028, 4.666714],
      zoom: 8,
      hashtags: ["#Belgique", "#LivreBelge", "#CultureBelgique"]
    },
    LU: {
      name: "Luxembourg",
      adjective: "luxembourgeois",
      subdivisionLabel: "Canton",
      subdivisions: [
        "Capellen",
        "Clervaux",
        "Diekirch",
        "Echternach",
        "Esch-sur-Alzette",
        "Grevenmacher",
        "Luxembourg",
        "Mersch",
        "Redange",
        "Remich",
        "Vianden",
        "Wiltz"
      ],
      center: [49.815273, 6.129583],
      zoom: 9,
      hashtags: ["#Luxembourg", "#LivreLuxembourg", "#CultureLuxembourg"]
    },
    CH: {
      name: "Suisse",
      adjective: "suisse",
      subdivisionLabel: "Canton",
      subdivisions: [
        "Argovie",
        "Appenzell Rhodes-Extérieures",
        "Appenzell Rhodes-Intérieures",
        "Bâle-Campagne",
        "Bâle-Ville",
        "Berne",
        "Fribourg",
        "Genève",
        "Glaris",
        "Grisons",
        "Jura",
        "Lucerne",
        "Neuchâtel",
        "Nidwald",
        "Obwald",
        "Saint-Gall",
        "Schaffhouse",
        "Schwytz",
        "Soleure",
        "Tessin",
        "Thurgovie",
        "Uri",
        "Valais",
        "Vaud",
        "Zoug",
        "Zurich"
      ],
      center: [46.818188, 8.227512],
      zoom: 8,
      hashtags: ["#Suisse", "#LivreSuisse", "#CultureSuisse"]
    },
    MC: {
      name: "Monaco",
      adjective: "monégasque",
      subdivisionLabel: "Territoire",
      subdivisions: ["Monaco"],
      center: [43.738418, 7.424616],
      zoom: 13,
      hashtags: ["#Monaco", "#LivreMonaco", "#CultureMonaco"]
    }
  };

  const DEFAULT_COUNTRY_CODE = "FR";
  const EUROPE_CENTER = [47.2, 5.1];
  const EUROPE_ZOOM = 5;

  function normalizeCountryCode(value) {
    const code = String(value || DEFAULT_COUNTRY_CODE).trim().toUpperCase();
    return COUNTRIES[code] ? code : DEFAULT_COUNTRY_CODE;
  }

  function getCountry(value) {
    return COUNTRIES[normalizeCountryCode(value)];
  }

  function getCountryName(value) {
    return getCountry(value).name;
  }

  function getCountryCode(record) {
    return normalizeCountryCode(record?.country_code || record?.countryCode);
  }

  function getSubdivisions(value) {
    return [...getCountry(value).subdivisions];
  }

  function getSubdivisionLabel(value) {
    return getCountry(value).subdivisionLabel;
  }

  function populateCountrySelect(select, options = {}) {
    if (!select) return;

    const includeAll = options.includeAll === true;
    const selected = options.selected == null
      ? (includeAll ? "" : DEFAULT_COUNTRY_CODE)
      : String(options.selected);

    select.innerHTML = "";

    if (includeAll) {
      const allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = options.allLabel || "Tous les pays";
      select.appendChild(allOption);
    }

    Object.entries(COUNTRIES).forEach(([code, country]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = country.name;
      option.selected = code === selected;
      select.appendChild(option);
    });
  }

  function populateSubdivisionSelect(select, countryCode, options = {}) {
    if (!select) return;

    const code = normalizeCountryCode(countryCode);
    const selected = String(options.selected || "");
    const label = getSubdivisionLabel(code);

    select.innerHTML = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = options.emptyLabel || `Toutes les ${label.toLowerCase()}s`;
    select.appendChild(emptyOption);

    getSubdivisions(code).forEach((subdivision) => {
      const option = document.createElement("option");
      option.value = subdivision;
      option.textContent = subdivision;
      option.selected = subdivision === selected;
      select.appendChild(option);
    });
  }

  function formatPlace(record, options = {}) {
    const city = String(record?.city || "").trim();
    const region = String(record?.region || "").trim();
    const countryCode = getCountryCode(record);
    const country = getCountryName(countryCode);
    const includeCountry = options.includeCountry !== false;
    const separator = String(options.separator || ", ");
    const parts = [city, region].filter(Boolean);

    if (includeCountry && country && !parts.includes(country)) {
      parts.push(country);
    }

    return parts.join(separator);
  }

  function getMapView(countryCode) {
    if (!countryCode) {
      return { center: EUROPE_CENTER, zoom: EUROPE_ZOOM };
    }

    const country = getCountry(countryCode);
    return { center: country.center, zoom: country.zoom };
  }

  function getCountryHashtags(countryCode) {
    return [...getCountry(countryCode).hashtags];
  }

  window.DEDICALIVRES_GEO = Object.freeze({
    COUNTRIES,
    DEFAULT_COUNTRY_CODE,
    EUROPE_CENTER,
    EUROPE_ZOOM,
    normalizeCountryCode,
    getCountry,
    getCountryName,
    getCountryCode,
    getSubdivisions,
    getSubdivisionLabel,
    populateCountrySelect,
    populateSubdivisionSelect,
    formatPlace,
    getMapView,
    getCountryHashtags
  });
})();
