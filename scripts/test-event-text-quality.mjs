import assert from "node:assert/strict";
import fs from "node:fs";
import "../event-text-quality.js";

const detector = globalThis.DEDICALIVRES_EVENT_TEXT_QUALITY;
const classify = (value) => detector.analyzeField("title", value).map((issue) => issue.code);

assert.deepEqual(classify("Dédicace à Biarritz"), []);
assert.ok(classify("Clara HÃ©raut en dÃ©dicace").includes("mojibake"));
assert.ok(classify("Clara HÃƒÂ©raut").includes("mojibake"));
assert.ok(classify("Rencontre &amp; dédicace").includes("html-entity"));
for (const entity of ["&eacute;", "&egrave;", "&agrave;", "&ccedil;", "&rsquo;", "&hellip;", "&#233;", "&#xE9;"]) {
  assert.ok(classify(`Rencontre ${entity} Paris`).includes("html-entity"), `entité non détectée: ${entity}`);
}
assert.ok(classify("<strong>Rencontre</strong>").includes("html-markup"));
assert.ok(classify("Texte corrompu �").includes("replacement-character"));
assert.ok(classify("Description interrompue…").includes("possible-truncation"));
for (const valid of ["Âme et littérature", "L’Âge d’or", "Iñaki Peña", "François Cheng", "Māori et littérature"]) {
  assert.ok(!classify(valid).includes("mojibake"), `faux positif mojibake: ${valid}`);
}
for (const valid of ["R&D; littérature", "Rencontre &eacute sans point-virgule", "https://example.test/?a=b&c=d"]) {
  assert.ok(!classify(valid).includes("html-entity"), `faux positif entité: ${valid}`);
}

const completeUnverified = detector.summarize({ title: "Salon du livre", description: "Texte correct", city: "Lyon", region: "Rhône", validated: true, verified: false });
assert.equal(completeUnverified.hasIssues, false);
assert.equal(completeUnverified.issues.some((issue) => issue.code === "verified"), false);

const shell = fs.readFileSync("admin-shell.js", "utf8");
const classic = fs.readFileSync("admin.js", "utf8");
const adminPages = ["admin.html", "admin-v11.html"].map((file) => fs.readFileSync(file, "utf8"));
const migration = fs.readFileSync("supabase/migrations/20261009210559_admin_event_moderation_history.sql", "utf8");
assert.match(shell, /Texte à contrôler/);
assert.match(shell, /text-issue/);
assert.match(shell, /"Complétude"/);
assert.match(shell, /"Vérification humaine"/);
assert.match(shell, /"Publication"/);
assert.match(classic, /DEDICALIVRES_EVENT_TEXT_QUALITY/);
assert.doesNotMatch(shell + classic, /textQuality[\s\S]{0,200}\.(?:update|insert|upsert|delete)\(/);
assert.match(migration, /events_append_moderation_history/);
for (const page of adminPages) assert.match(page, /admin-shell\.js\?v=event-bulk-preview-p1-5a-1/);
console.log("PASS qualité texte : détection déterministe, faux positifs protégés, lecture seule, V10/V11 et historique P1.3 préservés");
