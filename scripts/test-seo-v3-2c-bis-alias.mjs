import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE_SHA = "3d2ee57bc1eaf9c1db887cf4f7c7605f93debd63";
const PILOT_SHA = "a6591ebf1ff0ef6da7b941e2ad62a9d5908feb2f";
const prefix = "1er-salon-du-livre-saint-sulpice-le-gueretois";
const aliases = [`${prefix}-4907.html`, `${prefix}-4939.html`, `${prefix}-5030.html`];
const canonicalName = `${prefix}-4024.html`;
const canonicalUrl = `https://dedicalivres.fr/evenement/${canonicalName}`;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}

for (const alias of aliases) {
  const path = `evenement/${alias}`;
  assert.ok(fs.existsSync(path), `Alias absent : ${path}`);
  const html = fs.readFileSync(path, "utf8");

  assert.match(html, /^<!doctype html>/i, `Doctype absent : ${alias}`);
  assert.match(html, /<html lang="fr">[\s\S]*<head>[\s\S]*<\/head>[\s\S]*<body>[\s\S]*<\/body>[\s\S]*<\/html>\s*$/i);
  assert.equal(
    (html.match(/<link\s+rel="canonical"\s+href="[^"]+"\s*>/g) || []).length,
    1,
    `Canonical unique attendu : ${alias}`
  );
  assert.ok(
    html.includes(`<link rel="canonical" href="${canonicalUrl}">`),
    `Canonical incorrect : ${alias}`
  );
  assert.equal(
    occurrences(html, `<meta http-equiv="refresh" content="0; url=${canonicalUrl}">`),
    1,
    `Meta refresh incorrect : ${alias}`
  );
  assert.equal(
    occurrences(html, `window.location.replace("${canonicalUrl}");`),
    1,
    `Fallback JavaScript incorrect : ${alias}`
  );
  assert.ok(html.includes("Cette fiche a été regroupée avec sa fiche principale."));
  assert.ok(html.includes(`<a href="${canonicalUrl}">Consulter la fiche principale</a>`));
  assert.ok(!html.includes("application/ld+json"), `JSON-LD résiduel : ${alias}`);
  assert.ok(!html.includes('"@type": "Event"'), `Event JSON-LD résiduel : ${alias}`);
  assert.ok(!/noindex/i.test(html), `noindex inattendu : ${alias}`);
  assert.equal(html, git("show", `${PILOT_SHA}:${path}`), `Alias pilote modifié : ${alias}`);
}

const canonicalPath = `evenement/${canonicalName}`;
assert.equal(
  fs.readFileSync(canonicalPath, "utf8"),
  git("show", `${BASE_SHA}:${canonicalPath}`),
  "La page canonique 4024 ne doit pas être modifiée"
);

const sitemap = fs.readFileSync("sitemap-evenements.xml", "utf8");
const sitemapBefore = git("show", `${BASE_SHA}:sitemap-evenements.xml`);
const index = fs.readFileSync("evenement/index.html", "utf8");
const indexBefore = git("show", `${BASE_SHA}:evenement/index.html`);

for (const alias of aliases) {
  const oldUrl = `https://dedicalivres.fr/evenement/${alias}`;
  assert.equal(occurrences(sitemapBefore, oldUrl), 1, `URL initiale sitemap inattendue : ${alias}`);
  assert.equal(occurrences(sitemap, oldUrl), 0, `Alias encore dans le sitemap : ${alias}`);
  assert.equal(occurrences(indexBefore, alias), 1, `Référence initiale index inattendue : ${alias}`);
  assert.equal(occurrences(index, alias), 0, `Alias encore dans l’index : ${alias}`);
}

assert.equal(occurrences(sitemapBefore, canonicalUrl), 1);
assert.equal(occurrences(sitemap, canonicalUrl), 1, "Canonique absente ou dupliquée dans le sitemap");
assert.equal(occurrences(indexBefore, canonicalName), 1);
assert.equal(occurrences(index, canonicalName), 1, "Canonique absente ou dupliquée dans l’index");

const baseEventCount = git("ls-tree", "-r", "--name-only", BASE_SHA, "--", "evenement")
  .split("\n")
  .filter((path) => path.endsWith(".html")).length;
const currentEventCount = fs.readdirSync("evenement").filter((name) => name.endsWith(".html")).length;
assert.equal(currentEventCount, baseEventCount, "Aucune page événement ne doit être supprimée");

console.log("SEO_V3_2C_BIS_ALIAS_OK");
console.log(`ALIASES=${aliases.length}`);
console.log("SITEMAP_REMOVED=3");
console.log("INDEX_REMOVED=3");
