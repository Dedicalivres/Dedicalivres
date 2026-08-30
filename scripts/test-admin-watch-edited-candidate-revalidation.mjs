import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_REVALIDATION_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    setLastResults(value) { lastResults = value; },
    getLastResults() { return lastResults; },
    saveWatchCandidateEdits,
    recalculateWatchCandidateMissingFields,
    getWatchCandidateQualityScore,
    inferWatchCandidateWorkflowState,
    getWatchWorkflowState,
    renderResultCard,
    renderWatchSubmissionPreview,
    buildSubmissionPayload,
    buildWatchCandidateQueue
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
const api = sandbox.__WATCH_REVALIDATION_TEST_API__;
assert.ok(api, "API de test Pack 6C indisponible");

function createCandidateClient({ updates = [], inserts = [], reads = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", payload: null, filters: [] };
      calls.push(call);
      return {
        insert(payload) {
          call.operation = "insert";
          call.payload = payload;
          return this;
        },
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
          const queue = call.operation === "update" ? updates : call.operation === "insert" ? inserts : reads;
          const response = queue.length ? queue.shift() : { data: [], error: null };
          return Promise.resolve(response).then(resolve, reject);
        }
      };
    }
  };
}

function createForm(item, overrides = {}, { endDateEdited = false } = {}) {
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
    dataset: { watchUserEdited: endDateEdited ? "true" : "false" }
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

const candidateId = "00000000-0000-4000-8000-000000006c00";
const identityKey = "candidate:v1:fontvieille-2026";
const baseCandidate = {
  identity_key: identityKey,
  sourceUrl: "https://example.test/fontvieille",
  officialUrl: "https://example.test/fontvieille",
  title: "Salon du livre",
  type: "Salon",
  startDate: "2026-09-20",
  endDate: "",
  city: "Fontvieille",
  country: "",
  venue: "Centre culturel",
  address: "Place du village",
  description: "Salon du livre réunissant auteurs, lecteurs et éditeurs pour une journée de rencontres.",
  imageUrl: "https://example.test/fontvieille.jpg",
  status: "À vérifier",
  confidence: 83,
  missingFields: ["pays"],
  filterWarnings: [],
  workflowStatus: "review"
};

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
    status_updated_at: "2026-08-30T08:00:00.000Z",
    version
  };
}

function reset(candidate, snapshotCandidates = []) {
  localStorage.clear();
  api.setLastResults([candidate]);
  api.setSnapshot({ availability: "server", candidates: snapshotCandidates });
}

// Fontvieille : le dernier motif "pays" est résolu sans toucher à endDate.
const fontvieille = structuredClone(baseCandidate);
const qualityBefore = api.getWatchCandidateQualityScore(fontvieille);
const readyRow = serverRow("ready", 4);
const fontvieilleClient = createCandidateClient({ updates: [{ data: [readyRow], error: null }] });
reset(fontvieille, [serverRow("review", 3)]);
api.setClient(fontvieilleClient);
assert.equal(api.getWatchWorkflowState(fontvieille), "review");
api.saveWatchCandidateEdits(0, createForm(fontvieille, { country: "France" }));
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(fontvieille.country, "France");
assert.equal(fontvieille.endDate, "", "L’édition du pays ne doit jamais remplir endDate");
assert.ok(!fontvieille.missingFields.includes("pays"));
assert.ok(!fontvieille.adminText.includes("À vérifier : pays"));
assert.ok(api.getWatchCandidateQualityScore(fontvieille) > qualityBefore, "La qualité doit être recalculée depuis les données éditées");
assert.equal(api.getWatchWorkflowState(fontvieille), "ready");
assert.equal(fontvieilleClient.calls.length, 1, "Une seule persistance contenu + workflow est permise");
assert.equal(fontvieilleClient.calls[0].table, "admin_watch_candidates");
assert.equal(fontvieilleClient.calls[0].payload.workflow_status, "ready");
assert.equal(fontvieilleClient.calls[0].payload.country, "France");
assert.equal(fontvieilleClient.calls[0].payload.end_date, null);
assert.equal(fontvieilleClient.calls[0].payload.description, fontvieille.description);

const renderedFontvieille = api.renderResultCard(fontvieille, 0);
assert.ok(renderedFontvieille.includes("Fontvieille · France"));
assert.ok(renderedFontvieille.includes("Workflow : Prêt"));
assert.ok(!renderedFontvieille.includes("À vérifier : pays"));

// Une autre alerte réellement bloquante maintient review.
const stillReview = { ...structuredClone(baseCandidate), city: "", missingFields: ["ville", "pays"] };
const noWriteClient = createCandidateClient();
reset(stillReview, []);
api.setClient(noWriteClient);
await api.saveWatchCandidateEdits(0, createForm(stillReview, { country: "France" }));
assert.deepEqual(Array.from(stillReview.missingFields), ["ville"]);
assert.equal(api.inferWatchCandidateWorkflowState(stillReview), "review");
assert.equal(api.getWatchWorkflowState(stillReview), "review");
assert.equal(noWriteClient.calls.length, 0, "Une identité serveur incomplète ne doit pas déclencher d’INSERT");

// Corriger le dernier champ bloquant réutilise les critères existants et passe ready.
const lastBlocking = { ...structuredClone(baseCandidate), city: "", country: "France", missingFields: ["ville"] };
const lastBlockingClient = createCandidateClient({ updates: [{ data: [readyRow], error: null }] });
reset(lastBlocking, [serverRow("review", 3)]);
api.setClient(lastBlockingClient);
api.saveWatchCandidateEdits(0, createForm(lastBlocking, { city: "Fontvieille", country: "France" }));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(lastBlocking.missingFields.includes("ville"), false);
assert.equal(api.getWatchWorkflowState(lastBlocking), "ready");

