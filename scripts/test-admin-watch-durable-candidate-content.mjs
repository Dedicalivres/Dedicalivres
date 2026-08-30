import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync("admin-watch.js", "utf8");
const migrationPath = "supabase/migrations/20260830134724_admin_watch_durable_candidate_content.sql";
const migration = fs.readFileSync(migrationPath, "utf8");
const baseMigration = fs.readFileSync("supabase/migrations/20260828152600_admin_watch_persistence_schema_rls.sql", "utf8");

for (const column of ["type", "end_date", "country", "venue", "address", "description", "official_url", "image_url"]) {
  assert.match(migration, new RegExp(`add column ${column} text|add column ${column} date`), `Colonne durable absente : ${column}`);
}
assert.ok(!/add column[^;]+default/i.test(migration), "Les colonnes éditables ne doivent inventer aucune valeur par défaut");
assert.ok(!migration.includes("create policy") && !migration.includes("grant ") && !migration.includes("revoke "));
assert.ok(!migration.includes("public.events"), "La migration candidat ne doit jamais publier d’événement");
assert.ok(baseMigration.includes("alter table public.admin_watch_candidates enable row level security"));
assert.ok(baseMigration.includes("revoke all privileges on table public.admin_watch_candidates from anon, authenticated"));
assert.ok(baseMigration.includes("grant select, insert, update on table public.admin_watch_candidates to authenticated"));
for (const policy of [
  "admin_watch_candidates_select_admin",
  "admin_watch_candidates_insert_admin",
  "admin_watch_candidates_update_admin"
]) {
  assert.ok(baseMigration.includes(`create policy ${policy}`), `Policy admin historique absente : ${policy}`);
}
assert.ok(baseMigration.includes("if new.workflow_status is distinct from old.workflow_status then"));
assert.equal((baseMigration.match(/insert into public\.admin_watch_transitions/g) || []).length, 2);

for (const fragment of [
  "async function buildWatchCandidatePersistencePayload(",
  "async function insertEditedWatchCandidate(",
  "async function updateEditedWatchCandidateOptimistically(",
  "async function persistEditedWatchCandidate(",
  ".insert([payload])",
  ".update(updatePayload)",
  '.eq("version", Number(expectedVersion))',
  "persistEditedWatchCandidate(item, nextWorkflowState)",
  "candidate._watchDurableContent",
  "recalculateWatchCandidateMissingFields(candidate)"
]) {
  assert.ok(source.includes(fragment), `Persistance durable incomplète : ${fragment}`);
}

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_DURABLE_CONTENT_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      const base = createEmptyWatchPersistenceSnapshot(value?.availability || "local");
      watchPersistenceSnapshot = { ...base, ...(value || {}) };
    },
    getSnapshot() { return watchPersistenceSnapshot; },
    setLastResults(value) { lastResults = value; },
    getLastResults() { return lastResults; },
    saveWatchCandidateEdits,
    buildWatchCandidatePersistencePayload,
    buildWatchCandidateQueue,
    getWatchWorkflowState,
    getWatchQueueCounts,
    renderResultCard
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
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} }
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
  Uint8Array,
  TextEncoder,
  console,
  document,
  localStorage,
  setTimeout,
  clearTimeout,
  navigator: {},
  crypto: webcrypto,
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.dispatchEvent = () => {};
sandbox.window.requestAnimationFrame = (callback) => callback();

vm.runInNewContext(instrumented, sandbox, { filename: "admin-watch.js" });
const api = sandbox.__WATCH_DURABLE_CONTENT_TEST_API__;
assert.ok(api, "API de test Pack 6E indisponible");

function createClient(responder) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", payload: null, filters: [], columns: "", limit: null };
      calls.push(call);
      return {
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
          return Promise.resolve(responder(call)).then(resolve, reject);
        }
      };
    }
  };
}

function createForm(item, overrides = {}, { endDateEdited = false } = {}) {
  const values = {
    title: item.title,
    startDate: item.startDate,
    city: item.city,
    type: item.type,
    country: item.country,
    venue: item.venue,
    address: item.address,
    description: item.description,
    officialUrl: item.officialUrl,
    imageUrl: item.imageUrl,
    ...overrides
  };
  const endDateField = {
    value: Object.hasOwn(overrides, "endDate") ? overrides.endDate : item.endDate,
    dataset: { watchUserEdited: endDateEdited ? "true" : "false" }
  };
  return {
    elements: {
      namedItem(name) {
        return Object.hasOwn(values, name) ? { value: values[name] ?? "" } : null;
      }
    },
    querySelector(selector) {
      return selector === '[data-watch-field="endDate"]' ? endDateField : null;
    }
  };
}

