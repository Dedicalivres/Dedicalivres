import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../admin-author-profile-submissions.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/20261001153248_author_profile_submissions.sql", import.meta.url), "utf8");
const calls = [];
const submission = { id: "submission-1", request_type: "create", payload: {}, status: "pending", created_at: "2026-10-01T00:00:00Z" };
const feedback = { textContent: "", className: "" };
const list = { innerHTML: "" };
const count = { textContent: "" };
let clickHandler;
let answer;
let rpcResult = { data: true, error: null };
const card = { dataset: { authorProfileSubmission: submission.id }, querySelectorAll: () => [button] };
const button = { dataset: { profileSubmissionAction: "reject" }, disabled: false, closest: () => card };
const elements = {
  "author-profile-submissions-panel": { addEventListener: (name, handler) => { if (name === "click") clickHandler = handler; } },
  "author-profile-submissions-list": list,
  "author-profile-submissions-count": count,
  "author-profile-submissions-feedback": feedback
};
const client = {
  from(table) {
    assert.equal(table, "author_profile_submissions", "aucune écriture sur la fiche publique");
    return {
      select() { return this; }, eq() { return this; }, order() { return this; },
      limit() { return Promise.resolve({ data: [submission], error: null }); }
    };
  },
  async rpc(name, args) {
    calls.push({ name, args });
    return rpcResult;
  }
};
const window = {
  DEDICALIVRES_CONFIG: { supabaseUrl: "https://example.test", supabaseAnonKey: "public-test-key" },
  DEDICALIVRES_AUTHOR_CONTRIBUTION: { compareSubmission: () => [], findStrongExistingAuthorMatch: () => null },
  DEDICALIVRES_ADMIN_AUTHENTICATED: true,
  supabase: { createClient: () => client },
  getDedicalivresSupabaseClient: () => client,
  addEventListener() {},
  prompt: () => answer
};
const document = { getElementById: (id) => elements[id] || null };
vm.runInNewContext(source, { window, document, Date, Intl });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(typeof clickHandler, "function");

async function reject(value) {
  answer = value;
  await clickHandler({ target: { closest: () => button } });
}

await reject(null);
await reject("   ");
await reject("x".repeat(501));
assert.equal(calls.length, 0, "annulation et motifs invalides sans écriture");
assert.match(feedback.textContent, /1 et 500 caractères/);

await reject("  Données inexactes  ");
assert.equal(calls.length, 1);
assert.equal(calls[0].name, "reject_author_profile_submission");
assert.equal(calls[0].args.p_submission_id, submission.id);
assert.equal(calls[0].args.p_reason, "Données inexactes");
assert.equal(button.disabled, false);

rpcResult = { data: null, error: { message: "Erreur Supabase simulée" } };
await reject("Motif valable");
assert.equal(calls.length, 2);
assert.match(feedback.textContent, /Erreur Supabase simulée/);
assert.equal(button.disabled, false, "les actions restent disponibles après erreur");

let finishDecision;
rpcResult = new Promise((resolve) => { finishDecision = resolve; });
answer = "Motif concurrent";
const firstDecision = clickHandler({ target: { closest: () => button } });
await clickHandler({ target: { closest: () => button } });
assert.equal(calls.length, 3, "une seule décision pendant la RPC en cours");
assert.equal(button.disabled, true);
finishDecision({ data: true, error: null });
await firstDecision;
assert.equal(button.disabled, false);

assert.doesNotMatch(migration.match(/create or replace function public\.reject_author_profile_submission[\s\S]*?\$\$;/)?.[0] || "", /update public\.authors/);
console.log("PASS rejet auteur : motif, limites, annulation, erreur RPC et fiche publique intacte");
