import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync("admin-watch.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260828152600_admin_watch_persistence_schema_rls.sql",
  "utf8"
);

assert.match(source, /\.from\("events"\)\.insert\(\[payload\]\)\.select\("id"\)/);
assert.match(source, /const watchSubmissionInFlight = new Set\(\)/);
assert.match(source, /await setWatchWorkflowState\(item, "submitted"\)/);
assert.match(migration, /create trigger audit_admin_watch_candidate_workflow[\s\S]*private\.audit_admin_watch_workflow\(\)/);

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__WATCH_FINAL_SUBMISSION_TEST_API__ = {
    setClient(value) { client = value; },
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
    },
    setResults(value) { lastResults = value; },
    createSubmissionFromWatch,
    buildSubmissionPayload,
    getWatchWorkflowState
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
  crypto: webcrypto,
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.dispatchEvent = () => true;
sandbox.window.requestAnimationFrame = (callback) => callback();
sandbox.window.DEDICALIVRES_DUPLICATES = { findMatches: async () => [] };

vm.runInNewContext(instrumented, sandbox, { filename: "admin-watch.js" });
const api = sandbox.__WATCH_FINAL_SUBMISSION_TEST_API__;
assert.ok(api, "API de test soumission finale indisponible");

const candidateId = "00000000-0000-4000-8000-000000000601";
const eventId = "00000000-0000-4000-8000-000000000602";
const sourceUrl = "https://www.fontvieille.fr/agenda/salon-du-livre/";
const baseCandidate = {
  identity_key: "candidate:v1:fontvieille",
  sourceUrl,
  officialUrl: sourceUrl,
  title: "Salon du livre",
  type: "Salon",
  startDate: "2026-09-20",
  endDate: "",
  city: "Fontvieille",
  country: "France",
  description: "Organisé par Lilec Bibliothèque associative de Fontvieille",
  workflow_status: "ready",
  _watchPersisted: true,
  _watchServerOnly: true
};

function serverCandidate(overrides = {}) {
  return {
    id: candidateId,
    identity_key: baseCandidate.identity_key,
    origin_url: sourceUrl,
    canonical_origin_url: sourceUrl,
    official_url: sourceUrl,
    title: baseCandidate.title,
    type: baseCandidate.type,
    start_date: baseCandidate.startDate,
    end_date: null,
    city: baseCandidate.city,
    country: baseCandidate.country,
    workflow_status: "ready",
    submitted_event_id: null,
    status_updated_at: "2026-08-30T08:00:00.000Z",
    version: 2,
    ...overrides
  };
}

