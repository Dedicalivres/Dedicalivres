import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `Fonction ${name} introuvable`);
  return source.slice(start, end);
}

const renderSource = extractFunction("renderWatchCandidateEditor", "syncWatchCandidateEditorDates");
const syncSource = extractFunction("syncWatchCandidateEditorDates", "bindWatchCandidateEditorDateSync");
const bindSource = extractFunction("bindWatchCandidateEditorDateSync", "renderWatchSubmissionPreview");
const saveSource = extractFunction("saveWatchCandidateEdits", "getWatchCandidateEndDateUpdate");
const endDateUpdateSource = extractFunction("getWatchCandidateEndDateUpdate", "buildWatchCandidateAdminText");
const animationFrames = [];

const api = new Function("window", `
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
`)({
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
  }
});

const candidate = {
  title: "Salon du livre de Fontvieille",
  startDate: "2026-09-20",
  endDate: "",
  city: "Fontvieille",
  type: "Salon",
  country: "France",
  description: "Rencontre littéraire",
  officialUrl: "https://example.test/fontvieille",
  imageUrl: ""
};

const firstHtml = api.renderWatchCandidateEditor(candidate, 0);
const secondHtml = api.renderWatchCandidateEditor(candidate, 0);
const firstName = firstHtml.match(/name="(watchEndDate_0-[0-9]+)" data-watch-field="endDate"/)?.[1];
const secondName = secondHtml.match(/name="(watchEndDate_0-[0-9]+)" data-watch-field="endDate"/)?.[1];
assert.ok(firstName && secondName, "Le champ de fin doit avoir une identité DOM dédiée");
assert.notEqual(firstName, secondName, "Chaque rendu doit renouveler l’identité DOM du champ");
assert.ok(firstHtml.includes('data-watch-field="endDate" data-watch-user-edited="false"'));
assert.ok(firstHtml.includes('type="date" value="" autocomplete="off"'));
assert.ok(!firstHtml.includes('name="endDate"'), "Le nom stable restauré par Safari doit disparaître");

let endDateInputHandler = null;
let toggleHandler = null;
const inputs = {
  startDate: { value: "" },
  endDate: {
    value: "",
    dataset: { watchUserEdited: "false" },
    addEventListener(type, handler) {
      if (type === "input") endDateInputHandler = handler;
    }
  }
};
const editor = {
  open: false,
  querySelector(selector) {
    if (selector.includes('name="startDate"')) return inputs.startDate;
    if (selector.includes('data-watch-field="endDate"')) return inputs.endDate;
    return null;
  },
  addEventListener(type, handler) {
    if (type === "toggle") toggleHandler = handler;
  },
  closest(selector) {
    assert.equal(selector, "[data-watch-result-index]");
    return { dataset: { watchResultIndex: "0" } };
  }
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
    return inputs.endDate;
  }
};

api.bindWatchCandidateEditorDateSync(container, [candidate]);
assert.equal(typeof endDateInputHandler, "function", "L’édition utilisateur doit être suivie localement");
assert.equal(typeof toggleHandler, "function", "La resynchronisation à l’ouverture doit rester active");

api.syncWatchCandidateEditorDates(editor, candidate);
assert.equal(inputs.startDate.value, "2026-09-20");
assert.equal(inputs.endDate.value, "");
assert.equal(inputs.endDate.dataset.watchUserEdited, "false");

// Une restauration Safari sans action utilisateur ne devient jamais une modification à sauver.
inputs.endDate.value = "2026-08-30";
assert.equal(api.getWatchCandidateEndDateUpdate(form, candidate), "");

// Une vraie saisie utilisateur est conservée exactement.
inputs.endDate.value = "2026-09-21";
endDateInputHandler();
assert.equal(inputs.endDate.dataset.watchUserEdited, "true");
assert.equal(api.getWatchCandidateEndDateUpdate(form, candidate), "2026-09-21");

// Une date existante peut être vidée explicitement par l’utilisateur.
candidate.endDate = "2026-09-21";
api.syncWatchCandidateEditorDates(editor, candidate);
inputs.endDate.value = "";
endDateInputHandler();
assert.equal(api.getWatchCandidateEndDateUpdate(form, candidate), "");

// Fermer/réouvrir repart toujours de la source JS, même après une nouvelle pollution Safari.
candidate.endDate = "";
inputs.endDate.value = "2026-08-30";
inputs.endDate.dataset.watchUserEdited = "true";
editor.open = true;
toggleHandler();
assert.equal(inputs.endDate.value, "");
assert.equal(inputs.endDate.dataset.watchUserEdited, "false");
assert.equal(animationFrames.length, 1, "Aucune troisième stratégie différée ne doit être ajoutée");
inputs.endDate.value = "2026-08-30";
animationFrames.shift()();
assert.equal(inputs.endDate.value, "");

assert.ok(saveSource.includes("endDate: getWatchCandidateEndDateUpdate(form, item)"));
for (const field of ["title", "startDate", "city", "type", "country", "description", "officialUrl", "imageUrl"]) {
  assert.ok(saveSource.includes(`${field}: value("${field}")`), `Le champ ${field} ne doit pas changer`);
}

assert.equal((bindSource.match(/requestAnimationFrame/g) || []).length, 1);
for (const implementation of [renderSource, syncSource, bindSource, endDateUpdateSource]) {
  for (const forbidden of [
    "new Date(",
    "Date.now(",
    "setTimeout(",
    "queueMicrotask(",
    "fetch(",
    "client.from(",
    "persistCandidateWorkflowDecision(",
    "setWatchWorkflowState(",
    "localStorage.setItem("
  ]) {
    assert.ok(!implementation.includes(forbidden), `Effet de bord interdit : ${forbidden}`);
  }
}

console.log("ADMIN_WATCH_SAFARI_END_DATE_HARDENING_OK");
