import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

assert.match(source, /data-watch-submission-status/);
assert.match(source, /error\?\.code/);
assert.match(source, /error\?\.details/);
assert.match(source, /error\?\.hint/);
assert.match(source, /Échec de la soumission/);

console.log("ADMIN_WATCH_VISIBLE_SUBMISSION_ERROR_OK");
