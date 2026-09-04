import assert from "node:assert/strict";
import fs from "node:fs";

const v10 = fs.readFileSync("admin.html", "utf8");
const v11 = fs.readFileSync("admin-v11.html", "utf8");
const shell = fs.readFileSync("admin-shell.js", "utf8");
const bridge = fs.readFileSync("admin-v11-bridge.js", "utf8");
const publication = fs.readFileSync("author-publication.js", "utf8");
const config = fs.readFileSync("config.js", "utf8");
const readme = fs.readFileSync("README.md", "utf8");

assert.match(v10, /Dédicalivres — Admin V(?:10|11)/);
assert.match(v11, /data-v11-release-state="preactivation"/);
assert.match(readme, /Point d’entrée admin actif/);
assert.match(readme, /Source V11 de référence/);
assert.match(shell, /\/\\\/admin\\\.html\$\//);
assert.match(shell, /isActiveEntrypoint \? "active" : "preactivation"/);
assert.match(shell, /isActiveEntrypoint \? "V11 · active" : "V11 · préactivation"/);
assert.match(bridge, /V11_WATCH_WRITE_GUARD = !watchSubmissionEnabled/);
assert.match(config, /adminV11WatchSubmissionEnabled: false/);
assert.match(v11, /Aucune publication automatique/);
assert.doesNotMatch(v11, /publication publique reste volontairement désactivée/);
assert.match(v11, /Les présences peuvent être modifiées ; la suppression reste verrouillée/);
assert.match(shell, /communityDeleteButton\.disabled = true/);
assert.match(publication, /author\.publication_ready === true/);
assert.match(publication, /author\.editorial_status === "READY"/);
assert.match(shell, /author\.editorial_status === "READY"/);
assert.match(shell, /publicationEngine\.isPubliclyAvailable\(author\)/);
assert.match(shell, /URL publique/);

console.log("PASS admin-v11-activation-readiness");
