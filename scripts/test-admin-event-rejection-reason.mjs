import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const classic = fs.readFileSync("admin.js", "utf8");
const v11 = fs.readFileSync("admin-shell.js", "utf8");
const comptoir = fs.readFileSync("admin-comptoir.js", "utf8");
const sql = fs.readFileSync("supabase/migrations/20261009204509_admin_event_rejection_reason.sql", "utf8");

function section(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `section ${from}`);
  return source.slice(start, end);
}

const classicSource = section(classic, "async function rejectEvent(id) {", "\nasync function showEventRejectionReason");
const v11Source = section(v11, "  async function runV11EventAction(action) {", "\n  if (eventValidateButton)");
const event = { id: "event-1", title: "Livre test", validated: true, rejected: false };

async function exerciseClassic(answer, response = { data: true, error: null }) {
  const calls = [];
  const messages = [];
  const context = {
    eventRejectionsInFlight: new Set(), allEvents: [event],
    ensureAdminSession: async () => true,
    window: { prompt: () => answer },
    supabaseClient: { rpc: async (name, args) => { calls.push({ name, args }); return response; } },
    showToast: (message) => messages.push(message),
    loadDashboard: async () => {}, recordAdminAction: () => {}, eventActionLabel: () => event.title
  };
  const reject = vm.runInNewContext(`(${classicSource.trim()})`, context);
  const result = await reject(event.id);
  return { result, calls, messages };
}

for (const invalid of [null, "  ", "x".repeat(501)]) {
  const result = await exerciseClassic(invalid);
  assert.equal(result.result, false);
  assert.equal(result.calls.length, 0, "aucune écriture si annulation ou motif invalide");
}
const accepted = await exerciseClassic("  Données inexactes  ");
assert.equal(accepted.result, true);
assert.equal(accepted.calls[0].name, "reject_event_with_reason");
assert.equal(accepted.calls[0].args.p_reason, "Données inexactes");
const failed = await exerciseClassic("Motif valable", { data: null, error: { message: "Erreur simulée" } });
assert.equal(failed.result, false);
assert.match(failed.messages.join(" "), /Erreur simulée/);

let finish;
const concurrentCalls = [];
const concurrentContext = {
  eventRejectionsInFlight: new Set(), allEvents: [event], ensureAdminSession: async () => true,
  window: { prompt: () => "Concurrence" },
  supabaseClient: { rpc: (name, args) => { concurrentCalls.push({ name, args }); return new Promise((resolve) => { finish = resolve; }); } },
  showToast: () => {}, loadDashboard: async () => {}, recordAdminAction: () => {}, eventActionLabel: () => event.title
};
const rejectConcurrent = vm.runInNewContext(`(${classicSource.trim()})`, concurrentContext);
const first = rejectConcurrent(event.id);
const second = rejectConcurrent(event.id);
assert.equal(await second, false);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(concurrentCalls.length, 1);
finish({ data: true, error: null });
assert.equal(await first, true);

async function exerciseV11(answer, response = { data: true, error: null }) {
  const calls = [];
  const alerts = [];
  const messages = [];
  const state = { v11EventActionRunning: false };
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return response; } };
  const context = {
    context: { getState: () => ({ authenticated: true }), getClient: () => client },
    getSelectedV11Event: () => event,
    setV11EventActionsBusy: (busy) => { state.v11EventActionRunning = busy; },
    window: { prompt: () => answer, alert: (message) => alerts.push(message) },
    v11ActionMessage: (message) => messages.push(message),
    refreshV11AfterEventAction: async () => {}, renderEventDetail: () => {},
    console: { error() {} }, ...state
  };
  const run = vm.runInNewContext(`(${v11Source.trim()})`, context);
  await run("reject");
  return { calls, alerts, messages };
}
assert.equal((await exerciseV11(null)).calls.length, 0);
assert.equal((await exerciseV11("  ")).calls.length, 0);
assert.equal((await exerciseV11("x".repeat(501))).calls.length, 0);
const v11Accepted = await exerciseV11("  Motif V11  ");
assert.equal(v11Accepted.calls[0].name, "reject_event_with_reason");
assert.equal(v11Accepted.calls[0].args.p_reason, "Motif V11");
const v11Failed = await exerciseV11("Motif", { data: null, error: { message: "Droits insuffisants" } });
assert.match(v11Failed.alerts.join(" "), /Droits insuffisants/);

let finishV11;
const v11ConcurrentCalls = [];
const v11Context = {
  v11EventActionRunning: false,
  context: {
    getState: () => ({ authenticated: true }),
    getClient: () => ({ rpc: (name, args) => {
      v11ConcurrentCalls.push({ name, args });
      return new Promise((resolve) => { finishV11 = resolve; });
    } })
  },
  getSelectedV11Event: () => event,
  window: { prompt: () => "Motif concurrent", alert: () => {} },
  v11ActionMessage: () => {}, refreshV11AfterEventAction: async () => {},
  renderEventDetail: () => {}, console
};
v11Context.setV11EventActionsBusy = (busy) => { v11Context.v11EventActionRunning = busy; };
const rejectV11Concurrent = vm.runInNewContext(`(${v11Source.trim()})`, v11Context);
const firstV11 = rejectV11Concurrent("reject");
await rejectV11Concurrent("reject");
assert.equal(v11ConcurrentCalls.length, 1, "V11 bloque une seconde décision simultanée");
finishV11({ data: true, error: null });
await firstV11;

const reasonSource = section(classic, "async function showEventRejectionReason(id) {", "\nasync function showEventModerationHistory");
const reasonAlerts = [];
const showReason = vm.runInNewContext(`(${reasonSource.trim()})`, {
  ensureAdminSession: async () => true,
  supabaseClient: { rpc: async () => ({ data: [{ reason: "Motif privé" }], error: null }) },
  window: { alert: (message) => reasonAlerts.push(message) }, showToast: () => {}
});
await showReason(event.id);
assert.match(reasonAlerts[0], /Motif privé/);

assert.match(classic, /get_event_rejection_reason/);
assert.match(v11, /get_event_rejection_reason/);
assert.match(comptoir, /kind !== "event" && act === "no"/);
assert.match(sql, /create table private\.event_rejection_reasons/);
assert.match(sql, /enable row level security/);
assert.match(sql, /security invoker/g);
assert.match(sql, /ADMIN_REQUIRED/);
assert.match(sql, /char_length\(cleaned_reason\) not between 1 and 500/);
assert.match(sql, /update public\.events[\s\S]*?insert into private\.event_rejection_reasons/);
assert.match(sql, /revoke all on function public\.get_event_rejection_reason\(uuid\) from public, anon/);
assert.doesNotMatch(sql, /admin_note/);
assert.doesNotMatch(classicSource + v11Source, /\.from\("events"\)\s*\.update\(\{\s*rejected: true/);
assert.match(v11, /\.from\("events"\)[\s\S]*?validated: true,[\s\S]*?rejected: false/);
console.log("PASS motif événement : 2 interfaces, annulation, validation, erreur, concurrence, confidentialité, publication");
