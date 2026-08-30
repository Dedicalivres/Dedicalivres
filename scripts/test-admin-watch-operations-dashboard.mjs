import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "Centre de pilotage",
  'class="watch-card watch-operations-dashboard"',
  'id="watch-operations-candidates-count"',
  'id="watch-operations-event-count"',
  'id="watch-operations-sources-count"',
  'id="watch-operations-source-quality"',
  'id="watch-operations-last-activity"',
  'id="watch-operations-event-status"',
  "Non vérifié / en attente",
  "Disponible",
  "Indisponible",
  "Aucune activité enregistrée",
  "Aucune source qualifiée",
  'data-watch-workspace-view="candidates"',
  'data-watch-workspace-view="event-watch"',
  'data-watch-workspace-view="sources"',
  "function updateWatchOperationsDashboard(",
  "function getWatchOperationsLatestActivity(",
  "function renderWatchOperationsSource(",
  "function switchWatchWorkspaceView("
];

for (const fragment of required) {
  assert.ok(source.includes(fragment), `Cockpit opérationnel incomplet : ${fragment}`);
}

const dashboardStart = source.indexOf("function updateWatchOperationsDashboard(");
const textHelperStart = source.indexOf("function setWatchOperationsText(", dashboardStart);
const dashboardSource = source.slice(dashboardStart, textHelperStart);

assert.ok(
  dashboardSource.includes('["ready", "review"].includes(getWatchWorkflowState(item))'),
  "Le compteur candidats doit compter uniquement ready et review depuis le workflow réel"
);
for (const excludedState of ["duplicate", "submitted", "handled", "rejected"]) {
  assert.ok(
    !dashboardSource.includes(`"${excludedState}"`),
    `Le compteur À traiter ne doit pas inclure ${excludedState}`
  );
}

assert.ok(
  dashboardSource.includes("getEventWatchWorkflowCounts(eventWatchAlerts).review") &&
    !dashboardSource.includes("review_state"),
  "Le compteur Event Watch doit utiliser uniquement review du workflow local"
);

assert.ok(
  dashboardSource.includes("sortProductiveSources(readProductiveSources())") &&
    dashboardSource.includes("getProductiveSourceYieldScore(item)") &&
    dashboardSource.includes("getProductiveSourceYieldLevel(") &&
    dashboardSource.includes('level === "excellent"') &&
    dashboardSource.includes('level === "good"') &&
    dashboardSource.includes("productiveSources.slice(0, 3)"),
  "Le cockpit doit relire les sources existantes, réutiliser leur rendement et limiter le top à trois"
);

assert.ok(
  !dashboardSource.includes("localStorage.setItem") &&
    !dashboardSource.includes("fetch(") &&
    !dashboardSource.includes("fetchEventWatch(") &&
    !dashboardSource.includes("callWatchWorker(") &&
    !dashboardSource.includes("analyzeUrls(") &&
    !dashboardSource.includes("client.from("),
  "La synthèse doit rester locale, informative et sans action automatique"
);

const latestStart = source.indexOf("function getWatchOperationsLatestActivity(");
const renderTopStart = source.indexOf("function renderWatchOperationsSource(", latestStart);
const latestSource = source.slice(latestStart, renderTopStart);

assert.ok(
  latestSource.includes("lastWatchAnalysisAt") &&
    latestSource.includes("item?.lastSeenAt") &&
    latestSource.includes("alert?.detected_at") &&
    latestSource.includes("Number.isNaN(date.getTime())") &&
    latestSource.includes("Aucune activité enregistrée") &&
    !latestSource.includes("Date.now"),
  "La dernière activité doit utiliser uniquement les timestamps connus et ignorer les dates invalides"
);

const navigationStart = source.indexOf("function switchWatchWorkspaceView(");
const navigationEnd = source.indexOf("function updateWatchOperationsDashboard(", navigationStart);
const navigationSource = source.slice(navigationStart, navigationEnd);

assert.ok(
  navigationSource.includes('document.querySelectorAll("[data-watch-workspace-panel]")') &&
    navigationSource.includes('panel.hidden = panel.dataset.watchWorkspacePanel !== view') &&
    navigationSource.includes('button.setAttribute("aria-selected", String(active))') &&
    navigationSource.includes("handleWatchWorkspaceKeydown") &&
    !navigationSource.includes("fetch") &&
    !navigationSource.includes("analyzeUrls") &&
    !navigationSource.includes("loadEventWatchAlerts") &&
    !navigationSource.includes("rerunProductiveSource") &&
    !navigationSource.includes("createSubmissionFromWatch"),
  "La navigation interne doit activer une seule vue, rester accessible et ne lancer aucune action métier"
);

