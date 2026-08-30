import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `Fonction ${name} introuvable`);
  return source.slice(start, end);
}

const syncSource = extractFunction("syncWatchCandidateEditorDates", "bindWatchCandidateEditorDateSync");
const bindSource = extractFunction("bindWatchCandidateEditorDateSync", "renderWatchSubmissionPreview");
const animationFrames = [];
const api = new Function("window", `
  function normalizeIsoDate(value) {
    const match = String(value || "").match(/^(20[0-9]{2})-[0-9]{2}-[0-9]{2}$/);
    return match ? match[0] : "";
  }
  ${syncSource}
  ${bindSource}
  return { bindWatchCandidateEditorDateSync };
`)({
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
  }
});

const inputs = {
  startDate: { value: "" },
  endDate: {
    value: "",
    dataset: {},
    addEventListener() {}
  }
};
let toggleHandler = null;
const editor = {
  open: false,
  addEventListener(type, handler) {
    if (type === "toggle") toggleHandler = handler;
  },
  closest(selector) {
    assert.equal(selector, "[data-watch-result-index]");
    return { dataset: { watchResultIndex: "0" } };
  },
  querySelector(selector) {
    if (selector.includes('name="startDate"')) return inputs.startDate;
    if (selector.includes('data-watch-field="endDate"')) return inputs.endDate;
    return null;
  }
};
const container = {
  querySelectorAll(selector) {
    assert.equal(selector, "[data-watch-candidate-editor]");
    return [editor];
  }
};
const candidate = {
  startDate: "2026-09-20",
  endDate: ""
};

api.bindWatchCandidateEditorDateSync(container, [candidate]);
assert.equal(typeof toggleHandler, "function", "L’écouteur toggle doit être attaché");

// Première ouverture : synchronisation immédiate depuis le candidat.
editor.open = true;
toggleHandler();
assert.equal(inputs.startDate.value, "2026-09-20");
assert.equal(inputs.endDate.value, "");
assert.equal(animationFrames.length, 1);

// Safari restaure une ancienne valeur après toggle : la frame suivante doit l’écraser.
inputs.endDate.value = "2026-08-30";
animationFrames.shift()();
assert.equal(inputs.startDate.value, "2026-09-20");
assert.equal(inputs.endDate.value, "");

// Fermer ne synchronise rien et ne planifie aucune frame.
editor.open = false;
inputs.endDate.value = "2026-08-30";
toggleHandler();
assert.equal(inputs.endDate.value, "2026-08-30");
assert.equal(animationFrames.length, 0);

// Chaque réouverture repart de la source JS et corrige à nouveau Safari.
editor.open = true;
toggleHandler();
assert.equal(inputs.endDate.value, "");
inputs.endDate.value = "2026-08-30";
animationFrames.shift()();
assert.equal(inputs.endDate.value, "");

// Une vraie date de fin reste la valeur exacte, immédiatement et après la frame.
candidate.endDate = "2026-09-21";
editor.open = false;
toggleHandler();
editor.open = true;
toggleHandler();
assert.equal(inputs.endDate.value, "2026-09-21");
inputs.endDate.value = "2026-08-30";
animationFrames.shift()();
assert.equal(inputs.endDate.value, "2026-09-21");

const renderResultsSource = extractFunction("renderResults", "saveWatchCandidateEdits");
assert.ok(renderResultsSource.includes("bindWatchCandidateEditorDateSync(container, queueResults)"));
assert.ok(bindSource.includes('editor.addEventListener("toggle"'));
assert.ok(bindSource.includes("if (!editor.open) return"));
assert.ok(bindSource.includes("window.requestAnimationFrame("));

for (const forbidden of [
  "setTimeout(",
  "fetch(",
  "client.from(",
  "persistCandidateWorkflowDecision(",
  "setWatchWorkflowState(",
  "localStorage.setItem("
]) {
  assert.ok(!bindSource.includes(forbidden) && !syncSource.includes(forbidden));
}

console.log("ADMIN_WATCH_SAFARI_DATE_RESTORE_OK");
