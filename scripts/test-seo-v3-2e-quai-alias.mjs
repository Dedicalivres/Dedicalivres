import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE_SHA = "29f2b0fff80bccceef6852dff0c0c097cba2d37a";
const oldName = "bande-dessinee-quai-des-bulles-9-octobre-2026-au-11-octobre-2026-saint-5111.html";
const canonicalName = "quai-des-bulles-les-9-10-et-11-octobre-2026-a-saint-malo-35-saint-malo-2732.html";
const oldPath = `evenement/${oldName}`;
const canonicalPath = `evenement/${canonicalName}`;
const canonicalUrl = `https://dedicalivres.fr/evenement/${canonicalName}`;
const reportHashes = new Map([
  ["scripts/fixtures/seo-v3-2d-audit-remaining.tsv", "eb4a723633d3e9d9c46706f962ef86450b2299a2ec6c9ac4853aa60149ee9927"],
  ["scripts/fixtures/seo-v3-2d-future-classification.tsv", "772e4140dd9b5130a9f0c11a5eaf660e94691f15272edae30898983656e067fc"],
]);

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}

function eventJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
  return blocks.filter((item) => item["@type"] === "Event");
}

function sha256(path) {
  return createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

const expectedAlias = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fiche regroupée — Dédicalivres</title>
  <meta name="description" content="Cette fiche événement a été regroupée avec sa fiche principale sur Dédicalivres.">
  <link rel="canonical" href="${canonicalUrl}">
  <meta http-equiv="refresh" content="0; url=${canonicalUrl}">
  <script>
    window.location.replace("${canonicalUrl}");
  </script>
</head>
<body>
  <main>
    <h1>Fiche regroupée</h1>
    <p>Cette fiche a été regroupée avec sa fiche principale.</p>
    <p><a href="${canonicalUrl}">Consulter la fiche principale</a></p>
  </main>
</body>
</html>
`;

assert.ok(fs.existsSync(oldPath), "La page 5111 doit rester physiquement présente");
assert.ok(fs.existsSync(canonicalPath), "La canonique 2732 doit exister");

const alias = fs.readFileSync(oldPath, "utf8");
const canonical = fs.readFileSync(canonicalPath, "utf8");
const oldBefore = git("show", `${BASE_SHA}:${oldPath}`);
const canonicalBefore = git("show", `${BASE_SHA}:${canonicalPath}`);
assert.equal(alias, expectedAlias, "Le contenu de l’alias doit suivre exactement le modèle validé");
assert.equal(canonical, canonicalBefore, "La page canonique 2732 ne doit pas être modifiée");

const oldEvents = eventJsonLd(oldBefore);
const canonicalEvents = eventJsonLd(canonical);
assert.equal(oldEvents.length, 1, "La page 5111 initiale doit décrire un Event");
assert.equal(canonicalEvents.length, 1, "La canonique doit conserver un Event JSON-LD valide");
const oldEvent = oldEvents[0];
const canonicalEvent = canonicalEvents[0];
assert.match(String(oldEvent.name).toLowerCase(), /quai des bulles/);
assert.match(String(canonicalEvent.name).toLowerCase(), /quai des bulles/);
assert.equal(oldEvent.startDate, canonicalEvent.startDate);
assert.equal(oldEvent.endDate, canonicalEvent.endDate);
assert.equal(oldEvent.startDate, "2026-10-09");
assert.equal(oldEvent.endDate, "2026-10-11");
assert.equal(oldEvent.location.address.addressLocality, canonicalEvent.location.address.addressLocality);
assert.equal(oldEvent.location.address.addressRegion, canonicalEvent.location.address.addressRegion);
assert.equal(canonicalEvent.location.address.addressLocality, "Saint-Malo");
assert.ok(!/http-equiv="refresh"/i.test(canonical), "La canonique ne doit pas être un alias");
assert.ok(!/window\.location\.replace\(/.test(canonical), "La canonique ne doit pas rediriger");

assert.equal((alias.match(/<link\s+rel="canonical"\s+href="[^"]+"\s*>/g) || []).length, 1);
assert.equal(occurrences(alias, `<link rel="canonical" href="${canonicalUrl}">`), 1);
assert.equal(occurrences(alias, `<meta http-equiv="refresh" content="0; url=${canonicalUrl}">`), 1);
assert.equal(occurrences(alias, `window.location.replace("${canonicalUrl}");`), 1);
assert.equal(occurrences(alias, `<a href="${canonicalUrl}">Consulter la fiche principale</a>`), 1);
assert.ok(alias.includes("Cette fiche a été regroupée avec sa fiche principale."));
assert.equal(eventJsonLd(alias).length, 0, "Aucun Event JSON-LD ne doit subsister dans l’alias");
assert.ok(!/application\/ld\+json/i.test(alias), "Aucun ancien JSON-LD ne doit subsister");
assert.ok(!/noindex/i.test(alias), "L’alias ne doit pas recevoir noindex");

const sitemap = fs.readFileSync("sitemap-evenements.xml", "utf8");
const sitemapBefore = git("show", `${BASE_SHA}:sitemap-evenements.xml`);
const index = fs.readFileSync("evenement/index.html", "utf8");
const indexBefore = git("show", `${BASE_SHA}:evenement/index.html`);
const oldUrl = `https://dedicalivres.fr/evenement/${oldName}`;
assert.equal(occurrences(sitemapBefore, oldUrl), 1);
assert.equal(occurrences(sitemap, oldUrl), 0, "L’ancienne URL doit quitter le sitemap");
assert.equal(occurrences(sitemapBefore, canonicalUrl), 1);
assert.equal(occurrences(sitemap, canonicalUrl), 1, "La canonique doit rester dans le sitemap");
assert.equal(occurrences(indexBefore, oldName), 1);
assert.equal(occurrences(index, oldName), 0, "L’ancienne référence doit quitter l’index");
assert.equal(occurrences(indexBefore, canonicalName), 1);
assert.equal(occurrences(index, canonicalName), 1, "La canonique doit rester dans l’index");

for (const [path, expectedHash] of reportHashes) {
  assert.ok(fs.existsSync(path), `Rapport d’audit absent : ${path}`);
  assert.equal(sha256(path), expectedHash, `Rapport d’audit modifié : ${path}`);
}

const expectedEventChanges = new Set([oldPath, "evenement/index.html"]);
const eventChanges = git("diff", "--name-status", BASE_SHA, "--", "evenement")
  .trim().split("\n").filter(Boolean).map((line) => {
    const [status, path] = line.split("\t");
    assert.equal(status, "M", `Modification événement interdite : ${line}`);
    return path;
  });
assert.deepEqual(new Set(eventChanges), expectedEventChanges, "Une autre page événement a été modifiée");

const baseEventCount = git("ls-tree", "-r", "--name-only", BASE_SHA, "--", "evenement")
  .split("\n").filter((path) => path.endsWith(".html")).length;
const currentEventCount = fs.readdirSync("evenement").filter((name) => name.endsWith(".html")).length;
assert.equal(currentEventCount, baseEventCount, "Aucune page événement ne doit être supprimée");

const trackedChanges = git("diff", "--name-only", BASE_SHA).trim().split("\n").filter(Boolean);
const untrackedChanges = git("ls-files", "--others", "--exclude-standard").trim().split("\n").filter(Boolean);
const allowedChanges = new Set([
  oldPath,
  "evenement/index.html",
  "sitemap-evenements.xml",
  "scripts/test-seo-v3-2e-quai-alias.mjs",
  ...reportHashes.keys(),
]);
assert.deepEqual(new Set([...trackedChanges, ...untrackedChanges]), allowedChanges, "Modification hors périmètre détectée");
assert.equal(git("diff", "--diff-filter=D", "--name-only", BASE_SHA).trim(), "", "Aucun fichier ne doit être supprimé");

console.log("SEO_V3_2E_QUAI_ALIAS_OK");
console.log("ALIASES=1");
console.log("SITEMAP_OLD_REMAINING=0");
console.log("INDEX_OLD_REMAINING=0");
console.log(`EVENT_PAGES=${currentEventCount}`);
