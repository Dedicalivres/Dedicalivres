import assert from "node:assert/strict";
import fs from "node:fs";

const name = fs.readdirSync("supabase/migrations")
  .find((entry) => entry.endsWith("_crawler_visits_history_backfill.sql"));
assert.ok(name, "migration backfill absente");

const sql = fs.readFileSync(`supabase/migrations/${name}`, "utf8");
const signatures = [
  "meta-webindexer",
  "meta-externalagent",
  "googlebot",
  "adsbot-google",
  "ahrefsbot",
  "bytespider",
  "qwantbot",
  "bingbot",
  "certsignalbot",
  "hubspot crawler",
  "applebot"
];

assert.match(sql, /^begin;/);
assert.match(sql, /commit;\s*$/);
for (const table of ["site_visits", "event_visits", "visits"]) {
  assert.match(sql, new RegExp(`from public\\.${table}\\b`));
  assert.match(sql, new RegExp(`'${table}'::text as origin_table`));
}
for (const signature of signatures) {
  assert.match(sql, new RegExp(`%${signature.replace(" ", "\\s")}%`, "i"));
}
assert.doesNotMatch(sql, /like\s+(?:any\s*\(array\[)?\s*'%crawler%'/i);
assert.doesNotMatch(sql, /like\s+(?:any\s*\(array\[)?\s*'%spider%'/i);
assert.match(sql, /source\.id::text as origin_id/);
assert.match(sql, /on conflict \(origin_table, origin_id\)\s+where origin_table is not null and origin_id is not null\s+do nothing/s);
assert.match(sql, /candidate_count <> 1330/);
assert.match(sql, /historical_count <> 1330/);
assert.match(sql, /site_count <> 975/);
assert.match(sql, /event_count <> 339/);
assert.match(sql, /legacy_count <> 16/);
assert.doesNotMatch(sql, /\bdelete\b/i);
assert.doesNotMatch(sql, /\btruncate\b/i);
assert.doesNotMatch(sql, /\bupdate\s+(?:public\.)?(?:site_visits|event_visits|visits)\b/i);

console.log("PASS crawler history backfill : sélection, mapping, garde-fous et idempotence");