function createClient({ insertError = null, updateError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operation: "", payload: null, filters: [], columns: "" };
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
        abortSignal() { return this; },
        then(resolve, reject) {
          let response;
          if (table === "events" && call.operation === "insert") {
            response = insertError
              ? { data: null, error: insertError }
              : { data: [{ id: eventId }], error: null };
          } else if (table === "admin_watch_candidates" && call.operation === "update") {
            response = updateError
              ? { data: null, error: updateError }
              : {
                  data: [serverCandidate({
                    workflow_status: "submitted",
                    submitted_event_id: call.payload.submitted_event_id,
                    version: 3
                  })],
                  error: null
                };
          } else {
            response = { data: [], error: null };
          }
          return Promise.resolve(response).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

function createButton() {
  const status = { hidden: true, textContent: "", dataset: {} };
  return {
    disabled: false,
    textContent: "Confirmer l’envoi",
    dataset: { watchDuplicateReviewed: "false" },
    status,
    closest() {
      return { querySelector: () => status };
    }
  };
}

// Le payload réel Fontvieille n'envoie aucune chaîne vide dans une colonne date optionnelle.
const emptyDatePayload = api.buildSubmissionPayload({ ...baseCandidate });
assert.equal(emptyDatePayload.end_date, null);
assert.equal(emptyDatePayload.registration_open_date, null);
assert.equal(emptyDatePayload.registration_deadline, null);
assert.equal(emptyDatePayload.validated, false);
assert.equal(emptyDatePayload.featured, false);
assert.equal(emptyDatePayload.rejected, false);
assert.equal(emptyDatePayload.verified, false);
const datedPayload = api.buildSubmissionPayload({
  ...baseCandidate,
  endDate: "2026-09-21",
  registrationOpenDate: "2026-06-01",
  registrationDeadline: "2026-09-01"
});
assert.equal(datedPayload.end_date, "2026-09-21");
assert.equal(datedPayload.registration_open_date, "2026-06-01");
assert.equal(datedPayload.registration_deadline, "2026-09-01");

// Candidat server-only après reload : double clic puis retry ne produisent qu'un INSERT.
localStorage.clear();
const candidate = { ...baseCandidate };
api.setResults([candidate]);
api.setSnapshot({
  availability: "server",
  componentAvailability: { candidates: "available", sources: "available", eventAlerts: "available" },
  candidates: [serverCandidate()]
});
const successClient = createClient();
api.setClient(successClient);
const button = createButton();
await Promise.all([
  api.createSubmissionFromWatch(candidate, button),
  api.createSubmissionFromWatch(candidate, button)
]);
assert.equal(successClient.calls.filter((call) => call.table === "events" && call.operation === "insert").length, 1);
assert.equal(successClient.calls.filter((call) => call.table === "admin_watch_candidates" && call.operation === "update").length, 1);
assert.equal(successClient.calls.filter((call) => call.table === "admin_watch_transitions").length, 0);
const eventInsert = successClient.calls.find((call) => call.table === "events" && call.operation === "insert");
assert.equal(eventInsert.payload[0].end_date, null);
assert.equal(eventInsert.payload[0].registration_open_date, null);
assert.equal(eventInsert.payload[0].registration_deadline, null);
const candidateUpdate = successClient.calls.find((call) => call.table === "admin_watch_candidates" && call.operation === "update");
assert.equal(candidateUpdate.payload.workflow_status, "submitted");
assert.equal(candidateUpdate.payload.submitted_event_id, eventId);
assert.equal(candidate.submittedEventId, eventId);
assert.equal(api.getWatchWorkflowState(candidate), "submitted");
await api.createSubmissionFromWatch(candidate, createButton());
assert.equal(successClient.calls.filter((call) => call.table === "events" && call.operation === "insert").length, 1);

// Une erreur INSERT conserve le workflow et l'identifiant intacts, et rend le bouton réutilisable.
localStorage.clear();
const failedCandidate = {
  ...baseCandidate,
  identity_key: "candidate:v1:fontvieille-error",
  title: "Salon du livre — erreur simulée",
  sourceUrl: `${sourceUrl}?error=1`,
  officialUrl: `${sourceUrl}?error=1`
};
api.setResults([failedCandidate]);
api.setSnapshot({
  availability: "server",
  componentAvailability: { candidates: "available", sources: "available", eventAlerts: "available" },
  candidates: [serverCandidate({
    identity_key: failedCandidate.identity_key,
    title: failedCandidate.title,
    origin_url: failedCandidate.sourceUrl,
    canonical_origin_url: failedCandidate.sourceUrl,
    official_url: failedCandidate.officialUrl
  })]
});
const failedClient = createClient({
  insertError: { code: "22007", message: "invalid input syntax for type date", details: "date: empty", hint: "use null" }
});
api.setClient(failedClient);
const failedButton = createButton();
await api.createSubmissionFromWatch(failedCandidate, failedButton);
assert.equal(failedCandidate.submittedEventId, undefined);
assert.equal(api.getWatchWorkflowState(failedCandidate), "ready");
assert.equal(failedClient.calls.filter((call) => call.table === "admin_watch_candidates" && call.operation === "update").length, 0);
assert.equal(failedButton.disabled, false);
assert.equal(failedButton.textContent, "Confirmer l’envoi");
for (const fragment of ["22007", "invalid input syntax", "date: empty", "use null"]) {
  assert.ok(failedButton.status.textContent.includes(fragment));
}

// Le parcours actuel n'est pas atomique : si le rattachement du candidat échoue,
// l'événement est déjà inséré. Ce constat impose de conserver le verrou V11 fermé
// jusqu'à l'ajout d'un contrat serveur transactionnel.
localStorage.clear();
const partialCandidate = {
  ...baseCandidate,
  identity_key: "candidate:v1:fontvieille-partial",
  title: "Salon du livre — rupture simulée",
  sourceUrl: `${sourceUrl}?partial=1`,
  officialUrl: `${sourceUrl}?partial=1`
};
api.setResults([partialCandidate]);
api.setSnapshot({
  availability: "server",
  componentAvailability: { candidates: "available", sources: "available", eventAlerts: "available" },
  candidates: [serverCandidate({
    identity_key: partialCandidate.identity_key,
    title: partialCandidate.title,
    origin_url: partialCandidate.sourceUrl,
    canonical_origin_url: partialCandidate.sourceUrl,
    official_url: partialCandidate.officialUrl
  })]
});
const partialClient = createClient({
  updateError: { code: "57014", message: "candidate update interrupted" }
});
api.setClient(partialClient);
const partialButton = createButton();
await api.createSubmissionFromWatch(partialCandidate, partialButton);
assert.equal(partialClient.calls.filter((call) => call.table === "events" && call.operation === "insert").length, 1);
assert.equal(partialClient.calls.filter((call) => call.table === "admin_watch_candidates" && call.operation === "update").length, 1);
assert.equal(api.getWatchWorkflowState(partialCandidate), "submitted");
assert.equal(partialCandidate.submittedEventId, eventId);
assert.equal(partialButton.disabled, true);
assert.equal(partialButton.textContent, "Soumission créée");
assert.equal(partialButton.status.textContent, "Soumission créée. Elle reste en attente de validation humaine.");

console.log("ADMIN_WATCH_FINAL_SUBMISSION_OK");
