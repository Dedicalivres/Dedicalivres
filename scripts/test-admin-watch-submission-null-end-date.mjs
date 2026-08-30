import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

assert.match(
  source,
  /end_date:\s*normalizeIsoDate\(item\.endDate\)\s*\|\|\s*null/,
  "Une date de fin vide doit être envoyée à Supabase sous forme NULL"
);

assert.doesNotMatch(
  source,
  /end_date:\s*normalizeIsoDate\(item\.endDate\),/,
  "Le payload ne doit plus envoyer une chaîne vide dans events.end_date"
);

console.log("ADMIN_WATCH_SUBMISSION_NULL_END_DATE_OK");
