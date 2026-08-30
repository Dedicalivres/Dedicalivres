import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "function getWatchImageQuality(",
  'state: "image-absente"',
  'state: "image-douteuse"',
  'state: "image-ok"',
  "Sans image",
  "Image douteuse",
  "Image OK",
  "WATCH_SUSPICIOUS_IMAGE_PATTERN",
  "WATCH_NON_IMAGE_EXTENSION_PATTERN",
  "function getWatchCandidateQualityScore(",
  "function getWatchCandidateQualityLevel(",
  "candidateQualityScore",
  "Qualité ${candidateQualityScore}%",
  "function getWatchDuplicateSignal(",
  "function getLocalWatchDuplicateSignal(",
  'state === "existing"',
  'state === "probable"',
  "Déjà présent",
  "Doublon probable",
  "Nouveau",
  "watchDuplicateSignal",
  "data-watch-duplicate-warning",
  "data-watch-duplicate-reviewed",
  "getWatchImageQuality(result)",
  "getWatchCandidateQualityScore(result)",
  "getWatchDuplicateSignal(result)"
];

for (const fragment of required) {
  assert.ok(
    source.includes(fragment),
    `Pack qualité incomplet : ${fragment}`
  );
}

const imageStart = source.indexOf("function getWatchImageQuality(");
const scoreStart = source.indexOf("function getWatchCandidateQualityScore(", imageStart);
const imageSource = source.slice(imageStart, scoreStart);

assert.ok(
  imageSource.includes("normalizeUrlValue") &&
    !imageSource.includes("fetch("),
  "La qualification image doit rester locale et sans téléchargement"
);

const qualityLevelStart = source.indexOf("function getWatchCandidateQualityLevel(", scoreStart);
const scoreSource = source.slice(scoreStart, qualityLevelStart);

assert.ok(
  !scoreSource.includes("confidence") &&
    !scoreSource.includes("Math.random") &&
    !scoreSource.includes("Date.now"),
  "Le score qualité doit être déterministe et distinct de confidence"
);

const saveStart = source.indexOf("function saveWatchCandidateEdits(");
const adminTextStart = source.indexOf("function buildWatchCandidateAdminText(", saveStart);
const saveSource = source.slice(saveStart, adminTextStart);

assert.ok(
  saveSource.includes("const item = results[index]") &&
    saveSource.includes("item.missingFields = recalculateWatchCandidateMissingFields(item)") &&
    saveSource.includes("item.adminText = buildWatchCandidateAdminText(item)") &&
    saveSource.includes("getLocalWatchDuplicateSignal(item, lastResults)") &&
    saveSource.includes("renderResults(lastResults)"),
  "L’édition doit recalculer les signaux et conserver l’index réel"
);

const duplicateLookupStart = source.indexOf("async function findExistingSubmission(");
const duplicateKeyStart = source.indexOf("function getWatchDuplicateKey(", duplicateLookupStart);
const duplicateLookupSource = source.slice(duplicateLookupStart, duplicateKeyStart);

assert.ok(
  duplicateLookupSource.includes('strongestMatch?.level === "certain"') &&
    duplicateLookupSource.includes('recordWatchDuplicateSignal(item, "existing", strongestMatch)') &&
    duplicateLookupSource.includes('["probable", "possible"].includes(strongestMatch?.level)') &&
    duplicateLookupSource.includes('recordWatchDuplicateSignal(item, "probable", strongestMatch)') &&
    duplicateLookupSource.includes("return null"),
  "Un probable doit rester distinct d’un doublon certain"
);

const precheckStart = source.indexOf("async function precheckWatchDuplicates(");
const payloadStart = source.indexOf("function buildSubmissionPayload(", precheckStart);
const precheckSource = source.slice(precheckStart, payloadStart);

assert.ok(
  precheckSource.includes("if (!duplicate) return") &&
    precheckSource.includes('setWatchWorkflowState(item, "duplicate")'),
  "Le workflow duplicate doit dépendre uniquement d’un doublon confirmé"
);

const previewStart = source.indexOf("function renderWatchSubmissionPreview(");
const submissionStart = source.indexOf("async function createSubmissionFromWatch(", previewStart);
const previewSource = source.slice(previewStart, submissionStart);

assert.ok(
  previewSource.includes("watch-preview-signals") &&
    previewSource.includes("watch-preview-duplicate-warning") &&
    previewSource.includes("candidateQualityScore") &&
    previewSource.includes("imageQuality") &&
    previewSource.includes("duplicateSignal"),
  "La prévisualisation doit contenir les trois indicateurs qualité"
);

assert.equal(
  (source.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Le pack ne doit ajouter aucun insert Supabase"
);

console.log("ADMIN_WATCH_QUALITY_PACK_OK");
