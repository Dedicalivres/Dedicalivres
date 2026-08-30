import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "function updateServerWatchCandidateOptimistically(",
  "async function persistCandidateWorkflowDecision(",
  "function readLatestServerWatchCandidate(",
  "function adoptServerWatchCandidate(",
  "function writeLocalWatchWorkflowState(",
  '.from("admin_watch_candidates")',
  '.update(payload)',
  '.eq("id", serverCandidate.id)',
  '.eq("version", Number(expectedVersion))',
  "Cette décision a été modifiée dans une autre session.",
  "Décision enregistrée localement.",
  'setWatchWorkflowState(item, "duplicate")',
  'setWatchWorkflowState(item, "submitted")',
  'setWatchWorkflowState(item, "handled")',
  'setWatchWorkflowState(item, "rejected")'
];

for (const fragment of required) {
  assert.ok(source.includes(fragment), `Writer candidat incomplet : ${fragment}`);
}

const writerStart = source.indexOf("function adoptServerWatchCandidate(");
const writerEnd = source.indexOf("async function insertEditedWatchCandidate(", writerStart);
const writerSource = source.slice(writerStart, writerEnd);

assert.equal((writerSource.match(/\.update\(/g) || []).length, 1, "Un seul UPDATE candidat doit exister dans le writer");
assert.equal((writerSource.match(/\.from\("admin_watch_candidates"\)/g) || []).length, 2, "Le writer doit cibler seulement candidat pour UPDATE et relecture");
for (const forbidden of [
  ".insert(",
  ".upsert(",
  ".delete(",
  ".rpc(",
  "admin_watch_transitions",
  "admin_watch_sources",
  "admin_event_watch_alerts",
  'from("events")',
  "service_role",
  "setInterval(",
  "fetch("
]) {
  assert.ok(!writerSource.includes(forbidden), `Opération interdite dans le writer candidat : ${forbidden}`);
}

assert.equal(
  (source.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Pack 5D ne doit ajouter aucun INSERT events"
);
assert.ok(!source.includes("setInterval("), "Pack 5D ne doit ajouter aucun polling");

const submissionStart = source.indexOf("async function createSubmissionFromWatch(");
const submissionEnd = source.indexOf("function getSubmissionBlockingFields(", submissionStart);
const submissionSource = source.slice(submissionStart, submissionEnd);
const eventInsertPosition = submissionSource.indexOf('.from("events").insert([payload])');
const submittedIdPosition = submissionSource.indexOf("item.submittedEventId = payload.id", eventInsertPosition);
const submittedWorkflowPosition = submissionSource.indexOf('setWatchWorkflowState(item, "submitted")', submittedIdPosition);
assert.ok(
  eventInsertPosition >= 0 && submittedIdPosition > eventInsertPosition && submittedWorkflowPosition > submittedIdPosition,
  "Le workflow submitted doit être persisté seulement après la soumission métier réussie"
);
assert.equal(
  (submissionSource.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Un échec du writer ne doit pas relancer la soumission events"
);

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_CANDIDATE_WRITE_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    setWatchWorkflowState,
    persistCandidateWorkflowDecision,
    updateServerWatchCandidateOptimistically,
    getWatchWorkflowState,
    updateWatchOperationsDashboard,
    setLastResults(value) { lastResults = value; },
    getLastResults() { return lastResults; }
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
const api = sandbox.__WATCH_CANDIDATE_WRITE_TEST_API__;
assert.ok(api, "API de test writer candidat indisponible");

function createCandidateClient({ updates = [], reads = [] } = {}) {
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

const WORKFLOW_KEY = "dedicalivres_admin_watch_workflow_v2";
const candidateId = "00000000-0000-4000-8000-0000000005d0";
const duplicateEventId = "00000000-0000-4000-8000-0000000005d1";
const submittedEventId = "00000000-0000-4000-8000-0000000005d2";
const candidate = {
  identity_key: "candidate:v1:write-test",
  sourceUrl: "https://events.example/write-test",
  title: "Salon test",
  startDate: "2026-10-10",
  city: "Paris",
  status: "Complet",
  missingFields: [],
  confidence: 95
};

function serverRow(overrides = {}) {
  return {
    id: candidateId,
    identity_key: candidate.identity_key,
    canonical_origin_url: candidate.sourceUrl,
    title: candidate.title,
    start_date: candidate.startDate,
    city: candidate.city,
    workflow_status: "review",
    status_updated_at: "2026-08-20T10:00:00.000Z",
    version: 3,
    ...overrides
  };
}

function resetLocalState() {
  localStorage.clear();
  api.setLastResults([candidate]);
}

// A/B. UPDATE versionné par id, puis adoption de la version retournée.
resetLocalState();
const successRow = serverRow({ workflow_status: "handled", version: 4, status_updated_at: "2026-08-21T10:00:00.000Z" });
const successClient = createCandidateClient({ updates: [{ data: [successRow], error: null }] });
api.setClient(successClient);
api.setSnapshot({ availability: "server", candidates: [serverRow()] });
const sessionResults = api.getLastResults();
const success = await api.setWatchWorkflowState(candidate, "handled");
assert.equal(success.status, "success");
assert.equal(successClient.calls.length, 1);
assert.equal(successClient.calls[0].table, "admin_watch_candidates");
assert.equal(successClient.calls[0].operation, "update");
assert.deepEqual(successClient.calls[0].filters, [["id", candidateId], ["version", 3]]);
assert.equal(successClient.calls[0].payload.workflow_status, "handled");
assert.equal(api.getSnapshot().candidates[0].version, 4, "Le cache doit adopter la version 4");
assert.equal(api.getWatchWorkflowState(candidate), "handled");
assert.equal(api.getLastResults(), sessionResults, "Le writer ne doit pas remplacer lastResults par des lignes serveur");

// C. Zéro ligne déclenche une seule relecture et aucun second UPDATE.
resetLocalState();
const conflictRow = serverRow({ workflow_status: "handled", version: 5, status_updated_at: "2026-08-22T10:00:00.000Z" });
const conflictClient = createCandidateClient({
  updates: [{ data: [], error: null }],
  reads: [{ data: [conflictRow], error: null }]
});
api.setClient(conflictClient);
api.setSnapshot({ availability: "server", candidates: [serverRow()] });
const conflict = await api.setWatchWorkflowState(candidate, "handled");
assert.equal(conflict.status, "conflict");
assert.equal(conflictClient.calls.filter((call) => call.operation === "update").length, 1);
assert.equal(conflictClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(api.getSnapshot().candidates[0].version, 5);
assert.equal(api.getWatchWorkflowState(candidate), "handled");

// D/E. Réseau ou table absente : décision locale conservée, erreur contenue.
for (const error of [
  { message: "Failed to fetch" },
  { code: "PGRST205", message: "table not found in schema cache" }
]) {
  resetLocalState();
  const unavailableClient = createCandidateClient({ updates: [{ data: null, error }] });
  api.setClient(unavailableClient);
  api.setSnapshot({ availability: "server", candidates: [serverRow()] });
  const result = await api.setWatchWorkflowState(candidate, "handled");
  assert.equal(result.status, "unavailable");
  assert.equal(api.getWatchWorkflowState(candidate), "handled");
  assert.equal(JSON.parse(localStorage.getItem(WORKFLOW_KEY))[`url:${candidate.sourceUrl}`].state, "handled");
}

// F. Ligne serveur absente : local uniquement et aucune requête/INSERT automatique.
resetLocalState();
const missingClient = createCandidateClient();
api.setClient(missingClient);
api.setSnapshot({ availability: "server", candidates: [] });
const missing = await api.setWatchWorkflowState(candidate, "handled");
assert.equal(missing.status, "missing");
assert.equal(missingClient.calls.length, 0);
assert.equal(api.getWatchWorkflowState(candidate), "handled");

// N/O/P/Q. Tous les états fermés passent par le même writer versionné.
for (const state of ["duplicate", "handled", "rejected", "submitted"]) {
  resetLocalState();
  const item = {
    ...candidate,
    duplicateEventId: state === "duplicate" ? duplicateEventId : "",
    submittedEventId: state === "submitted" ? submittedEventId : ""
  };
  const row = serverRow({ workflow_status: state, version: 4 });
  const stateClient = createCandidateClient({ updates: [{ data: [row], error: null }] });
  api.setClient(stateClient);
  api.setSnapshot({ availability: "server", candidates: [serverRow()] });
  const result = await api.setWatchWorkflowState(item, state);
  assert.equal(result.status, "success", `Transition ${state} non persistée`);
  assert.deepEqual(stateClient.calls[0].filters, [["id", candidateId], ["version", 3]]);
  if (state === "duplicate") assert.equal(stateClient.calls[0].payload.duplicate_event_id, duplicateEventId);
  if (state === "submitted") assert.equal(stateClient.calls[0].payload.submitted_event_id, submittedEventId);
}

// R. Un échec workflow après soumission ne contient aucune opération events et ne retry pas.
resetLocalState();
const submittedFailureClient = createCandidateClient({
  updates: [{ data: null, error: { message: "network unavailable" } }]
});
api.setClient(submittedFailureClient);
api.setSnapshot({ availability: "server", candidates: [serverRow()] });
const submittedFailure = await api.setWatchWorkflowState(
  { ...candidate, submittedEventId },
  "submitted"
);
assert.equal(submittedFailure.status, "unavailable");
assert.equal(submittedFailureClient.calls.length, 1);
assert.ok(submittedFailureClient.calls.every((call) => call.table === "admin_watch_candidates"));

// S. Un serveur déjà fermé ne peut pas être rouvert par une décision locale active obsolète.
resetLocalState();
const closedClient = createCandidateClient();
api.setClient(closedClient);
api.setSnapshot({
  availability: "server",
  candidates: [serverRow({ workflow_status: "handled", version: 5 })]
});
const preventedReopen = await api.setWatchWorkflowState(candidate, "ready");
assert.equal(preventedReopen.status, "conflict");
assert.equal(closedClient.calls.length, 0, "Une réouverture obsolète ne doit lancer aucun UPDATE");
assert.equal(api.getWatchWorkflowState(candidate), "handled");

// T/U/V. Aucun write au rendu, aucun remplacement de session, aucun polling.
resetLocalState();
const renderClient = createCandidateClient();
api.setClient(renderClient);
api.setSnapshot({ availability: "server", candidates: [serverRow()] });
const preservedResults = api.getLastResults();
api.updateWatchOperationsDashboard();
assert.equal(renderClient.calls.length, 0, "Un rendu ne doit déclencher aucune écriture serveur");
assert.equal(api.getLastResults(), preservedResults);

console.log("ADMIN_WATCH_CANDIDATE_SERVER_WRITE_OK");
