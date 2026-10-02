import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("soumettre.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const draft = fs.readFileSync("author-local-draft.js", "utf8");

assert.match(html, /La proposition sera relue avant publication\./);
assert.match(html, /Dédicalivres peut corriger ou vérifier certaines informations avant mise en ligne\./);
assert.ok(
  html.indexOf("submission-moderation-note") < html.indexOf('name="title"'),
  "Le message de modération doit précéder les champs événement"
);

assert.match(draft, /form\.id === 'submission-form'[\s\S]*?#dedicace-author-fields/);
assert.match(draft, /submissionAuthorIntro\.insertAdjacentElement\('afterend', box\)/);
assert.match(app, /const isDedicace = submissionTypeSelect\.value === "Dédicace";[\s\S]*?dedicaceAuthorFields\.hidden = !isDedicace/);
assert.ok(
  html.indexOf('id="dedicace-author-fields"') > html.indexOf('name="start_date"'),
  "La section auteur doit rester après les informations principales"
);
const formHtml = html.match(/<form id="submission-form"[\s\S]*?<\/form>/)?.[0] || "";
assert.equal((formHtml.match(/\sname="[^"]+"/g) || []).length, 28, "Les 28 contrôles métier doivent rester présents");

assert.doesNotMatch(app, /uploadImageToSupabase|bascule Supabase/);

const uploadSource = app.match(
  /async function uploadImage\(file\) \{[\s\S]*?\n  \}\n\n  function shouldUseR2Upload/
)?.[0]?.replace(/\n\n  function shouldUseR2Upload$/, "");
assert.ok(uploadSource, "Fonction uploadImage introuvable");

const calls = [];
const context = {
  eventImageUploadCache: new Map(),
  validateEventImageFile() {},
  getFileCacheKey() { return "fixture"; },
  compressImage: async (file) => ({ ...file, compressed: true }),
  shouldUseR2Upload: () => true,
  uploadImageToR2: async (file, folder) => {
    calls.push({ file, folder });
    return "https://r2.example/event-images/fixture.jpg";
  }
};
vm.runInNewContext(`${uploadSource}; globalThis.uploadImage = uploadImage;`, context);

const uploaded = await context.uploadImage({ name: "fixture.png" });
assert.equal(uploaded, "https://r2.example/event-images/fixture.jpg");
assert.equal(calls.length, 1);
assert.equal(calls[0].folder, "event-images");
assert.equal(calls[0].file.compressed, true, "L’image doit rester compressée avant l’upload R2");

const unavailable = {
  ...context,
  eventImageUploadCache: new Map(),
  getFileCacheKey: () => "",
  shouldUseR2Upload: () => false
};
vm.runInNewContext(`${uploadSource}; globalThis.uploadImage = uploadImage;`, unavailable);
await assert.rejects(
  unavailable.uploadImage({ name: "fixture.png" }),
  /stockage d.image R2 est indisponible/
);

const failed = {
  ...context,
  eventImageUploadCache: new Map(),
  getFileCacheKey: () => "",
  uploadImageToR2: async () => { throw new Error("R2 indisponible"); }
};
vm.runInNewContext(`${uploadSource}; globalThis.uploadImage = uploadImage;`, failed);
await assert.rejects(failed.uploadImage({ name: "fixture.png" }), /R2 indisponible/);

console.log("EVENT_SUBMISSION_CLARITY_OK");
