import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  'const isActiveWorkflow = ["ready", "review"].includes(workflowState)',
  'isActiveWorkflow && (!isServerOnly || (workflowState === "ready" && hasDurableContent)) ? `',
  "renderWatchCandidateEditor(result, index)",
  "function renderWatchCandidateEditor(",
  "Modifier la fiche",
  'name="title"',
  'name="startDate"',
  'data-watch-field="endDate"',
  'name="city"',
  'name="type"',
  'name="country"',
  'name="description"',
  'name="officialUrl"',
  'name="imageUrl"',
  "Enregistrer",
  "Annuler",
  "function saveWatchCandidateEdits(",
  "const item = results[index]",
  "Object.assign(item, updates)",
  "item.missingFields = recalculateWatchCandidateMissingFields(item)",
  "lastResults = sortWatchResultsByCompleteness(lastResults)",
  "renderResults(lastResults)",
  'data-watch-editor-form="${index}"',
  "function renderWatchSubmissionPreview(",
  "Prévisualisation avant soumission",
  "Champs bloquants",
  "Retour / Corriger",
  "Confirmer l’envoi",
  'data-watch-confirm-submit="${index}"',
  "function openWatchSubmissionPreview("
];

for (const fragment of required) {
  assert.ok(
    source.includes(fragment),
    `Éditeur ou prévisualisation incomplet : ${fragment}`
  );
}

assert.ok(
  source.includes('["venue", "address"].forEach((property) => {'),
  "Les champs lieu/adresse existants doivent être conservés sans nouvelle propriété"
);

const submitHandlerStart = source.indexOf('container.querySelectorAll("[data-watch-submit]")');
const editorHandlerStart = source.indexOf('container.querySelectorAll("[data-watch-editor-form]")', submitHandlerStart);
const submitHandler = source.slice(submitHandlerStart, editorHandlerStart);

assert.ok(
  submitHandler.includes("openWatchSubmissionPreview(index, queueResults, button)") &&
    !submitHandler.includes("createSubmissionFromWatch"),
  "Envoyer en soumission doit ouvrir la prévisualisation sans créer de soumission"
);

const confirmHandlerStart = source.indexOf('container.querySelectorAll("[data-watch-confirm-submit]")');
const saveHandlerStart = source.indexOf("function saveWatchCandidateEdits(", confirmHandlerStart);
const confirmHandler = source.slice(confirmHandlerStart, saveHandlerStart);

assert.ok(
  confirmHandler.includes("const item = queueResults[index]") &&
    confirmHandler.includes("createSubmissionFromWatch(item, button)"),
  "Seule la confirmation doit appeler la création existante avec l’index réel"
);

const previewStart = source.indexOf("function openWatchSubmissionPreview(");
const filterLabelStart = source.indexOf("function getWatchQueueFilterLabel(", previewStart);
const previewSource = source.slice(previewStart, filterLabelStart);

assert.ok(
  !previewSource.includes('.from("events").insert') &&
    !previewSource.includes("markHandled(") &&
    !previewSource.includes('setWatchWorkflowState(item, "submitted")'),
  "La prévisualisation ne doit produire aucun effet de bord avant confirmation"
);

assert.ok(
  source.includes("renderWatchSubmissionPreview(result, index)") &&
    source.includes("const isClosedWorkflow = WATCH_CANDIDATE_CLOSED_STATES.includes(workflowState)"),
  "Les états terminés ne doivent proposer ni édition ni prévisualisation active"
);


assert.ok(
  source.includes("item.adminText = buildWatchCandidateAdminText(item)"),
  "adminText doit être régénéré après modification du candidat"
);

assert.ok(
  source.includes("function buildWatchCandidateAdminText("),
  "Helper de régénération adminText absent"
);

console.log("ADMIN_WATCH_CANDIDATE_EDITOR_OK");
