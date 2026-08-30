import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");
const sourceWithRefreshAudit = source.replace(
  "  function refreshWatchCandidateWorkflowView() {",
  `  function refreshWatchCandidateWorkflowView() {
    globalThis.__WATCH_REVIEW_READY_REFRESH_COUNT__ =
      (globalThis.__WATCH_REVIEW_READY_REFRESH_COUNT__ || 0) + 1;`
);
assert.notEqual(sourceWithRefreshAudit, source, "Le point de rafraîchissement workflow doit rester identifiable");

const instrumented = sourceWithRefreshAudit.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_REVIEW_READY_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    setLastResults(value) { lastResults = value; },
    saveWatchCandidateEdits,
    inferWatchCandidateWorkflowState,
    getWatchWorkflowState,
    buildWatchCandidateQueue,
    getWatchQueueCounts,
    renderResultCard,
    resetRefreshCount() { globalThis.__WATCH_REVIEW_READY_REFRESH_COUNT__ = 0; },
    getRefreshCount() { return globalThis.__WATCH_REVIEW_READY_REFRESH_COUNT__ || 0; }
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
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} }
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
  crypto: globalThis.crypto,
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.dispatchEvent = () => {};
sandbox.window.requestAnimationFrame = (callback) => callback();

vm.runInNewContext(instrumented, sandbox, { filename: "admin-watch.js" });
const api = sandbox.__WATCH_REVIEW_READY_TEST_API__;
assert.ok(api, "API de test Pack 6D indisponible");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createCandidateClient({ updates = [], selects = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", payload: null, filters: [] };
      calls.push(call);
      return {
        update(payload) {
          call.operation = "update";
          call.payload = payload;
          return this;
        },
        select() {
          if (!call.operation) call.operation = "select";
          return this;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return this;
        },
        limit() { return this; },
        abortSignal() { return this; },
        then(resolve, reject) {
          const queue = call.operation === "update" ? updates : selects;
          const response = queue.length ? queue.shift() : { data: [], error: null };
          return Promise.resolve(response).then(resolve, reject);
        }
      };
    }
  };
}

function createForm(item, overrides = {}) {
  const values = {
    title: item.title,
    startDate: item.startDate,
    city: item.city,
    type: item.type,
    country: item.country,
    description: item.description,
    officialUrl: item.officialUrl,
    imageUrl: item.imageUrl,
    venue: item.venue,
    address: item.address,
    ...overrides
  };
  const endDateField = {
    value: Object.prototype.hasOwnProperty.call(overrides, "endDate") ? overrides.endDate : item.endDate,
    dataset: { watchUserEdited: "false" }
  };
  return {
    elements: {
      namedItem(name) {
        return Object.prototype.hasOwnProperty.call(values, name) ? { value: values[name] ?? "" } : null;
      }
    },
    querySelector(selector) {
      return selector === '[data-watch-field="endDate"]' ? endDateField : null;
    }
  };
}

const candidateId = "00000000-0000-4000-8000-000000006d00";
const identityKey = "candidate:v1:fontvieille-pack-6d";
const baseCandidate = {
  identity_key: identityKey,
  sourceUrl: "https://example.test/fontvieille-pack-6d",
  officialUrl: "https://example.test/fontvieille-pack-6d",
  title: "Salon du livre de Fontvieille",
  type: "Salon",
  startDate: "2026-09-20",
  endDate: "",
  city: "Fontvieille",
  country: "",
  venue: "Centre culturel",
  address: "Place du village",
  description: "Salon du livre réunissant auteurs, lecteurs et éditeurs.",
  imageUrl: "https://example.test/fontvieille.jpg",
  status: "À vérifier",
  confidence: 83,
  missingFields: ["pays"],
  filterWarnings: [],
  workflowStatus: "review"
};

function cloneCandidate(overrides = {}) {
  return { ...JSON.parse(JSON.stringify(baseCandidate)), ...overrides };
}

function serverRow(state = "review", version = 3) {
  return {
    id: candidateId,
    identity_key: identityKey,
    canonical_origin_url: baseCandidate.sourceUrl,
    origin_url: baseCandidate.sourceUrl,
    title: baseCandidate.title,
    start_date: baseCandidate.startDate,
    city: baseCandidate.city,
    workflow_status: state,
    status_updated_at: `2026-08-30T08:0${version}:00.000Z`,
    version
  };
}

function reset(candidate, snapshotCandidates = []) {
  localStorage.clear();
  api.resetRefreshCount();
  api.setLastResults(candidate ? [candidate] : []);
  api.setSnapshot({
    availability: "server",
    componentAvailability: { candidates: "available", sources: "available", eventAlerts: "available" },
    candidates: snapshotCandidates
  });
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Succès différé : aucun ready fictif avant acquittement, puis snapshot et vue passent ensemble à ready.
const successCandidate = cloneCandidate();
const pendingUpdate = deferred();
const successClient = createCandidateClient({ updates: [pendingUpdate.promise] });
reset(successCandidate, [serverRow("review", 3)]);
api.setClient(successClient);
assert.equal(api.getWatchWorkflowState(successCandidate), "review");
api.saveWatchCandidateEdits(0, createForm(successCandidate, { country: "France" }));

assert.equal(api.inferWatchCandidateWorkflowState(successCandidate), "ready");
assert.equal(successCandidate.endDate, "", "La correction pays ne doit jamais remplir date de fin");
assert.equal(api.getWatchWorkflowState(successCandidate), "review", "Le snapshot serveur review reste visible avant acquittement");
assert.equal(api.getSnapshot().candidates[0].workflow_status, "review");
assert.equal(api.getRefreshCount(), 0, "Aucun rafraîchissement d’acquittement ne doit précéder le serveur");
assert.equal(successClient.calls.length, 1, "Le writer versionné existant doit être appelé exactement une fois");
assert.equal(successClient.calls[0].operation, "update");
assert.equal(JSON.stringify(successClient.calls[0].payload), JSON.stringify({ workflow_status: "ready" }));
assert.deepEqual(successClient.calls[0].filters, [["id", candidateId], ["version", 3]]);

pendingUpdate.resolve({ data: [serverRow("ready", 4)], error: null });
await settle();

assert.equal(api.getSnapshot().candidates[0].workflow_status, "ready");
assert.equal(api.getSnapshot().candidates[0].version, 4);
assert.equal(api.getWatchWorkflowState(successCandidate), "ready");
assert.equal(api.getRefreshCount(), 1, "Le succès serveur doit reconstruire immédiatement la vue workflow");
const successQueue = api.buildWatchCandidateQueue([successCandidate]);
assert.equal(successQueue.length, 1);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.getWatchQueueCounts(successQueue))),
  { all: 1, active: 1, ready: 1, review: 0, duplicate: 0, handled: 0, rejected: 0, "current-analysis": 1 }
);
const rendered = api.renderResultCard(successQueue[0], 0);
assert.ok(rendered.includes("Workflow : Prêt"));
assert.ok(!rendered.includes("À vérifier : pays"));

