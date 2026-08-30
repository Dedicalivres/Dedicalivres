import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync("admin-watch.js", "utf8");

for (const fragment of [
  "function createServerWatchQueueCandidate(",
  "function enrichWorkerWatchCandidateWithServer(",
  "function buildWatchCandidateQueue(",
  "buildWatchCandidateQueue(Array.isArray(results) ? results : [])",
  'isPersisted ? "<span>Persisté</span>"',
  "const isClosedWorkflow = WATCH_CANDIDATE_CLOSED_STATES.includes(workflowState)",
  "const item = queueResults[index]",
  "persistCandidateWorkflowDecision(item, state)"
]) {
  assert.ok(source.includes(fragment), `File serveur incomplète : ${fragment}`);
}

const renderStart = source.indexOf("function renderResults(");
const renderEnd = source.indexOf("function saveWatchCandidateEdits(", renderStart);
const renderSource = source.slice(renderStart, renderEnd);
assert.ok(renderSource.includes('setWatchWorkflowState(item, "handled")'));
assert.ok(renderSource.includes('setWatchWorkflowState(item, "rejected")'));
assert.ok(!renderSource.includes("client.from("), "Le rendu ne doit créer aucune voie d’écriture directe");

const writerStart = source.indexOf("function adoptServerWatchCandidate(");
const writerEnd = source.indexOf("function getEventWatchPersistenceKeys(", writerStart);
const writerSource = source.slice(writerStart, writerEnd);
assert.equal((writerSource.match(/\.update\(/g) || []).length, 1, "Un seul UPDATE candidat optimiste doit subsister");
assert.ok(!writerSource.includes("admin_watch_transitions"), "Le frontend ne doit jamais écrire les transitions");

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_SERVER_QUEUE_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      const base = createEmptyWatchPersistenceSnapshot(value?.availability || "local");
      watchPersistenceSnapshot = { ...base, ...(value || {}) };
    },
    setLastResults(value) { lastResults = value; },
    getSnapshot() { return watchPersistenceSnapshot; },
    buildWatchCandidateQueue,
    getWatchWorkflowState,
    getWatchWorkflowLabel,
    getWatchQueueCounts,
    matchesWatchQueueFilter,
    setFilter(value) { watchQueueFilter = value; },
    renderResultCard,
    setWatchWorkflowState
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
const api = sandbox.__WATCH_SERVER_QUEUE_TEST_API__;
assert.ok(api, "API de test de file serveur indisponible");

const WORKFLOW_KEY = "dedicalivres_admin_watch_workflow_v2";
const HISTORY_KEY = "dedicalivres_admin_watch_history_v1";
function resetLocalState() {
  localStorage.setItem(WORKFLOW_KEY, "{}");
  localStorage.setItem(HISTORY_KEY, "[]");
}

