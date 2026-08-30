import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `Fonction ${name} introuvable`);
  return source.slice(start, end);
}

const renderEditorSource = extractFunction("renderWatchCandidateEditor", "syncWatchCandidateEditorDates");
const syncDatesSource = extractFunction("syncWatchCandidateEditorDates", "bindWatchCandidateEditorDateSync");
const api = new Function(`
  let watchEditorRenderSequence = 0;
  function normalizeIsoDate(value) {
    const match = String(value || "").match(/^(20[0-9]{2})-[0-9]{2}-[0-9]{2}$/);
    return match ? match[0] : "";
  }
  function escapeHtml(value) { return String(value ?? ""); }
  function escapeAttr(value) { return escapeHtml(value); }
  ${renderEditorSource}
  ${syncDatesSource}
  return { renderWatchCandidateEditor, syncWatchCandidateEditorDates };
`)();

const baseCandidate = {
  title: "Salon du livre de Fontvieille",
  startDate: "2026-09-20",
  city: "Fontvieille",
  type: "Salon",
  country: "France",
  description: "",
  officialUrl: "https://example.test/fontvieille",
  imageUrl: ""
};

for (const absentEndDate of [undefined, null, ""]) {
  const candidate = { ...baseCandidate, endDate: absentEndDate };
  const before = structuredClone(candidate);
  const html = api.renderWatchCandidateEditor(candidate, 0);
  assert.match(html, /<input name="startDate" type="date" value="2026-09-20"/);
  assert.match(html, /<input id="watchEndDate_0-[0-9]+" name="watchEndDate_0-[0-9]+" data-watch-field="endDate" data-watch-user-edited="false" type="date" value="" autocomplete="off">/);
  assert.deepEqual(candidate, before, "Le rendu ne doit pas modifier le candidat");
}

const datedCandidate = { ...baseCandidate, endDate: "2026-09-21" };
const datedHtml = api.renderWatchCandidateEditor(datedCandidate, 1);
assert.match(datedHtml, /<input id="watchEndDate_1-[0-9]+" name="watchEndDate_1-[0-9]+" data-watch-field="endDate" data-watch-user-edited="false" type="date" value="2026-09-21" autocomplete="off">/);

const inputs = {
  startDate: { value: "2026-08-30" },
  endDate: { value: "2026-08-30", dataset: {} }
};
const container = {
  querySelector(selector) {
    if (selector.includes('name="startDate"')) return inputs.startDate;
    if (selector.includes('data-watch-field="endDate"')) return inputs.endDate;
    return null;
  }
};

api.syncWatchCandidateEditorDates(container, baseCandidate);
assert.equal(inputs.startDate.value, "2026-09-20");
assert.equal(inputs.endDate.value, "", "Une valeur restaurée par le navigateur doit être vidée");

api.syncWatchCandidateEditorDates(container, datedCandidate);
assert.equal(inputs.endDate.value, "2026-09-21");

const renderResultsSource = extractFunction("renderResults", "saveWatchCandidateEdits");
assert.ok(renderResultsSource.includes("syncWatchCandidateEditorDates(detail, queueResults[index])"));

for (const implementation of [renderEditorSource, syncDatesSource]) {
  for (const forbidden of [
    "new Date(",
    "Date.now(",
    "fetch(",
    "client.from(",
    "persistCandidateWorkflowDecision(",
    "setWatchWorkflowState(",
    "localStorage.setItem("
  ]) {
    assert.ok(!implementation.includes(forbidden), `Effet de bord interdit dans l’éditeur : ${forbidden}`);
  }
}

console.log("ADMIN_WATCH_EMPTY_END_DATE_EDITOR_OK");
