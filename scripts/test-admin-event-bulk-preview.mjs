import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const moduleSource = fs.readFileSync("admin-event-bulk-preview.js", "utf8");
const shell = fs.readFileSync("admin-shell.js", "utf8");
const v10 = fs.readFileSync("admin.html", "utf8");
const v11 = fs.readFileSync("admin-v11.html", "utf8");
const css = fs.readFileSync("admin-v11.css", "utf8");
const sandbox = {};
vm.runInNewContext(moduleSource, sandbox);
const bulk = sandbox.DEDICALIVRES_EVENT_BULK_PREVIEW;

assert.equal(bulk.MAX_SELECTION, 20);
const selection = bulk.createSelectionController();
for (let index = 1; index <= 20; index += 1) {
  assert.equal(selection.toggle(index, true).changed, true);
}
assert.equal(selection.size(), 20, "sélection multiple limitée à 20");
assert.equal(selection.toggle(21, true).limitReached, true, "21e événement refusé");
assert.equal(selection.toggle(5, false).changed, true, "désélection individuelle");
assert.equal(selection.size(), 19);
assert.equal(selection.selectMany([5, 21]).added, 1, "sélection visible remplit jusqu’à la limite");
assert.equal(selection.size(), 20);

const filteredOutButUnchanged = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1,
  title: `Événement ${index + 1}`
}));
selection.capturePreview(filteredOutButUnchanged);
assert.equal(selection.reconcile(filteredOutButUnchanged), false, "un changement de filtre ne modifie pas la sélection");
const changed = filteredOutButUnchanged.map((event) => ({ ...event }));
changed[0].title = "Titre actualisé";
assert.equal(selection.reconcile(changed), true, "un changement de données invalide l’aperçu");
selection.clear();
assert.equal(selection.size(), 0, "remise à zéro");

const complete = {
  id: "ready",
  title: "Salon du livre",
  start_date: "2026-11-14",
  city: "Lille",
  country_code: "FR",
  validated: false,
  rejected: false,
  verified: true
};
const controls = {
  validatePublication(event) {
    const missing = ["title", "start_date", "city", "country_code"].filter((field) => !String(event[field] || "").trim());
    if (missing.length) throw new Error(`Champs indispensables manquants : ${missing.join(", ")}.`);
  },
  validateRegistration() {},
  duplicates: { analyzePair: () => null },
  textQuality: { summarize: () => ({ hasIssues: false, fields: [] }) }
};

assert.equal(bulk.inspectEvent(complete, "validate", [complete], controls).status, "ready");
assert.equal(
  bulk.inspectEvent({ ...complete, id: "incomplete", city: "" }, "validate", [], controls).status,
  "blocked",
  "fiche incomplète bloquée"
);
assert.equal(
  bulk.inspectEvent({ ...complete, id: "incomplete-reject", city: "" }, "reject", [], controls).status,
  "ready",
  "le rejet conserve le parcours existant et affiche seulement la complétude"
);
assert.equal(
  bulk.inspectEvent(complete, "validate", [complete, { ...complete, id: "duplicate" }], {
    ...controls,
    duplicates: { analyzePair: () => ({ level: "probable", score: 88 }) }
  }).status,
  "review",
  "doublon signalé"
);
assert.equal(
  bulk.inspectEvent(complete, "validate", [complete], {
    ...controls,
    textQuality: { summarize: () => ({ hasIssues: true, fields: ["description"] }) }
  }).status,
  "review",
  "anomalie textuelle signalée"
);
assert.equal(
  bulk.inspectEvent({ ...complete, id: "rejected", rejected: true }, "reject", [], controls).status,
  "blocked",
  "événement déjà rejeté bloqué"
);

for (const page of [v10, v11]) {
  assert.match(page, /id="v11-bulk-select-visible"/);
  assert.match(page, /id="v11-bulk-preview-panel"/);
  assert.match(page, /admin-event-bulk-preview\.js\?v=p1-5a-1/);
  assert.match(page, /admin-shell\.js\?v=event-bulk-preview-p1-5a-1/);
  assert.match(page, /admin-v11\.css\?v=event-bulk-preview-p1-5a-1/);
}
assert.equal(v10, v11, "compatibilité V10/V11 conservée");
assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.v11-bulk-actions/);
assert.match(shell, /getFilteredEvents\(state\.events \|\| \[\]\)[\s\S]*selectMany\(visibleIds\)/);
assert.match(shell, /markV11BulkPreviewStale\(events\)/);
assert.doesNotMatch(moduleSource, /\.from\(|\.update\(|\.insert\(|\.upsert\(|\.rpc\(/);
assert.doesNotMatch(shell.slice(shell.indexOf("function renderV11BulkPreview("), shell.indexOf("const priorityList")), /\.from\(|\.update\(|\.insert\(|\.upsert\(|\.rpc\(/);
assert.doesNotMatch(moduleSource + shell.slice(shell.indexOf("function renderV11BulkPreview("), shell.indexOf("const priorityList")), /submitter_(?:name|email)/);

console.log("PASS P1.5A : sélection 20 max, filtres, aperçu, obsolescence, contrôles existants, mobile, V10 et absence d’écriture");