const availabilityStart = source.indexOf("function getEventWatchAvailabilityLabel(");
const availabilityEnd = source.indexOf("function getWatchOperationsLatestActivity(", availabilityStart);
const availabilitySource = source.slice(availabilityStart, availabilityEnd);
assert.ok(
  availabilitySource.includes('eventWatchAvailability === "available"') &&
    availabilitySource.includes('eventWatchAvailability === "unavailable"') &&
    availabilitySource.includes("Non vérifié / en attente"),
  "Les trois états de disponibilité Event Watch doivent être explicitement gérés"
);

const loadStart = source.indexOf("async function loadEventWatchAlerts(");
const renderEventStart = source.indexOf("function renderEventWatchAlerts(", loadStart);
const loadSource = source.slice(loadStart, renderEventStart);
assert.ok(
  loadSource.includes('eventWatchAvailability = "pending"') &&
    loadSource.includes('eventWatchAvailability = "available"') &&
    loadSource.includes('eventWatchAvailability = "unavailable"'),
  "La disponibilité du cockpit doit dériver du chargement Event Watch existant"
);

const productiveMetricStart = source.indexOf("function getProductiveSourceMetric(");
const productiveScoreStart = source.indexOf("function getProductiveSourceYieldScore(", productiveMetricStart);
const productiveMetricSource = source.slice(productiveMetricStart, productiveScoreStart);
const readSourcesStart = source.indexOf("function readProductiveSources(");
const writeSourcesStart = source.indexOf("function writeProductiveSources(", readSourcesStart);
const readSourcesSource = source.slice(readSourcesStart, writeSourcesStart);

assert.ok(
  source.includes('const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1"') &&
    productiveMetricSource.includes("item?.totalCount") &&
    productiveMetricSource.includes("calculateProductiveSourceRate") &&
    readSourcesSource.includes("return Array.isArray(parsed) ? parsed : []") &&
    readSourcesSource.includes("catch") &&
    readSourcesSource.includes("return []"),
  "Les anciennes sources partielles et un localStorage vide ou invalide doivent rester compatibles"
);

assert.ok(
  !source.includes("WATCH_OPERATIONS_KEY") &&
    !source.includes("watch_operations_dashboard_v1"),
  "Le cockpit ne doit créer aucune nouvelle clé localStorage"
);

const renderResultsStart = source.indexOf("function renderResults(");
const renderCardStart = source.indexOf("function renderResultCard(", renderResultsStart);
const renderResultsSource = source.slice(renderResultsStart, renderCardStart);
const workflowStart = source.indexOf("function setWatchWorkflowState(");
const storedWorkflowStart = source.indexOf("function getStoredWatchWorkflowState(", workflowStart);
const workflowSource = source.slice(workflowStart, storedWorkflowStart);
const rememberStart = source.indexOf("function rememberProductiveSources(");
const sourceResultsStart = source.indexOf("function getResultsForProductiveSource(", rememberStart);
const rememberSource = source.slice(rememberStart, sourceResultsStart);
const queueControlsStart = source.indexOf("function updateEventWatchQueueControls(");
const priorityStart = source.indexOf("function getEventWatchAlertPriority(", queueControlsStart);
const queueControlsSource = source.slice(queueControlsStart, priorityStart);
const clearStart = source.indexOf("function clearHistory(");
const readHistoryStart = source.indexOf("function readHistory(", clearStart);
const clearSource = source.slice(clearStart, readHistoryStart);

for (const [label, implementation] of [
  ["rendu Veille", renderResultsSource],
  ["workflow candidat", workflowSource],
  ["sources productives", rememberSource],
  ["workflow Event Watch", queueControlsSource],
  ["effacement historique", clearSource]
]) {
  assert.ok(
    implementation.includes("updateWatchOperationsDashboard()"),
    `Mise à jour du cockpit absente après : ${label}`
  );
}

assert.equal(
  (source.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Le cockpit ne doit ajouter aucune écriture Supabase"
);
assert.ok(!source.includes("setInterval("), "Le cockpit ne doit ajouter aucun polling");
assert.ok(
  source.includes("endpoint Event Watch non local refusé") &&
    source.includes("protocole Event Watch local invalide") &&
    !source.includes("V11_WATCH_WRITE_GUARD = false"),
  "Les protections Event Watch et le write guard doivent rester intacts"
);

console.log("ADMIN_WATCH_OPERATIONS_DASHBOARD_OK");