// Reload avec résultat Worker, puis reload serveur seul : une seule fiche et workflow ready persistant.
localStorage.clear();
const reloadedWorkerCandidate = cloneCandidate({ country: "France", missingFields: [], workflowStatus: "review" });
api.setSnapshot({ availability: "server", candidates: [serverRow("ready", 4)] });
api.setLastResults([reloadedWorkerCandidate]);
const workerReloadQueue = api.buildWatchCandidateQueue([reloadedWorkerCandidate]);
assert.equal(workerReloadQueue.length, 1);
assert.equal(workerReloadQueue[0].country, "France");
assert.equal(api.getWatchWorkflowState(workerReloadQueue[0]), "ready");
assert.equal(api.getWatchQueueCounts(workerReloadQueue).ready, 1);
api.setLastResults([]);
const serverOnlyReloadQueue = api.buildWatchCandidateQueue([]);
assert.equal(serverOnlyReloadQueue.length, 1);
assert.equal(api.getWatchWorkflowState(serverOnlyReloadQueue[0]), "ready");
assert.equal(api.getWatchQueueCounts(serverOnlyReloadQueue).ready, 1);

// Conflit de version : la lecture serveur gagne, est adoptée et rerendue sans ready fictif.
const conflictCandidate = cloneCandidate();
const conflictClient = createCandidateClient({
  updates: [{ data: [], error: null }],
  selects: [{ data: [serverRow("review", 4)], error: null }]
});
reset(conflictCandidate, [serverRow("review", 3)]);
api.setClient(conflictClient);
api.saveWatchCandidateEdits(0, createForm(conflictCandidate, { country: "France" }));
await settle();
assert.equal(conflictClient.calls.filter((call) => call.operation === "update").length, 1);
assert.equal(conflictClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(api.getSnapshot().candidates[0].version, 4);
assert.equal(api.getWatchWorkflowState(conflictCandidate), "review");
assert.equal(api.getRefreshCount(), 1);

// Échec réseau : snapshot et UI logique restent review ; le fallback local est conservé.
const failedCandidate = cloneCandidate();
const failedClient = createCandidateClient({ updates: [{ data: null, error: { message: "network unavailable" } }] });
reset(failedCandidate, [serverRow("review", 3)]);
api.setClient(failedClient);
api.saveWatchCandidateEdits(0, createForm(failedCandidate, { country: "France" }));
await settle();
assert.equal(failedClient.calls.length, 1);
assert.equal(api.getSnapshot().candidates[0].workflow_status, "review");
assert.equal(api.getWatchWorkflowState(failedCandidate), "review");
assert.equal(api.getRefreshCount(), 0);
assert.ok([...storage.values()].some((value) => value.includes('"state":"ready"')), "Le fallback local ready doit rester intact");

// Les workflows fermés ne sont jamais rouverts et ne déclenchent aucun UPDATE.
for (const closedState of ["duplicate", "submitted", "handled", "rejected"]) {
  const closedCandidate = cloneCandidate();
  const closedClient = createCandidateClient();
  reset(closedCandidate, [serverRow(closedState, 5)]);
  api.setClient(closedClient);
  api.saveWatchCandidateEdits(0, createForm(closedCandidate, { country: "France" }));
  await settle();
  assert.equal(api.getWatchWorkflowState(closedCandidate), closedState);
  assert.equal(closedClient.calls.length, 0, `${closedState} ne doit jamais appeler le writer`);
}

// Audit statique : aucun writer, réseau ou chemin de publication supplémentaire.
const writerStart = source.indexOf("async function updateServerWatchCandidateOptimistically(");
const writerEnd = source.indexOf("async function persistCandidateWorkflowDecision(", writerStart);
const writerSource = source.slice(writerStart, writerEnd);
assert.equal((writerSource.match(/\.update\(/g) || []).length, 1);
assert.equal((writerSource.match(/\.from\("admin_watch_candidates"\)/g) || []).length, 1);
assert.ok(writerSource.includes("const payload = { workflow_status: nextWorkflowStatus }"));
assert.ok(!writerSource.includes("country") && !writerSource.includes("end_date"));
assert.equal((source.match(/\.from\("events"\)\.insert\(/g) || []).length, 1);
assert.ok(source.includes("findExistingSubmissionCached(item)"), "Le précontrôle de soumission existant doit rester en place");

console.log("ADMIN_WATCH_REVIEW_READY_PERSISTENCE_OK");
