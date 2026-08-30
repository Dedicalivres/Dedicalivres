import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");
const css = fs.readFileSync("admin-v11.css", "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `Fonction ${name} introuvable`);
  return source.slice(start, end);
}

const renderSource = extractFunction("renderWatchCandidateEditor", "syncWatchCandidateEditorDates");
const syncSource = extractFunction("syncWatchCandidateEditorDates", "bindWatchCandidateEditorDateSync");
const bindSource = extractFunction("bindWatchCandidateEditorDateSync", "renderWatchSubmissionPreview");
const endDateUpdateSource = extractFunction("getWatchCandidateEndDateUpdate", "buildWatchCandidateAdminText");
const matchesSource = extractFunction("matchesWatchQueueFilter", "matchesWatchCandidateSearch");
const workerStatusSource = extractFunction("setWatchWorkerStatus", "analyzeUrls").replace(/\s+async\s*$/, "");
const analyzeSource = `async ${extractFunction("analyzeUrls", "testWorkerHealth").replace(/\s+async\s*$/, "")}`;

const editorApi = new Function("window", `
  let watchEditorRenderSequence = 0;
  function normalizeIsoDate(value) {
    const match = String(value || "").match(/^(20[0-9]{2})-[0-9]{2}-[0-9]{2}$/);
    return match ? match[0] : "";
  }
  function escapeHtml(value) { return String(value ?? ""); }
  function escapeAttr(value) { return escapeHtml(value); }
  function cleanText(value) { return String(value ?? "").trim(); }
  ${renderSource}
  ${syncSource}
  ${bindSource}
  ${endDateUpdateSource}
  return {
    renderWatchCandidateEditor,
    syncWatchCandidateEditorDates,
    bindWatchCandidateEditorDateSync,
    getWatchCandidateEndDateUpdate
  };
`)({ requestAnimationFrame() {} });

const reviewCandidate = {
  workflowStatus: "review",
  title: "Salon du livre de Fontvieille",
  startDate: "2026-09-20",
  endDate: "",
  city: "Fontvieille",
  venue: "",
  address: "",
  type: "Salon",
  country: "",
  description: "",
  officialUrl: "https://example.test/fontvieille",
  imageUrl: ""
};
const beforeRender = structuredClone(reviewCandidate);
const emptyHtml = editorApi.renderWatchCandidateEditor(reviewCandidate, 0);
assert.deepEqual(reviewCandidate, beforeRender, "Le rendu UX ne doit modifier ni données ni workflow");
assert.ok(emptyHtml.includes("Aucune date de fin"));
assert.ok(emptyHtml.includes("Ajouter une date de fin"));
assert.match(
  emptyHtml,
  /data-watch-field="endDate"[^>]*type="date" value=""[^>]* hidden>/,
  "Un input date vide ne doit pas être visible par défaut"
);
assert.ok(emptyHtml.includes('placeholder="Ex. France"'));
assert.ok(emptyHtml.includes("Champ requis pour préparer la soumission"));
assert.ok(emptyHtml.includes('placeholder="Lieu de l’événement"'));
assert.ok(emptyHtml.includes('placeholder="Adresse"'));
assert.ok(emptyHtml.includes('placeholder="Type d’événement"'));
assert.ok(emptyHtml.includes('placeholder="Description de l’événement"'));
assert.equal(reviewCandidate.workflowStatus, "review");
assert.ok(!emptyHtml.includes("2026-08-30"), "Aucune date du jour ne doit être générée");

const datedHtml = editorApi.renderWatchCandidateEditor({ ...reviewCandidate, endDate: "2026-09-21" }, 1);
assert.match(datedHtml, /data-watch-field="endDate"[^>]*value="2026-09-21"[^>]*aria-label="Date de fin">/);
assert.ok(datedHtml.includes("Supprimer la date de fin"));

let inputHandler;
let addHandler;
let removeHandler;
const input = {
  value: "",
  hidden: true,
  dataset: { watchUserEdited: "false" },
  focused: false,
  addEventListener(type, handler) {
    if (type === "input") inputHandler = handler;
  },
  focus() { this.focused = true; }
};
const startInput = { value: "" };
const emptyState = { hidden: false };
const addButton = {
  hidden: false,
  focused: false,
  addEventListener(type, handler) { if (type === "click") addHandler = handler; },
  focus() { this.focused = true; }
};
const removeButton = {
  hidden: true,
  addEventListener(type, handler) { if (type === "click") removeHandler = handler; }
};
const editor = {
  open: false,
  querySelector(selector) {
    if (selector.includes('name="startDate"')) return startInput;
    if (selector.includes('data-watch-field="endDate"')) return input;
    if (selector.includes("data-watch-end-date-empty")) return emptyState;
    if (selector.includes("data-watch-end-date-add")) return addButton;
    if (selector.includes("data-watch-end-date-remove")) return removeButton;
    return null;
  },
  addEventListener() {},
  closest() { return { dataset: { watchResultIndex: "0" } }; }
};
const container = {
  querySelectorAll(selector) {
    assert.equal(selector, "[data-watch-candidate-editor]");
    return [editor];
  }
};
const form = {
  querySelector(selector) {
    assert.equal(selector, '[data-watch-field="endDate"]');
    return input;
  }
};

