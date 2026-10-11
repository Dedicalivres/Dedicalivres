import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const checker = path.join(root, "scripts/check-publication-diff.mjs");
const pascalId = "c69b157c-bf2f-4ddf-affa-a57497d261c2";
const seclinId = "14b81335-1dab-4f6d-9667-5e88675c6f98";
const baselineMap = JSON.parse(fs.readFileSync(path.join(root, "docs/territoires/event-canonical-map.json"), "utf8"));
const baselineIndex = fs.readFileSync(path.join(root, "evenement/index.html"), "utf8");
const pascalPath = baselineMap[pascalId];
const seclinPath = `evenement/rencontre-litteraire-seclin-${seclinId}.html`;
const pascalCard = baselineIndex.split("\n").find((line) => line.includes(path.basename(pascalPath)));
const thirdCard = baselineIndex.split("\n").find((line) => line.startsWith('<a class="card"') && line !== pascalCard);
const thirdPath = `evenement/${thirdCard?.match(/href="([^"]+)"/)?.[1]}`;
const thirdId = Object.keys(baselineMap).find((id) => baselineMap[id] === thirdPath);
const seclinCard = `<a class="card" href="${path.basename(seclinPath)}"><div class="t">Rencontre littéraire</div><div class="s">Dédicace · Seclin, Hauts-de-France · 24 octobre 2026</div></a>`;

assert.ok(pascalCard?.includes("21 novembre 2026"));
assert.ok(thirdCard);
assert.ok(thirdId);
assert.ok(!baselineIndex.includes(seclinId));

function write(fixture, relative, contents) {
  const filename = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, contents);
}

function run(fixture, command, args, env = {}) {
  return spawnSync(command, args, {
    cwd: fixture,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function makeFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "publication-p0-index-"));
  write(fixture, "scripts/event-publisher/legacy-enriched-events.json",
    fs.readFileSync(path.join(root, "scripts/event-publisher/legacy-enriched-events.json")));
  write(fixture, "docs/territoires/event-canonical-map.json", JSON.stringify(baselineMap));
  write(fixture, "evenement/index.html", baselineIndex);
  write(fixture, pascalPath, "Pascal initial");
  write(fixture, thirdPath, "Autre fiche initiale");
  assert.equal(run(fixture, "git", ["init", "-q"]).status, 0);
  assert.equal(run(fixture, "git", ["add", "-A"]).status, 0);
  assert.equal(run(fixture, "git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]).status, 0);

  const nextMap = { ...baselineMap };
  delete nextMap[pascalId];
  nextMap[seclinId] = seclinPath;
  write(fixture, "docs/territoires/event-canonical-map.json", JSON.stringify(nextMap));
  write(fixture, "evenement/index.html", baselineIndex.replace(pascalCard, seclinCard));
  fs.unlinkSync(path.join(fixture, pascalPath));
  write(fixture, seclinPath, "Seclin publié");
  return { fixture, nextMap };
}

function check(fixture, expectedPass, label) {
  const result = run(fixture, process.execPath, [checker], {
    PUBLICATION_P0_RECOVERY: "true",
    PUBLICATION_DEPUBLISH_PATHS: JSON.stringify([pascalPath]),
  });
  assert.equal(result.status === 0, expectedPass,
    `${label}: status=${result.status}\n${result.stdout}\n${result.stderr}`);
}

const fixtures = [];
try {
  const pass = makeFixture();
  fixtures.push(pass.fixture);
  check(pass.fixture, true, "index régénéré et deux fiches ciblées");

  const thirdPage = makeFixture();
  fixtures.push(thirdPage.fixture);
  write(thirdPage.fixture, thirdPath, "Autre fiche modifiée");
  check(thirdPage.fixture, false, "troisième fiche modifiée");

  const unauthorizedDelete = makeFixture();
  fixtures.push(unauthorizedDelete.fixture);
  fs.unlinkSync(path.join(unauthorizedDelete.fixture, thirdPath));
  check(unauthorizedDelete.fixture, false, "suppression non autorisée");

  const otherCanonical = makeFixture();
  fixtures.push(otherCanonical.fixture);
  otherCanonical.nextMap[thirdId] = "evenement/autre-canonical.html";
  write(otherCanonical.fixture, "docs/territoires/event-canonical-map.json", JSON.stringify(otherCanonical.nextMap));
  check(otherCanonical.fixture, false, "canonical hors périmètre");

  const addedCard = makeFixture();
  fixtures.push(addedCard.fixture);
  const addedIndex = fs.readFileSync(path.join(addedCard.fixture, "evenement/index.html"), "utf8");
  write(addedCard.fixture, "evenement/index.html", addedIndex.replace(seclinCard, `${seclinCard}\n<a class="card" href="intrus.html">Intrus</a>`));
  check(addedCard.fixture, false, "événement intrus ajouté à l’index");

  const removedCard = makeFixture();
  fixtures.push(removedCard.fixture);
  const removedIndex = fs.readFileSync(path.join(removedCard.fixture, "evenement/index.html"), "utf8");
  write(removedCard.fixture, "evenement/index.html", removedIndex.replace(thirdCard, ""));
  check(removedCard.fixture, false, "autre événement retiré de l’index");
} finally {
  for (const fixture of fixtures) fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("PASS reprise P0 : index actualisé, autres liens et fiches protégés");
