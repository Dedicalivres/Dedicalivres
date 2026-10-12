import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const worker = pathToFileURL(path.resolve("scripts/publication-jobs.mjs"));
const originalCwd = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "publication-p0-recovery-"));
fs.mkdirSync(path.join(fixtureRoot, "scripts/event-publisher"), {recursive:true});
fs.mkdirSync(path.join(fixtureRoot, "docs/territoires"), {recursive:true});
fs.mkdirSync(path.join(fixtureRoot, "evenement"), {recursive:true});
fs.copyFileSync(path.join(originalCwd, "scripts/event-publisher/legacy-enriched-events.json"),
  path.join(fixtureRoot, "scripts/event-publisher/legacy-enriched-events.json"));
fs.writeFileSync(path.join(fixtureRoot, "docs/territoires/event-canonical-map.json"),
  JSON.stringify({"c69b157c-bf2f-4ddf-affa-a57497d261c2":"evenement/pascal.html"}));
fs.writeFileSync(path.join(fixtureRoot, "evenement/pascal.html"), "ancienne fiche Pascal");
process.chdir(fixtureRoot);
const targets = [
  ["c098bfc8-4482-4452-857d-d9227b422a41", "c69b157c-bf2f-4ddf-affa-a57497d261c2", "unpublish"],
  ["21d2d1eb-5b65-46e3-9624-0e877df1702d", "14b81335-1dab-4f6d-9667-5e88675c6f98", "validation"],
];
let importNumber = 0;

function fixture() {
  const jobs = targets.map(([id, eventId, reason]) => ({
    id, event_id: eventId, target_event_id: eventId, reason,
    status: "FAILED", attempt_count: 3, batch_id: null, commit_sha: null,
    requested_at: "2026-10-11T13:20:54Z", last_error: "Échec précédent",
  }));
  jobs.push({
    id: "99999999-9999-4999-8999-999999999999",
    event_id: "88888888-8888-4888-8888-888888888888",
    target_event_id: "88888888-8888-4888-8888-888888888888",
    reason: "validation", status: "PENDING", attempt_count: 0,
    batch_id: null, commit_sha: null, requested_at: "2026-10-11T14:00:00Z",
  });
  const events = [
    { id: targets[0][1], validated: false, rejected: true },
    { id: targets[1][1], validated: true, rejected: false },
  ];
  const patches = [];
  let injectThird = false;

  function selectedRows(url) {
    let rows = jobs;
    const idFilter = url.searchParams.get("id");
    if (idFilter) {
      const ids = idFilter.startsWith("in.(")
        ? idFilter.slice(4, -1).split(",")
        : [idFilter.slice(3)];
      rows = rows.filter((row) => ids.includes(row.id));
      if (injectThird && url.pathname.endsWith("event_publication_jobs")) {
        rows = [...rows, jobs[2]];
      }
    }
    const status = url.searchParams.get("status");
    if (status) rows = rows.filter((row) => row.status === status.slice(3));
    const attempts = url.searchParams.get("attempt_count");
    if (attempts) rows = rows.filter((row) => row.attempt_count === Number(attempts.slice(3)));
    const batch = url.searchParams.get("batch_id");
    if (batch) rows = rows.filter((row) => batch === "is.null" ? row.batch_id === null : row.batch_id === batch.slice(3));
    const commit = url.searchParams.get("commit_sha");
    if (commit === "is.null") rows = rows.filter((row) => row.commit_sha === null);
    return rows;
  }

  async function fetchMock(rawUrl, options = {}) {
    const url = new URL(rawUrl);
    const method = options.method || "GET";
    if (url.pathname.endsWith("/events")) {
      assert.equal(method, "GET");
      return { ok: true, text: async () => JSON.stringify(events) };
    }
    assert.ok(url.pathname.endsWith("/event_publication_jobs"));
    if (method === "GET") {
      return { ok: true, text: async () => JSON.stringify(selectedRows(url)) };
    }
    assert.equal(method, "PATCH");
    const payload = JSON.parse(options.body);
    const rows = selectedRows(url);
    for (const row of rows) Object.assign(row, payload);
    patches.push({ ids: rows.map((row) => row.id), payload });
    return { ok: true, text: async () => JSON.stringify(rows) };
  }

  return { jobs, events, patches, fetchMock, injectThird: () => { injectThird = true; } };
}