let uuidCounter = 1;
function nextUuid() {
  const suffix = (uuidCounter++).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

function serverCandidate({ state, slug, title = `Candidat ${slug}`, date = "2026-09-26", city = "Paris" }) {
  const url = `https://events.example/${slug}`;
  return {
    id: nextUuid(),
    identity_key: `candidate:v1:${slug}`,
    origin_url: url,
    canonical_origin_url: url,
    title,
    start_date: date,
    city,
    workflow_status: state,
    status_updated_at: "2026-08-30T08:00:00.000Z",
    version: 1
  };
}

function setServerRows(rows, availability = "server") {
  api.setSnapshot({
    availability,
    componentAvailability: {
      candidates: availability === "unavailable" ? "unavailable" : "available",
      sources: "available",
      eventAlerts: "available"
    },
    candidates: rows,
    sources: [],
    eventAlerts: []
  });
}

// A. Deux lignes serveur restent disponibles sans résultat Worker courant.
resetLocalState();
const handledRow = serverCandidate({ state: "handled", slug: "handled" });
const rejectedRow = serverCandidate({ state: "rejected", slug: "rejected" });
api.setLastResults([]);
setServerRows([handledRow, rejectedRow]);
const serverOnlyQueue = api.buildWatchCandidateQueue([]);
assert.equal(serverOnlyQueue.length, 2);
assert.ok(serverOnlyQueue.every((candidate) => candidate._watchServerOnly && candidate._watchPersisted));
const serverOnlyCards = serverOnlyQueue.map((candidate, index) => api.renderResultCard(candidate, index));
assert.equal(serverOnlyCards.length, 2);
assert.ok(serverOnlyCards.every((card) => card.includes('class="watch-result')));

// B. La ligne Worker gagne visuellement, les métadonnées et le workflow serveur sont adoptés.
resetLocalState();
const richWorker = {
  sourceUrl: handledRow.origin_url,
  officialUrl: handledRow.canonical_origin_url,
  title: handledRow.title,
  startDate: handledRow.start_date,
  city: handledRow.city,
  imageUrl: "https://images.example/affiche.jpg",
  type: "Festival",
  description: "Description riche conservée depuis le Worker.",
  confidence: 94,
  adminText: "Fiche riche",
  missingFields: [],
  watchDuplicateSignal: { state: "new", key: "rich", label: "Nouveau", reasons: [] }
};
api.setLastResults([richWorker]);
setServerRows([handledRow]);
const deduplicatedQueue = api.buildWatchCandidateQueue([richWorker]);
assert.equal(deduplicatedQueue.length, 1);
assert.equal(deduplicatedQueue[0].imageUrl, richWorker.imageUrl);
assert.equal(deduplicatedQueue[0].description, richWorker.description);
assert.equal(deduplicatedQueue[0].adminText, richWorker.adminText);
assert.equal(deduplicatedQueue[0].serverCandidateId, handledRow.id);
assert.equal(deduplicatedQueue[0].serverVersion, 1);
assert.equal(api.getWatchWorkflowState(deduplicatedQueue[0]), "handled");

// C/D. Les états fermés serveur sont uniquement visibles dans leurs filtres dédiés.
resetLocalState();
setServerRows([handledRow, rejectedRow]);
api.setFilter("handled");
assert.equal(serverOnlyQueue.filter((item) => api.matchesWatchQueueFilter(api.getWatchWorkflowState(item))).length, 1);
api.setFilter("active");
assert.equal(serverOnlyQueue.filter((item) => api.matchesWatchQueueFilter(api.getWatchWorkflowState(item))).length, 0);
api.setFilter("rejected");
assert.equal(serverOnlyQueue.filter((item) => api.matchesWatchQueueFilter(api.getWatchWorkflowState(item))).length, 1);

// E/F. Ready/review alimentent À traiter et tous les compteurs incluent le serveur.
resetLocalState();
const readyRow = serverCandidate({ state: "ready", slug: "ready" });
const reviewRow = serverCandidate({ state: "review", slug: "review" });
const duplicateRow = serverCandidate({ state: "duplicate", slug: "duplicate" });
const submittedRow = serverCandidate({ state: "submitted", slug: "submitted" });
setServerRows([readyRow, reviewRow, handledRow, rejectedRow, duplicateRow, submittedRow]);
const completeQueue = api.buildWatchCandidateQueue([]);
const counts = api.getWatchQueueCounts(completeQueue);
assert.equal(counts.all, 6);
assert.equal(counts.ready, 1);
assert.equal(counts.review, 1);
assert.equal(counts.active, 2);
assert.equal(counts.handled, 1);
assert.equal(counts.rejected, 1);
assert.equal(counts.duplicate, 1);
assert.equal(api.getWatchWorkflowLabel("submitted"), "Soumis");

// G. Une carte persistée ouvre la source sans déclencher d'écriture et n'invente aucun champ riche.
let updateCalls = 0;
const updateClient = {
  from(table) {
    assert.equal(table, "admin_watch_candidates");
    const call = { payload: null, id: "" };
    const builder = {
      update(payload) {
        updateCalls += 1;
        call.payload = payload;
        return this;
      },
      eq(column, value) {
        if (column === "id") call.id = value;
        return this;
      },
      select() { return this; },
      abortSignal() { return this; },
      then(resolve) {
        const current = api.getSnapshot().candidates.find((candidate) => candidate.id === call.id);
        const updated = {
          ...current,
          workflow_status: call.payload.workflow_status,
          status_updated_at: "2026-08-30T09:00:00.000Z",
          version: Number(current?.version || 0) + 1
        };
        return Promise.resolve({ data: [updated], error: null }).then(resolve);
      }
    };
    return builder;
  }
};
api.setClient(updateClient);
setServerRows([readyRow]);
const readyCandidate = api.buildWatchCandidateQueue([])[0];
const readyCard = api.renderResultCard(readyCandidate, 0);
assert.match(readyCard, /Persisté/);
assert.match(readyCard, new RegExp(readyRow.origin_url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(readyCard, /Ouvrir la source/);
assert.match(readyCard, /Marquer traité/);
assert.match(readyCard, /Écarter/);
assert.ok(!readyCard.includes("Image non détectée"));
assert.ok(!readyCard.includes("Type inconnu"));
assert.ok(!readyCard.includes("Qualité"));
assert.equal(updateCalls, 0, "Rendre ou ouvrir la source ne doit produire aucune écriture");

// H. Une décision humaine emprunte l'UPDATE optimiste existant.
const handledDecision = await api.setWatchWorkflowState(readyCandidate, "handled");
assert.equal(handledDecision.status, "success");
assert.equal(updateCalls, 1);
assert.equal(api.getSnapshot().candidates[0].workflow_status, "handled");
assert.equal(api.getSnapshot().candidates[0].version, 2);

// I. Sans lecture serveur, la file locale riche continue de fonctionner seule.
resetLocalState();
api.setLastResults([richWorker]);
setServerRows([], "unavailable");
const fallbackQueue = api.buildWatchCandidateQueue([richWorker]);
assert.equal(fallbackQueue.length, 1);
assert.equal(fallbackQueue[0].imageUrl, richWorker.imageUrl);
assert.equal(fallbackQueue[0]._watchPersisted, false);

// J. Un état serveur fermé ne peut pas être rouvert et n'affiche aucune action de réouverture.
resetLocalState();
setServerRows([handledRow]);
const closedCandidate = api.buildWatchCandidateQueue([])[0];
const closedCard = api.renderResultCard(closedCandidate, 0);
assert.ok(!closedCard.includes("Marquer traité"));
assert.ok(closedCard.includes("Écarter"), "handled peut utiliser la transition fermée vers rejected");
const callsBeforeReopen = updateCalls;
const reopenDecision = await api.setWatchWorkflowState(closedCandidate, "ready");
assert.equal(reopenDecision.status, "conflict");
assert.equal(updateCalls, callsBeforeReopen, "Une réouverture interdite ne doit émettre aucun UPDATE");
assert.equal(api.getSnapshot().candidates[0].workflow_status, "handled");
const rejectedDecision = await api.setWatchWorkflowState(closedCandidate, "rejected");
assert.equal(rejectedDecision.status, "success");
assert.equal(updateCalls, callsBeforeReopen + 1);
assert.equal(api.getSnapshot().candidates[0].workflow_status, "rejected");
assert.equal(api.getSnapshot().candidates[0].version, 2);

console.log("ADMIN_WATCH_SERVER_CANDIDATE_QUEUE_OK");
