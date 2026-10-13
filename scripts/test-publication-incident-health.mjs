import assert from "node:assert/strict";
import {
  classifyPublicationHealth,
  readPublicationJobs,
} from "./publication-incident-health.mjs";

const NOW = new Date("2026-10-13T12:00:00Z");
const REFERENCE = "2026-10-13T00:00:00Z";
const base = { id: "job-private-id", requested_at: "2026-10-13T11:00:00Z",
  started_at: "2026-10-13T11:30:00Z", finished_at: "2026-10-13T11:30:00Z" };
const health = (rows, options = {}) => classifyPublicationHealth(rows,
  { now: () => NOW, incidentReferenceAt: REFERENCE, ...options });

assert.equal(health([]).state, "HEALTHY");
assert.equal(health([{ ...base, status: "RUNNING", started_at: "2026-10-13T11:30:01Z" }])
  .counts.signals.running_in_progress, 1);
assert.equal(health([{ ...base, status: "RUNNING", started_at: "2026-10-13T11:15:00Z" }])
  .counts.signals.running_suspect, 1);
const runningWithoutDate = health([{ ...base, status: "RUNNING", started_at: null }]);
assert.equal(runningWithoutDate.counts.signals.anomaly, 1);
assert.equal(runningWithoutDate.state, "UNKNOWN");
assert.equal(health([{ ...base, status: "PENDING", requested_at: "2026-10-13T10:00:00Z" }],
  { automationEnabled: false }).counts.signals.pending_suppressed, 1);
assert.equal(health([{ ...base, status: "PENDING", requested_at: "2026-10-13T10:00:00Z" }],
  { automationEnabled: true }).counts.signals.pending_delayed, 1);
assert.equal(health([{ ...base, status: "FAILED", finished_at: "2026-10-12T23:00:00Z" }])
  .counts.signals.failed_historical, 1);
assert.equal(health([{ ...base, status: "FAILED" }]).counts.signals.failed_recent, 1);
assert.equal(health([{ ...base, status: "BLOCKED" }]).counts.signals.blocked_recent, 1);
assert.equal(health([{ ...base, status: "FAILED" }], { incidentReferenceAt: null }).state,
  "UNKNOWN");
const incoherentDate = health([
  { ...base, status: "PENDING", requested_at: "2026-10-14T00:00:00Z" },
], { automationEnabled: true });
assert.equal(incoherentDate.counts.signals.anomaly, 1);
assert.equal(incoherentDate.state, "UNKNOWN");

function response(rows, range = `0-${rows.length - 1}/${rows.length}`, status = 200) {
  return { ok: status >= 200 && status < 300, status,
    headers: { get: (name) => name.toLowerCase() === "content-range" ? range : null },
    text: async () => JSON.stringify(rows) };
}

async function expectReadFailure(fetchImpl, pattern) {
  await assert.rejects(readPublicationJobs({ url: "https://example.invalid", key: "test-key",
    fetchImpl }), pattern);
}

await expectReadFailure(async () => { throw new Error("secret network detail"); },
  /NETWORK_UNAVAILABLE/);
await expectReadFailure(async () => response([], "0-0/0", 401), /HTTP_401/);
await expectReadFailure(async () => ({ ok: true, status: 200,
  headers: { get: () => "0-0/1" }, text: async () => "not-json" }), /JSON_INVALID/);
await expectReadFailure(async () => response([{ ...base, status: "RUNNING" }], "0-0/2"),
  /PAGINATION_TRUNCATED/);
assert.deepEqual(await readPublicationJobs({ url: "https://example.invalid", key: "test-key",
  fetchImpl: async () => response([], "*/0") }), []);

const calls = [];
const rows = await readPublicationJobs({ url: "https://example.invalid", key: "test-key",
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return response([{ ...base, status: "RUNNING", dispatch_token: "private-token",
      last_error: "private-error", contact: "private-contact" }], "0-0/1");
  } });
assert.equal(calls.length, 1);
assert.equal(calls[0].options.method, "GET");
assert.doesNotMatch(calls[0].url, /last_error|dispatch_token|event_id|contact/);
assert.equal(calls.some((call) => call.options.method !== "GET"), false);

const publicReport = JSON.stringify(health(rows));
assert.doesNotMatch(publicReport, /job-private-id|private-token|private-error|private-contact/);
assert.match(publicReport, /mutations_performed":0/);

console.log("PASS observation incidents : classification, STOP, GET-only et confidentialité");
