import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE_SHA = "2e78158709c0545fba8828ec4099ff25141ae469";
const BASE_URL = "https://dedicalivres.fr/evenement/";
const VATAN_CANONICAL = "4eme-salon-du-livre-vatan-1289.html";
const PARAY_CANONICAL = "salon-du-livre-paray-le-monial-1283.html";
const QUAI_ALIAS = "bande-dessinee-quai-des-bulles-9-octobre-2026-au-11-octobre-2026-saint-5111.html";
const REPORT_HASHES = new Map([
  ["scripts/fixtures/seo-v3-2d-audit-remaining.tsv", "eb4a723633d3e9d9c46706f962ef86450b2299a2ec6c9ac4853aa60149ee9927"],
  ["scripts/fixtures/seo-v3-2d-future-classification.tsv", "772e4140dd9b5130a9f0c11a5eaf660e94691f15272edae30898983656e067fc"],
]);

const vatanAliases = ["3715", "3900", "3997", "4891", "4924", "5017"]
  .map((id) => `4eme-salon-du-livre-vatan-${id}.html`);
const parayAliases = ["3362", "3509", "3526", "3557", "3574", "3831", "3921", "4049", "4919", "4951", "5041"]
  .map((id) => `salon-du-livre-paray-le-monial-${id}.html`);
const mappings = [
  ...vatanAliases.map((source) => ({ source, target: VATAN_CANONICAL, date: "2026-11-22", city: "Vatan" })),
  ...parayAliases.map((source) => ({ source, target: PARAY_CANONICAL, date: "2026-09-26", city: "Paray-le-Monial" })),
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}

function sha256(path) {
  return createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

function eventJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]))
    .filter((item) => item["@type"] === "Event");
}

function aliasHtml(target) {
  const url = `${BASE_URL}${target}`;
  return `<!doctype html>\n<html lang="fr">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Fiche regroupée — Dédicalivres</title>\n  <meta name="description" content="Cette fiche événement a été regroupée avec sa fiche principale sur Dédicalivres.">\n  <link rel="canonical" href="${url}">\n  <meta http-equiv="refresh" content="0; url=${url}">\n  <script>\n    window.location.replace("${url}");\n  </script>\n</head>\n<body>\n  <main>\n    <h1>Fiche regroupée</h1>\n    <p>Cette fiche a été regroupée avec sa fiche principale.</p>\n    <p><a href="${url}">Consulter la fiche principale</a></p>\n  </main>\n</body>\n</html>\n`;
}

assert.equal(vatanAliases.length, 6);
assert.equal(parayAliases.length, 11);
assert.equal(mappings.length, 17);

for (const { source, target, date, city } of mappings) {
  const path = `evenement/${source}`;
  const targetUrl = `${BASE_URL}${target}`;
  assert.ok(fs.existsSync(path), `Alias absent : ${path}`);
  const before = git("show", `${BASE_SHA}:${path}`);
  const eventsBefore = eventJsonLd(before);
  assert.equal(eventsBefore.length, 1, `La fiche initiale doit contenir un Event : ${source}`);
  assert.equal(eventsBefore[0].startDate, date, `Date initiale inattendue : ${source}`);
  assert.equal(eventsBefore[0].location.address.addressLocality, city, `Ville initiale inattendue : ${source}`);

  const html = fs.readFileSync(path, "utf8");
  assert.equal(html, aliasHtml(target), `Modèle d’alias inattendu : ${source}`);
  assert.equal(occurrences(html, `<link rel="canonical" href="${targetUrl}">`), 1);
  assert.equal(occurrences(html, `<meta http-equiv="refresh" content="0; url=${targetUrl}">`), 1);
  assert.equal(occurrences(html, `window.location.replace("${targetUrl}");`), 1);
  assert.equal(occurrences(html, `<a href="${targetUrl}">Consulter la fiche principale</a>`), 1);
  assert.ok(html.includes("Cette fiche a été regroupée avec sa fiche principale."));
  assert.ok(!/application\/ld\+json/i.test(html), `JSON-LD résiduel : ${source}`);
  assert.ok(!/"@type"\s*:\s*"Event"/i.test(html), `Event résiduel : ${source}`);
  assert.ok(!/noindex/i.test(html), `noindex inattendu : ${source}`);
}

