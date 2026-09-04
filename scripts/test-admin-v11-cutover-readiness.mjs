import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(
  fs.readFileSync("docs/admin-v11-cutover-manifest.json", "utf8")
);
const currentV10 = fs.readFileSync(manifest.v10_entrypoint);
const currentV11 = fs.readFileSync(manifest.v11_source);
const config = fs.readFileSync("config.js", "utf8");
const adminShell = fs.readFileSync("admin-shell.js", "utf8");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

assert.equal(manifest.activation_scope.length, 1);
assert.equal(manifest.activation_scope[0], "admin.html");
assert.equal(manifest.production_database_change_allowed, false);
assert.equal(manifest.automatic_deployment_allowed, false);
assert.equal(sha256(currentV11), manifest.v11_sha256);

const archivedV10 = execFileSync(
  "git",
  ["show", `${manifest.base_commit}:${manifest.v10_entrypoint}`]
);
assert.equal(sha256(archivedV10), manifest.v10_sha256);

function assertValidEntrypoint(entrypoint) {
  const entrypointHash = sha256(entrypoint);
  assert.ok(
    [manifest.v10_sha256, manifest.v11_sha256].includes(entrypointHash),
    "admin.html doit correspondre exactement à la V10 de rollback ou à la V11 validée"
  );

  if (entrypointHash === manifest.v10_sha256) {
    assert.deepEqual(entrypoint, archivedV10);
  } else {
    assert.deepEqual(entrypoint, currentV11);
  }
}

assertValidEntrypoint(currentV10);
assertValidEntrypoint(archivedV10);
assertValidEntrypoint(currentV11);

const v11Text = currentV11.toString("utf8");
for (const asset of [
  "admin-v11.css",
  "admin-context.js",
  "admin-v11-bridge.js",
  "admin-shell.js",
  "admin-watch.js",
  "admin-v11-exports.js",
  "admin-v11-maintenance.js",
  "admin-nfc-cockpit.js"
]) {
  assert.ok(v11Text.includes(asset), `Ressource V11 absente : ${asset}`);
}
assert.doesNotMatch(v11Text, /location(?:\.href|\.replace)?\s*\([^)]*admin-v11\.html/);
assert.match(config, /adminV11WatchSubmissionEnabled:\s*false/);
assert.match(
  v11Text,
  /id="v11-author-merge"[\s\S]*?disabled[\s\S]*?>[\s\S]*?Fusionner/
);
assert.match(
  adminShell,
  /if \(authorMergeButton\) \{\s*authorMergeButton\.disabled = true;\s*\}/
);

console.log("PASS admin-v11-cutover-readiness");
