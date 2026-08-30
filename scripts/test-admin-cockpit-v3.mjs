import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("admin.html", "utf8");
const source = fs.readFileSync("admin.js", "utf8");
const legacyQuality = fs.readFileSync("admin-quality-control.js", "utf8");
const visitsSource = fs.readFileSync("admin-visits-counter-fix.js", "utf8");
const css = fs.readFileSync("admin-cockpit.css", "utf8");

const expectedTabs = [
  "overview",
  "events",
  "moderation",
  "quality",
  "stats",
  "premium",
  "exports",
  "watch",
  "social",
  "settings"
];

const tabMatches = [...html.matchAll(/<button class="admin-tab(?: active)?" data-tab="([^"]+)"[^>]*>/g)];
assert.deepEqual(tabMatches.map((match) => match[1]), expectedTabs, "Les 10 onglets doivent rester présents et ordonnés");
assert.ok(source.includes("function switchAdminTab("), "La navigation existante doit rester la source de vérité");
assert.ok(source.includes('document.querySelector(`.admin-tab[data-tab="${target}"]`)?.click()'));

for (const id of [
  "login-screen",
  "dashboard",
  "admin-sidebar-toggle",
  "events-container",
  "events-count",
  "search-input",
  "filter-status",
  "filter-archive",
  "filter-type",
  "edit-modal",
  "quality-control-grid",
  "quality-control-list",
  "premium-container",
  "tab-watch"
]) {
  assert.ok(html.includes(`id="${id}"`), `ID critique supprimé : ${id}`);
}

// Dashboard : mission, actions immédiates et état de la base restent séparés du trafic.
assert.ok(source.includes("À FAIRE AUJOURD’HUI"));
assert.ok(html.includes('id="admin-base-state-panel"'));
assert.ok(source.includes("function renderAdminBaseState("));
assert.ok(source.includes("renderAdminMissionControl"));
assert.ok(source.includes("renderPriorityActionPanel"));
assert.ok(visitsSource.includes('document.getElementById("admin-base-state-panel")'), "Le trafic doit rester après l’état de la base");

// Événements : filtres locaux, reset et cartes opérationnelles.
for (const id of ["filter-city", "filter-date", "filter-country", "filter-quality", "reset-event-filters"]) {
  assert.ok(html.includes(`id="${id}"`), `Filtre V3 absent : ${id}`);
}
const filterStart = source.indexOf("function getFilteredEvents(");
const filterEnd = source.indexOf("/* SCORE QUALITÉ ÉVÉNEMENT */", filterStart);
const filterSource = source.slice(filterStart, filterEnd);
assert.ok(filterSource.includes("filterCity"));
assert.ok(filterSource.includes("filterDate"));
assert.ok(filterSource.includes("filterCountry"));
assert.ok(filterSource.includes("filterQuality"));
assert.ok(!filterSource.includes("supabaseClient"), "Les filtres ne doivent lancer aucune requête");

// Modération : command center, checklist, décisions et passage à la fiche suivante.
for (const id of ["admin-moderation-command-center", "moderation-command-grid", "moderation-events-list"]) {
  assert.ok(html.includes(`id="${id}"`), `Contrôle de modération absent : ${id}`);
}
for (const fragment of [
  "function renderModerationEventQueue(",
  "function renderModerationEventCard(",
  'data-action="validate"',
  'data-action="reject"',
  "renderEventChecklist(event)",
  "Ouvrir la source",
  "function focusNextModerationEvent("
]) {
  assert.ok(source.includes(fragment), `Fonction de modération absente : ${fragment}`);
}
assert.ok(source.includes("Rejeter cet événement ?"), "Le rejet doit demander confirmation");

// Qualité : résumé et vraie file de correction par sévérité avec ouverture directe.
for (const severity of ["critical", "important", "improvement"]) {
  assert.ok(html.includes(`<option value="${severity}">`), `Sévérité qualité absente : ${severity}`);
}
for (const fragment of [
  "À CORRIGER EN PRIORITÉ",
  "function getQualityCorrectionEntries(",
  "function getEventQualityIssues(",
  "function openAdminEventFromControl(",
  "data-quality-event="
]) {
  assert.ok(source.includes(fragment), `File Qualité absente : ${fragment}`);
}
const qualityStart = source.indexOf("function renderQualityControlCenter(");
const qualityEnd = source.indexOf("function renderStatsControlCenter(", qualityStart);
assert.ok(!source.slice(qualityStart, qualityEnd).includes("supabaseClient"), "Qualité V3 doit utiliser allEvents sans requête");

// L’ancien radar ne doit plus dupliquer les IDs ni relire events dans le cockpit V3.
const guardIndex = legacyQuality.indexOf('document.querySelector("#tab-quality #quality-control-list")');
const waitIndex = legacyQuality.indexOf("waitForAdmin();");
assert.ok(guardIndex >= 0 && waitIndex > guardIndex, "Le garde-fou du radar historique doit précéder son chargement");

// Sidebar V2 et responsive restent intacts.
for (const fragment of [
  "ADMIN_SIDEBAR_STATE_KEY",
  "function bindAdminSidebar(",
  "@media (min-width: 681px)",
  "@media (max-width: 680px)",
  "@media (max-width: 430px)",
  ".admin-tab:focus-visible",
  ".admin-filter-field input:focus-visible"
]) {
  assert.ok(source.includes(fragment) || css.includes(fragment), `Protection sidebar/responsive absente : ${fragment}`);
}

console.log("ADMIN_COCKPIT_V3_OK");
