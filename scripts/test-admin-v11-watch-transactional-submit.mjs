import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("admin-watch.js", "utf8");
const config = fs.readFileSync("config.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260904155821_admin_watch_transactional_submit.sql",
  "utf8"
);

assert.match(config, /adminV11WatchSubmissionEnabled:\s*false/);
assert.match(source, /client\.rpc\("submit_admin_watch_candidate"/);
assert.match(source, /p_candidate_id:\s*serverCandidate\.id/);
assert.match(source, /p_expected_version:\s*expectedVersion/);
assert.doesNotMatch(source, /\.from\("events"\)\.insert\(/);
assert.match(source, /La fiche doit être persistée sur le serveur avant sa soumission/);

for (const fragment of [
  "create function public.submit_admin_watch_candidate(",
  "security invoker",
  "set search_path = ''",
  "auth.uid() is null",
  "private.is_admin()",
  "for update",
  "watch_candidate_version_conflict",
  "watch_candidate_not_ready",
  "watch_candidate_already_submitted",
  "watch_candidate_incomplete",
  "insert into public.events",
  "workflow_status = 'submitted'",
  "submitted_event_id = v_event_id",
  "get diagnostics v_updated_count = row_count",
  "watch_candidate_link_failed",
  "revoke all on function public.submit_admin_watch_candidate(uuid, bigint) from public",
  "revoke all on function public.submit_admin_watch_candidate(uuid, bigint) from anon",
  "grant execute on function public.submit_admin_watch_candidate(uuid, bigint) to authenticated"
]) {
  assert.ok(migration.includes(fragment), `Contrat transactionnel incomplet : ${fragment}`);
}

for (const flag of ["validated", "featured", "rejected", "verified"]) {
  assert.match(migration, new RegExp(`\\b${flag}\\b`));
}
assert.match(migration, /false,\s*false,\s*false,\s*false\s*\n\s*\);/);
assert.match(migration, /-- drop function if exists public\.submit_admin_watch_candidate\(uuid, bigint\);/);

console.log("PASS admin-v11-watch-transactional-submit");
