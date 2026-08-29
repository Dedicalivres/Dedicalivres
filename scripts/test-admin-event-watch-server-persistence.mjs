import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("admin-watch.js", "utf8");

const required = [
  "async function buildServerEventWatchAlertPayload(",
  "async function insertServerEventWatchAlert(",
  "async function updateServerEventWatchAlertOptimistically(",
  "async function persistEventWatchDecision(",
  "function adoptServerEventWatchAlert(",
  '.from("admin_event_watch_alerts")',
  '.insert([payload])',
  '.update({ workflow_status: nextWorkflowStatus })',
  '.eq("id", serverAlert.id)',
  '.eq("version", Number(expectedVersion))',
  'String(error?.code || "") === "23505"',
  "Décision Event Watch enregistrée localement.",
  "Cette décision Event Watch a été modifiée dans une autre session."
];

for (const fragment of required) {
  assert.ok(source.includes(fragment), `Persistance Event Watch incomplète : ${fragment}`);
}

const writerStart = source.indexOf("function adoptServerEventWatchAlert(");
const writerEnd = source.indexOf("function resolveWatchPersistenceWorkflow(", writerStart);
const writerSource = source.slice(writerStart, writerEnd);

assert.equal((writerSource.match(/\.insert\(/g) || []).length, 1, "Un seul point d’INSERT Event Watch est autorisé");
assert.equal((writerSource.match(/\.update\(/g) || []).length, 1, "Un seul point d’UPDATE Event Watch est autorisé");
for (const forbidden of [
  ".upsert(",
  ".delete(",
  ".rpc(",
  "service_role",
  'from("events")',
  'from("admin_watch_candidates")',
  'from("admin_watch_sources")',
  'from("admin_watch_transitions")',
  "setInterval(",
  "fetch("
]) {
  assert.ok(!writerSource.includes(forbidden), `Opération interdite dans le writer Event Watch : ${forbidden}`);
}

const loadStart = source.indexOf("async function loadEventWatchAlerts(");
const renderStart = source.indexOf("function renderEventWatchAlerts(", loadStart);
const keyStart = source.indexOf("function getEventWatchAlertKey(", renderStart);
const loadSource = source.slice(loadStart, renderStart);
const renderSource = source.slice(renderStart, keyStart);
assert.ok(!loadSource.includes('from("admin_event_watch_alerts")'), "Le chargement bridge ne doit pas écrire côté serveur");
assert.ok(!renderSource.includes('from("admin_event_watch_alerts")'), "Le rendu ne doit pas écrire côté serveur");

const bindStart = source.indexOf("function bindControls(");
const analyzeStart = source.indexOf("async function analyzeUrls(", bindStart);
const bindSource = source.slice(bindStart, analyzeStart);
const filterStart = bindSource.indexOf('document.querySelectorAll("[data-event-watch-filter]")');
const categoryStart = bindSource.indexOf('document.querySelectorAll("[data-event-watch-category]")', filterStart);
const filterSource = bindSource.slice(filterStart, categoryStart);
assert.ok(
  filterSource.includes("renderEventWatchAlerts()") &&
    !filterSource.includes("persistEventWatchDecision") &&
    !filterSource.includes('from("admin_event_watch_alerts")'),
  "Un filtre Event Watch doit rester un rendu local sans persistance"
);

assert.ok(!source.includes("setInterval("), "Aucun polling ne doit être ajouté");
assert.equal((source.match(/\.from\("events"\)\.insert\(/g) || []).length, 1, "Aucun write events supplémentaire");

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__EVENT_WATCH_PERSISTENCE_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    setBridgeAlerts(value) { eventWatchAlerts = value; },
    getBridgeAlerts() { return eventWatchAlerts; },
    setFilter(value) { eventWatchQueueFilter = value; },
    renderEventWatchAlerts,
    getEventWatchWorkflowState,
    setEventWatchWorkflowState,
    persistEventWatchDecision,
    buildServerEventWatchAlertPayload,
    updateServerEventWatchAlertOptimistically
  };
})();
`);

const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};
const document = {
  readyState: "loading",
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  createElement() { return { dataset: {}, style: {}, appendChild() {} }; },
  head: { appendChild() {} }
};
const sandbox = {
  AbortController,
  URL,
  Date,
  Error,
  Map,
  Set,
  Promise,
  Number,
  String,
  Array,
  Object,
  Math,
  JSON,
  RegExp,
  TextEncoder,
  Uint8Array,
  console,
  document,
  localStorage,
  setTimeout,
  clearTimeout,
  navigator: {},
  crypto: globalThis.crypto
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.requestAnimationFrame = (callback) => callback();

vm.runInNewContext(instrumented, sandbox, { filename: "admin-watch.js" });
const api = sandbox.__EVENT_WATCH_PERSISTENCE_TEST_API__;
assert.ok(api, "API de test persistance Event Watch indisponible");

function createEventWatchClient({ inserts = [], updates = [], reads = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", payload: null, filters: [], columns: "", limit: null };
      calls.push(call);
      const builder = {
        insert(payload) {
          call.operation = "insert";
          call.payload = payload;
          return this;
        },
        update(payload) {
          call.operation = "update";
          call.payload = payload;
          return this;
        },
        select(columns) {
          if (!call.operation) call.operation = "select";
          call.columns = columns;
          return this;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return this;
        },
        limit(value) {
          call.limit = value;
          return this;
        },
        abortSignal() { return this; },
        then(resolve, reject) {
          const queue = call.operation === "insert"
            ? inserts
            : call.operation === "update"
              ? updates
              : reads;
          const response = queue.length ? queue.shift() : { data: [], error: null };
          return Promise.resolve(response).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

const EVENT_WORKFLOW_KEY = "dedicalivres_admin_event_watch_workflow_v1";
const alertId = "00000000-0000-4000-8000-0000000005f0";
const eventId = "00000000-0000-4000-8000-0000000005f1";
const bridgeAlert = {
  id: "engine-alert-5g",
  dedicalivres_event_id: eventId,
  field: "date",
  field_label: "Date",
  event_title: "Festival du test",
  event_date: "2026-10-10",
  event_city: "Paris",
  old_value: "2026-10-10",
  new_value: "2026-10-11",
  source: "https://events.example/festival#programme",
  proof: { text: "Date annoncée : 11 octobre", url: "https://events.example/festival" },
  detected_at: "2026-08-29T08:00:00.000Z",
  confidence: 92,
  status_label: "Changement probable"
};

function serverRow(overrides = {}) {
  return {
    id: alertId,
    identity_key: "event-watch:v1:stable-test",
    engine_origin: "automatte-local",
    engine_alert_id: bridgeAlert.id,
    event_id: eventId,
    field: bridgeAlert.field,
    field_label: bridgeAlert.field_label,
    event_title: bridgeAlert.event_title,
    event_date: bridgeAlert.event_date,
    event_city: bridgeAlert.event_city,
    old_value: bridgeAlert.old_value,
    new_value: bridgeAlert.new_value,
    source_url: "https://events.example/festival",
    proof: bridgeAlert.proof,
    detected_at: bridgeAlert.detected_at,
    confidence: 0.92,
    status_label: bridgeAlert.status_label,
    workflow_status: "review",
    status_updated_at: "2026-08-29T08:00:00.000Z",
    version: 1,
    ...overrides
  };
}

function resetState(snapshot = {}) {
  localStorage.clear();
  const alerts = [{ ...bridgeAlert }];
  api.setBridgeAlerts(alerts);
  api.setSnapshot({ availability: "server", eventAlerts: [], ...snapshot });
  return alerts;
}

// A-D/AD. Chargement logique, rendu et filtre ne déclenchent aucune écriture.
const passiveClient = createEventWatchClient();
api.setClient(passiveClient);
const passiveAlerts = resetState();
api.renderEventWatchAlerts();
api.setFilter("handled");
api.renderEventWatchAlerts();
assert.equal(passiveClient.calls.length, 0, "Une alerte bridge sans décision ne doit jamais être persistée");
assert.equal(api.getBridgeAlerts(), passiveAlerts, "Le rendu ne doit pas remplacer les alertes bridge");

// E/N/O/AA/AB. Une décision explicite sur une alerte absente produit un seul INSERT compact et adopte la ligne.
const insertedRow = serverRow({ workflow_status: "confirmed", version: 1 });
const insertClient = createEventWatchClient({ inserts: [{ data: [insertedRow], error: null }] });
api.setClient(insertClient);
const insertedBridge = resetState();
const insertResult = await api.setEventWatchWorkflowState(insertedBridge[0], "confirmed");
assert.equal(insertResult.status, "success");
assert.equal(insertClient.calls.filter((call) => call.operation === "insert").length, 1);
assert.equal(insertClient.calls.filter((call) => call.operation === "update").length, 0);
const insertPayload = insertClient.calls[0].payload[0];
assert.equal(insertPayload.event_id, eventId, "Le UUID event valide doit être conservé");
assert.equal(insertPayload.workflow_status, "confirmed");
assert.equal(insertPayload.confidence, 0.92);
assert.equal(insertPayload.engine_alert_id, bridgeAlert.id);
assert.ok(insertPayload.identity_key.startsWith("event-watch:v1:"));
assert.equal(api.getSnapshot().eventAlerts[0].id, alertId);
assert.equal(api.getBridgeAlerts(), insertedBridge, "L’adoption serveur ne doit pas remplacer le tableau bridge");

const invalidUuidPayload = await api.buildServerEventWatchAlertPayload(
  { ...bridgeAlert, id: "engine-invalid-uuid", dedicalivres_event_id: "not-a-uuid" },
  "invalid-workflow"
);
assert.equal(invalidUuidPayload.event_id, null, "Un faux UUID ne doit pas être inventé ou transmis");
assert.equal(invalidUuidPayload.workflow_status, "review", "Un workflow invalide doit être sécurisé");
const firstIdentity = (await api.buildServerEventWatchAlertPayload({ ...bridgeAlert }, "handled")).identity_key;
const secondIdentity = (await api.buildServerEventWatchAlertPayload({ ...bridgeAlert }, "ignored")).identity_key;
assert.equal(firstIdentity, secondIdentity, "L’identité doit être stable et indépendante de la décision");

// F/T. Une alerte existante produit zéro INSERT et un UPDATE verrouillé par id + version.
const updatedRow = serverRow({ workflow_status: "handled", version: 2 });
const updateClient = createEventWatchClient({ updates: [{ data: [updatedRow], error: null }] });
api.setClient(updateClient);
const updateBridge = resetState({ eventAlerts: [serverRow()] });
const updateResult = await api.setEventWatchWorkflowState(updateBridge[0], "handled");
assert.equal(updateResult.status, "success");
assert.equal(updateClient.calls.filter((call) => call.operation === "insert").length, 0);
assert.equal(updateClient.calls.filter((call) => call.operation === "update").length, 1);
assert.deepEqual(updateClient.calls[0].filters, [["id", alertId], ["version", 1]]);
assert.equal(updateClient.calls[0].payload.workflow_status, "handled");

// Q/R. Un état serveur fermé gagne et n’est jamais rouvert par un local actif.
for (const closedState of ["ignored", "handled"]) {
  const closedClient = createEventWatchClient();
  api.setClient(closedClient);
  const closedBridge = resetState({ eventAlerts: [serverRow({ workflow_status: closedState, version: 4 })] });
  const result = await api.setEventWatchWorkflowState(closedBridge[0], "confirmed");
  assert.equal(result.status, "conflict");
  assert.equal(closedClient.calls.length, 0);
  assert.equal(api.getEventWatchWorkflowState(closedBridge[0]), closedState);
}

// S. Une violation UNIQUE produit une relecture, aucun second INSERT, puis l’UPDATE nécessaire.
const uniqueExisting = serverRow({ version: 3 });
const uniqueUpdated = serverRow({ workflow_status: "handled", version: 4 });
const uniqueClient = createEventWatchClient({
  inserts: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
  reads: [{ data: [uniqueExisting], error: null }],
  updates: [{ data: [uniqueUpdated], error: null }]
});
api.setClient(uniqueClient);
resetState();
const uniqueResult = await api.setEventWatchWorkflowState(api.getBridgeAlerts()[0], "handled");
assert.equal(uniqueResult.status, "success");
assert.equal(uniqueClient.calls.filter((call) => call.operation === "insert").length, 1);
assert.equal(uniqueClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(uniqueClient.calls.filter((call) => call.operation === "update").length, 1);

// U/V. Un conflit UPDATE relit une fois, tente au maximum un second UPDATE et jamais un troisième.
const latestRow = serverRow({ workflow_status: "confirmed", version: 2 });
const retriedRow = serverRow({ workflow_status: "handled", version: 3 });
const retryClient = createEventWatchClient({
  updates: [{ data: [], error: null }, { data: [retriedRow], error: null }],
  reads: [{ data: [latestRow], error: null }]
});
api.setClient(retryClient);
resetState({ eventAlerts: [serverRow()] });
const retryResult = await api.setEventWatchWorkflowState(api.getBridgeAlerts()[0], "handled");
assert.equal(retryResult.status, "success");
assert.equal(retryClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(retryClient.calls.filter((call) => call.operation === "update").length, 2);
assert.deepEqual(retryClient.calls.at(-1).filters, [["id", alertId], ["version", 2]]);

const exhaustedClient = createEventWatchClient({
  updates: [{ data: [], error: null }, { data: [], error: null }],
  reads: [{ data: [latestRow], error: null }]
});
api.setClient(exhaustedClient);
resetState({ eventAlerts: [serverRow()] });
const exhausted = await api.setEventWatchWorkflowState(api.getBridgeAlerts()[0], "handled");
assert.equal(exhausted.status, "conflict");
assert.equal(exhaustedClient.calls.filter((call) => call.operation === "update").length, 2);
assert.equal(exhaustedClient.calls.filter((call) => call.operation === "select").length, 1);

// W-Z. Réseau, table absente et RLS refusée conservent immédiatement la décision locale.
for (const error of [
  { message: "Failed to fetch" },
  { code: "PGRST205", message: "table not found in schema cache" },
  { code: "42501", message: "row-level security policy rejected the request" }
]) {
  const fallbackClient = createEventWatchClient({ inserts: [{ data: null, error }] });
  api.setClient(fallbackClient);
  const fallbackBridge = resetState();
  const result = await api.setEventWatchWorkflowState(fallbackBridge[0], "handled");
  assert.equal(result.status, "unavailable");
  assert.equal(api.getEventWatchWorkflowState(fallbackBridge[0]), "handled");
  const workflow = JSON.parse(localStorage.getItem(EVENT_WORKFLOW_KEY));
  assert.equal(workflow[`id:${bridgeAlert.id}`].state, "handled");
  assert.equal(fallbackClient.calls.filter((call) => call.operation === "insert").length, 1);
}

// P. Une action invalide ne modifie ni le local ni le serveur.
const invalidClient = createEventWatchClient();
api.setClient(invalidClient);
resetState();
assert.equal(api.setEventWatchWorkflowState(api.getBridgeAlerts()[0], "reopened"), undefined);
assert.equal(invalidClient.calls.length, 0);
assert.equal(localStorage.getItem(EVENT_WORKFLOW_KEY), null);

console.log("ADMIN_EVENT_WATCH_SERVER_PERSISTENCE_OK");
