import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync("admin-watch.js", "utf8");

for (const fragment of [
  "componentAvailability:",
  "candidates: reads[0].state",
  "sources: reads[1].state",
  "eventAlerts: reads[2].state",
  "function isWatchPersistenceComponentAvailable(",
  "function canUseControlledWatchImportPlan("
]) {
  assert.ok(source.includes(fragment), `Disponibilité par composant manquante : ${fragment}`);
}

const previewStart = source.indexOf("async function previewControlledWatchImport(");
const previewEnd = source.indexOf("function cancelControlledWatchImport(", previewStart);
const previewSource = source.slice(previewStart, previewEnd);
assert.ok(!previewSource.includes('watchPersistenceSnapshot.availability !== "server"'), "La preview ne doit plus dépendre du statut global");
assert.ok(!previewSource.includes("loadWatchPersistenceSnapshot("), "La preview ne doit pas relancer le snapshot");
assert.ok(!previewSource.includes("client.from("), "La preview ne doit lancer aucune requête directe");

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_COMPONENT_AVAILABILITY_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      const base = createEmptyWatchPersistenceSnapshot(value?.availability || "local");
      watchPersistenceSnapshot = { ...base, ...(value || {}) };
    },
    resetState() {
      watchPersistenceSnapshot = createEmptyWatchPersistenceSnapshot();
      watchPersistenceLoadPromise = null;
      clearPendingControlledWatchImport();
      lastWatchPersistenceNotice = "";
    },
    setLastResults(value) { lastResults = value; },
    getPendingPlan() { return pendingWatchImportPlan; },
    buildControlledImportCandidate,
    buildControlledWatchImportPlan,
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

function createElement(id) {
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
  elements.set(id, createElement(id));
}

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
const api = sandbox.__WATCH_COMPONENT_AVAILABILITY_TEST_API__;
assert.ok(api, "API de test de disponibilité indisponible");

let networkCalls = 0;
api.setClient({
  from() {
    networkCalls += 1;
    throw new Error("Aucune requête réseau attendue depuis la preview");
  }
});

const HISTORY_KEY = "dedicalivres_admin_watch_history_v1";
const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1";
const candidates = Array.from({ length: 11 }, (_, index) => ({
  sourceUrl: `https://events.example/component-${index + 1}`,
  title: `Rencontre littéraire ${index + 1}`,
  startDate: `2026-10-${String(index + 1).padStart(2, "0")}`,
  city: "Paris",
  workflowStatus: index < 10 ? "handled" : "ready"
}));
const localSource = {
  sourceUrl: "https://sources.example/agenda",
  title: "Agenda local",
  analysesCount: 2,
  observedCount: 3
};

localStorage.setItem(HISTORY_KEY, "[]");
const existingCandidates = [];
for (const candidate of candidates.slice(0, 10)) {
  const entry = await api.buildControlledImportCandidate(candidate);
  existingCandidates.push({ ...entry.payload, version: 1 });
}

function setLocalFixture(sources = []) {
  localStorage.setItem(HISTORY_KEY, "[]");
  localStorage.setItem(PRODUCTIVE_SOURCES_KEY, JSON.stringify(sources));
  api.setLastResults(candidates);
}

function setComponentSnapshot({ candidateState, sourceState, eventState, candidateRows = existingCandidates, sourceRows = [] }) {
  api.setSnapshot({
    availability: [candidateState, sourceState, eventState].every((state) => state === "available") ? "server" : "mixed",
    componentAvailability: {
      candidates: candidateState,
      sources: sourceState,
      eventAlerts: eventState
    },
    candidates: candidateRows,
    sources: sourceRows,
    eventAlerts: []
  });
}

// Cas A : les candidats restent importables avec sources et Event Watch indisponibles.
api.resetState();
setLocalFixture();
setComponentSnapshot({ candidateState: "available", sourceState: "unavailable", eventState: "unavailable" });
const candidateOnlyPlan = await api.previewControlledWatchImport();
assert.ok(candidateOnlyPlan, "La disponibilité candidats doit suffire sans source locale");
assert.equal(candidateOnlyPlan.candidates.create.length, 1);
assert.equal(candidateOnlyPlan.candidates.existing.length, 10);
assert.equal(candidateOnlyPlan.sources.create.length, 0);
assert.ok(api.getPendingPlan(), "Le plan candidat doit pouvoir être confirmé");
assert.equal(elements.get("watch-import-confirm-btn").disabled, false);

// Cas B : aucune preview candidat si sa lecture serveur est indisponible.
api.resetState();
setLocalFixture();
setComponentSnapshot({ candidateState: "unavailable", sourceState: "available", eventState: "available", candidateRows: [] });
assert.equal(await api.previewControlledWatchImport(), null);
assert.equal(api.getPendingPlan(), null);
assert.equal(elements.get("watch-import-confirm-btn").disabled, true);
assert.match(elements.get("watch-import-summary").textContent, /candidats indisponible/);

// Cas C : une source locale ne peut jamais devenir un INSERT lorsque son état serveur est inconnu.
api.resetState();
setLocalFixture([localSource]);
setComponentSnapshot({ candidateState: "available", sourceState: "unavailable", eventState: "available" });
const blockedSourcePlan = await api.buildControlledWatchImportPlan();
assert.equal(blockedSourcePlan.sources.create.length, 0, "Une source inconnue ne doit jamais être classée absente");
assert.equal(blockedSourcePlan.sources.blocked, 1, "La source doit être explicitement bloquée");
assert.equal(await api.previewControlledWatchImport(), null);
assert.equal(api.getPendingPlan(), null, "Aucun plan contenant une source inconnue ne doit être confirmable");
assert.equal(elements.get("watch-import-confirm-btn").disabled, true);
assert.match(elements.get("watch-import-summary").textContent, /sources indisponible/);

// Cas D : Event Watch indisponible n'empêche ni les candidats ni les sources disponibles.
api.resetState();
setLocalFixture([localSource]);
setComponentSnapshot({ candidateState: "available", sourceState: "available", eventState: "unavailable" });
const completeImportPlan = await api.previewControlledWatchImport();
assert.ok(completeImportPlan);
assert.equal(completeImportPlan.candidates.create.length, 1);
assert.equal(completeImportPlan.candidates.existing.length, 10);
assert.equal(completeImportPlan.sources.create.length, 1);
assert.equal(elements.get("watch-import-confirm-btn").disabled, false);

// Cas E : la protection contre un snapshot remplacé reste active.
setComponentSnapshot({ candidateState: "available", sourceState: "available", eventState: "unavailable" });
assert.equal(await api.confirmControlledWatchImport(), null);
assert.equal(api.getPendingPlan(), null);
assert.match(elements.get("watch-import-summary").textContent, /n’est plus à jour/);
assert.equal(networkCalls, 0, "Aucun cas de preview ne doit accéder au serveur");

console.log("ADMIN_WATCH_COMPONENT_AVAILABILITY_OK");
