import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-social-generator.js", "utf8");
const adminHtml = fs.readFileSync("admin.html", "utf8");
const adminV11Html = fs.readFileSync("admin-v11.html", "utf8");
const sandbox = {
  window: { addEventListener() {} },
  document: { readyState: "loading", addEventListener() {} },
  console,
  Date,
  Intl,
  TextDecoder,
  Uint8Array,
  setTimeout,
  clearTimeout
};

vm.runInNewContext(source, sandbox);
const publisher = sandbox.window.DEDICALIVRES_SOCIAL_GENERATOR;
assert.ok(publisher, "Le Social Publisher doit exposer son API locale");

const friday = new Date(2026, 9, 2, 12);
const range = publisher.getWeekendRange(friday);
assert.equal(range.start.getFullYear(), 2026);
assert.equal(range.start.getMonth(), 9);
assert.equal(range.start.getDate(), 3);
assert.equal(range.end.getDate(), 4);

const fixture = [
  { id: "vendredi", start_date: "2026-10-02" },
  { id: "samedi", start_date: "2026-10-03" },
  { id: "dimanche", start_date: "2026-10-04" },
  { id: "chevauchement", start_date: "2026-10-02", end_date: "2026-10-03" },
  { id: "lundi", start_date: "2026-10-05" },
  { id: "sans-date", start_date: null }
];
assert.deepEqual(
  fixture.filter((event) => publisher.matchesWeekend(event, friday)).map((event) => event.id),
  ["samedi", "dimanche", "chevauchement"]
);

const sundayRange = publisher.getWeekendRange(new Date(2026, 9, 4, 12));
assert.equal(sundayRange.start.getDate(), 3, "Le dimanche reste rattaché au week-end courant");
assert.equal(sundayRange.end.getDate(), 4);

assert.match(source, /<option value="weekend">Ce week-end<\/option>/);
assert.match(source, /if \(period === "weekend"\) return matchesWeekend\(event, today\)/);
assert.match(source, /selectedIds\.has/);
assert.match(source, /Télécharger ZIP/);
assert.match(source, /width: 1080,[\s\S]*?height: 1920/);
assert.match(source, /width: 1600,[\s\S]*?height: 900/);
assert.doesNotMatch(source, /graph\.facebook|instagram\.com\/.*publish|publishTo(?:Instagram|Facebook)/i);
assert.equal(adminHtml, adminV11Html, "Les deux entrées admin doivent rester identiques");
assert.match(adminHtml, /admin-social-generator\.js\?v=v11-social-weekend-1/);

console.log("PASS Social Publisher : lot week-end local, sélection manuelle préservée, formats et export inchangés");
