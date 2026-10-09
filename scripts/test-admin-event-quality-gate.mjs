import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-shell.js", "utf8");
const start = source.indexOf("function validateV11EventPublicationPayload(");
const end = source.indexOf("async function runV11EventAction(", start);

assert.ok(start >= 0 && end > start, "Quality gate événement V11 introuvable");

const sandbox = {};
vm.runInNewContext(
  `${source.slice(start, end)}; globalThis.validateEvent = validateV11EventPublicationPayload;`,
  sandbox
);

const complete = {
  title: "Salon du livre",
  start_date: "2026-11-14",
  city: "Lille",
  country_code: "FR"
};

assert.doesNotThrow(() => sandbox.validateEvent(complete));

for (const [field, label] of [
  ["title", "titre"],
  ["start_date", "date de début"],
  ["city", "ville"],
  ["country_code", "pays"]
]) {
  assert.throws(
    () => sandbox.validateEvent({ ...complete, [field]: " " }),
    new RegExp(label)
  );
}

const validationAction = source.slice(end, source.indexOf("function bindV11EventActions(", end));
assert.match(validationAction, /action === "validate"[\s\S]*validateV11EventPublicationPayload\(event\)/);
assert.match(validationAction, /FICHE À CORRIGER AVANT VALIDATION/);

const saveStart = source.indexOf("async function saveV11EventEdition(");
const saveEnd = source.indexOf("function closeV11EventEditor(", saveStart);
const saveSource = source.slice(saveStart, saveEnd);
assert.match(saveSource, /event\.validated === true[\s\S]*event\.rejected !== true[\s\S]*validateV11EventPublicationPayload\(payload\)/);

console.log("ADMIN_EVENT_QUALITY_GATE_OK");
