import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync("config.js", "utf8");
const bridge = fs.readFileSync("admin-v11-bridge.js", "utf8");
const watch = fs.readFileSync("admin-watch.js", "utf8");
const maintenance = fs.readFileSync("admin-v11-maintenance.js", "utf8");

assert.match(config, /adminV11WatchSubmissionEnabled: true/);
assert.match(bridge, /adminV11WatchSubmissionEnabled === true/);
assert.match(bridge, /V11_WATCH_WRITE_GUARD = !watchSubmissionEnabled/);
assert.match(bridge, /if \(window\.V11_WATCH_WRITE_GUARD\) document\.addEventListener/);
assert.match(watch, /getSubmissionBlockingFields/);
assert.match(watch, /watchSubmissionInFlight/);
assert.match(watch, /findExistingSubmissionCached/);
assert.match(watch, /data-watch-duplicate-reviewed/);
assert.match(watch, /data-watch-confirm-submit/);
assert.match(watch, /Confirmer l’envoi/);
assert.match(maintenance, /Soumission Veille bloquée par configuration/);
assert.match(maintenance, /Soumission contrôlée autorisée par configuration/);

console.log("PASS admin-v11-watch-controlled-submit");