const candidateId = "00000000-0000-4000-8000-000000006e00";
const identityKey = "candidate:v1:fontvieille-pack-6e";
const fontvieille = {
  identity_key: identityKey,
  sourceUrl: "https://agenda.example/fontvieille",
  officialUrl: "https://salondulivre.example/fontvieille",
  title: "Salon du livre de Fontvieille",
  type: "Salon",
  startDate: "2026-09-20",
  endDate: "",
  city: "Fontvieille",
  country: "",
  venue: "Centre culturel",
  address: "Place du village",
  description: "Salon du livre réunissant auteurs, lecteurs et éditeurs pour une journée de rencontres.",
  imageUrl: "https://images.example/fontvieille.jpg",
  status: "À vérifier",
  confidence: 83,
  missingFields: ["pays"],
  filterWarnings: [],
  workflowStatus: "review"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serverRow(payload, { id = candidateId, version = 1, workflowStatus = payload.workflow_status } = {}) {
  return {
    id,
    ...payload,
    workflow_status: workflowStatus,
    status_updated_at: `2026-08-30T14:0${version}:00.000Z`,
    updated_at: `2026-08-30T14:0${version}:00.000Z`,
    last_seen_at: "2026-08-30T13:00:00.000Z",
    version
  };
}

function reset(candidate, rows = []) {
  localStorage.clear();
  api.setLastResults(candidate ? [candidate] : []);
  api.setSnapshot({
    availability: "server",
    componentAvailability: { candidates: "available", sources: "available", eventAlerts: "available" },
    candidates: rows
  });
}

// Fontvieille absent du serveur : l’action humaine Enregistrer produit un INSERT unique et complet.
const insertedCandidate = clone(fontvieille);
let insertedRow;
const insertClient = createClient((call) => {
  assert.equal(call.table, "admin_watch_candidates");
  assert.equal(call.operation, "insert");
  insertedRow = serverRow(call.payload[0]);
  return { data: [insertedRow], error: null };
});
reset(insertedCandidate);
api.setClient(insertClient);
const insertResult = await api.saveWatchCandidateEdits(
  0,
  createForm(insertedCandidate, { country: "France" })
);
assert.equal(insertResult.status, "success");
assert.equal(insertClient.calls.length, 1);
assert.equal(insertClient.calls[0].operation, "insert");
const insertPayload = insertClient.calls[0].payload[0];
assert.deepEqual(
  {
    identity_key: insertPayload.identity_key,
    origin_url: insertPayload.origin_url,
    canonical_origin_url: insertPayload.canonical_origin_url,
    official_url: insertPayload.official_url,
    title: insertPayload.title,
    type: insertPayload.type,
    start_date: insertPayload.start_date,
    end_date: insertPayload.end_date,
    city: insertPayload.city,
    country: insertPayload.country,
    venue: insertPayload.venue,
    address: insertPayload.address,
    description: insertPayload.description,
    image_url: insertPayload.image_url,
    workflow_status: insertPayload.workflow_status
  },
  {
    identity_key: identityKey,
    origin_url: fontvieille.sourceUrl,
    canonical_origin_url: fontvieille.sourceUrl,
    official_url: fontvieille.officialUrl,
    title: fontvieille.title,
    type: "Salon",
    start_date: "2026-09-20",
    end_date: null,
    city: "Fontvieille",
    country: "France",
    venue: fontvieille.venue,
    address: fontvieille.address,
    description: fontvieille.description,
    image_url: fontvieille.imageUrl,
    workflow_status: "ready"
  }
);
assert.equal(api.getSnapshot().candidates.length, 1);
assert.equal(api.getSnapshot().candidates[0].country, "France");
assert.equal(api.getSnapshot().candidates[0].version, 1);
assert.equal(api.getWatchWorkflowState(insertedCandidate), "ready");
assert.equal(insertedCandidate.endDate, "");

const currentQueue = api.buildWatchCandidateQueue([insertedCandidate]);
assert.equal(currentQueue.length, 1, "L’INSERT adopté ne doit pas dupliquer le candidat Worker");
assert.equal(currentQueue[0].country, "France");
assert.equal(api.getWatchQueueCounts(currentQueue).ready, 1);

// Reload sans Worker : la ligne serveur restitue toute la fiche et produit une carte riche.
localStorage.clear();
api.setLastResults([]);
api.setSnapshot({ availability: "server", candidates: [insertedRow] });
const serverOnlyQueue = api.buildWatchCandidateQueue([]);
assert.equal(serverOnlyQueue.length, 1);
assert.equal(serverOnlyQueue[0].country, "France");
assert.equal(serverOnlyQueue[0].type, "Salon");
assert.equal(serverOnlyQueue[0].endDate, "");
assert.equal(serverOnlyQueue[0].venue, fontvieille.venue);
assert.equal(serverOnlyQueue[0].address, fontvieille.address);
assert.equal(serverOnlyQueue[0].description, fontvieille.description);
assert.equal(serverOnlyQueue[0].officialUrl, fontvieille.officialUrl);
assert.equal(serverOnlyQueue[0].imageUrl, fontvieille.imageUrl);
assert.equal(serverOnlyQueue[0]._watchDurableContent, true);
assert.equal(api.getWatchWorkflowState(serverOnlyQueue[0]), "ready");
const richCard = api.renderResultCard(serverOnlyQueue[0], 0);
assert.ok(richCard.includes("Salon"));
assert.ok(richCard.includes("Fontvieille · France"));
assert.ok(richCard.includes(fontvieille.description));
assert.ok(richCard.includes(fontvieille.imageUrl));
assert.ok(richCard.includes("Site officiel"));

// Un Worker frais garde ses valeurs non vides ; le serveur enrichit seulement ses lacunes.
const freshWorker = clone(fontvieille);
freshWorker.type = "Rencontre littéraire";
freshWorker.country = "";
freshWorker.description = "Description Worker plus fraîche.";
const enriched = api.buildWatchCandidateQueue([freshWorker])[0];
assert.equal(enriched.type, "Rencontre littéraire");
assert.equal(enriched.description, "Description Worker plus fraîche.");
assert.equal(enriched.country, "France");
assert.equal(enriched.workflow_status, "ready");

// Édition ultérieure : contenu et workflow partent dans un seul UPDATE versionné, version N+1.
const updatedCandidate = clone(insertedCandidate);
const existingPayload = await api.buildWatchCandidatePersistencePayload(updatedCandidate, "ready");
const existingRow = serverRow(existingPayload, { version: 4 });
let updatedRow;
const updateClient = createClient((call) => {
  if (call.operation === "update") {
    updatedRow = serverRow({ ...existingRow, ...call.payload }, { version: 5, workflowStatus: call.payload.workflow_status });
    return { data: [updatedRow], error: null };
  }
  throw new Error("Relecture inattendue sur UPDATE réussi");
});
reset(updatedCandidate, [existingRow]);
api.setClient(updateClient);
const updateResult = await api.saveWatchCandidateEdits(
  0,
  createForm(updatedCandidate, {
    country: "France",
    venue: "Moulin de Fontvieille",
    address: "12 avenue des Moulins",
    description: "Description humaine durable mise à jour.",
    endDate: "2026-09-21"
  }, { endDateEdited: true })
);
assert.equal(updateResult.status, "success");
assert.equal(updateClient.calls.length, 1);
assert.equal(updateClient.calls[0].operation, "update");
assert.deepEqual(updateClient.calls[0].filters, [["id", candidateId], ["version", 4]]);
assert.equal(updateClient.calls[0].payload.venue, "Moulin de Fontvieille");
assert.equal(updateClient.calls[0].payload.address, "12 avenue des Moulins");
assert.equal(updateClient.calls[0].payload.description, "Description humaine durable mise à jour.");
assert.equal(updateClient.calls[0].payload.end_date, "2026-09-21");
assert.equal(updateClient.calls[0].payload.workflow_status, "ready");
assert.equal(api.getSnapshot().candidates[0].version, 5);
assert.equal(api.buildWatchCandidateQueue([])[0].endDate, "2026-09-21");

// Conflit INSERT : une seule tentative, puis relecture/adoption par identity_key.
const concurrentPayload = await api.buildWatchCandidatePersistencePayload({ ...fontvieille, country: "France", missingFields: [] }, "ready");
const concurrentRow = serverRow(concurrentPayload, { id: "00000000-0000-4000-8000-000000006e01", version: 2 });
const insertConflictClient = createClient((call) => {
  if (call.operation === "insert") return { data: null, error: { code: "23505", message: "duplicate key" } };
  assert.deepEqual(call.filters, [["identity_key", identityKey]]);
  return { data: [concurrentRow], error: null };
});
const insertConflictCandidate = clone(fontvieille);
reset(insertConflictCandidate);
api.setClient(insertConflictClient);
const insertConflict = await api.saveWatchCandidateEdits(0, createForm(insertConflictCandidate, { country: "France" }));
assert.equal(insertConflict.status, "conflict");
assert.equal(insertConflictClient.calls.filter((call) => call.operation === "insert").length, 1);
assert.equal(insertConflictClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(api.getSnapshot().candidates.length, 1);
assert.equal(api.getSnapshot().candidates[0].id, concurrentRow.id);

// Conflit UPDATE : zéro ligne modifiée, une relecture, version serveur plus récente adoptée.
const versionConflictCandidate = clone(insertedCandidate);
const latestRow = serverRow({ ...existingPayload, description: "Version concurrente", workflow_status: "ready" }, { version: 6 });
const versionConflictClient = createClient((call) => {
  if (call.operation === "update") return { data: [], error: null };
  assert.deepEqual(call.filters, [["id", candidateId]]);
  return { data: [latestRow], error: null };
});
reset(versionConflictCandidate, [existingRow]);
api.setClient(versionConflictClient);
const versionConflict = await api.saveWatchCandidateEdits(
  0,
  createForm(versionConflictCandidate, { country: "France", description: "Modification locale concurrente" })
);
assert.equal(versionConflict.status, "conflict");
assert.equal(versionConflictClient.calls.filter((call) => call.operation === "update").length, 1);
assert.equal(versionConflictClient.calls.filter((call) => call.operation === "select").length, 1);
assert.equal(api.getSnapshot().candidates[0].version, 6);
assert.equal(api.getSnapshot().candidates[0].description, "Version concurrente");

// Une édition de contenu fermé reste fermée mais peut être persistée en un UPDATE.
for (const closedState of ["duplicate", "submitted", "handled", "rejected"]) {
  const closedCandidate = clone(insertedCandidate);
  const closedRow = serverRow({ ...existingPayload, workflow_status: closedState }, { version: 7, workflowStatus: closedState });
  const closedClient = createClient((call) => ({
    data: [serverRow({ ...closedRow, ...call.payload }, { version: 8, workflowStatus: call.payload.workflow_status })],
    error: null
  }));
  reset(closedCandidate, [closedRow]);
  api.setClient(closedClient);
  const result = await api.saveWatchCandidateEdits(
    0,
    createForm(closedCandidate, { country: "France", venue: `Lieu ${closedState}` })
  );
  assert.equal(result.status, "success");
  assert.equal(closedClient.calls.length, 1);
  assert.equal(closedClient.calls[0].payload.workflow_status, closedState);
  assert.equal(api.getWatchWorkflowState(closedCandidate), closedState);
}

// Audit réseau/publication : deux writers candidats explicites, aucune écriture métier automatique.
const durableWriterStart = source.indexOf("async function insertEditedWatchCandidate(");
const durableWriterEnd = source.indexOf("async function persistCandidateWorkflowDecision(", durableWriterStart);
const durableWriterSource = source.slice(durableWriterStart, durableWriterEnd);
assert.equal((durableWriterSource.match(/\.insert\(/g) || []).length, 1);
assert.equal((durableWriterSource.match(/\.update\(/g) || []).length, 1);
for (const forbidden of ['from("events")', "public.events", ".upsert(", ".delete(", ".rpc(", "admin_watch_transitions"]) {
  assert.ok(!durableWriterSource.includes(forbidden), `Effet de bord interdit dans le writer durable : ${forbidden}`);
}
assert.equal((source.match(/\.from\("events"\)\.insert\(/g) || []).length, 1);
assert.ok(source.includes("findExistingSubmissionCached(item)"));

console.log("ADMIN_WATCH_DURABLE_CANDIDATE_CONTENT_OK");
