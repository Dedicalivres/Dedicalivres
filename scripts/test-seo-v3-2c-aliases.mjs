import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE_SHA = "3d2ee57bc1eaf9c1db887cf4f7c7605f93debd63";
const PILOT_SHA = "a6591ebf1ff0ef6da7b941e2ad62a9d5908feb2f";
const BASE_URL = "https://dedicalivres.fr/evenement/";
const MAPPING_PATH = "scripts/fixtures/seo-v3-2-exact-stale-mapping.txt";
const NON_EXACT_PATH = "scripts/fixtures/seo-v3-2-absent-non-exacts.txt";
const PILOT_ALIASES = new Set([
  "1er-salon-du-livre-saint-sulpice-le-gueretois-4907.html",
  "1er-salon-du-livre-saint-sulpice-le-gueretois-4939.html",
  "1er-salon-du-livre-saint-sulpice-le-gueretois-5030.html",
]);
const VATAN_PAGES = [
  "4eme-salon-du-livre-vatan-3715.html",
  "4eme-salon-du-livre-vatan-3900.html",
  "4eme-salon-du-livre-vatan-3997.html",
  "4eme-salon-du-livre-vatan-4891.html",
  "4eme-salon-du-livre-vatan-4924.html",
  "4eme-salon-du-livre-vatan-5017.html",
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}

function lines(path) {
  return fs.readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean);
}

function baseFile(path, sha = BASE_SHA) {
  return git("show", `${sha}:${path}`);
}

function aliasHtml(target) {
  const url = `${BASE_URL}${target}`;
  return `<!doctype html>\n<html lang="fr">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Fiche regroupée — Dédicalivres</title>\n  <meta name="description" content="Cette fiche événement a été regroupée avec sa fiche principale sur Dédicalivres.">\n  <link rel="canonical" href="${url}">\n  <meta http-equiv="refresh" content="0; url=${url}">\n  <script>\n    window.location.replace("${url}");\n  </script>\n</head>\n<body>\n  <main>\n    <h1>Fiche regroupée</h1>\n    <p>Cette fiche a été regroupée avec sa fiche principale.</p>\n    <p><a href="${url}">Consulter la fiche principale</a></p>\n  </main>\n</body>\n</html>\n`;
}

const mappings = lines(MAPPING_PATH).map((line, index) => {
  const parts = line.split(" -> ");
  assert.equal(parts.length, 2, `Mapping invalide ligne ${index + 1}`);
  const [source, target] = parts;
  assert.match(source, /^[a-z0-9][a-z0-9-]*\.html$/, `Source hors evenement/ : ${source}`);
  assert.match(target, /^[a-z0-9][a-z0-9-]*\.html$/, `Cible hors evenement/ : ${target}`);
  return { source, target };
});
const sources = new Set(mappings.map(({ source }) => source));
const canonicals = new Set(mappings.map(({ target }) => target));

assert.equal(mappings.length, 183, "Le mapping doit contenir exactement 183 lignes");
assert.equal(sources.size, 183, "Les 183 sources doivent être uniques");
assert.equal(canonicals.size, 20, "Le mapping doit contenir exactement 20 canoniques");
assert.equal([...sources].filter((source) => canonicals.has(source)).length, 0, "Source/cible chevauchée");
assert.equal([...PILOT_ALIASES].filter((source) => sources.has(source)).length, 3, "Pilote incomplet");