editorApi.bindWatchCandidateEditorDateSync(container, [reviewCandidate]);
assert.equal(typeof addHandler, "function");
assert.equal(typeof inputHandler, "function");
assert.equal(typeof removeHandler, "function");

addHandler();
assert.equal(input.hidden, false, "Ajouter doit rendre le vrai champ date disponible");
assert.equal(input.value, "");
assert.equal(input.dataset.watchUserEdited, "false");
assert.equal(emptyState.hidden, true);
assert.equal(input.focused, true);

input.value = "2026-09-21";
inputHandler();
assert.equal(input.dataset.watchUserEdited, "true");
assert.equal(editorApi.getWatchCandidateEndDateUpdate(form, reviewCandidate), "2026-09-21");

const datedCandidate = { ...reviewCandidate, endDate: "2026-09-21" };
editorApi.syncWatchCandidateEditorDates(editor, datedCandidate);
assert.equal(input.hidden, false);
assert.equal(removeButton.hidden, false);
removeHandler();
assert.equal(input.value, "");
assert.equal(input.hidden, true);
assert.equal(emptyState.hidden, false);
assert.equal(input.dataset.watchUserEdited, "true");
assert.equal(editorApi.getWatchCandidateEndDateUpdate(form, datedCandidate), "");

const workerElements = {
  "watch-worker-status": { textContent: "Worker : non vérifié", dataset: { state: "unchecked" } },
  "watch-urls": { value: "https://example.test/event" },
  "watch-analyze-btn": { disabled: false, textContent: "Analyser les URL" },
  "watch-copy-all-btn": { disabled: false, hidden: false },
  "watch-country": { value: "Tous" },
  "watch-type": { value: "Tous" },
  "watch-mode": { value: "prepare" },
  "watch-candidate-search": { value: "ancienne recherche" }
};
const workerApi = new Function("document", "console", `
  const WATCH_PAGE_SIZE = 10;
  let watchOffset = 0;
  let lastWatchAnalysisAt = "";
  let lastResults = [];
  let lastPagination = {};
  let watchQueueFilter = "all";
  let watchCandidateSearch = "";
  let workerFailure = false;
  function setStatus() {}
  async function callWatchWorker() {
    if (workerFailure) throw new Error("Worker indisponible");
    return { results: [{ title: "Candidat" }] };
  }
  function sortWatchResultsByCompleteness(results) { return results; }
  function normalizeWatchPagination() { return {}; }
  function switchWatchWorkspaceView() {}
  function renderResults() {}
  async function precheckWatchDuplicates() { return 0; }
  function rememberProductiveSources() { return false; }
  function renderHistory() {}
  function updatePagingControls() {}
  function formatPaginationStatus() { return ""; }
  function getEmptyPagination() { return {}; }
  ${workerStatusSource}
  ${analyzeSource}
  return {
    analyzeUrls,
    setFailure(value) { workerFailure = value; }
  };
`)(
  { getElementById(id) { return workerElements[id] || null; } },
  { error() {} }
);

await workerApi.analyzeUrls();
assert.equal(workerElements["watch-worker-status"].textContent, "Worker : opérationnel");
assert.equal(workerElements["watch-worker-status"].dataset.state, "available");
workerApi.setFailure(true);
await workerApi.analyzeUrls();
assert.equal(workerElements["watch-worker-status"].textContent, "Worker : indisponible");
assert.equal(workerElements["watch-worker-status"].dataset.state, "unavailable");
assert.equal((analyzeSource.match(/callWatchWorker\(/g) || []).length, 1, "Aucun ping Worker supplémentaire");
assert.ok(!analyzeSource.includes("fetch("));

const filterApi = new Function(`
  let watchQueueFilter = "finished";
  const WATCH_CANDIDATE_CLOSED_STATES = ["duplicate", "submitted", "handled", "rejected"];
  ${matchesSource}
  return { matchesWatchQueueFilter };
`)();
for (const state of ["duplicate", "submitted", "handled", "rejected"]) {
  assert.equal(filterApi.matchesWatchQueueFilter(state), true, `${state} doit apparaître dans Terminés`);
}
for (const state of ["ready", "review"]) {
  assert.equal(filterApi.matchesWatchQueueFilter(state), false, `${state} doit rester hors de Terminés`);
}
assert.ok(source.includes('watchQueueFilter = "finished"'));
assert.ok(source.includes('finished: "Historique / Terminés"'));
assert.ok(source.includes('aria-label="Afficher les actions secondaires"'));
assert.ok(css.includes("#tab-watch .watch-card-actions-menu > summary::after"));

for (const forbidden of ["fetch(", "client.from(", "persistCandidateWorkflowDecision(", "setWatchWorkflowState(", "localStorage.setItem("]) {
  assert.ok(!renderSource.includes(forbidden));
  assert.ok(!syncSource.includes(forbidden));
  assert.ok(!bindSource.includes(forbidden));
  assert.ok(!workerStatusSource.includes(forbidden));
}
assert.ok(css.includes("@media (max-width: 1100px)"));
assert.ok(css.includes("@media (max-width: 768px)"));
assert.ok(css.includes("@media (max-width: 480px)"));
assert.ok(css.includes("#tab-watch .watch-end-date-actions > button"));

console.log("ADMIN_WATCH_UX_STABILIZATION_OK");
