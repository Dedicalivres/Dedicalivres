import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "Importer les données locales",
  "Confirmer l’import",
  "function buildControlledWatchImportPlan(",
  "async function previewControlledWatchImport(",
  "async function confirmControlledWatchImport(",
  "async function insertControlledImportCandidate(",
  "async function insertControlledImportSource(",
  "async function runControlledImportPool(",
  "async function executeControlledWatchImport(",
  'createWatchPersistenceHash("legacy-watch-v2"',
  'createWatchPersistenceHash("source:v1"',
  'document.getElementById("watch-import-local-btn")?.addEventListener("click", previewControlledWatchImport)',
  'document.getElementById("watch-import-confirm-btn")?.addEventListener("click", confirmControlledWatchImport)'
];
for (const fragment of required) {
  assert.ok(source.includes(fragment), `Import contrôlé incomplet : ${fragment}`);
}

const importStart = source.indexOf("function createControlledWatchImportCounts(");
const importEnd = source.indexOf("async function analyzeUrls(", importStart);
const importSource = source.slice(importStart, importEnd);

assert.equal((importSource.match(/\.insert\(/g) || []).length, 2, "Deux points d'INSERT contrôlés sont attendus");
assert.equal(
  (importSource.match(/\.from\("admin_watch_candidates"\)/g) || []).length,
  2,
  "Candidats : un INSERT et une relecture UNIQUE seulement"
);
assert.equal(
  (importSource.match(/\.from\("admin_watch_sources"\)/g) || []).length,
  2,
  "Sources : un INSERT et une relecture UNIQUE seulement"
);
for (const forbidden of [
  ".upsert(",
  ".delete(",
  ".rpc(",
  ".update(",
  "service_role",
  'from("events")',
  "admin_event_watch_alerts",
  "admin_watch_transitions",
  "setInterval("
]) {
  assert.ok(!importSource.includes(forbidden), `Opération interdite dans l'import : ${forbidden}`);
}
assert.ok(!importSource.includes("localStorage.removeItem("), "L'import ne doit supprimer aucune donnée locale");
assert.ok(!source.includes("setInterval("), "L'import ne doit ajouter aucun polling");
assert.ok(
  source.includes("const WATCH_CONTROLLED_IMPORT_CONCURRENCY = 3") &&
    importSource.includes("Math.min(WATCH_CONTROLLED_IMPORT_CONCURRENCY, items.length)"),
  "La concurrence d'import doit être bornée"
);
assert.equal(
  (source.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Aucune écriture events supplémentaire n'est autorisée"
);
const analyzeStart = source.indexOf("async function analyzeUrls(");
const analyzeEnd = source.indexOf("async function testWorkerHealth(", analyzeStart);
const analyzeSource = source.slice(analyzeStart, analyzeEnd);
assert.ok(
  !analyzeSource.includes("executeControlledWatchImport(") &&
    !analyzeSource.includes("insertControlledImportCandidate(") &&
    !analyzeSource.includes("insertControlledImportSource("),
  "Une analyse automatique ne doit jamais déclencher l'import contrôlé"
);

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_CONTROLLED_IMPORT_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      const base = createEmptyWatchPersistenceSnapshot(value?.availability || "local");
      watchPersistenceSnapshot = { ...base, ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    setLastResults(value) { lastResults = value; },
    getLastResults() { return lastResults; },
    getPendingPlan() { return pendingWatchImportPlan; },
    bindControls,
    updateWatchOperationsDashboard,
    buildControlledImportCandidate,
    buildControlledImportSource,
    buildControlledWatchImportPlan,
    previewControlledWatchImport,
    confirmControlledWatchImport,
    executeControlledWatchImport,
    insertControlledImportCandidate,
    insertControlledImportSource,
    runControlledImportPool
  };
})();
`);

const storage = new Map();
const elements = new Map();
const listeners = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
function createElementState(id) {
  return {
    id,
    hidden: false,
    disabled: false,
    textContent: "",
    dataset: {},
    style: {},
    addEventListener(type, handler) { listeners.set(`${id}:${type}`, handler); }
  };
}
for (const id of [
  "watch-import-local-btn",
  "watch-import-preview",
  "watch-import-summary",
  "watch-import-cancel-btn",
  "watch-import-confirm-btn"
]) {
  elements.set(id, createElementState(id));
}
elements.get("watch-import-preview").hidden = true;

const document = {
  readyState: "loading",
  addEventListener() {},
  querySelector() { return null; },
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
  Uint8Array,
  TextEncoder,
  console,
  document,
  localStorage,
  setTimeout,
  clearTimeout,
  navigator: {},
  crypto: webcrypto
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.requestAnimationFrame = (callback) => callback();

vm.runInNewContext(instrumented, sandbox, { filename: "admin-watch.js" });
const api = sandbox.__WATCH_CONTROLLED_IMPORT_TEST_API__;
assert.ok(api, "API de test import contrôlé indisponible");

function createImportClient(responder) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", payload: null, columns: "", filters: [], limit: null };
      calls.push(call);
      const builder = {
        insert(payload) {
          call.operation = "insert";
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
          return Promise.resolve()
            .then(() => responder(call, calls.length - 1))
            .then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

let uuidCounter = 1;
function nextUuid() {
  const suffix = (uuidCounter++).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

function successResponse(call) {
  if (call.operation !== "insert") return { data: [], error: null };
  return {
    data: [{ id: nextUuid(), ...call.payload[0], version: 1 }],
    error: null
  };
}

const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1";
const WORKFLOW_KEY = "dedicalivres_admin_watch_workflow_v2";
const HISTORY_KEY = "dedicalivres_admin_watch_history_v1";
const candidateToCreate = {
  sourceUrl: "https://events.example/new",
  title: "Salon nouveau",
  startDate: "2026-10-10",
  city: "Paris",
  workflowStatus: "ready",
  duplicateEventId: "pas-un-uuid",
  submittedEventId: "00000000-0000-4000-8000-0000000000aa"
};
const candidateAlreadyPresent = {
  sourceUrl: "https://events.example/existing",
  title: "Salon existant",
  startDate: "2026-11-11",
  city: "Lyon",
  workflowStatus: "handled"
};
const incompleteCandidate = {
  sourceUrl: "https://events.example/incomplete",
  title: "Sans ville",
  startDate: "2026-12-12",
  city: ""
};
const sourceToCreate = {
  sourceUrl: "https://sources.example/new",
  title: "Source nouvelle",
  analysesCount: 3,
  observedCount: 20,
  completeCount: 12,
  reviewCount: 5,
  rejectedCount: 3,
  certainDuplicateCount: 1,
  probableDuplicateCount: 2,
  withImageCount: 15,
  withoutImageCount: 5,
  firstSeenAt: "2026-07-01T00:00:00.000Z",
  lastSeenAt: "2026-08-28T00:00:00.000Z"
};
const sourceAlreadyPresent = {
  sourceUrl: "https://sources.example/existing",
  urlHash: "source:v1:existing-stable",
  title: "Source existante",
  analysesCount: 2,
  observedCount: 10
};
const incompleteSource = {
  sourceUrl: "https://sources.example/incomplete",
  title: "Sans nombre d'analyses"
};

function setLocalFixture() {
  localStorage.clear();
  localStorage.setItem(HISTORY_KEY, "[]");
  localStorage.setItem(PRODUCTIVE_SOURCES_KEY, JSON.stringify([
    sourceToCreate,
    sourceAlreadyPresent,
    incompleteSource
  ]));
  api.setLastResults([candidateToCreate, candidateAlreadyPresent, incompleteCandidate]);
}

// A/B. Le chargement et le rendu ne déclenchent aucun accès distant.
const idleClient = createImportClient(successResponse);
api.setClient(idleClient);
api.setSnapshot({ availability: "server", candidates: [], sources: [] });
api.bindControls();
assert.ok(listeners.has("watch-import-local-btn:click"));
assert.ok(listeners.has("watch-import-confirm-btn:click"));
api.updateWatchOperationsDashboard();
assert.equal(idleClient.calls.length, 0);

// P/Q. Les identités générées sont déterministes et stables.
const firstCandidateIdentity = await api.buildControlledImportCandidate(candidateToCreate);
const secondCandidateIdentity = await api.buildControlledImportCandidate({ ...candidateToCreate });
assert.equal(firstCandidateIdentity.payload.identity_key, secondCandidateIdentity.payload.identity_key);
assert.match(firstCandidateIdentity.payload.identity_key, /^legacy-watch-v2:[0-9a-f]{64}$/);
const firstSourceIdentity = await api.buildControlledImportSource(sourceToCreate);
const secondSourceIdentity = await api.buildControlledImportSource({ ...sourceToCreate });
assert.equal(firstSourceIdentity.payload.url_hash, secondSourceIdentity.payload.url_hash);
assert.match(firstSourceIdentity.payload.url_hash, /^source:v1:[0-9a-f]{64}$/);
assert.equal(
  (await api.buildControlledImportSource(sourceAlreadyPresent)).payload.url_hash,
  sourceAlreadyPresent.urlHash,
  "Un url_hash local existant doit être réutilisé"
);

// R/S/T. UUID liés filtrés, workflow invalide sûr et état fermé conservé.
assert.ok(!Object.hasOwn(firstCandidateIdentity.payload, "duplicate_event_id"));
assert.equal(firstCandidateIdentity.payload.submitted_event_id, candidateToCreate.submittedEventId);
const invalidWorkflow = await api.buildControlledImportCandidate({
  ...candidateToCreate,
  sourceUrl: "https://events.example/invalid-workflow",
  workflowStatus: "inconnu"
});
assert.equal(invalidWorkflow.payload.workflow_status, "review");
const closedWorkflow = await api.buildControlledImportCandidate({
  ...candidateToCreate,
  sourceUrl: "https://events.example/closed",
  workflowStatus: "rejected"
});
assert.equal(closedWorkflow.payload.workflow_status, "rejected");

// U. Une métrique explicitement NULL reste NULL, même si un total legacy existe.
const nullMetricSource = await api.buildControlledImportSource({
  ...sourceToCreate,
  sourceUrl: "https://sources.example/null",
  observedCount: null,
  totalCount: 99
});
assert.equal(nullMetricSource.payload.observed_count, null);

// C/D. La preview calcule créations/existants/skips sans aucune écriture.
setLocalFixture();
const existingCandidateEntry = await api.buildControlledImportCandidate(candidateAlreadyPresent);
const existingSourceEntry = await api.buildControlledImportSource(sourceAlreadyPresent);
api.setSnapshot({
  availability: "server",
  candidates: [{ id: nextUuid(), ...existingCandidateEntry.payload, version: 1 }],
  sources: [{ id: nextUuid(), ...existingSourceEntry.payload, version: 1 }]
});
const previewClient = createImportClient(successResponse);
api.setClient(previewClient);
const previewPlan = await api.buildControlledWatchImportPlan();
assert.equal(previewPlan.candidates.create.length, 1);
assert.equal(previewPlan.candidates.existing.length, 1);
assert.equal(previewPlan.candidates.skipped, 1);
assert.equal(previewPlan.sources.create.length, 1);
assert.equal(previewPlan.sources.existing.length, 1);
assert.equal(previewPlan.sources.skipped, 1);
assert.equal(previewClient.calls.length, 0);
await api.previewControlledWatchImport();
assert.ok(api.getPendingPlan(), "La preview doit préparer un plan en attente de confirmation");
assert.equal(previewClient.calls.length, 0, "Aucun write ne doit précéder la confirmation humaine");
assert.match(elements.get("watch-import-summary").textContent, /1 à créer/);

// E/G/O/Z. Après confirmation : un INSERT par objet absent et adoption snapshot.
const localBeforeSuccess = new Map(storage);
const importClient = createImportClient(successResponse);
api.setClient(importClient);
const confirmed = await api.confirmControlledWatchImport();
assert.equal(confirmed.candidates.created, 1);
assert.equal(confirmed.candidates.existing, 1);
assert.equal(confirmed.sources.created, 1);
assert.equal(confirmed.sources.existing, 1);
assert.equal(importClient.calls.filter((call) => call.operation === "insert" && call.table === "admin_watch_candidates").length, 1);
assert.equal(importClient.calls.filter((call) => call.operation === "insert" && call.table === "admin_watch_sources").length, 1);
assert.equal(api.getSnapshot().candidates.length, 2);
assert.equal(api.getSnapshot().sources.length, 2);
assert.deepEqual(new Map(storage), localBeforeSuccess, "L'import ne doit supprimer ni modifier le localStorage");

// F/H/AA. Un second plan est idempotent : tout est désormais existant.
const idempotentPlan = await api.buildControlledWatchImportPlan();
assert.equal(idempotentPlan.candidates.create.length, 0);
assert.equal(idempotentPlan.candidates.existing.length, 2);
assert.equal(idempotentPlan.sources.create.length, 0);
assert.equal(idempotentPlan.sources.existing.length, 2);
const noInsertClient = createImportClient(() => {
  throw new Error("Aucun INSERT attendu pour les lignes existantes");
});
api.setClient(noInsertClient);
const idempotentResult = await api.executeControlledWatchImport(idempotentPlan);
assert.equal(idempotentResult.candidates.created, 0);
assert.equal(idempotentResult.sources.created, 0);
assert.equal(noInsertClient.calls.length, 0);

// V/W. Une collision UNIQUE relit la ligne et ne retente jamais l'INSERT.
const raceEntry = await api.buildControlledImportCandidate({
  ...candidateToCreate,
  sourceUrl: "https://events.example/race"
});
const raceRow = { id: nextUuid(), ...raceEntry.payload, version: 1 };
const raceClient = createImportClient((call) => {
  if (call.operation === "insert") {
    return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
  }
  return { data: [raceRow], error: null };
});
api.setClient(raceClient);
api.setSnapshot({ availability: "server", candidates: [], sources: [] });
const raceResult = await api.executeControlledWatchImport({
  candidates: { create: [raceEntry], existing: [], skipped: 0 },
  sources: { create: [], existing: [], skipped: 0 }
});
assert.equal(raceResult.candidates.existing, 1);
assert.equal(raceClient.calls.filter((call) => call.operation === "insert").length, 1);
assert.equal(raceClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(api.getSnapshot().candidates[0].identity_key, raceEntry.payload.identity_key);

// X. Le pool ne dépasse jamais trois opérations simultanées.
let activeWorkers = 0;
let maxActiveWorkers = 0;
const poolItems = Array.from({ length: 9 }, (_, index) => index);
const poolResults = await api.runControlledImportPool(poolItems, async (value) => {
  activeWorkers += 1;
  maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
  await new Promise((resolve) => setTimeout(resolve, 2));
  activeWorkers -= 1;
  return value * 2;
});
assert.equal(maxActiveWorkers, 3);
assert.deepEqual([...poolResults], poolItems.map((value) => value * 2));

// Y. Une erreur partielle ne bloque pas les autres objets.
const partialEntries = await Promise.all([
  api.buildControlledImportCandidate({ ...candidateToCreate, sourceUrl: "https://events.example/partial-1" }),
  api.buildControlledImportCandidate({ ...candidateToCreate, sourceUrl: "https://events.example/partial-2" })
]);
let partialInsertIndex = 0;
const partialClient = createImportClient((call) => {
  partialInsertIndex += 1;
  if (partialInsertIndex === 1) return { data: null, error: { code: "42501", message: "permission denied" } };
  return successResponse(call);
});
api.setClient(partialClient);
api.setSnapshot({ availability: "server", candidates: [], sources: [] });
const partialResult = await api.executeControlledWatchImport({
  candidates: { create: partialEntries, existing: [], skipped: 0 },
  sources: { create: [], existing: [], skipped: 0 }
});
assert.equal(partialResult.candidates.failed, 1);
assert.equal(partialResult.candidates.created, 1);
assert.equal(partialClient.calls.filter((call) => call.operation === "insert").length, 2);

// AB/AC/AD. Table absente, RLS et réseau : fallback propre, local intact.
for (const error of [
  { code: "PGRST205", message: "table not found in schema cache" },
  { code: "42501", message: "row-level security policy" },
  { message: "Failed to fetch" }
]) {
  setLocalFixture();
  const localBeforeFailure = new Map(storage);
  const failureEntry = await api.buildControlledImportCandidate(candidateToCreate);
  const failureClient = createImportClient(() => ({ data: null, error }));
  api.setClient(failureClient);
  api.setSnapshot({ availability: "server", candidates: [], sources: [] });
  const failureResult = await api.executeControlledWatchImport({
    candidates: { create: [failureEntry], existing: [], skipped: 0 },
    sources: { create: [], existing: [], skipped: 0 }
  });
  assert.equal(failureResult.candidates.failed, 1);
  assert.equal(failureResult.candidates.created, 0);
  assert.deepEqual(new Map(storage), localBeforeFailure);
}

// Le client absent est également contenu sans faux succès.
api.setClient(null);
const unavailableResult = await api.executeControlledWatchImport({
  candidates: { create: [firstCandidateIdentity], existing: [], skipped: 0 },
  sources: { create: [firstSourceIdentity], existing: [], skipped: 0 }
});
assert.equal(unavailableResult.candidates.failed, 1);
assert.equal(unavailableResult.sources.failed, 1);

console.log("ADMIN_WATCH_CONTROLLED_IMPORT_OK");