for (const { source, target } of mappings) {
  const path = `evenement/${source}`;
  const targetPath = `evenement/${target}`;
  assert.ok(fs.existsSync(path), `Alias absent : ${path}`);
  assert.ok(fs.existsSync(targetPath), `Canonique absente : ${targetPath}`);
  const html = fs.readFileSync(path, "utf8");
  const targetUrl = `${BASE_URL}${target}`;

  assert.equal(html, aliasHtml(target), `Contenu d’alias inattendu : ${source}`);
  assert.match(html, /^<!doctype html>/i, `Doctype absent : ${source}`);
  assert.match(html, /<html lang="fr">[\s\S]*<head>[\s\S]*<\/head>[\s\S]*<body>[\s\S]*<\/body>[\s\S]*<\/html>\s*$/i);
  assert.equal((html.match(/<link\s+rel="canonical"\s+href="[^"]+"\s*>/g) || []).length, 1);
  assert.equal(occurrences(html, `<link rel="canonical" href="${targetUrl}">`), 1);
  assert.equal(occurrences(html, `<meta http-equiv="refresh" content="0; url=${targetUrl}">`), 1);
  assert.equal(occurrences(html, `window.location.replace("${targetUrl}");`), 1);
  assert.equal(occurrences(html, `<a href="${targetUrl}">Consulter la fiche principale</a>`), 1);
  assert.ok(html.includes("Cette fiche a été regroupée avec sa fiche principale."));
  assert.ok(!/application\/ld\+json/i.test(html), `JSON-LD résiduel : ${source}`);
  assert.ok(!/"@type"\s*:\s*"Event"/i.test(html), `Event JSON-LD résiduel : ${source}`);
  assert.ok(!/noindex/i.test(html), `noindex inattendu : ${source}`);
}

for (const canonical of canonicals) {
  const path = `evenement/${canonical}`;
  const html = fs.readFileSync(path, "utf8");
  assert.equal(html, baseFile(path), `Canonique modifiée : ${canonical}`);
  assert.ok(!html.includes("Cette fiche a été regroupée avec sa fiche principale."), `Canonique transformée en alias : ${canonical}`);
  assert.ok(!/http-equiv="refresh"/i.test(html), `Canonique avec refresh : ${canonical}`);
  assert.ok(!/window\.location\.replace\(/.test(html), `Canonique avec redirection JS : ${canonical}`);
}

for (const source of PILOT_ALIASES) {
  const path = `evenement/${source}`;
  assert.equal(fs.readFileSync(path, "utf8"), baseFile(path, PILOT_SHA), `Pilote modifié : ${source}`);
}

const sitemap = fs.readFileSync("sitemap-evenements.xml", "utf8");
const sitemapBefore = baseFile("sitemap-evenements.xml");
const index = fs.readFileSync("evenement/index.html", "utf8");
const indexBefore = baseFile("evenement/index.html");

for (const { source } of mappings) {
  const sourceUrl = `${BASE_URL}${source}`;
  assert.equal(occurrences(sitemapBefore, sourceUrl), 1, `Source initiale sitemap inattendue : ${source}`);
  assert.equal(occurrences(sitemap, sourceUrl), 0, `Alias encore dans le sitemap : ${source}`);
  assert.equal(occurrences(indexBefore, source), 1, `Source initiale index inattendue : ${source}`);
  assert.equal(occurrences(index, source), 0, `Alias encore dans l’index : ${source}`);
}

for (const canonical of canonicals) {
  const canonicalUrl = `${BASE_URL}${canonical}`;
  const sitemapCountBefore = occurrences(sitemapBefore, canonicalUrl);
  const indexCountBefore = occurrences(indexBefore, canonical);
  assert.equal(occurrences(sitemap, canonicalUrl), sitemapCountBefore, `Canonique altérée dans le sitemap : ${canonical}`);
  assert.equal(occurrences(index, canonical), indexCountBefore, `Canonique altérée dans l’index : ${canonical}`);
}

const nonExactPages = lines(NON_EXACT_PATH);
assert.equal(nonExactPages.length, 273, "Le rapport hors périmètre doit contenir 273 pages");
assert.equal(new Set(nonExactPages).size, 273, "Les pages hors périmètre doivent être uniques");
for (const page of nonExactPages) {
  assert.match(page, /^[a-z0-9][a-z0-9-]*\.html$/, `Page hors périmètre invalide : ${page}`);
  const path = `evenement/${page}`;
  assert.ok(fs.existsSync(path), `Page hors périmètre absente : ${page}`);
  assert.equal(fs.readFileSync(path, "utf8"), baseFile(path), `Page hors périmètre modifiée : ${page}`);
}

assert.equal(VATAN_PAGES.length, 6);
for (const page of VATAN_PAGES) {
  const path = `evenement/${page}`;
  assert.ok(fs.existsSync(path), `Page Vatan absente : ${page}`);
  assert.equal(fs.readFileSync(path, "utf8"), baseFile(path), `Page Vatan modifiée : ${page}`);
}

const baseEventPages = git("ls-tree", "-r", "--name-only", BASE_SHA, "--", "evenement")
  .split("\n")
  .filter((path) => path.endsWith(".html"));
const currentEventPages = fs.readdirSync("evenement").filter((name) => name.endsWith(".html"));
assert.equal(currentEventPages.length, baseEventPages.length, "Le nombre de pages événement doit rester identique");

const expectedEventChanges = new Set([
  ...[...sources].map((source) => `evenement/${source}`),
  "evenement/index.html",
]);
const eventChanges = git("diff", "--name-status", BASE_SHA, "--", "evenement")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, path] = line.split("\t");
    assert.equal(status, "M", `Modification événement interdite : ${line}`);
    return path;
  });
assert.deepEqual(new Set(eventChanges), expectedEventChanges, "Un fichier événement hors périmètre a été modifié");

const trackedChanges = git("diff", "--name-status", BASE_SHA)
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split("\t").at(-1));
const untrackedChanges = git("ls-files", "--others", "--exclude-standard").trim().split("\n").filter(Boolean);
const allowedChanges = new Set([
  ...expectedEventChanges,
  "sitemap-evenements.xml",
  "scripts/test-seo-v3-2c-bis-alias.mjs",
  "scripts/test-seo-v3-2c-aliases.mjs",
  MAPPING_PATH,
  NON_EXACT_PATH,
]);
assert.deepEqual(new Set([...trackedChanges, ...untrackedChanges]), allowedChanges, "Modification hors périmètre détectée");
assert.equal(git("diff", "--diff-filter=D", "--name-only", BASE_SHA).trim(), "", "Aucun fichier ne doit être supprimé");

console.log("SEO_V3_2C_ALIASES_OK");
console.log(`MAPPINGS=${mappings.length}`);
console.log(`ALIASES=${sources.size}`);
console.log(`NEW_ALIASES=${sources.size - PILOT_ALIASES.size}`);
console.log(`CANONICALS=${canonicals.size}`);
console.log("SITEMAP_OLD_REMAINING=0");
console.log("INDEX_OLD_REMAINING=0");
console.log(`EVENT_PAGES_BASE=${baseEventPages.length}`);
console.log(`EVENT_PAGES_CURRENT=${currentEventPages.length}`);
console.log(`NON_EXACT_INTACT=${nonExactPages.length}`);
console.log(`VATAN_INTACT=${VATAN_PAGES.length}`);