const canonicalHashes = new Map([
  [VATAN_CANONICAL, "211dffdfb4d1bc54e8754a480af0fcaba4654c6bcdbac3d02e12748ac4b89703"],
  [PARAY_CANONICAL, "a70a6ff4c73f094205da9dfa6330547adf03936c65a6755e50180e6d0f559fd3"],
]);
for (const [canonical, expectedHash] of canonicalHashes) {
  const path = `evenement/${canonical}`;
  assert.ok(fs.existsSync(path), `Canonique absente : ${canonical}`);
  assert.equal(fs.readFileSync(path, "utf8"), git("show", `${BASE_SHA}:${path}`), `Canonique modifiée : ${canonical}`);
  assert.equal(sha256(path), expectedHash, `SHA canonique modifié : ${canonical}`);
  assert.equal(eventJsonLd(fs.readFileSync(path, "utf8")).length, 1, `Event canonique absent : ${canonical}`);
}

const quaiPath = `evenement/${QUAI_ALIAS}`;
const quai = fs.readFileSync(quaiPath, "utf8");
assert.equal(quai, git("show", `${BASE_SHA}:${quaiPath}`), "L’alias Quai des Bulles doit rester intact");
assert.equal(sha256(quaiPath), "3d570a57bfd3422a0feb4502b06f6cf4ad7b2db6df4e2983f44ee0132fe9d377");

const sitemap = fs.readFileSync("sitemap-evenements.xml", "utf8");
const sitemapBefore = git("show", `${BASE_SHA}:sitemap-evenements.xml`);
const index = fs.readFileSync("evenement/index.html", "utf8");
const indexBefore = git("show", `${BASE_SHA}:evenement/index.html`);
for (const { source } of mappings) {
  const sourceUrl = `${BASE_URL}${source}`;
  assert.equal(occurrences(sitemapBefore, sourceUrl), 1, `URL initiale sitemap inattendue : ${source}`);
  assert.equal(occurrences(sitemap, sourceUrl), 0, `Ancienne URL encore dans le sitemap : ${source}`);
  assert.equal(occurrences(indexBefore, source), 1, `Référence initiale index inattendue : ${source}`);
  assert.equal(occurrences(index, source), 0, `Ancienne référence encore dans l’index : ${source}`);
}
for (const canonical of canonicalHashes.keys()) {
  const canonicalUrl = `${BASE_URL}${canonical}`;
  assert.equal(occurrences(sitemap, canonicalUrl), 1, `Canonique sitemap absente ou dupliquée : ${canonical}`);
  assert.equal(occurrences(index, canonical), 1, `Canonique index absente ou dupliquée : ${canonical}`);
}

for (const [path, expectedHash] of REPORT_HASHES) {
  assert.ok(fs.existsSync(path), `Rapport d’audit absent : ${path}`);
  assert.equal(sha256(path), expectedHash, `Rapport d’audit modifié : ${path}`);
}

const expectedEventChanges = new Set([
  ...mappings.map(({ source }) => `evenement/${source}`),
  "evenement/index.html",
]);
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
assert.equal(currentEventCount, baseEventCount, "Le nombre de pages événement doit rester identique");

const trackedChanges = git("diff", "--name-only", BASE_SHA).trim().split("\n").filter(Boolean);
const untrackedChanges = git("ls-files", "--others", "--exclude-standard").trim().split("\n").filter(Boolean);
const allowedChanges = new Set([
  ...expectedEventChanges,
  "sitemap-evenements.xml",
  "scripts/test-seo-v3-2h-vatan-paray-aliases.mjs",
  ...REPORT_HASHES.keys(),
]);
assert.deepEqual(new Set([...trackedChanges, ...untrackedChanges]), allowedChanges, "Modification hors périmètre détectée");
assert.equal(git("diff", "--diff-filter=D", "--name-only", BASE_SHA).trim(), "", "Aucun fichier ne doit être supprimé");

console.log("SEO_V3_2H_VATAN_PARAY_ALIASES_OK");
console.log(`VATAN_ALIASES=${vatanAliases.length}`);
console.log(`PARAY_ALIASES=${parayAliases.length}`);
console.log(`ALIASES=${mappings.length}`);
console.log("SITEMAP_OLD_REMAINING=0");
console.log("INDEX_OLD_REMAINING=0");
console.log(`EVENT_PAGES=${currentEventCount}`);