// endDate vide et vraie endDate restent exactement celles de la source JS.
assert.equal(fontvieille.endDate, "");
const datedCandidate = { ...structuredClone(baseCandidate), country: "France", endDate: "2026-09-21", missingFields: [] };
reset(datedCandidate, []);
api.setClient(createCandidateClient({
  inserts: [{ data: [{ ...serverRow("ready", 1), end_date: "2026-09-21" }], error: null }]
}));
await api.saveWatchCandidateEdits(0, createForm(datedCandidate, { country: "France" }));
assert.equal(datedCandidate.endDate, "2026-09-21");

// Aucun workflow serveur fermé ne peut être rouvert par cette revalidation.
for (const closedState of ["duplicate", "submitted", "handled", "rejected"]) {
  const closedCandidate = structuredClone(baseCandidate);
  const closedClient = createCandidateClient({ updates: [{ data: [serverRow(closedState, 6)], error: null }] });
  reset(closedCandidate, [serverRow(closedState, 5)]);
  api.setClient(closedClient);
  await api.saveWatchCandidateEdits(0, createForm(closedCandidate, { country: "France" }));
  assert.equal(api.getWatchWorkflowState(closedCandidate), closedState);
  assert.equal(closedClient.calls.length, 1, `${closedState} doit persister le contenu sans réouverture`);
  assert.equal(closedClient.calls[0].payload.workflow_status, closedState);
}

// Reconstruction logique : Worker/source avec France + workflow serveur ready = une seule fiche cohérente.
localStorage.clear();
const reloadedWorkerCandidate = {
  ...structuredClone(baseCandidate),
  country: "France",
  missingFields: [],
  workflowStatus: "review"
};
api.setSnapshot({ availability: "server", candidates: [readyRow] });
api.setLastResults([reloadedWorkerCandidate]);
const reloadedQueue = api.buildWatchCandidateQueue([reloadedWorkerCandidate]);
assert.equal(reloadedQueue.length, 1, "Le reload ne doit pas créer un candidat artificiel");
assert.equal(reloadedQueue[0].country, "France");
assert.equal(api.getWatchWorkflowState(reloadedQueue[0]), "ready");
assert.ok(!reloadedQueue[0].missingFields.includes("pays"));

// Prévisualisation seulement : données éditées, avertissement review et aucune publication.
const readyPreview = api.renderWatchSubmissionPreview(fontvieille, 0);
assert.ok(readyPreview.includes("<dt>Pays</dt><dd>France</dd>"));
assert.ok(readyPreview.includes("<dt>Date de fin</dt><dd>Non renseignée</dd>"));
assert.ok(readyPreview.includes("Aucun champ bloquant détecté."));

localStorage.clear();
api.setSnapshot({ availability: "server", candidates: [serverRow("review", 3)] });
const validButReview = { ...structuredClone(baseCandidate), country: "France", missingFields: [] };
const reviewPreview = api.renderWatchSubmissionPreview(validButReview, 0);
assert.ok(reviewPreview.includes("Workflow à vérifier : relis la fiche avant de confirmer l’envoi."));

const payload = api.buildSubmissionPayload(fontvieille);
assert.equal(payload.country_code, "FR");
assert.equal(payload.end_date, null);
assert.equal(payload.validated, false);
assert.equal(payload.verified, false);

const saveStart = source.indexOf("function saveWatchCandidateEdits(");
const saveEnd = source.indexOf("function getWatchCandidateEndDateUpdate(", saveStart);
const saveSource = source.slice(saveStart, saveEnd);
const previewStart = source.indexOf("function renderWatchSubmissionPreview(");
const submissionStart = source.indexOf("async function createSubmissionFromWatch(", previewStart);
const previewSource = source.slice(previewStart, submissionStart);
const writerStart = source.indexOf("async function updateServerWatchCandidateOptimistically(");
const writerEnd = source.indexOf("async function persistCandidateWorkflowDecision(", writerStart);
const writerSource = source.slice(writerStart, writerEnd);

for (const forbidden of ["fetch(", '.from("events")', ".insert(", ".upsert(", "public.events"]) {
  assert.ok(!saveSource.includes(forbidden), `Écriture interdite pendant l’édition : ${forbidden}`);
  assert.ok(!previewSource.includes(forbidden), `Effet de bord interdit pendant la prévisualisation : ${forbidden}`);
}
assert.ok(writerSource.includes("const payload = { workflow_status: nextWorkflowStatus }"));
assert.ok(!writerSource.includes("country") && !writerSource.includes("end_date") && !writerSource.includes("description"));
assert.match(source, /WATCH_SERVER_CANDIDATE_COLUMNS\s*=\s*[^;]*end_date/);
assert.match(source, /WATCH_SERVER_CANDIDATE_COLUMNS\s*=\s*[^;]*country/);
assert.match(source, /WATCH_SERVER_CANDIDATE_COLUMNS\s*=\s*[^;]*description/);
assert.equal((source.match(/\.from\("events"\)\.insert\(/g) || []).length, 1, "Aucune nouvelle publication ne doit être ajoutée");
assert.ok(source.includes("findExistingSubmissionCached(item)"), "Le précontrôle doublon doit rester actif");

console.log("ADMIN_WATCH_EDITED_CANDIDATE_REVALIDATION_OK");
