import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const classic = fs.readFileSync("admin.js", "utf8");
const v11 = fs.readFileSync("admin-shell.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261009210559_admin_event_moderation_history.sql", "utf8");
const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rows = [
  { decision: "reject", admin_id: "admin-1", decided_at: "2026-10-09T12:00:00Z", old_validated: true, old_rejected: false, new_validated: false, new_rejected: true, reason: "Second motif" },
  { decision: "validate", admin_id: "admin-1", decided_at: "2026-10-08T12:00:00Z", old_validated: false, old_rejected: true, new_validated: true, new_rejected: false, reason: null },
  { decision: "reject", admin_id: "admin-1", decided_at: "2026-10-07T12:00:00Z", old_validated: true, old_rejected: false, new_validated: false, new_rejected: true, reason: "Premier motif" }
];

const start = classic.indexOf("async function showEventModerationHistory(id) {");
const end = classic.indexOf("\nasync function toggleFeatured", start);
assert.ok(start >= 0 && end > start);
const alerts = [];
const calls = [];
const errors = [];
let rpcResponse = { data: rows, error: null };
const handler = vm.runInNewContext(`(${classic.slice(start, end).trim()})`, {
  ensureAdminSession: async () => true,
  supabaseClient: { rpc: async (name, args) => { calls.push({ name, args }); return rpcResponse; } },
  window: { alert: (message) => alerts.push(message) },
  showToast: (message) => errors.push(message),
  Date, Array
});
await handler(eventId);
assert.equal(calls[0].name, "get_event_moderation_history");
assert.equal(calls[0].args.p_event_id, eventId);
assert.match(alerts[0], /Premier motif/);
assert.match(alerts[0], /Second motif/);
assert.match(alerts[0], /Validation/);
assert.match(alerts[0], /Admin : admin-1/);

rpcResponse = { data: null, error: { message: "Lecture refusée" } };
await handler(eventId);
assert.match(errors[0], /Lecture refusée/);

assert.match(classic, /data-action="moderation-history"/);
assert.match(classic, /action === "moderation-history"/);
assert.match(v11, /historyButton\.textContent = "Historique des décisions"/);
assert.match(v11, /get_event_moderation_history/);
assert.match(v11, /get_event_rejection_reason/, "lecture du dernier motif conservée");
assert.match(classic, /get_event_rejection_reason/, "lecture du dernier motif conservée");
assert.match(classic, /\.slice\(0, 20\)/, "historique local conservé");
for (const page of ["admin.html", "admin-v11.html"]) {
  assert.match(fs.readFileSync(page, "utf8"), /admin-shell\.js\?v=event-text-quality-p1-4-1/);
}

assert.match(migration, /create table private\.event_moderation_history/);
assert.match(migration, /revoke all on private\.event_moderation_history from public, anon, authenticated/);
assert.match(migration, /security definer/);
assert.match(migration, /after update of validated, rejected on public\.events/);
assert.match(migration, /create or replace function public\.reject_event_with_reason/);
assert.match(migration, /get_event_moderation_history/);
assert.doesNotMatch(migration, /admin_note/);
console.log("PASS historique modération : consultation V10/V11, motifs privés, journal DB et historique local préservé");
