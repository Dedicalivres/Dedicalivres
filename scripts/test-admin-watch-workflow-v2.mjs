import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  'const WORKFLOW_KEY = "dedicalivres_admin_watch_workflow_v2"',
  "function getWatchCandidateKey(",
  "function readWatchWorkflow(",
  "function writeWatchWorkflow(",
  "function setWatchWorkflowState(",
  "function getWatchWorkflowState(",
  "function getWatchWorkflowLabel(",
  "function getWatchWorkflowPriority(",
  'setWatchWorkflowState(item, "handled")',
  'setWatchWorkflowState(item, "duplicate")',
  'setWatchWorkflowState(item, "submitted")',
  'lastResults = sortWatchResultsByCompleteness(lastResults)',
  '"Élément déjà traité"',
  '"Fiche à vérifier"'
];

for (const fragment of required) {
  assert.ok(
    source.includes(fragment),
    `Workflow V2 incomplet : ${fragment}`
  );
}

const ready = source.indexOf("ready: 0");
const review = source.indexOf("review: 1");
const duplicate = source.indexOf("duplicate: 2");
const submitted = source.indexOf("submitted: 3");
const handled = source.indexOf("handled: 4");
const rejected = source.indexOf("rejected: 5");

assert.ok(
  ready >= 0 &&
  review > ready &&
  duplicate > review &&
  submitted > duplicate &&
  handled > submitted &&
  rejected > handled,
  "Ordre de priorité Workflow V2 incorrect"
);

assert.ok(
  source.includes('if (alreadyHandled) return "handled";'),
  "Compatibilité avec l'ancien historique absente"
);

console.log("ADMIN_WATCH_WORKFLOW_V2_OK");
