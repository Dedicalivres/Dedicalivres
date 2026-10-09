import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const publisher = fs.readFileSync("scripts/publish-events-local.sh", "utf8");
const blockStart = publisher.indexOf("<<'PY'\n");
const blockEnd = publisher.indexOf("\nPY\n", blockStart);
assert(blockStart >= 0 && blockEnd > blockStart, "Garde-fou Python introuvable");
const guard = publisher.slice(blockStart + "<<'PY'\n".length, blockEnd);
const eventId = "22222222-2222-4222-8222-222222222222";

function fixture(replacementSlug) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "event-edit-root-"));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "event-edit-export-"));
  fs.mkdirSync(path.join(root, "evenement"));
  fs.mkdirSync(path.join(output, "evenement"));
  fs.writeFileSync(path.join(root, "evenement", "ancienne-fiche.html"), "ancienne");
  fs.writeFileSync(path.join(output, "evenement", "nouvelle-fiche.html"), "nouvelle");
  fs.writeFileSync(
    path.join(output, "event-pages-manifest.json"),
    JSON.stringify({ version: 1, events: { [eventId]: replacementSlug } })
  );
  fs.writeFileSync(
    path.join(output, "sitemap-evenements.xml"),
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://dedicalivres.fr/evenement/index.html</loc></url><url><loc>https://dedicalivres.fr/evenement/nouvelle-fiche.html</loc></url></urlset>'
  );
  return { root, output };
}

function run(replacementSlug) {
  const { root, output } = fixture(replacementSlug);
  try {
    const result = spawnSync(
      "python3",
      ["-", root, output, '["evenement/ancienne-fiche.html"]', JSON.stringify([eventId])],
      { input: guard, encoding: "utf8" }
    );
    return { result, oldExists: fs.existsSync(path.join(root, "evenement", "ancienne-fiche.html")) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  }
}

const renamed = run("nouvelle-fiche");
assert.equal(renamed.result.status, 0, renamed.result.stderr);
assert.equal(renamed.oldExists, false);

const missingReplacement = run("fiche-absente");
assert.notEqual(missingReplacement.result.status, 0);
assert.match(missingReplacement.result.stderr, /sans remplacement canonique valide/);
assert.equal(missingReplacement.oldExists, true);

console.log("PASS modification canonical : ancien slug retiré seulement avec remplacement généré valide");
