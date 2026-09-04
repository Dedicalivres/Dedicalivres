import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync("admin-shell.js", "utf8");
const config = fs.readFileSync("config.js", "utf8");
const html = fs.readFileSync("admin-v11.html", "utf8");
const activeHtml = fs.readFileSync("admin.html", "utf8");
const mergeSql = fs.readFileSync(
  "supabase/migrations/20260822114500_merge_author_profiles_audit.sql",
  "utf8"
);
const revertSql = fs.readFileSync(
  "supabase/migrations/20260822115500_revert_author_merge.sql",
  "utf8"
);

assert.equal(activeHtml, html, "admin.html doit rester identique à admin-v11.html");
assert.match(config, /adminV11AuthorMergeEnabled:\s*true/);
assert.match(html, /id="v11-author-merge-panel"/);
assert.match(html, /id="v11-author-merge-candidate"/);
assert.match(html, /id="v11-author-merge-primary"/);
assert.match(html, /id="v11-author-merge-preview"/);
assert.match(html, /id="v11-author-merge-confirm"/);
assert.match(html, /id="v11-author-merge-history-list"/);

assert.match(shell, /findProbableAuthorDuplicates\(authors\)/);
assert.match(shell, /match\.score/);
assert.match(shell, /Fiche conservée/);
assert.match(shell, /Fiche archivée/);
assert.match(shell, /CONFIRMER LA FUSION/);
assert.match(shell, /v11AuthorMergeRunning/);
assert.match(shell, /authorMergeConfirm\.disabled = true/);
assert.match(shell, /\.rpc\("merge_author_profiles"/);
assert.match(shell, /p_primary_id:\s*primaryId/);
assert.match(shell, /p_secondary_id:\s*secondaryId/);
assert.match(shell, /\.from\("author_merge_audit"\)/);
assert.match(shell, /data-v11-author-merge-revert/);
assert.match(shell, /CONFIRMER LE RETOUR ARRIÈRE/);
assert.match(shell, /\.rpc\("revert_author_merge"/);
assert.match(shell, /p_audit_id:\s*auditId/);
assert.match(shell, /presence_event_conflict/);
assert.match(shell, /merge_state_changed/);
assert.doesNotMatch(shell, /authorMergeButton\.disabled = true;/);

assert.match(mergeSql, /security invoker/i);
assert.match(mergeSql, /if not private\.is_admin\(\)/);
assert.match(mergeSql, /revoke all on function public\.merge_author_profiles[\s\S]*from anon/);
assert.match(mergeSql, /insert into public\.author_merge_audit/);
assert.doesNotMatch(mergeSql, /delete from public\.authors/i);

assert.match(revertSql, /security invoker/i);
assert.match(revertSql, /if not private\.is_admin\(\)/);
assert.match(revertSql, /presence_restore_count_mismatch/);
assert.match(revertSql, /revoke all on function public\.revert_author_merge[\s\S]*from anon/);

console.log("PASS — Admin V11 fusion auteur contrôlée");
