import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-canary-evidence.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261014120000_admin_canary_evidence_status.sql", "utf8");
const pages = ["admin.html", "admin-v11.html"].map((path) => fs.readFileSync(path, "utf8"));
assert.equal(pages[0], pages[1], "Les deux alias V11 restent identiques");
for (const page of pages) {
  assert.match(page, /id="v11-canary-proof-form"/);
  assert.match(page, /human_confirmed" type="checkbox" required/);
  assert.match(page, /admin-canary-evidence\.js\?v=canary-e2-2/);
}
assert.match(fs.readFileSync("admin-shell.js", "utf8"), /dedicalivres:admin-event-detail/);
assert.doesNotMatch(source, /service_role|\.from\("event_publication_jobs"\)|\.from\("publication_canary_evidence"\)/);
assert.match(migration, /auth\.uid\(\) is null or not \(select private\.is_admin\(\)\)/);
assert.match(migration, /is distinct from e\.(description|region|country_code|lat|lng)/);
assert.match(migration, /interval '30 days'/);
assert.doesNotMatch(migration, /events\.verified/);

class Element {
  constructor() { this.textContent = ""; this.children = []; this.disabled = false; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  reset() { this.resetCount = (this.resetCount || 0) + 1; }
}
const elements = new Map();
const document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
  createElement() { return new Element(); },
  createTextNode(text) { return { textContent: text }; }
};
const listeners = {};
const calls = [];
let proof = { proof_status: "none", pending_validation_job: true, technical_candidate: false, proof_count: 0 };
let current;
let writeError = null;
const api = {
  rpc: async (name, args) => {
    calls.push(name);
    if (name === "get_publication_canary_evidence") return { data: [proof], error: null };
    assert.equal(name, "record_publication_canary_evidence_checked");
    assert.equal(args.p_human_confirmed, true);
    for (const field of ["title", "city", "region", "country_code", "description", "website", "start_date", "end_date", "lat", "lng"]) {
      assert.equal(args[`p_expected_${field}`], event[field]);
    }
    if (writeError) return { data: null, error: { message: writeError } };
    proof = { ...proof, proof_status: "valid", technical_candidate: true, proof_count: 1 };
    return { data: 1, error: null };
  },
  from(name) {
    assert.equal(name, "events");
    return { select: () => ({ eq: () => ({ single: async () => ({ data: current, error: null }) }) }) };
  }
};
const window = {
  DEDICALIVRES_ADMIN_V11_BRIDGE: { isAuthenticated: () => true, getClient: () => api },
  addEventListener: (name, callback) => { listeners[name] = callback; },
  confirm: () => true
};
class FormDataMock { get(name) { return name === "human_confirmed" ? "on" : "https://source.example/events/123"; } }
vm.runInNewContext(source, { window, document, FormData: FormDataMock, Date, String, Boolean });
const event = {
  id: "11111111-1111-4111-8111-111111111111", title: "Salon", city: "Lille",
  start_date: "2026-11-01", end_date: null, website: null,
  description: "Librairie", region: "Hauts-de-France", country_code: "FR", lat: null, lng: null
};
current = { ...event };
await listeners["dedicalivres:admin-event-detail"]({ detail: { event } });
assert.deepEqual(calls, ["get_publication_canary_evidence"], "Ouverture = lecture seule");
assert.match(elements.get("v11-canary-proof-status").textContent, /Aucune preuve/);
const form = elements.get("v11-canary-proof-form");
const submit = () => form.listeners.submit({ preventDefault() {} });
current = { ...event, description: "Lieu changé" };
await submit();
assert.equal(calls.filter((name) => name === "record_publication_canary_evidence_checked").length, 0);
assert.match(elements.get("v11-canary-proof-feedback").textContent, /Fiche modifiée/);
current = { ...event };
await listeners["dedicalivres:admin-event-detail"]({ detail: { event } });
writeError = "CANARY_SOURCE_EVIDENCE_STALE";
await submit();
assert.match(elements.get("v11-canary-proof-feedback").textContent, /rechargez la fiche et vérifiez à nouveau la source/);
assert.equal(proof.proof_count, 0, "Refus SQL : aucune preuve ajoutée");
writeError = null;
await listeners["dedicalivres:admin-event-detail"]({ detail: { event } });
await Promise.all([submit(), submit()]);
assert.equal(calls.filter((name) => name === "record_publication_canary_evidence_checked").length, 2, "Un refus puis une seule écriture malgré le double clic");
assert.match(elements.get("v11-canary-proof-status").textContent, /Preuve éditoriale valide/);
assert.match(elements.get("v11-canary-job-status").textContent, /Réservation non garantie/);
assert.equal(fs.readFileSync("admin-v11.css", "utf8").includes("@media (max-width: 700px)"), true);
console.log("PASS Admin CANARY : lecture seule, état, source, changement de fiche, confirmation, anti-double-clic, alias et mobile CSS");
await import("./test-admin-canary-direct.mjs");
