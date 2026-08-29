import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "function readServerWatchRows(",
  "function readServerWatchCandidates(",
  "function readServerWatchSources(",
  "function readServerEventWatchAlerts(",
  "async function loadWatchPersistenceSnapshot(",
  "function resolveWatchPersistenceWorkflow(",
  "function mergeServerWatchSources(",
  'client.from(table).select(columns)',
  '"admin_watch_candidates"',
  '"admin_watch_sources"',
  '"admin_event_watch_alerts"',
  "WATCH_SERVER_READ_TIMEOUT_MS",
  "query.abortSignal(controller.signal)",
  "Persistance :",
  'const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1"',
  'const WORKFLOW_KEY = "dedicalivres_admin_watch_workflow_v2"',
  'const EVENT_WATCH_WORKFLOW_KEY = "dedicalivres_admin_event_watch_workflow_v1"'
];

for (const fragment of required) {
  assert.ok(source.includes(fragment), `Lecture serveur/fallback incomplète : ${fragment}`);
}

const repositoryStart = source.indexOf("function classifyWatchPersistenceError(");
const repositoryEnd = source.indexOf("function normalizeWatchPersistenceUrl(", repositoryStart);
const repositorySource = source.slice(repositoryStart, repositoryEnd);

for (const forbidden of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc(", "fetch(", "service_role"]) {
  assert.ok(!repositorySource.includes(forbidden), `Écriture ou accès interdit dans le repository : ${forbidden}`);
}
assert.ok(!source.includes("setInterval("), "Pack 5C ne doit ajouter aucun polling");
assert.ok(!/\banon\b/.test(repositorySource), "Le repository ne doit introduire aucun accès anon explicite");

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_SERVER_READ_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    loadWatchPersistenceSnapshot,
    getWatchWorkflowState,
    getEventWatchWorkflowState,
    readProductiveSources,
    updateWatchOperationsDashboard,
    setLastResults(value) { lastResults = value; },
    getLastResults() { return lastResults; }
  };
})();
`);

const storage = new Map();
const elements = new Map();
let dashboardEnabled = false;
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
const document = {
  readyState: "loading",
  addEventListener() {},
  querySelector(selector) {
    if (selector === ".watch-operations-dashboard" && dashboardEnabled) return {};
    return null;
  },
  querySelectorAll() { return []; },
  getElementById(id) { return elements.get(id) || null; },
  createElement() { return { dataset: {}, style: {}, appendChild() {} }; },
  head: { appendChild() {} }
};
const sandbox = {
  AbortController,
  URL,
  Date,
  Error,
  Map,
  Set,
  Promise,
  Number,
  String,
  Array,
  Object,
  Math,
  JSON,
  RegExp,
  console,
  document,
  localStorage,
  setTimeout,
  clearTimeout,
  navigator: {},
  crypto: globalThis.crypto
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.requestAnimationFrame = (callback) => callback();

vm.runInNewContext(instrumented, sandbox, { filename: "admin-watch.js" });
const api = sandbox.__WATCH_SERVER_READ_TEST_API__;
assert.ok(api, "API de test instrumentée indisponible");

function createReadOnlyClient(responses) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", columns: "", order: "", limit: null, aborted: false };
      calls.push(call);
      const builder = {
        select(columns) {
          call.operation = "select";
          call.columns = columns;
          return this;
        },
        order(column) {
          call.order = column;
          return this;
        },
        limit(limit) {
          call.limit = limit;
          return this;
        },
        abortSignal(signal) {
          call.aborted = signal.aborted;
          return this;
        },
        then(resolve, reject) {
          const response = typeof responses === "function" ? responses(table) : responses[table];
          return Promise.resolve(response).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

function setLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1";
const WORKFLOW_KEY = "dedicalivres_admin_watch_workflow_v2";
const EVENT_WATCH_WORKFLOW_KEY = "dedicalivres_admin_event_watch_workflow_v1";
const localSource = {
  sourceUrl: "https://source.example/agenda/",
  title: "Source locale",
  observedCount: 3,
  completeCount: 1,
  reviewCount: 2,
  analysesCount: 1,
  lastSeenAt: "2026-08-01T10:00:00.000Z"
};

// A. Une indisponibilité réseau reste une lecture locale sans toucher la session Worker.
localStorage.clear();
setLocalJson(PRODUCTIVE_SOURCES_KEY, [localSource]);
const sessionResults = [{ title: "Résultat Worker intact" }];
api.setLastResults(sessionResults);
const unavailableClient = createReadOnlyClient(() => ({
  data: null,
  error: { message: "Failed to fetch" }
}));
api.setClient(unavailableClient);
const unavailableSnapshot = await api.loadWatchPersistenceSnapshot();
assert.equal(unavailableSnapshot.availability, "unavailable", "Le réseau indisponible doit activer le fallback");
assert.deepEqual(
  { ...unavailableSnapshot.componentAvailability },
  { candidates: "unavailable", sources: "unavailable", eventAlerts: "unavailable" }
);
assert.equal(api.readProductiveSources()[0].observedCount, 3, "Les métriques locales doivent rester lisibles");
assert.equal(api.getLastResults(), sessionResults, "Le snapshot serveur ne doit pas remplacer lastResults");

// B. Une table absente est classée et ne provoque aucune exception d'initialisation.
const missingClient = createReadOnlyClient(() => ({
  data: null,
  error: { code: "42P01", message: "relation does not exist" }
}));
api.setClient(missingClient);
const missingSnapshot = await api.loadWatchPersistenceSnapshot();
assert.equal(missingSnapshot.availability, "unavailable", "Les tables absentes doivent conserver le mode local");
assert.deepEqual(
  { ...missingSnapshot.componentAvailability },
  { candidates: "table-missing", sources: "table-missing", eventAlerts: "table-missing" }
);
assert.deepEqual([...missingSnapshot.errors], ["table-missing", "table-missing", "table-missing"]);

const candidate = {
  sourceUrl: "https://events.example/salon",
  title: "Salon du livre",
  startDate: "2026-09-12",
  city: "Paris",
  status: "Complet",
  missingFields: [],
  confidence: 95
};
const serverCandidateBase = {
  identity_key: "candidate:v1:test",
  canonical_origin_url: "https://events.example/salon",
  title: "Salon du livre",
  start_date: "2026-09-12",
  city: "Paris",
  status_updated_at: "2026-08-20T10:00:00.000Z"
};

// C. Un état serveur fermé gagne sur un état local actif.
localStorage.clear();
api.setSnapshot({ candidates: [{ ...serverCandidateBase, workflow_status: "handled" }] });
assert.equal(api.getWatchWorkflowState(candidate), "handled");

// D. Un état local fermé ne peut pas être rouvert par un état serveur actif.
setLocalJson(WORKFLOW_KEY, {
  [`url:${candidate.sourceUrl}`]: { state: "handled", updatedAt: "2026-08-21T10:00:00.000Z" }
});
api.setSnapshot({ candidates: [{ ...serverCandidateBase, workflow_status: "ready" }] });
assert.equal(api.getWatchWorkflowState(candidate), "handled");

// E/F. Les métriques serveur priment uniquement pour une source identifiée; sinon le local reste intact.
localStorage.clear();
setLocalJson(PRODUCTIVE_SOURCES_KEY, [localSource]);
api.setSnapshot({
  sources: [{
    canonical_url: "https://source.example/agenda/",
    url_hash: "source:v1:test",
    source_url: "https://source.example/agenda/",
    title: "Source serveur",
    observed_count: 20,
    complete_count: 15,
    review_count: null,
    rejected_count: 1,
    duplicate_certain_count: 2,
    duplicate_probable_count: 1,
    with_image_count: 14,
    without_image_count: 6,
    analyses_count: 5,
    first_seen_at: "2026-07-01T10:00:00.000Z",
    last_seen_at: "2026-08-22T10:00:00.000Z",
    is_active: true,
    version: 3
  }]
});
const mergedSource = api.readProductiveSources()[0];
assert.equal(mergedSource.observedCount, 20, "Le compteur serveur doit être prioritaire");
assert.equal(mergedSource.completeCount, 15, "Les métriques serveur doivent alimenter le cockpit");
assert.equal(mergedSource.reviewCount, null, "Une métrique serveur inconnue doit rester null");
assert.equal(mergedSource.serverPersisted, true);
api.setSnapshot({ sources: [] });
assert.equal(api.readProductiveSources()[0].observedCount, 3, "Une source serveur absente conserve les métriques locales");

// G. L'état Event Watch persistant fermé complète l'alerte courante du bridge local.
localStorage.clear();
const localAlert = { id: "engine-alert-42", field: "date", event_title: "Salon du livre" };
setLocalJson(EVENT_WATCH_WORKFLOW_KEY, {
  "id:engine-alert-42": { state: "review", updatedAt: "2026-08-18T10:00:00.000Z" }
});
api.setSnapshot({
  eventAlerts: [{
    identity_key: "event-watch:v1:test",
    engine_alert_id: "engine-alert-42",
    workflow_status: "handled",
    status_updated_at: "2026-08-20T10:00:00.000Z"
  }]
});
assert.equal(api.getEventWatchWorkflowState(localAlert), "handled");

// H/I/M. Les trois requêtes sont SELECT-only, bornées, sans polling ni rôle anon explicite.
const emptyClient = createReadOnlyClient(() => ({ data: [], error: null }));
api.setClient(emptyClient);
api.setLastResults([]);
dashboardEnabled = true;
for (const id of [
  "watch-operations-candidates-count",
  "watch-operations-event-count",
  "watch-operations-sources-count",
  "watch-operations-source-quality",
  "watch-operations-last-activity",
  "watch-operations-event-status",
  "watch-operations-top-sources",
  "watch-persistence-status"
]) {
  elements.set(id, { textContent: "", innerHTML: "", dataset: {} });
}
const emptySnapshot = await api.loadWatchPersistenceSnapshot();
assert.equal(emptySnapshot.availability, "server", "Un snapshot serveur vide mais lisible reste disponible");
assert.deepEqual(
  { ...emptySnapshot.componentAvailability },
  { candidates: "available", sources: "available", eventAlerts: "available" }
);
assert.equal(elements.get("watch-operations-candidates-count").textContent, "0");
assert.equal(elements.get("watch-persistence-status").textContent, "Persistance : Serveur");
assert.equal(emptyClient.calls.length, 3);
assert.ok(emptyClient.calls.every((call) => call.operation === "select" && call.limit > 0));

console.log("ADMIN_WATCH_SERVER_READ_FALLBACK_OK");
