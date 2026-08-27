import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  'let watchQueueFilter = "all"',
  'data-watch-queue-filter="all"',
  'data-watch-queue-filter="ready"',
  'data-watch-queue-filter="review"',
  'data-watch-queue-filter="duplicate"',
  'data-watch-queue-filter="handled"',
  'data-watch-queue-filter="rejected"',
  "function getWatchQueueFilterLabel(",
  "function getWatchQueueCounts(",
  "function updateWatchQueueFilters(",
  'watchQueueFilter === "all"',
  "visibleItems"
];

for (const fragment of required) {
  assert.ok(
    source.includes(fragment),
    `File filtrée V2.2 incomplète : ${fragment}`
  );
}

assert.ok(
  source.includes('watchQueueFilter = String(button.dataset.watchQueueFilter || "all")'),
  "Changement de filtre absent"
);

assert.ok(
  source.includes('watchQueueFilter = "all"'),
  "Réinitialisation du filtre absente"
);

console.log("ADMIN_WATCH_FILTERED_QUEUE_OK");
