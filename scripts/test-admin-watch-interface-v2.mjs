import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");
const css = fs.readFileSync("admin-v11.css", "utf8");

function sliceFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `Fonction ${name} introuvable`);
  return source.slice(start, end);
}

// A/B — quatre vues, un seul panneau visible au chargement, puis masquage piloté.
for (const view of ["candidates", "event-watch", "sources", "search"]) {
  assert.ok(source.includes(`data-watch-workspace-view="${view}"`), `Onglet ${view} absent`);
  assert.ok(source.includes(`data-watch-workspace-panel="${view}"`), `Panneau ${view} absent`);
}
const interfaceSource = sliceFunction("injectInterface", "bindControls");
const panelTags = [...interfaceSource.matchAll(/<article[^>]+data-watch-workspace-panel="([^"]+)"[^>]*>/g)];
assert.equal(panelTags.length, 4, "Le cockpit doit exposer exactement quatre vues principales");
assert.deepEqual(
  panelTags.filter((match) => !/\shidden(?:\s|>)/.test(match[0])).map((match) => match[1]),
  ["candidates"],
  "Candidats doit être la seule vue active au chargement"
);
const switchSource = sliceFunction("switchWatchWorkspaceView", "handleWatchWorkspaceKeydown");
assert.ok(switchSource.includes("panel.hidden = panel.dataset.watchWorkspacePanel !== view"));

// C — les compteurs dirigent vers la vue et le filtre correspondants.
const controlsSource = sliceFunction("bindControls", "switchWatchWorkspaceView");
assert.ok(controlsSource.includes("[data-watch-summary-filter]"));
assert.ok(controlsSource.includes("watchQueueFilter = String(button.dataset.watchSummaryFilter"));
assert.ok(controlsSource.includes('switchWatchWorkspaceView("candidates")'));
assert.ok(controlsSource.includes("[data-watch-summary-view]"));

// D/E — la file réunit le snapshot serveur et conserve les filtres workflow.
const queueSource = sliceFunction("buildWatchCandidateQueue", "adoptServerWatchCandidate");
assert.ok(queueSource.includes("watchPersistenceSnapshot.candidates"));
assert.ok(queueSource.includes("watchPersistenceSnapshot.candidates.forEach"));
assert.ok(source.includes("const queueResults = buildWatchCandidateQueue"));
assert.ok(source.includes(".filter((item) => matchesWatchQueueFilter(item.state, item.result))"));
assert.ok(source.includes("data-watch-filter-count"));
assert.ok(source.includes("data-watch-summary-count"));

// F/G — une fiche riche garde ses outils dans Examiner, une fiche serveur seule reste minimale.
const cardSource = sliceFunction("renderResultCard", "renderWatchCandidateEditor");
assert.ok(cardSource.includes("data-watch-examine"));
assert.ok(cardSource.includes("data-watch-candidate-detail"));
assert.ok(cardSource.includes("renderWatchCandidateEditor(result, index)"));
assert.ok(cardSource.includes("renderWatchSubmissionPreview(result, index)"));
assert.ok(cardSource.includes('isServerOnly ? " is-server-only"'));
assert.ok(cardSource.includes('isActiveWorkflow && (!isServerOnly || (workflowState === "ready" && hasDurableContent))'));

// H — les décisions continuent d'emprunter la persistance optimiste existante.
const workflowSource = sliceFunction("setWatchWorkflowState", "getStoredWatchWorkflowState");
assert.ok(workflowSource.includes("persistCandidateWorkflowDecision("));
assert.ok(source.includes("serverVersion"));

// I — l'import local existe toujours mais se trouve dans la maintenance repliée.
const detailsIndex = interfaceSource.indexOf('class="watch-system-details"');
const importIndex = interfaceSource.indexOf('id="watch-import-local-btn"');
const detailsEnd = interfaceSource.indexOf("</details>", detailsIndex);
assert.ok(detailsIndex >= 0 && importIndex > detailsIndex && importIndex < detailsEnd);
assert.ok(interfaceSource.includes('id="watch-import-confirm-btn"'));

// J — l'indisponibilité Auto-Matte reste locale à sa vue et n'altère pas le cockpit.
const eventLoadSource = sliceFunction("loadEventWatchAlerts", "renderEventWatchAlerts");
assert.ok(eventLoadSource.includes("Auto-Matte local indisponible"));
assert.ok(eventLoadSource.includes("Le reste de l’administration demeure disponible"));
assert.ok(!switchSource.includes("fetch("));

// K — aucune nouvelle publication automatique n'est introduite.
assert.equal((source.match(/\.from\("events"\)\.insert\(/g) || []).length, 1);
assert.ok(!source.includes("setInterval("));

// L — tabs, clavier, états aria, focus et responsive principaux.
assert.ok(interfaceSource.includes('role="tablist"'));
assert.ok(interfaceSource.includes('role="tab"'));
assert.ok(interfaceSource.includes('aria-selected="true"'));
const keyboardSource = sliceFunction("handleWatchWorkspaceKeydown", "updateWatchOperationsDashboard");
for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
  assert.ok(keyboardSource.includes(`"${key}"`), `Navigation clavier ${key} absente`);
}
assert.ok(css.includes("#tab-watch .watch-workspace-panel[hidden]"));
assert.ok(css.includes("@media (max-width: 1100px)"));
assert.ok(css.includes("@media (max-width: 768px)"));
assert.ok(css.includes("@media (max-width: 480px)"));
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
assert.ok(css.includes(":focus-visible"));

console.log("ADMIN_WATCH_INTERFACE_V2_OK");
