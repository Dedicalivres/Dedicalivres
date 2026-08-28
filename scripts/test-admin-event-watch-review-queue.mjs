import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  'const EVENT_WATCH_WORKFLOW_KEY = "dedicalivres_admin_event_watch_workflow_v1"',
  'let eventWatchQueueFilter = "review"',
  'data-event-watch-filter="review"',
  'data-event-watch-filter="confirmed"',
  'data-event-watch-filter="handled"',
  'data-event-watch-filter="ignored"',
  'data-event-watch-filter="all"',
  'id="event-watch-review-count"',
  "changement${counts.review > 1 ? \"s\" : \"\"} à vérifier",
  "function getEventWatchAlertKey(",
  "function getEventWatchWorkflowState(",
  "function getEventWatchWorkflowCounts(",
  "function getEventWatchAlertPriority(",
  "function compareEventWatchAlerts(",
  "Confirmer le changement",
  "Marquer traité",
  "Écarter",
  "Critique",
  "Important",
  "Normal",
  "Ouvrir l’événement",
  "Voir la source",
  "Réinitialiser les états"
];

for (const fragment of required) {
  assert.ok(source.includes(fragment), `File Event Watch incomplète : ${fragment}`);
}

const keyStart = source.indexOf("function getEventWatchAlertKey(");
const workflowReadStart = source.indexOf("function readEventWatchWorkflow(", keyStart);
const keySource = source.slice(keyStart, workflowReadStart);

assert.ok(
  keySource.includes("alert?.id") &&
    keySource.includes("alert?.dedicalivres_event_id") &&
    keySource.includes("alert?.field") &&
    keySource.includes("alert?.source || alert?.proof?.url") &&
    !keySource.includes("index"),
  "La clé Event Watch doit privilégier un identifiant réel et utiliser un fallback déterministe sans index"
);

const entryStart = source.indexOf("function getEventWatchWorkflowEntry(");
const labelStart = source.indexOf("function getEventWatchWorkflowLabel(", entryStart);
const entrySource = source.slice(entryStart, labelStart);

assert.ok(
  entrySource.includes('["review", "confirmed", "ignored", "handled"]') &&
    entrySource.includes(': "review"'),
  "Le workflow doit accepter les quatre états et utiliser review par défaut"
);

const bindStart = source.indexOf("function bindControls(");
const analyzeStart = source.indexOf("async function analyzeUrls(", bindStart);
const bindSource = source.slice(bindStart, analyzeStart);
const filterBindingStart = bindSource.indexOf('document.querySelectorAll("[data-event-watch-filter]")');
const categoryBindingStart = bindSource.indexOf('document.querySelectorAll("[data-event-watch-category]")', filterBindingStart);
const filterBindingSource = bindSource.slice(filterBindingStart, categoryBindingStart);

assert.ok(
  filterBindingSource.includes("eventWatchQueueFilter =") &&
    filterBindingSource.includes("renderEventWatchAlerts()") &&
    !filterBindingSource.includes("loadEventWatchAlerts") &&
    !filterBindingSource.includes("fetch("),
  "Changer le filtre Event Watch doit uniquement relancer le rendu local"
);

const setStateStart = source.indexOf("function setEventWatchWorkflowState(");
const resetStart = source.indexOf("function resetEventWatchWorkflow(", setStateStart);
const setStateSource = source.slice(setStateStart, resetStart);

assert.ok(
  setStateSource.includes("writeEventWatchWorkflow(workflow)") &&
    setStateSource.includes("renderEventWatchAlerts()") &&
    setStateSource.includes("Aucun événement n’a été modifié") &&
    !setStateSource.includes("fetch(") &&
    !setStateSource.includes("fetchEventWatch(") &&
    !setStateSource.includes("callWatchWorker(") &&
    !setStateSource.includes("client.from("),
  "Une action Event Watch doit rester une écriture localStorage suivie d’un rendu local"
);

const countsStart = source.indexOf("function getEventWatchWorkflowCounts(");
const controlsStart = source.indexOf("function updateEventWatchQueueControls(", countsStart);
const priorityStart = source.indexOf("function getEventWatchAlertPriority(", controlsStart);
const countsAndControlsSource = source.slice(countsStart, priorityStart);

assert.ok(
  countsAndControlsSource.includes("counts.review") &&
    countsAndControlsSource.includes("data-event-watch-filter-count") &&
    countsAndControlsSource.includes('setAttribute("aria-pressed"'),
  "Les compteurs et aria-pressed doivent être recalculés depuis le workflow local"
);

