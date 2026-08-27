import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "const DUPLICATE_CHECK_CONCURRENCY = 4;",
  "const duplicateCheckCache = new Map();",
  "async function precheckWatchDuplicates(",
  "async function findExistingSubmissionCached(",
  "function getWatchDuplicateKey(",
  "await precheckWatchDuplicates(lastResults)",
  'setWatchWorkflowState(item, "duplicate")',
  "duplicateCheckCache.has(key)",
  "duplicateCheckCache.set(key, pending)",
  "duplicateCheckCache.delete(key)"
];

for (const fragment of required) {
  assert.ok(
    source.includes(fragment),
    `Pré-détection doublon incomplète : ${fragment}`
  );
}

assert.ok(
  source.includes("getSubmissionBlockingFields(item).length === 0"),
  "La pré-détection doit ignorer les candidats incomplets"
);

assert.ok(
  source.includes('["handled", "duplicate", "submitted", "rejected"].includes(state)'),
  "Les états terminés doivent être exclus de la pré-détection"
);

assert.ok(
  source.includes("for (let index = 0; index < candidates.length; index += DUPLICATE_CHECK_CONCURRENCY)"),
  "La concurrence bornée n'est pas appliquée"
);

assert.ok(
  source.includes("findExistingSubmissionCached(item)"),
  "Le cache n'est pas réutilisé lors de la soumission"
);

assert.ok(
  source.includes('`${duplicateCount} déjà présente(s) détectée(s) automatiquement.`'),
  "Le statut utilisateur de pré-détection est absent"
);

console.log("ADMIN_WATCH_DUPLICATE_PRECHECK_OK");
