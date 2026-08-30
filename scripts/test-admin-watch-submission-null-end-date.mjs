import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

assert.match(
  source,
  /end_date:\s*normalizeOptionalSubmissionDate\(item\.endDate\)/,
  "Une date de fin vide doit être envoyée à Supabase sous forme NULL"
);

const payloadStart = source.indexOf("function buildSubmissionPayload(");
const payloadEnd = source.indexOf("function normalizeOptionalSubmissionDate(", payloadStart);
const payloadSource = source.slice(payloadStart, payloadEnd);
assert.doesNotMatch(
  payloadSource,
  /end_date:\s*normalizeIsoDate\(item\.endDate\),/,
  "Le payload ne doit plus envoyer une chaîne vide dans events.end_date"
);

assert.match(source, /function normalizeOptionalSubmissionDate\(value\)[\s\S]*return normalizeIsoDate\(value\) \|\| null;/);
assert.match(source, /registration_open_date:\s*normalizeOptionalSubmissionDate/);
assert.match(source, /registration_deadline:\s*normalizeOptionalSubmissionDate/);

console.log("ADMIN_WATCH_SUBMISSION_NULL_END_DATE_OK");
