import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-canary-direct.js", "utf8");
const pages = ["admin.html", "admin-v11.html"].map((path) => fs.readFileSync(path, "utf8"));
assert.equal(pages[0], pages[1], "Admin et Admin V11 restent identiques");
for (const page of pages) {
  for (const id of ["proof-mode", "provenance", "direct-role", "direct-method", "direct-source",
    "direct-record", "direct-create", "direct-reference", "direct-read", "direct-confirm",
    "direct-verify", "direct-record-proof", "direct-reason", "direct-revoke"]) {
    assert.match(page, new RegExp(`id="v11-canary-${id}"`));
  }
  assert.match(page, /admin-canary-direct\.js\?v=canary-e5-d1-1/);
  assert.match(page, /admin-canary-evidence\.js\?v=canary-e2-2/);
}
assert.doesNotMatch(source, /localStorage|service_role|console\.|\.from\("event_publication_jobs"\)|\.from\("event_submission_contacts"\)/);
assert.match(fs.readFileSync("admin-v11.css", "utf8"), /@media \(max-width: 700px\)/);

const event = { id: "11111111-1111-4111-8111-111111111111", title: "Salon", city: "Lille",
  region: "Hauts-de-France", country_code: "FR", description: "Salle des fêtes",
  website: null, start_date: "2026-11-01", end_date: null, lat: null, lng: null };
const otherEvent = { ...event, id: "22222222-2222-4222-8222-222222222222" };
const direct = { observed_channel: "DIRECT_FORM", declared_origin: "DIRECT_AUTHOR",
  attested_origin: "DIRECT_ORGANIZER", attestation_state: "ATTESTED", proof_type: null };
const dossierRef = "evidence:123456781234423489ab123456789abc";
const writes = new Set(["record_direct_publication_canary_dossier", "verify_direct_publication_canary_dossier",
  "record_direct_publication_canary_evidence_checked", "revoke_direct_publication_canary_evidence"]);

