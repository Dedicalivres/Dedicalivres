import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync("admin-watch.js", "utf8");
const loadStart = source.indexOf("async function loadEventWatchAlerts(");
const renderStart = source.indexOf("function renderEventWatchAlerts(", loadStart);
const loadSource = source.slice(loadStart, renderStart);

assert.match(loadSource, /await startWatchPersistenceLoad\(\)/);
assert.match(loadSource, /mergeEventWatchAlerts\(localAlerts, watchPersistenceSnapshot\.eventAlerts\)/);
assert.match(loadSource, /mergeEventWatchAlerts\(\[\], watchPersistenceSnapshot\.eventAlerts\)/);
assert.ok(!loadSource.includes('.from("events")'), "Le fallback Event Watch ne doit jamais modifier public.events");
assert.ok(!loadSource.includes(".insert("), "Le chargement Event Watch doit rester sans écriture");

const instrumented = source.replace(/\}\)\(\);\s*$/, `
  globalThis.__EVENT_WATCH_FALLBACK_TEST_API__ = {
    setSnapshot(value) {
      watchPersistenceSnapshot = { ...createEmptyWatchPersistenceSnapshot(), ...(value || {}) };
      watchPersistenceLoadPromise = Promise.resolve(watchPersistenceSnapshot);
    },
    setAlerts(value) { eventWatchAlerts = value; },
    getAlerts() { return eventWatchAlerts; },
    getAvailability() { return eventWatchAvailability; },
    loadEventWatchAlerts,
    mergeEventWatchAlerts
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
const container = {
  innerHTML: "",
  querySelectorAll() { return []; }
};
const status = { textContent: "", dataset: {} };
const document = {
  readyState: "loading",
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById(id) {
    if (id === "event-watch-alerts") return container;
    if (id === "event-watch-status") return status;
    return null;
  },
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
  fetch: async () => { throw new Error("Load failed"); }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.requestAnimationFrame = (callback) => callback();
sandbox.window.DEDICALIVRES_CONFIG = {};

vm.runInNewContext(instrumented, sandbox, { filename: "admin-watch.js" });
const api = sandbox.__EVENT_WATCH_FALLBACK_TEST_API__;
assert.ok(api, "API de test fallback Event Watch indisponible");

const eventId = "00000000-0000-4000-8000-000000000611";
const alertId = "00000000-0000-4000-8000-000000000612";
const serverAlert = {
  id: alertId,
  identity_key: "event-watch:v1:fontvieille-date",
  engine_origin: "automatte-local",
  engine_alert_id: "engine-fontvieille-date",
  event_id: eventId,
  field: "date",
  field_label: "Date",
  event_title: "Salon du livre",
  event_date: "2026-09-20",
  event_city: "Fontvieille",
  old_value: "2026-09-20",
  new_value: "2026-09-21",
  source_url: "https://www.fontvieille.fr/agenda/salon-du-livre/",
  proof: { text: "Nouvelle date annoncée" },
  detected_at: "2026-08-30T09:00:00.000Z",
  confidence: 0.95,
  status_label: "Changement probable",
  workflow_status: "review",
  status_updated_at: "2026-08-30T09:00:00.000Z",
  version: 1
};
const localAlert = {
  id: "engine-fontvieille-date",
  dedicalivres_event_id: eventId,
  field: "date",
  field_label: "Date",
  event_title: "Salon du livre",
  event_date: "2026-09-20",
  event_city: "Fontvieille",
  old_value: "2026-09-20",
  new_value: "2026-09-21",
  source: serverAlert.source_url,
  proof: serverAlert.proof,
  detected_at: serverAlert.detected_at,
  confidence: 95,
  status_label: serverAlert.status_label
};

// Bridge disponible : fusion locale + serveur, une seule carte logique.
api.setSnapshot({
  availability: "server",
  componentAvailability: { candidates: "available", sources: "available", eventAlerts: "available" },
  eventAlerts: [serverAlert]
});
sandbox.fetch = async () => ({
  ok: true,
  json: async () => ({ ok: true, changes: [localAlert] })
});
await api.loadEventWatchAlerts();
assert.equal(api.getAvailability(), "available");
assert.equal(api.getAlerts().length, 1);
assert.equal(api.getAlerts()[0].id, localAlert.id, "L'identité moteur doit rester la clé UI lorsque le bridge répond");
assert.equal(api.getAlerts()[0].identity_key, serverAlert.identity_key);
assert.equal(api.getAlerts()[0].serverPersisted, true);

// Bridge indisponible : l'alerte serveur reste affichée et le statut local reste explicite.
api.setAlerts([]);
container.innerHTML = "";
status.textContent = "";
sandbox.fetch = async () => { throw new Error("Load failed"); };
await api.loadEventWatchAlerts();
assert.equal(api.getAvailability(), "unavailable");
assert.equal(api.getAlerts().length, 1);
assert.equal(api.getAlerts()[0].dedicalivres_event_id, eventId);
assert.equal(api.getAlerts()[0].source, serverAlert.source_url);
assert.ok(container.innerHTML.includes("Salon du livre"), "L'alerte persistée doit produire une carte visible");
assert.ok(status.textContent.includes("Auto-Matte local indisponible"));
assert.ok(status.textContent.includes("1 alerte(s) persistée(s) affichée(s)"));

// Bridge indisponible et serveur vide : aucun faux résultat, message d'indisponibilité explicite.
api.setSnapshot({
  availability: "server",
  componentAvailability: { candidates: "available", sources: "available", eventAlerts: "available" },
  eventAlerts: []
});
api.setAlerts([localAlert]);
container.innerHTML = "";
status.textContent = "";
await api.loadEventWatchAlerts();
assert.equal(api.getAlerts().length, 0);
assert.ok(container.innerHTML.includes("Aucun changement local ou persisté"));
assert.ok(status.textContent.includes("Event Watch indisponible"));

console.log("ADMIN_EVENT_WATCH_SERVER_FALLBACK_OK");
