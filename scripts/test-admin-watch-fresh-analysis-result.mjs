import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `Fonction ${name} introuvable`);
  return source.slice(start, end);
}

const countsSource = extractFunction("getWatchQueueCounts", "matchesWatchQueueFilter");
const matchesSource = extractFunction("matchesWatchQueueFilter", "matchesWatchCandidateSearch");
const api = new Function(`
  let watchQueueFilter = "all";
  function getWatchWorkflowState(result) { return result.workflow_status; }
  ${countsSource}
  ${matchesSource}
  return {
    getWatchQueueCounts,
    matchesWatchQueueFilter,
    setFilter(value) { watchQueueFilter = value; }
  };
`)();

const workerCandidate = (workflow_status, index = 0) => ({
  workflow_status,
  _watchWorkerIndex: index,
  _watchPersisted: true
});
const serverOnlyCandidate = (workflow_status) => ({
  workflow_status,
  _watchWorkerIndex: null,
  _watchServerOnly: true,
  _watchPersisted: true
});

const batchStates = ["ready", "rejected", "handled", "duplicate", "submitted"];
for (const state of batchStates) {
  const candidate = workerCandidate(state);
  api.setFilter("current-analysis");
  assert.equal(
    api.matchesWatchQueueFilter(state, candidate),
    true,
    `Le candidat Worker ${state} doit rester visible dans Dernière analyse`
  );
  assert.equal(candidate.workflow_status, state, `Le workflow ${state} ne doit pas être modifié`);
}

api.setFilter("current-analysis");
assert.equal(
  api.matchesWatchQueueFilter("handled", serverOnlyCandidate("handled")),
  false,
  "Dernière analyse ne doit pas mélanger toute la file serveur"
);

const mixedQueue = [
  workerCandidate("rejected", 0),
  workerCandidate("handled", 1),
  serverOnlyCandidate("handled"),
  serverOnlyCandidate("rejected")
];
assert.equal(api.getWatchQueueCounts(mixedQueue)["current-analysis"], 2);

api.setFilter("active");
assert.equal(api.matchesWatchQueueFilter("rejected", mixedQueue[0]), false);
assert.equal(api.matchesWatchQueueFilter("ready", workerCandidate("ready")), true);

api.setFilter("handled");
assert.equal(api.matchesWatchQueueFilter("handled", mixedQueue[1]), true);
assert.equal(api.matchesWatchQueueFilter("rejected", mixedQueue[0]), false);

api.setFilter("rejected");
assert.equal(api.matchesWatchQueueFilter("rejected", mixedQueue[0]), true);
assert.equal(api.matchesWatchQueueFilter("handled", mixedQueue[1]), false);

const analyzeSource = extractFunction("analyzeUrls", "testWorkerHealth");
const currentFilterIndex = analyzeSource.indexOf('watchQueueFilter = "current-analysis"');
const workerCallIndex = analyzeSource.indexOf("await callWatchWorker(");
assert.ok(workerCallIndex >= 0 && currentFilterIndex > workerCallIndex);
assert.ok(analyzeSource.includes('switchWatchWorkspaceView("candidates")'));
assert.ok(analyzeSource.includes('watchCandidateSearch = ""'));
assert.ok(analyzeSource.includes('candidateSearch.value = ""'));

const renderSource = extractFunction("renderResults", "saveWatchCandidateEdits");
assert.ok(renderSource.includes("matchesWatchQueueFilter(item.state, item.result)"));
assert.ok(source.includes('data-watch-queue-filter="current-analysis"'));
assert.ok(source.includes('Dernière analyse <span data-watch-filter-count="current-analysis">0</span>'));
assert.ok(source.includes('button.hidden = counts["current-analysis"] === 0'));
assert.ok(source.includes('let watchQueueFilter = "all"'), "Le filtre temporaire ne doit pas survivre au rechargement");

for (const forbidden of ["fetch(", "client.from(", "persistCandidateWorkflowDecision(", "setWatchWorkflowState("]) {
  assert.ok(!countsSource.includes(forbidden) && !matchesSource.includes(forbidden));
}

assert.equal((source.match(/\.from\("events"\)\.insert\(/g) || []).length, 1);

console.log("ADMIN_WATCH_FRESH_ANALYSIS_RESULT_OK");