const compareStart = source.indexOf("function compareEventWatchAlerts(", priorityStart);
const sourceUrlStart = source.indexOf("function getEventWatchSourceUrl(", compareStart);
const prioritySource = source.slice(priorityStart, compareStart);
const compareSource = source.slice(compareStart, sourceUrlStart);

for (const field of ["cancelled", "postponed", "date", "time", "location", "address"]) {
  assert.ok(prioritySource.includes(`"${field}"`), `Priorité critique absente : ${field}`);
}
for (const field of ["registration", "applications", "program", "speakers", "participants"]) {
  assert.ok(prioritySource.includes(`"${field}"`), `Priorité importante absente : ${field}`);
}
assert.ok(
  prioritySource.includes('return { state: "normal", label: "Normal", rank: 2 }'),
  "Une catégorie inconnue doit conserver une priorité neutre"
);

const stateOrder = compareSource.indexOf("stateDifference");
const priorityOrder = compareSource.indexOf("priorityDifference");
const dateOrder = compareSource.indexOf("dateDifference");
assert.ok(
  stateOrder >= 0 && priorityOrder > stateOrder && dateOrder > priorityOrder,
  "Le tri doit appliquer workflow, puis priorité, puis date de détection"
);

const renderStart = source.indexOf("function renderEventWatchAlerts(");
const keyFunctionStart = source.indexOf("function getEventWatchAlertKey(", renderStart);
const renderSource = source.slice(renderStart, keyFunctionStart);

assert.ok(
  renderSource.includes("getEventWatchSourceUrl(alert)") &&
    renderSource.includes("isUuid(remoteId)") &&
    renderSource.includes('target="_blank"') &&
    renderSource.includes('rel="noopener noreferrer"'),
  "Les liens événement/source doivent dépendre de données validées et s’ouvrir de façon sûre"
);

const sourceUrlEnd = source.indexOf("function matchesEventWatchCategory(", sourceUrlStart);
const sourceUrlSource = source.slice(sourceUrlStart, sourceUrlEnd);
assert.ok(
  sourceUrlSource.includes("normalizeUrlValue(alert?.source || alert?.proof?.url)"),
  "Le lien source doit passer par la validation d’URL existante"
);

const resetEnd = source.indexOf("function getEventWatchWorkflowCounts(", resetStart);
const resetSource = source.slice(resetStart, resetEnd);
assert.ok(
  resetSource.includes("localStorage.removeItem(EVENT_WATCH_WORKFLOW_KEY)") &&
    resetSource.includes('eventWatchQueueFilter = "review"') &&
    !resetSource.includes("fetch(") &&
    !resetSource.includes("fetchEventWatch(") &&
    !resetSource.includes("callWatchWorker(") &&
    !resetSource.includes("client.from(") &&
    !resetSource.includes("eventWatchAlerts = []"),
  "Le reset doit supprimer uniquement le workflow local et restaurer la vue review"
);

const eventWatchStart = source.indexOf("async function loadEventWatchAlerts(");
const renderResultsStart = source.indexOf("function renderResults(", eventWatchStart);
const eventWatchSource = source.slice(eventWatchStart, renderResultsStart);

assert.ok(
  source.includes('const DEFAULT_EVENT_WATCH_ENDPOINT = "http://127.0.0.1:5065/api/event-watch"') &&
    eventWatchSource.includes('url.searchParams.set("review_state", "all")') &&
    eventWatchSource.includes("endpoint Event Watch non local refusé") &&
    eventWatchSource.includes("protocole Event Watch local invalide"),
  "L’endpoint Event Watch et ses gardes loopback doivent rester inchangés"
);

assert.ok(
  !eventWatchSource.includes('method: "POST"') &&
    !eventWatchSource.includes("/api/event-watch/review") &&
    !eventWatchSource.includes("setInterval("),
  "Event Watch ne doit ni écrire sur le moteur ni ajouter de polling"
);

assert.equal(
  (source.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Le pack Event Watch ne doit ajouter aucune écriture Supabase"
);

assert.ok(
  !source.includes("V11_WATCH_WRITE_GUARD = false"),
  "Le write guard ne doit jamais être désactivé"
);

console.log("ADMIN_EVENT_WATCH_REVIEW_QUEUE_OK");
