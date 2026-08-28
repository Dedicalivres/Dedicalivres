import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  'const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1"',
  "function rememberProductiveSources(",
  "function getResultsForProductiveSource(",
  "function buildProductiveSourceMetrics(",
  "observedCount",
  "completeCount",
  "reviewCount",
  "rejectedCount",
  "certainDuplicateCount",
  "probableDuplicateCount",
  "withImageCount",
  "withoutImageCount",
  "completenessRate",
  "imageRate",
  "duplicateRate",
  "function calculateProductiveSourceRate(",
  "function getProductiveSourceYieldScore(",
  "function getProductiveSourceYieldLevel(",
  "Rendement",
  "Excellent",
  "Bon",
  "Moyen",
  "Faible",
  "function sortProductiveSources(",
  "analysesCount",
  "firstSeenAt",
  "lastSeenAt",
  'data-watch-rerun-source="${escapeAttr(item.sourceUrl || "")}"',
  "Relancer",
  "function rerunProductiveSource("
];

for (const fragment of required) {
  assert.ok(
    source.includes(fragment),
    `Cockpit sources incomplet : ${fragment}`
  );
}

assert.ok(
  source.includes("...(previous || {})") &&
    source.includes("item?.observedCount ?? item?.totalCount") &&
    source.includes('return Array.isArray(parsed) ? parsed : []'),
  "Les anciennes entrées PRODUCTIVE_SOURCES_KEY doivent rester compatibles"
);

assert.ok(
  source.includes("Math.round((Number(count) / Number(total)) * 100)"),
  "Le calcul des taux de complétude, image et doublon est absent"
);

const scoreStart = source.indexOf("function getProductiveSourceYieldScore(");
const levelStart = source.indexOf("function getProductiveSourceYieldLevel(", scoreStart);
const scoreSource = source.slice(scoreStart, levelStart);

assert.ok(
  scoreSource.includes("completionRate") &&
    scoreSource.includes("imageRate") &&
    scoreSource.includes("100 - duplicateRate") &&
    scoreSource.includes("sampleFactor") &&
    !scoreSource.includes("Math.random") &&
    !scoreSource.includes("Date.now"),
  "Le score rendement doit être local, explicable et déterministe"
);

const sortStart = source.indexOf("function sortProductiveSources(");
const rerunStart = source.indexOf("function rerunProductiveSource(", sortStart);
const sortSource = source.slice(sortStart, rerunStart);
const scoreOrder = sortSource.indexOf("rightScore - leftScore");
const dateOrder = sortSource.indexOf("dateDifference");
const nameOrder = sortSource.indexOf("localeCompare");

assert.ok(
  scoreOrder >= 0 && dateOrder > scoreOrder && nameOrder > dateOrder,
  "Le tri doit appliquer rendement, puis date, puis nom"
);

const rememberStart = source.indexOf("function rememberProductiveSources(");
const resultsCountStart = source.indexOf("function countCompleteResults(", rememberStart);
const sourceIntelligence = source.slice(rememberStart, resultsCountStart);

assert.ok(
  sourceIntelligence.includes("previousAnalysesCount + 1") &&
    sourceIntelligence.includes("previous?.firstSeenAt || previous?.lastSeenAt || now") &&
    sourceIntelligence.includes("lastSeenAt: now"),
  "Le cumul léger analysesCount / firstSeenAt / lastSeenAt est incomplet"
);

assert.ok(
  !sourceIntelligence.includes("client.from(") &&
    !sourceIntelligence.includes("fetch(") &&
    !sourceIntelligence.includes("callWatchWorker("),
  "Le cockpit ne doit ajouter aucune dépendance serveur"
);

const rerunEnd = source.indexOf("function countCompleteResults(", rerunStart);
const rerunSource = source.slice(rerunStart, rerunEnd);

assert.ok(
  rerunSource.includes('document.getElementById("watch-urls")') &&
    rerunSource.includes("watchOffset = 0") &&
    rerunSource.includes('watchQueueFilter = "active"') &&
    rerunSource.includes("lastPagination = getEmptyPagination()") &&
    rerunSource.includes("analyzeUrls()"),
  "Relancer doit restaurer la source, la pagination et la file active avant analyzeUrls"
);

assert.equal(
  (source.match(/\.from\("events"\)\.insert\(/g) || []).length,
  1,
  "Le cockpit ne doit ajouter aucun insert Supabase"
);

console.log("ADMIN_WATCH_SOURCE_INTELLIGENCE_OK");
