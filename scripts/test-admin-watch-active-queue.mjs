import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  'data-watch-queue-filter="active"',
  'data-watch-filter-count="active"',
  'À traiter : <span',
  'counts.active = counts.ready + counts.review',
  'id="watch-next-active-btn"',
  'document.getElementById("watch-next-active-btn")?.addEventListener("click", goToNextActiveResult)',
  "function goToNextActiveResult(",
  '["ready", "review"].includes(getWatchWorkflowState(result))',
  'nextCard.scrollIntoView({ behavior: "smooth", block: "start" })',
  'data-watch-result-index="${index}"',
  "const item = queueResults[index]",
  'watchQueueFilter = "active"',
  'if (nextActive) nextActive.disabled = counts.active === 0'
];

for (const fragment of required) {
  assert.ok(
    source.includes(fragment),
    `File active incomplète : ${fragment}`
  );
}

assert.ok(
  source.includes('if (watchQueueFilter === "active") return ["ready", "review"].includes(state)'),
  "La vue À traiter doit contenir uniquement ready et review"
);

const clearWatchStart = source.indexOf("function clearWatch()");
const markHandledStart = source.indexOf("function markHandled(", clearWatchStart);
const clearWatchSource = source.slice(clearWatchStart, markHandledStart);

assert.ok(
  clearWatchSource.includes('watchQueueFilter = "active"'),
  "Effacer doit restaurer le filtre À traiter"
);

assert.ok(
  clearWatchSource.includes("lastResults = []") &&
    clearWatchSource.includes("lastPagination = getEmptyPagination()") &&
    clearWatchSource.includes("watchOffset = 0") &&
    clearWatchSource.includes("updateWatchQueueFilters([])"),
  "Effacer doit réinitialiser résultats, pagination, compteurs et navigation"
);

assert.ok(
  source.includes('if (["handled", "duplicate", "submitted"].includes(stored))'),
  "Les états terminés persistants ne doivent pas être modifiés"
);

console.log("ADMIN_WATCH_ACTIVE_QUEUE_OK");
