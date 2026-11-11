"use strict";

// Test isolé de la provenance des soumissions Admin V11.
// Exécution : node --test tests/admin-origin.test.cjs
// Le classificateur est extrait du fichier de production pour éviter les tests d'une copie divergente.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const shell = read("admin-shell.js");
const context = read("admin-context.js");
const mainHtml = read("admin.html");
const aliasHtml = read("admin-v11.html");
const css = read("admin-v11.css");

function getClassifier() {
  const start = shell.indexOf("  function getV11EventOrigin(event) {");
  const end = shell.indexOf("  function createEventCard(event) {", start);
  assert.ok(start !== -1 && end > start, "classificateur présent dans admin-shell.js");
  return new Function(shell.slice(start, end) + "\nreturn getV11EventOrigin;")();
}

test("origine : distinguer les preuves d'une simple URL/source documentaire", () => {
  const classify = getClassifier();
  const fixtures = [
    ["soumission publique", { source_label: "Soumission publique" }, "public"],
    ["marqueur public explicite", { imported_source: "public-2026" }, "public"],
    ["auto-matte", { imported_source: "Auto-Matte:lot-01" }, "automatte"],
    ["automatte alias", { imported_source: "automatte_lot02" }, "automatte"],
    ["saisie administrateur attestée", { imported_source: "admin-manual-20261111" }, "owner"],
    ["import Paris Librairies", { imported_source: "parislibrairies-pdf-20261101" }, "internal"],
    ["source publique non égale à une soumission publique", { source_label: "Annoncé sur Facebook" }, "unknown"],
    ["URL et texte seuls", { website: "https://facebook.com/group/123", description: "Auto-Matte" }, "unknown"],
    ["fiche historique sans origine", {}, "unknown"],
    ["valeurs nulles", { imported_source: null, source_label: null }, "unknown"]
  ];
  for (const [name, event, expected] of fixtures) {
    assert.equal(classify(event).key, expected, name);
  }
  assert.equal(classify({ source_label: "Soumission publique" }).label, "Public · déclaré");
  assert.match(classify({ source_label: "Soumission publique" }).detail, /non attestée/);
});

test("origine : conserver distincte l'identité du collecteur et la source primaire", () => {
  const classify = getClassifier();
  const event = { imported_source: "Auto-Matte-lot-2", source_label: "Programme officiel de la mairie" };
  assert.equal(classify(event).key, "automatte");
  assert.match(classify(event).detail, /Auto-Matte/i);
  assert.equal(classify({ source_label: "Programme officiel de la mairie" }).key, "unknown");
});

test("V11 : raccordement complet des données, filtre, badges et détail", () => {
  assert.match(context, /const EVENT_COLUMNS = .*source_label,imported_source/);
  assert.match(mainHtml, /id="v11-event-origin-filter"/);
  assert.match(shell, /eventOriginFilter\?\.value \|\| "all"/);
  assert.match(shell, /getV11EventOrigin\(event\)\.key !== originFilter/);
  assert.match(shell, /eventRegistrationFilter\?\.value, eventOriginFilter\?\.value/);
  assert.match(shell, /eventRegistrationFilter,\s*eventOriginFilter\s*\]/);
  assert.match(shell, /originBadge\.textContent = origin\.label/);
  assert.match(shell, /if \(origin\.key !== "unknown"\)/);
  assert.match(mainHtml, /<option value="public">Public · déclaré<\/option>/);
  assert.match(shell, /\["Origine de la soumission", getV11EventOrigin\(event\)\.label\]/);
  assert.match(css, /\.v11-origin-badge\.is-automatte/);
  assert.equal(mainHtml, aliasHtml, "admin.html et admin-v11.html restent synchronisés");
});

test("V11 : aucune modification du statut de publication dans la classification", () => {
  const classify = getClassifier();
  const event = { validated: false, rejected: false, imported_source: "Auto-Matte-lot-1" };
  const before = JSON.stringify(event);
  classify(event);
  assert.equal(JSON.stringify(event), before);
});