class Element {
  constructor(id = "") {
    this.id = id; this.textContent = ""; this.children = []; this.listeners = {};
    this.value = ""; this.checked = false; this.disabled = false; this.hidden = false;
    this.options = [{ disabled: false }, { disabled: true }];
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}
function contents(element) {
  return [element.textContent, ...element.children.map(contents)].join(" ");
}
function setup(options = {}) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const listeners = {};
  const pending = [];
  const calls = [];
  const state = {
    current: { ...event }, origin: options.origin || { ...direct }, latest: options.latest || null,
    proof: { proof_status: "none", proof_count: 0 }, dossier: options.dossier || null,
    fail: {}, loseAfterWrite: null, confirm: true, delayCreate: null
  };
  const api = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (state.fail[name]) return { data: null, error: state.fail[name] };
      if (name === "get_event_provenance") return { data: [state.origin], error: null };
      if (name === "get_latest_direct_publication_canary_reference")
        return { data: state.latest ? [state.latest] : [], error: null };
      if (name === "get_publication_canary_evidence") return { data: [state.proof], error: null };
      if (name === "get_direct_publication_canary_dossier")
        return { data: args.p_evidence_reference === dossierRef && state.dossier ? [state.dossier] : [], error: null };
      if (name === "record_direct_publication_canary_dossier") {
        if (state.delayCreate) await state.delayCreate;
        state.dossier = { event_id: args.p_event_id, submission_event_id: args.p_submission_event_id,
          attested_origin: args.p_attested_origin, identity_method: args.p_identity_method,
          independent_source_reference: args.p_independent_source_reference,
          verification_record: args.p_verification_record, dossier_state: "PENDING_REVIEW" };
        if (state.loseAfterWrite === name) return { data: null, error: { message: "network failed" } };
        return { data: dossierRef, error: null };
      }
      if (name === "verify_direct_publication_canary_dossier") {
        state.dossier.dossier_state = "VERIFIED";
        state.dossier.verified_by = "33333333-3333-4333-8333-333333333333";
        state.dossier.verified_at = "2026-10-15T10:00:00Z";
        if (state.loseAfterWrite === name) return { data: null, error: { message: "network failed" } };
        return { data: true, error: null };
      }
      if (name === "record_direct_publication_canary_evidence_checked") {
        state.latest = { proof_id: 17, dossier_reference: dossierRef, dossier_state: "VERIFIED" };
        state.origin = { ...state.origin, proof_type: "DIRECT_VERIFIED", attestation_state: "ATTESTED" };
        state.proof = { proof_status: "valid", proof_count: state.proof.proof_count + 1 };
        if (state.loseAfterWrite === name) return { data: null, error: { message: "network failed" } };
        return { data: 17, error: null };
      }
      if (name === "revoke_direct_publication_canary_evidence") {
        if (args.p_proof_id !== state.latest.proof_id)
          return { data: null, error: { message: "CANARY_DIRECT_PROOF_NOT_LATEST" } };
        state.latest = { ...state.latest, dossier_state: "REVOKED" };
        state.origin = { ...state.origin, attestation_state: "REVOKED" };
        state.proof = { ...state.proof, proof_status: "invalidated" };
        if (state.loseAfterWrite === name) return { data: null, error: { message: "network failed" } };
        return { data: 18, error: null };
      }
      throw new Error(`RPC imprévue : ${name}`);
    },
    from(name) {
      assert.equal(name, "events");
      return { select: () => ({ eq: () => ({ single: async () => ({ data: state.current, error: null }) }) }) };
    }
  };
  const window = {
    DEDICALIVRES_ADMIN_V11_BRIDGE: { isAuthenticated: () => true, getClient: () => api },
    addEventListener: (name, listener) => { listeners[name] = listener; },
    dispatchEvent: (item) => { pending.push(listeners[item.type]({ detail: item.detail })); },
    confirm: () => state.confirm
  };
  const document = { getElementById: get, createElement: () => new Element() };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  vm.runInNewContext(source, { window, document, CustomEvent, String, Boolean, Object });
  const click = (id) => get(`v11-canary-${id}`).listeners.click();
  const open = (selected = event) => listeners["dedicalivres:admin-event-detail"]({ detail: { event: selected } });
  const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
  const count = (name) => calls.filter((call) => call.name === name).length;
  return { get: (id) => get(`v11-canary-${id}`), state, calls, click, open, settle, count };
}

// Missing RPCs fail closed without affecting the official proof form.
let h = setup({ origin: { observed_channel: "UNKNOWN" } });
await h.open();
assert.equal(h.get("proof-mode").options[1].disabled, true);
assert.match(contents(h.get("provenance")), /Origine non établie/);
assert.equal(h.get("proof-form").hidden, false);
assert.equal(h.calls.filter((call) => writes.has(call.name)).length, 0);
h = setup();
h.state.fail.get_latest_direct_publication_canary_reference = { code: "PGRST202", message: "Could not find the function" };
await h.open();
assert.equal(h.get("proof-mode").options[1].disabled, true);
assert.match(h.get("direct-availability").textContent, /RPC sécurisées absentes/);
assert.equal(h.get("proof-form").hidden, false);
assert.equal(h.calls.filter((call) => writes.has(call.name)).length, 0);

