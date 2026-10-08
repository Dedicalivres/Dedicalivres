import assert from "node:assert/strict";
import fs from "node:fs";

const name = fs.readdirSync("supabase/migrations")
  .find((entry) => entry.endsWith("_crawler_visits_history_cleanup.sql"));
assert.ok(name, "migration cleanup absente");

const sql = fs.readFileSync(`supabase/migrations/${name}`, "utf8");

assert.match(sql, /^begin;/);
assert.match(sql, /commit;\s*$/);
assert.match(sql, /historical_total <> 1330/);
assert.match(sql, /historical_site <> 975/);
assert.match(sql, /historical_event <> 339/);
assert.match(sql, /historical_visits <> 16/);
assert.match(sql, /source_site <> 975/);
assert.match(sql, /source_event <> 339/);
assert.match(sql, /source_visits <> 16/);

for (const table of ["site_visits", "event_visits", "visits"]) {
  assert.match(
    sql,
    new RegExp(`delete from public\\.${table} as source\\s+using public\\.crawler_visits as archive`, "s")
  );
  assert.match(sql, new RegExp(`archive\\.origin_table = '${table}'`));
}
assert.match(sql, /archive\.origin_id = source\.id::text/);
assert.equal((sql.match(/delete from public\./g) || []).length, 3);
assert.doesNotMatch(sql, /delete from public\.crawler_visits/i);

assert.match(sql, /get diagnostics deleted_site = row_count/);
assert.match(sql, /get diagnostics deleted_event = row_count/);
assert.match(sql, /get diagnostics deleted_visits = row_count/);
assert.match(sql, /deleted_site <> 975/);
assert.match(sql, /deleted_event <> 339/);
assert.match(sql, /deleted_visits <> 16/);
assert.match(sql, /remaining_site <> 0/);
assert.match(sql, /remaining_event <> 0/);
assert.match(sql, /remaining_visits <> 0/);

assert.doesNotMatch(sql, /user_agent/i);
assert.doesNotMatch(sql, /\b(?:like|ilike)\b/i);
assert.doesNotMatch(sql, /(?:^|\s)(?:~|~\*|!~|!~\*)(?:\s|$)/m);
assert.doesNotMatch(sql, /meta-webindexer|meta-externalagent|googlebot|adsbot-google/i);
assert.doesNotMatch(sql, /'%crawler%'|'%spider%'/i);
assert.doesNotMatch(sql, /\bupdate\b/i);
assert.doesNotMatch(sql, /\btruncate\b/i);
assert.doesNotMatch(sql, /\bdrop\b/i);
assert.doesNotMatch(sql, /\balter\b/i);
assert.doesNotMatch(sql, /\bcascade\b/i);

console.log("PASS crawler history cleanup : garde-fous, suppressions ciblées et archives préservées");
