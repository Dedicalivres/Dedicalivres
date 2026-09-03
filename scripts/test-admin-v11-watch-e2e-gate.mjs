import fs from "node:fs";
import assert from "node:assert/strict";

const config = fs.readFileSync("config.js", "utf8");
const bridge = fs.readFileSync("admin-v11-bridge.js", "utf8");
const watch = fs.readFileSync("admin-watch.js", "utf8");
const migrations = fs.readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .map((name) => fs.readFileSync(`supabase/migrations/${name}`, "utf8"))
  .join("\n");

assert.match(config, /adminV11WatchSubmissionEnabled:\s*false/);
assert.match(bridge, /V11_WATCH_WRITE_GUARD\s*=\s*!watchSubmissionEnabled/);
assert.match(watch, /\.from\("events"\)\.insert\(\[payload\]\)\.select\("id"\)/);
assert.match(watch, /await setWatchWorkflowState\(item, "submitted"\)/);
assert.doesNotMatch(migrations, /create(?:\s+or\s+replace)?\s+function\s+(?:public\.)?submit_admin_watch_candidate\s*\(/i);

console.log("ADMIN_V11_WATCH_E2E_GATE_LOCKED_OK");