// The declared role is read from provenance, never synthesized from the attested selector.
h = setup();
await h.open();
assert.equal(h.get("proof-mode").options[1].disabled, false);
assert.match(contents(h.get("provenance")), /Rôle déclaré Auteur/);
assert.match(contents(h.get("provenance")), /Dernier rôle attesté \(historique\) Organisateur/);
h.get("proof-mode").value = "direct";
h.get("proof-mode").listeners.change();
assert.equal(h.get("proof-form").hidden, true);
h.get("direct-role").value = "DIRECT_ORGANIZER";
h.get("direct-method").value = "OFFICIAL_PHONE";
h.get("direct-source").value = "https://source.example/fiche";
h.get("direct-record").value = "Appel au numéro officiel et identité vérifiée auprès de la source.";
await h.click("direct-create");
assert.equal(h.count("record_direct_publication_canary_dossier"), 1);
assert.equal(h.count("get_direct_publication_canary_dossier"), 1);
assert.equal(h.get("direct-reference").value, dossierRef);
assert.equal(h.count("record_direct_publication_canary_evidence_checked"), 0);
assert.equal(h.get("direct-verify").disabled, true);
h.get("direct-confirm").checked = true;
h.get("direct-confirm").listeners.change();
await h.click("direct-verify");
assert.equal(h.count("verify_direct_publication_canary_dossier"), 1);
assert.equal(h.state.dossier.dossier_state, "VERIFIED");
assert.equal(h.get("direct-confirm").checked, false);
await h.click("direct-record-proof");
await h.settle();
assert.equal(h.count("record_direct_publication_canary_evidence_checked"), 1);
const write = h.calls.find((call) => call.name === "record_direct_publication_canary_evidence_checked").args;
assert.equal(write.p_declared_origin, "DIRECT_AUTHOR");
assert.equal(write.p_attested_origin, "DIRECT_ORGANIZER");
assert.equal(write.p_justification_reference, dossierRef);
assert.equal(h.get("direct-revoke").disabled, false);
assert.match(h.get("direct-latest").textContent, /Dernière preuve directe : valide/);
assert.equal(h.calls.some((call) => /publish|job|claim|reserve/i.test(call.name)), false);

// Reload retrieves the real proof ID and dossier reference, then revokes via the existing RPC.
await h.open();
assert.equal(h.get("direct-reference").value, dossierRef);
assert.equal(h.get("direct-revoke").disabled, false);
h.get("direct-reason").value = "Source invalidée après nouveau contrôle";
await h.click("direct-revoke");
await h.settle();
assert.equal(h.calls.find((call) => call.name === "revoke_direct_publication_canary_evidence").args.p_proof_id, 17);
assert.equal(h.state.latest.dossier_state, "REVOKED");
assert.equal(h.get("direct-revoke").disabled, true);

// A public proof in front of a historical direct proof has no fallback.
h = setup({ origin: { ...direct, proof_type: "PUBLIC_OFFICIAL" } });
await h.open();
assert.equal(h.get("direct-revoke").disabled, true);
assert.match(h.get("direct-latest").textContent, /Aucune ancienne preuve directe/);

// A known private reference can be re-read; an unknown pending dossier is not invented.
h = setup({ dossier: { event_id: event.id, submission_event_id: event.id,
  attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE",
  dossier_state: "PENDING_REVIEW", verification_record: "Compte rendu conservé",
  independent_source_reference: "Source vérifiée" } });
await h.open();
assert.equal(h.get("direct-reference").value, "");
h.get("direct-reference").value = dossierRef;
h.get("direct-reference").listeners.input();
await h.click("direct-read");
assert.equal(h.state.dossier.dossier_state, "PENDING_REVIEW");
assert.match(contents(h.get("direct-dossier")), /Compte rendu conservé/);

// Stale fiche, rejected dossier, network error and cancellation never advance the workflow.
h = setup();
await h.open();
h.get("direct-role").value = "DIRECT_AUTHOR";
h.get("direct-method").value = "OFFICIAL_PHONE";
h.get("direct-source").value = "https://source.example/fiche";
h.get("direct-record").value = "Compte rendu de vérification indépendant et détaillé.";
h.state.current = { ...event, description: "Lieu changé" };
await h.click("direct-create");
assert.equal(h.count("record_direct_publication_canary_dossier"), 0);
assert.match(h.get("direct-feedback").textContent, /Fiche modifiée/);
h.state.current = { ...event };
h.state.fail.record_direct_publication_canary_dossier = { message: "network failed" };
await h.click("direct-create");
assert.equal(h.get("direct-create").disabled, true);
assert.match(h.get("direct-feedback").textContent, /écritures directes bloquées/);
await h.open(otherEvent);
assert.equal(h.get("direct-create").disabled, true, "Changer de fiche ne lève pas l'incertitude");
await h.open(event);
assert.equal(h.get("direct-create").disabled, true, "Recharger la fiche ne lève pas l'incertitude");
assert.equal(h.get("direct-reference").value, "", "Aucune référence de dossier inventée");

