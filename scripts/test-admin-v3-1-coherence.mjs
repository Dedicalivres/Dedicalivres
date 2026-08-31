import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = fs.readFileSync("admin.html", "utf8");
const source = fs.readFileSync("admin.js", "utf8");
const cockpitCss = fs.readFileSync("admin-cockpit.css", "utf8");
const watchCss = fs.readFileSync("admin-watch-v2.css", "utf8");

// A — La qualité de localisation distingue précisément ville et région.
const qualityStart = source.indexOf("function getEventLocationMissingLabel(");
const qualityEnd = source.indexOf("function renderEventQuality(", qualityStart);
assert.ok(qualityStart >= 0 && qualityEnd > qualityStart, "Fonctions qualité V3.1 introuvables");

const qualitySandbox = {
  hasEventCoords(event) {
    return Number.isFinite(Number(event?.latitude)) && Number.isFinite(Number(event?.longitude));
  }
};
vm.runInNewContext(
  `${source.slice(qualityStart, qualityEnd)}; globalThis.getQuality = getEventQuality;`,
  qualitySandbox
);

const completeEvent = {
  title: "Salon du livre de Fontvieille",
  start_date: "2026-09-20",
  city: "Fontvieille",
  region: "Provence-Alpes-Côte d’Azur",
  latitude: 43.727,
  longitude: 4.709,
  image_url: "https://example.test/image.jpg",
  description: "Une description éditoriale complète de plus de cent vingt caractères pour garantir le contrôle précis du score de qualité sans dépendance externe.",
  website: "https://example.test/evenement"
};

assert.deepEqual(
  JSON.parse(JSON.stringify(qualitySandbox.getQuality(completeEvent))),
  { score: 100, missing: [], level: "good", label: "Complet" }
);

const cityOnly = qualitySandbox.getQuality({ ...completeEvent, region: "" });
assert.equal(cityOnly.score, 85);
assert.equal(cityOnly.label, "Solide", "Une fiche incomplète ne doit pas être libellée Complet");
assert.deepEqual([...cityOnly.missing], ["Région manquante"]);
assert.ok(!cityOnly.missing.some((label) => /ville/i.test(label)), "La ville présente ne doit pas être annoncée manquante");

assert.deepEqual(
  [...qualitySandbox.getQuality({ ...completeEvent, city: "" }).missing],
  ["Ville manquante"]
);
assert.deepEqual(
  [...qualitySandbox.getQuality({ ...completeEvent, city: "", region: "" }).missing],
  ["Ville et région manquantes"]
);
assert.ok(source.includes('add("important", "Région manquante")'), "La file de correction doit signaler une région absente");

// B — Les métriques qualité annoncent leur périmètre sans forcer le total global.
assert.ok(source.includes("const excludedCount = allEvents.length - analyzedEvents.length;"));
assert.ok(source.includes("actifs/en attente non rejetés analysés"));
assert.ok(source.includes("hors périmètre"));

// C — Le KPI conserve son calcul et porte désormais son sens exact.
assert.ok(source.includes('renderControlMetric("Score qualité ≥ 55"'));
assert.ok(source.includes('"événements validés à venir"'));
assert.ok(!source.includes('renderControlMetric("Complétude"'));

// D — Aucun filtre date n’est restauré ou injecté par défaut.
assert.match(html, /id="filter-date"[\s\S]*?value=""[\s\S]*?autocomplete="off"[\s\S]*?aria-describedby="filter-date-help"/);
assert.ok(html.includes("Aucun filtre par défaut · affiche les événements présents à cette date"));
const clearDateStart = source.indexOf("function clearAdminEventDateFilter(");
const clearDateEnd = source.indexOf("/* SCORE QUALITÉ ÉVÉNEMENT */", clearDateStart);
const clearDateSource = source.slice(clearDateStart, clearDateEnd);
assert.ok(!clearDateSource.includes("new Date("), "Le filtre ne doit jamais recevoir la date courante");
let renderCount = 0;
const dateSandbox = {
  filterDate: { value: "2026-08-30" },
  renderEvents() { renderCount += 1; }
};
vm.runInNewContext(`${clearDateSource}; globalThis.clearDate = clearAdminEventDateFilter;`, dateSandbox);
dateSandbox.clearDate(true);
assert.equal(dateSandbox.filterDate.value, "");
assert.equal(renderCount, 1);
assert.ok(source.includes('window.addEventListener("pageshow", () => clearAdminEventDateFilter(true))'));

// E — Les sous-onglets Veille restent lisibles et défilables aux largeurs intermédiaires.
for (const fragment of [
  "@media (max-width: 1180px)",
  "scroll-snap-type: x proximity",
  "overscroll-behavior-x: contain",
  "min-height: 44px",
  "white-space: nowrap",
  "text-overflow: clip",
  "@media (max-width: 820px)",
  "@media (max-width: 430px)"
]) {
  assert.ok(watchCss.includes(fragment), `Protection responsive Veille absente : ${fragment}`);
}

// F — Les exports utilisent une sémantique cyan/violette, jamais le rouge danger.
const exportStart = cockpitCss.indexOf(".exports-file-button,");
const exportEnd = cockpitCss.indexOf(".exports-card {", exportStart);
const exportCss = cockpitCss.slice(exportStart, exportEnd);
for (const forbidden of ["255,82,82", "255,88,88", "159,18,57", "130,18,34", "#9f1239"]) {
  assert.ok(!exportCss.includes(forbidden), `Couleur danger conservée dans les exports : ${forbidden}`);
}
assert.ok(exportCss.includes("rgba(14,116,144"), "La couleur cyan neutre des fichiers est absente");
assert.ok(exportCss.includes(".exports-designs-section .exports-layout-card.exports-file-card"));
assert.ok(exportCss.includes("rgba(109,40,217"), "La distinction violette des maquettes est absente");

// G — Le cockpit décrit une référence locale, sans prétendre à un contrôle live.
assert.ok(html.includes("Backup de référence : 31 août 2026"));
assert.ok(html.includes("Checksums vérifiés lors de la création · aucune vérification live automatique"));
assert.ok(source.includes('renderControlMetric("Backup", "Référence"'));
assert.ok(!html.includes("2026-05-25_21-24-15"));
assert.ok(!source.includes("local vérifié"));

console.log("ADMIN_V3_1_COHERENCE_OK");