async function invoke(state, command, args = [], extraEnv = {}) {
  const oldArgv = process.argv;
  const oldFetch = global.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "PUBLICATION_P0_RECOVERY", "PUBLICATION_AUTOMATION_ENABLED", "PUBLICATION_PREACTIVATION_TEST", "PUBLICATION_ERROR", "GITHUB_OUTPUT"];
  const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.argv = [process.execPath, worker.pathname, command, ...args];
  global.fetch = state.fetchMock;
  Object.assign(process.env, {
    SUPABASE_URL: "https://example.invalid", SUPABASE_SECRET_KEY: "test-secret",
    PUBLICATION_P0_RECOVERY: "true", PUBLICATION_AUTOMATION_ENABLED: "false",
    PUBLICATION_PREACTIVATION_TEST: "false", ...extraEnv,
  });
  delete process.env.GITHUB_OUTPUT;
  try {
    await import(`${worker.href}?test=${++importNumber}`);
  } finally {
    process.argv = oldArgv;
    global.fetch = oldFetch;
    for (const key of keys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
}

const state = fixture();
await invoke(state, "claim");
assert.equal(state.patches.length, 1);
assert.deepEqual(new Set(state.patches[0].ids), new Set(targets.map(([id]) => id)));
assert.equal(state.patches[0].payload.attempt_count, 4);
assert.equal(state.patches[0].payload.status, "RUNNING");
assert.equal(state.patches[0].payload.requested_at, undefined);
assert.equal(state.patches[0].payload.last_error, undefined);
assert.equal(state.jobs[2].status, "PENDING");
for (const row of state.jobs.slice(0, 2)) {
  assert.equal(row.requested_at, "2026-10-11T13:20:54Z");
  assert.equal(row.last_error, "Échec précédent");
}
const batchId = state.jobs[0].batch_id;
await invoke(state, "verify-recovery", [batchId]);
await assert.rejects(invoke(state, "success", ["wrong-batch", "a".repeat(40)]), /batch non conforme/);
await assert.rejects(invoke(state, "claim"), /publication déjà en cours/);
state.events[1].validated = false;
await assert.rejects(invoke(state, "verify-recovery", [batchId]), /état inattendu/);
state.events[1].validated = true;
await invoke(state, "success", [batchId, "a".repeat(40)]);
assert.ok(state.jobs.slice(0, 2).every((row) => row.status === "SUCCESS" && row.attempt_count === 4 && row.last_error === "Échec précédent"));
await assert.rejects(invoke(state, "claim"), /état inattendu/);
assert.equal(state.patches.length, 2);

const failure = fixture();
await invoke(failure, "claim");
await invoke(failure, "fail", [failure.jobs[0].batch_id]);
assert.ok(failure.jobs.slice(0, 2).every((row) => row.status === "FAILED" && row.attempt_count === 4 && row.last_error.includes("Échec précédent")));
await assert.rejects(invoke(failure, "claim"), /état inattendu/);
assert.equal(failure.patches.length, 3);

const mixedBatch = fixture();
await invoke(mixedBatch, "claim");
mixedBatch.jobs[2].status = "RUNNING";
mixedBatch.jobs[2].batch_id = mixedBatch.jobs[0].batch_id;
await assert.rejects(invoke(mixedBatch, "success", [mixedBatch.jobs[0].batch_id, "a".repeat(40)]), /batch non conforme/);
await assert.rejects(invoke(mixedBatch, "fail", [mixedBatch.jobs[0].batch_id]), /batch non conforme/);
assert.equal(mixedBatch.patches.length, 1);

for (const change of [
  (sample) => sample.injectThird(),
  (sample) => { sample.jobs[0].status = "SUCCESS"; },
  (sample) => { sample.events[0].rejected = false; },
  (sample) => { sample.jobs[2].status = "RUNNING"; },
]) {
  const sample = fixture();
  change(sample);
  await assert.rejects(invoke(sample, "claim"));
  assert.equal(sample.patches.length, 0);
}

const disabled = fixture();
await assert.rejects(invoke(disabled, "claim", [], { PUBLICATION_AUTOMATION_ENABLED: "true" }), /incompatible/);
await assert.rejects(invoke(disabled, "claim", [], { PUBLICATION_PREACTIVATION_TEST: "true" }), /incompatible/);
assert.equal(disabled.patches.length, 0);

console.log("PASS reprise P0 : deux IDs, états métier, concurrence, historique et exécution unique");
process.chdir(originalCwd);
fs.rmSync(fixtureRoot, {recursive:true, force:true});