h = setup({ dossier: { event_id: event.id, submission_event_id: event.id,
  attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE", dossier_state: "PENDING_REVIEW" } });
await h.open();
h.get("direct-reference").value = dossierRef;
await h.click("direct-read");
h.get("direct-confirm").checked = true;
h.state.confirm = false;
await h.click("direct-verify");
assert.equal(h.count("verify_direct_publication_canary_dossier"), 0);
h.state.confirm = true;
h.state.fail.verify_direct_publication_canary_dossier = { message: "CANARY_DIRECT_DOSSIER_INVALID" };
await h.click("direct-verify");
assert.equal(h.count("record_direct_publication_canary_evidence_checked"), 0);
assert.equal(h.get("direct-verify").disabled, true);
delete h.state.fail.verify_direct_publication_canary_dossier;
await h.click("direct-read");
assert.equal(h.get("direct-verify").disabled, true, "Un résultat de vérification ambigu reste bloqué");

// A stale proof ID is sent as read and refused by the server; no fallback or retry.
h = setup({ latest: { proof_id: 11, dossier_reference: dossierRef, dossier_state: "VERIFIED" },
  dossier: { event_id: event.id, submission_event_id: event.id,
    attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE", dossier_state: "VERIFIED" } });
await h.open();
h.get("direct-reason").value = "Révocation après contrôle humain";
h.state.latest = { ...h.state.latest, proof_id: 12 };
await h.click("direct-revoke");
assert.equal(h.calls.find((call) => call.name === "revoke_direct_publication_canary_evidence").args.p_proof_id, 11);
assert.match(h.get("direct-feedback").textContent, /preuve plus récente/);
assert.equal(h.get("direct-revoke").disabled, true);

// Double click and event change while a read is in flight cannot write twice or bleed UI state.
h = setup();
await h.open();
h.get("direct-role").value = "DIRECT_AUTHOR";
h.get("direct-method").value = "OFFICIAL_PHONE";
h.get("direct-source").value = "https://source.example/fiche";
h.get("direct-record").value = "Compte rendu de vérification indépendant et détaillé.";
let release;
h.state.delayCreate = new Promise((resolve) => { release = resolve; });
const first = h.click("direct-create");
await h.click("direct-create");
await new Promise(setImmediate);
assert.equal(h.count("record_direct_publication_canary_dossier"), 1);
await h.open(otherEvent);
release();
await first;
assert.equal(h.get("direct-reference").value, "");
assert.equal(h.count("record_direct_publication_canary_dossier"), 1);
assert.equal(h.calls.some((call) => /publish|job|claim|reserve/i.test(call.name)), false);

// A committed proof with a lost response must not be repeated after a dossier-only read.
h = setup({ dossier: { event_id: event.id, submission_event_id: event.id,
  attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE", dossier_state: "VERIFIED" } });
await h.open();
h.get("direct-reference").value = dossierRef;
await h.click("direct-read");
h.state.loseAfterWrite = "record_direct_publication_canary_evidence_checked";
await h.click("direct-record-proof");
assert.equal(h.count("record_direct_publication_canary_evidence_checked"), 1);
assert.equal(h.get("direct-record-proof").disabled, true);
await h.click("direct-read");
assert.equal(h.get("direct-record-proof").disabled, true, "La preuve déjà créée ne peut être écrite une seconde fois");
assert.equal(h.count("record_direct_publication_canary_evidence_checked"), 1);
assert.equal(h.count("get_event_provenance") >= 2, true, "Réconciliation : provenance relue");
assert.equal(h.count("get_latest_direct_publication_canary_reference") >= 2, true, "Réconciliation : dernière preuve relue");

// A committed revocation with a lost response must be verified against the server.
h = setup({ latest: { proof_id: 11, dossier_reference: dossierRef, dossier_state: "VERIFIED" },
  dossier: { event_id: event.id, submission_event_id: event.id,
    attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE", dossier_state: "VERIFIED" },
  origin: { ...direct, proof_type: "DIRECT_VERIFIED" } });
h.state.proof = { proof_status: "valid", proof_count: 1 };
await h.open();
h.get("direct-reason").value = "Révocation après contrôle humain";
h.state.loseAfterWrite = "revoke_direct_publication_canary_evidence";
await h.click("direct-revoke");
assert.equal(h.count("revoke_direct_publication_canary_evidence"), 1);
await h.click("direct-read");
assert.equal(h.get("direct-revoke").disabled, true);
assert.equal(h.count("revoke_direct_publication_canary_evidence"), 1);
assert.equal(h.count("get_event_provenance") >= 2, true, "Révocation : provenance relue");

// A known reference can recover a completed creation; an unreadable server cannot.
h = setup();
await h.open();
h.get("direct-role").value = "DIRECT_AUTHOR";
h.get("direct-method").value = "OFFICIAL_PHONE";
h.get("direct-source").value = "https://source.example/fiche";
h.get("direct-record").value = "Compte rendu de vérification indépendant et détaillé.";
h.state.fail.get_direct_publication_canary_dossier = { message: "network failed" };
await h.click("direct-create");
assert.equal(h.get("direct-reference").value, dossierRef);
assert.equal(h.get("direct-create").disabled, true);
delete h.state.fail.get_direct_publication_canary_dossier;
await h.click("direct-read");
assert.equal(h.get("direct-create").disabled, true, "Dossier retrouvé : pas de seconde création automatique");
assert.equal(h.get("direct-verify").disabled, true, "Une nouvelle confirmation humaine reste requise");

// A lost verification response is reconciled only after the dossier and proof/provenance reads agree.
h = setup({ dossier: { event_id: event.id, submission_event_id: event.id,
  attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE", dossier_state: "PENDING_REVIEW" } });
await h.open();
h.get("direct-reference").value = dossierRef;
await h.click("direct-read");
h.get("direct-confirm").checked = true;
h.state.loseAfterWrite = "verify_direct_publication_canary_dossier";
await h.click("direct-verify");
assert.equal(h.get("direct-record-proof").disabled, true);
await h.click("direct-read");
assert.equal(h.state.dossier.dossier_state, "VERIFIED");
assert.equal(h.get("direct-record-proof").disabled, false);
assert.equal(h.count("verify_direct_publication_canary_dossier"), 1);

h = setup({ dossier: { event_id: event.id, submission_event_id: event.id,
  attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE", dossier_state: "VERIFIED" } });
await h.open();
h.get("direct-reference").value = dossierRef;
await h.click("direct-read");
h.state.loseAfterWrite = "record_direct_publication_canary_evidence_checked";
await h.click("direct-record-proof");
h.state.fail.get_event_provenance = { message: "network unavailable" };
await h.click("direct-read");
assert.equal(h.get("direct-record-proof").disabled, true, "Serveur indisponible : blocage conservé");
assert.match(h.get("direct-feedback").textContent, /reprise administrative|indisponible/i);

// A fresh JS context simulates a browser restart without in-memory uncertainty.
// Server reads must prevent a second proof for the same dossier after a lost response.
h = setup({ latest: { proof_id: 17, dossier_reference: dossierRef, dossier_state: "VERIFIED" },
  dossier: { event_id: event.id, submission_event_id: event.id,
    attested_origin: "DIRECT_AUTHOR", identity_method: "OFFICIAL_PHONE", dossier_state: "VERIFIED" },
  origin: { ...direct, proof_type: "DIRECT_VERIFIED" } });
h.state.proof = { proof_status: "valid", proof_count: 1 };
await h.open();
h.get("proof-mode").value = "direct";
h.get("proof-mode").listeners.change();
assert.equal(h.get("direct-reference").value, dossierRef);
assert.match(h.get("direct-latest").textContent, /Identifiant 17/);
assert.equal(h.get("direct-record-proof").disabled, true,
  "Après rechargement complet, la dernière preuve relue bloque une répétition sur le même dossier");
assert.equal(h.count("record_direct_publication_canary_evidence_checked"), 0);

console.log("PASS Admin direct CANARY : provenance, fail-closed, dossier, preuve, révocation, concurrence et confidentialité simulés");
