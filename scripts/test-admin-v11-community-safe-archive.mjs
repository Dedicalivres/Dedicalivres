import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync("admin-shell.js", "utf8");
const context = fs.readFileSync("admin-context.js", "utf8");
const config = fs.readFileSync("config.js", "utf8");
const html = fs.readFileSync("admin-v11.html", "utf8");
const activeHtml = fs.readFileSync("admin.html", "utf8");
const sql = fs.readFileSync(
  "supabase/migrations/20260904190703_admin_v11_community_safe_archive.sql",
  "utf8"
);

assert.equal(activeHtml, html, "admin.html doit rester identique à admin-v11.html");
assert.match(config, /adminV11CommunityArchiveEnabled:\s*false/);
assert.match(html, /id="v11-community-archive-panel"/);
assert.match(html, /id="v11-community-archive-reason"/);
assert.match(html, /id="v11-community-archive-confirm"/);
assert.match(html, /id="v11-community-archive-history-list"/);

assert.match(context, /communityArchiveEnabled/);
assert.match(context, /presenceColumns\.push\("archived_at", "archived_by", "archive_reason"\)/);
assert.match(context, /\.filter\(\(item\) => !item\.archived_at\)/);
assert.match(shell, /CONFIRMER LE RETRAIT/);
assert.match(shell, /v11CommunityActionRunning/);
assert.match(shell, /\.rpc\("archive_community_item"/);
assert.match(shell, /p_reason:\s*reason/);
assert.match(shell, /CONFIRMER LA RESTAURATION/);
assert.match(shell, /\.rpc\("restore_community_item"/);
assert.match(shell, /data-v11-community-restore-id/);

assert.match(sql, /add column if not exists archived_at timestamptz/g);
assert.match(sql, /security invoker/gi);
assert.match(sql, /if not private\.is_admin\(\)/g);
assert.match(sql, /archived_at is null/g);
assert.match(sql, /revoke all on function public\.archive_community_item[\s\S]*from anon/);
assert.match(sql, /revoke all on function public\.restore_community_item[\s\S]*from anon/);
assert.match(sql, /revoke delete on table public\.event_authors_presence from authenticated/);
assert.match(sql, /revoke delete on table public\.testimonials from authenticated/);
assert.doesNotMatch(sql, /delete\s+from\s+public\.(event_authors_presence|testimonials)/i);

console.log("PASS — Admin V11 retrait Communauté réversible préparé");
