import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync("admin-watch.js", "utf8");

for (const fragment of [
  "let watchPersistenceLoadPromise = null;",
  "let pendingWatchImportSnapshot = null;",
  "function startWatchPersistenceLoad()",
  "if (watchPersistenceLoadPromise) await watchPersistenceLoadPromise;",
  'isWatchPersistenceComponentAvailable(watchPersistenceSnapshot, "candidates")',
  "Précontrôle serveur des candidats indisponible",
  "watchPersistenceSnapshot !== pendingWatchImportSnapshot"
]) {
  assert.ok(source.includes(fragment), `Protection de preview manquante : ${fragment}`);
}

const previewStart = source.indexOf("async function previewControlledWatchImport(");
const previewEnd = source.indexOf("function cancelControlledWatchImport(", previewStart);
const previewSource = source.slice(previewStart, previewEnd);
assert.ok(!previewSource.includes("loadWatchPersistenceSnapshot("), "La preview ne doit pas relancer la lecture serveur");
assert.ok(!previewSource.includes("startWatchPersistenceLoad("), "La preview ne doit pas redémarrer la lecture initiale");
assert.ok(!previewSource.includes("client.from("), "La preview ne doit effectuer aucune requête directe");

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_IMPORT_PREVIEW_RACE_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    resetPersistenceState() {
      watchPersistenceSnapshot = createEmptyWatchPersistenceSnapshot();
      watchPersistenceLoadPromise = null;
      clearPendingControlledWatchImport();
      lastWatchPersistenceNotice = "";
    },
    setLastResults(value) { lastResults = value; },
    getSnapshot() { return watchPersistenceSnapshot; },
    getPendingPlan() { return pendingWatchImportPlan; },
    startWatchPersistenceLoad,
    buildControlledImportCandidate,
    previewControlledWatchImport,
    confirmControlledWatchImport
  };
})();
`);

const storage = new Map();
const elements = new Map();
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
    addEventListener() {}
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
const api = sandbox.__WATCH_IMPORT_PREVIEW_RACE_TEST_API__;
assert.ok(api, "API de test de la course preview indisponible");

function createReadClient(responder) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", columns: "", order: "", limit: null };
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
        limit(value) {
          call.limit = value;
          return this;
        },
        abortSignal() { return this; },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => responder(call))
            .then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const HISTORY_KEY = "dedicalivres_admin_watch_history_v1";
const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1";
const localCandidates = Array.from({ length: 11 }, (_, index) => ({
  sourceUrl: `https://events.example/import-${index + 1}`,
  title: `Festival du livre ${index + 1}`,
  startDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
  city: "Paris",
  workflowStatus: index < 10 ? "handled" : "ready"
}));

localStorage.setItem(HISTORY_KEY, "[]");
localStorage.setItem(PRODUCTIVE_SOURCES_KEY, "[]");
const existingRows = [];
for (const candidate of localCandidates.slice(0, 10)) {
  const entry = await api.buildControlledImportCandidate(candidate);
  existingRows.push({ ...entry.payload, version: 1 });
}

function responseFor(table) {
  return {
    data: table === "admin_watch_candidates" ? existingRows : [],
    error: null
  };
}

function setLocalFixture() {
  localStorage.setItem(HISTORY_KEY, "[]");
  localStorage.setItem(PRODUCTIVE_SOURCES_KEY, "[]");
  api.setLastResults(localCandidates);
}

function assertCorrectPreview(plan) {
  assert.ok(plan, "La preview doit être disponible après la lecture serveur");
  assert.equal(plan.candidates.create.length, 1, "Seul le nouveau candidat doit être créé");
  assert.equal(plan.candidates.existing.length, 10, "Les dix candidats serveur doivent être reconnus");
  assert.equal(plan.candidates.skipped, 0);
  assert.equal(plan.sources.create.length, 0);
}

// Cas 1 et 4 : la preview attend la lecture initiale et ne déclenche aucune seconde lecture.
api.resetPersistenceState();
api.setLastResults([]);
const gate = createDeferred();
const raceClient = createReadClient(async (call) => {
  await gate.promise;
  return responseFor(call.table);
});
api.setClient(raceClient);
const initialLoad = api.startWatchPersistenceLoad();
setLocalFixture();
const previewDuringLoad = api.previewControlledWatchImport();
await Promise.resolve();
assert.equal(raceClient.calls.length, 3, "Le chargement initial doit lancer exactement trois lectures");
assert.equal(api.getPendingPlan(), null, "Aucun plan ne doit être construit sur le snapshot vide");
assert.equal(elements.get("watch-import-confirm-btn").disabled, true, "La confirmation reste bloquée pendant le précontrôle");
gate.resolve();
await initialLoad;
const racePlan = await previewDuringLoad;
assertCorrectPreview(racePlan);
assert.equal(raceClient.calls.length, 3, "Le clic preview ne doit déclencher aucune lecture supplémentaire");
assert.equal(raceClient.calls.filter((call) => call.operation === "select").length, 3);

// Un plan devient non confirmable si le snapshot change après sa construction.
const callsBeforeStaleConfirmation = raceClient.calls.length;
api.setSnapshot({ availability: "server", candidates: existingRows, sources: [], eventAlerts: [] });
assert.equal(await api.confirmControlledWatchImport(), null, "Un ancien plan ne doit jamais être confirmé");
assert.equal(raceClient.calls.length, callsBeforeStaleConfirmation, "Le rejet d’un plan périmé ne doit rien écrire");
assert.match(elements.get("watch-import-summary").textContent, /n’est plus à jour/);

// Cas 2 : une lecture déjà terminée rend la preview immédiatement correcte.
api.resetPersistenceState();
api.setLastResults([]);
const loadedClient = createReadClient((call) => responseFor(call.table));
api.setClient(loadedClient);
await api.startWatchPersistenceLoad();
setLocalFixture();
const loadedPlan = await api.previewControlledWatchImport();
assertCorrectPreview(loadedPlan);
assert.equal(loadedClient.calls.length, 3, "Une preview après chargement ne doit pas relire le serveur");

// Cas 3 : une lecture serveur en erreur bloque le plan et préserve le fallback local.
api.resetPersistenceState();
api.setLastResults([]);
const failureClient = createReadClient(() => ({
  data: null,
  error: { message: "Failed to fetch" }
}));
api.setClient(failureClient);
const failingLoad = api.startWatchPersistenceLoad();
setLocalFixture();
const localBeforeFailure = new Map(storage);
const failedPlan = await api.previewControlledWatchImport();
await failingLoad;
assert.equal(failedPlan, null, "Une existence serveur inconnue ne doit produire aucun plan");
assert.equal(api.getPendingPlan(), null);
assert.equal(elements.get("watch-import-confirm-btn").disabled, true, "La confirmation doit être impossible en erreur serveur");
assert.match(elements.get("watch-import-summary").textContent, /Précontrôle serveur des candidats indisponible/);
assert.equal(failureClient.calls.length, 3, "L’erreur serveur ne doit pas provoquer de nouvelle tentative depuis la preview");
assert.equal(await api.confirmControlledWatchImport(), null);
assert.deepEqual(new Map(storage), localBeforeFailure, "Le fallback local doit rester strictement intact");

console.log("ADMIN_WATCH_IMPORT_PREVIEW_RACE_OK");
