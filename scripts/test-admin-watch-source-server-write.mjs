import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "function findServerWatchSource(",
  "function adoptServerWatchSource(",
  "function buildWatchSourceMetricsDelta(",
  "function applySourceMetricsDelta(",
  "async function executeServerWatchSourceUpdate(",
  "async function readLatestServerWatchSource(",
  "async function updateServerWatchSourceOptimistically(",
  "async function persistWatchSourceMetrics(",
  '.from("admin_watch_sources")',
  '.eq("id", serverSource.id)',
  '.eq("version", Number(expectedVersion))',
  "Statistiques de source conservées localement.",
  "persistWatchSourceMetrics(source, delta)"
];

for (const fragment of required) {
  assert.ok(source.includes(fragment), `Writer source incomplet : ${fragment}`);
}

const writerStart = source.indexOf("function findServerWatchSource(");
const writerEnd = source.indexOf("function getWatchOperationsLatestActivity(", writerStart);
const writerSource = source.slice(writerStart, writerEnd);

assert.equal((writerSource.match(/\.update\(/g) || []).length, 1, "Le writer source doit contenir un seul point d'UPDATE");
assert.equal(
  (writerSource.match(/\.from\("admin_watch_sources"\)/g) || []).length,
  2,
  "Le writer doit cibler admin_watch_sources uniquement pour UPDATE et relecture"
);
for (const forbidden of [
  ".insert(",
  ".upsert(",
  ".delete(",
  ".rpc(",
  "service_role",
  "admin_watch_candidates",
  "admin_event_watch_alerts",
  "admin_watch_transitions",
  'from("events")',
  "setInterval(",
  "fetch("
]) {
  assert.ok(!writerSource.includes(forbidden), `Opération interdite dans le writer source : ${forbidden}`);
}
assert.ok(!source.includes("setInterval("), "Pack 5E ne doit ajouter aucun polling");
assert.equal(
  (source.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Pack 5E ne doit ajouter aucune écriture events"
);

const scoreStart = source.indexOf("function getProductiveSourceYieldScore(");
const scoreEnd = source.indexOf("function getProductiveSourceYieldLevel(", scoreStart);
const scoreSource = source.slice(scoreStart, scoreEnd);
assert.ok(
  scoreSource.includes("completionRate * 0.5") &&
    scoreSource.includes("imageRate * 0.25") &&
    scoreSource.includes("(100 - duplicateRate) * 0.25"),
  "Le score de rendement existant doit rester inchangé"
);

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_SOURCE_WRITE_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    buildWatchSourceMetricsDelta,
    applySourceMetricsDelta,
    getResultsForProductiveSource,
    mapServerWatchSource,
    getProductiveSourceYieldScore,
    persistWatchSourceMetrics,
    updateServerWatchSourceOptimistically,
    updateWatchOperationsDashboard
  };
})();
`);

const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
const document = {
  readyState: "loading",
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
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
const api = sandbox.__WATCH_SOURCE_WRITE_TEST_API__;
assert.ok(api, "API de test writer source indisponible");

function createSourceClient({ updates = [], reads = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", payload: null, filters: [], columns: "", limit: null };
      calls.push(call);
      const builder = {
        update(payload) {
          call.operation = "update";
          call.payload = payload;
          return this;
        },
        select(columns) {
          if (!call.operation) call.operation = "select";
          call.columns = columns;
          return this;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return this;
        },
        limit(value) {
          call.limit = value;
          return this;
        },
        abortSignal() { return this; },
        then(resolve, reject) {
          const queue = call.operation === "update" ? updates : reads;
          const response = queue.length ? queue.shift() : { data: [], error: null };
          return Promise.resolve(response).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1";
const sourceId = "00000000-0000-4000-8000-0000000005e0";
const sourceUrl = "https://source.example/agenda";
const observedAt = "2026-08-28T10:00:00.000Z";
const metrics = {
  observedCount: 10,
  completeCount: 7,
  reviewCount: 2,
  rejectedCount: 1,
  certainDuplicateCount: 1,
  probableDuplicateCount: 1,
  withImageCount: 8,
  withoutImageCount: 2
};
const delta = api.buildWatchSourceMetricsDelta(metrics, observedAt);
const localSource = {
  sourceUrl,
  canonicalUrl: sourceUrl,
  title: "Agenda source",
  observedCount: 10,
  analysesCount: 1,
  firstSeenAt: observedAt,
  lastSeenAt: observedAt
};

function serverRow(overrides = {}) {
  return {
    id: sourceId,
    canonical_url: sourceUrl,
    url_hash: "source:v1:5e0",
    source_url: sourceUrl,
    title: "Agenda serveur",
    analyses_count: 5,
    metrics_since: "2026-07-01T00:00:00.000Z",
    observed_count: 100,
    complete_count: 70,
    review_count: 20,
    rejected_count: 10,
    duplicate_certain_count: 4,
    duplicate_probable_count: 3,
    with_image_count: 75,
    without_image_count: 25,
    first_seen_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-08-20T00:00:00.000Z",
    is_active: true,
    version: 2,
    ...overrides
  };
}

function setLocalSource() {
  localStorage.setItem(PRODUCTIVE_SOURCES_KEY, JSON.stringify([localSource]));
}

// A/B. UPDATE versionné avec delta, puis adoption de la version retournée.
localStorage.clear();
setLocalSource();
const successRow = serverRow({
  analyses_count: 6,
  observed_count: 110,
  complete_count: 77,
  review_count: 22,
  rejected_count: 11,
  duplicate_certain_count: 5,
  duplicate_probable_count: 4,
  with_image_count: 83,
  without_image_count: 27,
  last_seen_at: observedAt,
  version: 3
});
const successClient = createSourceClient({ updates: [{ data: [successRow], error: null }] });
api.setClient(successClient);
api.setSnapshot({ availability: "server", sources: [serverRow()] });
const success = await api.persistWatchSourceMetrics(localSource, delta);
assert.equal(success.status, "success");
assert.equal(successClient.calls.length, 1);
assert.equal(successClient.calls[0].table, "admin_watch_sources");
assert.equal(successClient.calls[0].operation, "update");
assert.deepEqual(successClient.calls[0].filters, [["id", sourceId], ["version", 2]]);
assert.equal(successClient.calls[0].payload.analyses_count, 6);
assert.equal(successClient.calls[0].payload.observed_count, 110);
assert.equal(api.getSnapshot().sources[0].version, 3);

// C. Un premier conflit relit une fois et recalcule le même delta avant un second UPDATE.
const latestRow = serverRow({ analyses_count: 8, observed_count: 140, version: 3 });
const retriedRow = serverRow({ analyses_count: 9, observed_count: 150, last_seen_at: observedAt, version: 4 });
const retryClient = createSourceClient({
  updates: [{ data: [], error: null }, { data: [retriedRow], error: null }],
  reads: [{ data: [latestRow], error: null }]
});
api.setClient(retryClient);
api.setSnapshot({ availability: "server", sources: [serverRow()] });
const retried = await api.persistWatchSourceMetrics(localSource, delta);
assert.equal(retried.status, "success");
assert.equal(retryClient.calls.filter((call) => call.operation === "update").length, 2);
assert.equal(retryClient.calls.filter((call) => call.operation === "select").length, 1);
const secondUpdate = retryClient.calls.filter((call) => call.operation === "update")[1];
assert.deepEqual(secondUpdate.filters, [["id", sourceId], ["version", 3]]);
assert.equal(secondUpdate.payload.analyses_count, 9);
assert.equal(secondUpdate.payload.observed_count, 150);
assert.equal(api.getSnapshot().sources[0].version, 4);

// D. Un second conflit abandonne le serveur sans troisième UPDATE et conserve le local.
localStorage.clear();
setLocalSource();
const localBeforeConflict = localStorage.getItem(PRODUCTIVE_SOURCES_KEY);
const secondConflictClient = createSourceClient({
  updates: [{ data: [], error: null }, { data: [], error: null }],
  reads: [{ data: [latestRow], error: null }]
});
api.setClient(secondConflictClient);
api.setSnapshot({ availability: "server", sources: [serverRow()] });
const secondConflict = await api.persistWatchSourceMetrics(localSource, delta);
assert.equal(secondConflict.status, "conflict");
assert.equal(secondConflictClient.calls.filter((call) => call.operation === "update").length, 2);
assert.equal(secondConflictClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(localStorage.getItem(PRODUCTIVE_SOURCES_KEY), localBeforeConflict);

// E/F. Réseau ou table absente : erreur contenue et local intact.
for (const error of [
  { message: "Failed to fetch" },
  { code: "PGRST205", message: "table not found in schema cache" }
]) {
  localStorage.clear();
  setLocalSource();
  const localBeforeFailure = localStorage.getItem(PRODUCTIVE_SOURCES_KEY);
  const unavailableClient = createSourceClient({ updates: [{ data: null, error }] });
  api.setClient(unavailableClient);
  api.setSnapshot({ availability: "server", sources: [serverRow()] });
  const unavailable = await api.persistWatchSourceMetrics(localSource, delta);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(localStorage.getItem(PRODUCTIVE_SOURCES_KEY), localBeforeFailure);
}

// G. Source absente : local uniquement, sans requête ni INSERT.
const missingClient = createSourceClient();
api.setClient(missingClient);
api.setSnapshot({ availability: "server", sources: [] });
const missing = await api.persistWatchSourceMetrics(localSource, delta);
assert.equal(missing.status, "missing");
assert.equal(missingClient.calls.length, 0);

// O/P. url_hash et bonnes valeurs d'identité/libellé ne sont jamais écrasés.
const safePayload = api.applySourceMetricsDelta(serverRow(), {
  ...delta,
  canonicalUrl: "",
  sourceUrl: "",
  title: ""
});
assert.ok(!Object.hasOwn(safePayload, "url_hash"));
assert.ok(!Object.hasOwn(safePayload, "canonical_url"));
assert.ok(!Object.hasOwn(safePayload, "source_url"));
assert.ok(!Object.hasOwn(safePayload, "title"));

// Q/R. first_seen_at ne progresse jamais, last_seen_at peut avancer.
const earlierPayload = api.applySourceMetricsDelta(serverRow(), {
  ...delta,
  firstSeenAt: "2026-06-01T00:00:00.000Z",
  lastSeenAt: observedAt
});
assert.equal(earlierPayload.first_seen_at, "2026-06-01T00:00:00.000Z");
assert.equal(earlierPayload.last_seen_at, observedAt);
const laterFirstSeenPayload = api.applySourceMetricsDelta(serverRow(), {
  ...delta,
  firstSeenAt: "2026-09-01T00:00:00.000Z"
});
assert.equal(laterFirstSeenPayload.first_seen_at, "2026-07-01T00:00:00.000Z");

// S. Un compteur historique NULL démarre au delta courant et reste explicitement partiel.
const unknownHistoryRow = serverRow({
  metrics_since: null,
  observed_count: null,
  complete_count: null,
  review_count: null,
  rejected_count: null,
  duplicate_certain_count: null,
  duplicate_probable_count: null,
  with_image_count: null,
  without_image_count: null
});
const partialPayload = api.applySourceMetricsDelta(unknownHistoryRow, delta);
assert.equal(partialPayload.observed_count, 10);
assert.equal(partialPayload.complete_count, 7);
assert.equal(partialPayload.metrics_since, observedAt);
const partialSource = api.mapServerWatchSource({ ...unknownHistoryRow, ...partialPayload, version: 3 });
assert.equal(partialSource.metricsHistoryComplete, false);
assert.equal(api.getProductiveSourceYieldScore(partialSource), null);

// T. Un lot multi-URL non attribuable ne produit aucun delta détaillé inventé.
const unattributed = api.getResultsForProductiveSource(
  sourceUrl,
  [sourceUrl, "https://other.example/agenda"],
  [{ title: "Résultat sans source attribuable" }]
);
assert.equal(unattributed, null);
const unattributedDelta = api.buildWatchSourceMetricsDelta(unattributed, observedAt);
const unattributedPayload = api.applySourceMetricsDelta(serverRow(), unattributedDelta);
assert.equal(unattributedDelta.hasDetailedMetrics, false);
assert.equal(unattributedPayload.analyses_count, 6);
for (const key of [
  "observed_count",
  "complete_count",
  "review_count",
  "rejected_count",
  "duplicate_certain_count",
  "duplicate_probable_count",
  "with_image_count",
  "without_image_count"
]) {
  assert.ok(!Object.hasOwn(unattributedPayload, key), `Métrique multi-URL inventée : ${key}`);
}

// U/V. Aucun write à l'init/rendu et aucun polling.
const renderClient = createSourceClient();
api.setClient(renderClient);
api.setSnapshot({ availability: "server", sources: [serverRow()] });
api.updateWatchOperationsDashboard();
assert.equal(renderClient.calls.length, 0);

// W. Le score existant reste identique pour un historique complètement connu.
const knownSource = api.mapServerWatchSource(serverRow({
  observed_count: 100,
  complete_count: 80,
  duplicate_certain_count: 10,
  duplicate_probable_count: 0,
  with_image_count: 70,
  without_image_count: 30,
  metrics_since: null
}));
assert.equal(api.getProductiveSourceYieldScore(knownSource), 80);

console.log("ADMIN_WATCH_SOURCE_SERVER_WRITE_OK");
