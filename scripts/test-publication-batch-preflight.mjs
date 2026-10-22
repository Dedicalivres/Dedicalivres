import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const worker = pathToFileURL(path.resolve("scripts/publication-jobs.mjs"));
const id = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
let imports = 0;

function fixture() {
  const row = { id, event_id: eventId, target_event_id: eventId,
    reason: "validation", status: "PENDING", attempt_count: 0,
    batch_id: null, commit_sha: null, last_error: null,
    requested_at: "2026-10-14T00:00:00Z" };
  const state = { row, candidate: row, armed: true, halted: false,
    lastReserved: null, cleared: 100,
    history: [{ id: 200, status: "in_progress", conclusion: null }], githubError: false,
    dbError: false, calls: [] };
  state.fetch = async (raw, options = {}) => {
    const url = new URL(raw);
    const method = options.method || "GET";
    state.calls.push({ path: url.pathname, method });
    if (url.hostname === "api.github.com") {
      if (state.githubError) throw new Error("network unavailable");
      return { ok: true, json: async () => ({ workflow_runs: state.history }) };
    }
    if (state.dbError) throw new Error("database unavailable");
    let result;
    if (url.pathname.endsWith("/rpc/publication_canary_status")) {
      result = [{ armed: state.armed, halted: state.halted,
        cleared_through_run_id: state.cleared, last_reserved_at: state.lastReserved }];
    } else if (url.pathname.endsWith("/rpc/publication_canary_candidate")) {
      result = state.candidate ? [state.candidate] : [];
    } else if (url.pathname.endsWith("/rpc/claim_publication_canary_batch")) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_expected.length, 1);
      assert.equal(body.p_expected[0].id, id);
      assert.equal(body.p_run_id, 200);
      result = [{ ...state.row, status: "RUNNING", attempt_count: 1,
        batch_id: body.p_batch_id }];
      state.lastReserved = new Date().toISOString();
    } else if (url.pathname.endsWith("/rpc/record_publication_canary_incident")) {
      state.armed = false;
      state.halted = true;
      result = null;
    } else {
      throw new Error(`Unexpected request ${url.pathname}`);
    }
    return { ok: true, text: async () => JSON.stringify(result) };
  };
  return state;
}

async function invoke(state, command, extra = {}) {
  const oldArgv = process.argv;
  const oldFetch = global.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "PUBLICATION_DOUAI_MANUAL",
    "PUBLICATION_AUTOMATION_ENABLED", "PUBLICATION_PREACTIVATION_TEST",
    "PUBLICATION_P0_RECOVERY", "GITHUB_OUTPUT", "GITHUB_EVENT_NAME",
    "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_REPOSITORY", "GITHUB_TOKEN",
    "PUBLICATION_ERROR", "PUBLICATION_CANARY_BATCH_ID"];
  const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const output = path.join(process.cwd(), `output-${++imports}.txt`);
  process.argv = [process.execPath, worker.pathname, command];
  global.fetch = state.fetch;
  Object.assign(process.env, { SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "test-secret", PUBLICATION_DOUAI_MANUAL: "false",
    PUBLICATION_AUTOMATION_ENABLED: "true", PUBLICATION_PREACTIVATION_TEST: "false",
    PUBLICATION_P0_RECOVERY: "false", GITHUB_OUTPUT: output,
    GITHUB_EVENT_NAME: "schedule", GITHUB_RUN_ID: "200", GITHUB_RUN_ATTEMPT: "1",
    GITHUB_REPOSITORY: "Dedicalivres/Dedicalivres", GITHUB_TOKEN: "test-token", ...extra });
  try {
    await import(`${worker.href}?canary=${imports}`);
    return fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  } finally {
    process.argv = oldArgv;
    global.fetch = oldFetch;
    for (const key of keys) oldEnv[key] === undefined
      ? delete process.env[key] : process.env[key] = oldEnv[key];
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "publication-canary-worker-"));
fs.mkdirSync(path.join(tmp, "scripts/event-publisher"), { recursive: true });
fs.mkdirSync(path.join(tmp, "docs/territoires"), { recursive: true });
fs.copyFileSync(path.join(root, "scripts/event-publisher/legacy-enriched-events.json"),
  path.join(tmp, "scripts/event-publisher/legacy-enriched-events.json"));
fs.writeFileSync(path.join(tmp, "docs/territoires/event-canonical-map.json"), "{}");
process.chdir(tmp);

try {
  const first = fixture();
  assert.match(await invoke(first, "preflight"), /has_pending=true/);
  const claimed=await invoke(first, "claim");
  assert.match(claimed, /job_count=1/);
  const batch=claimed.match(/^batch_id=(.+)$/m)[1];
  assert.equal(JSON.parse(claimed.match(/^publication_jobs=(.+)$/m)[1])[0].batch_id,batch);
  assert.equal(first.calls.filter((call) => call.path.endsWith("/rpc/claim_publication_canary_batch")).length, 1);
  assert.equal(first.calls.filter((call) => call.path.endsWith("/rpc/claim_event_publication_batch")).length, 0);

  const quota = fixture();
  quota.lastReserved = new Date().toISOString();
  assert.match(await invoke(quota, "preflight"), /has_pending=false/);
  assert.equal(quota.calls.some((call) => call.path.endsWith("/rpc/publication_canary_candidate")), false);

  const empty = fixture();
  empty.candidate = null;
  assert.match(await invoke(empty, "preflight"), /has_pending=false/);
  assert.equal(empty.calls.some((call) => call.path.endsWith("/rpc/claim_publication_canary_batch")), false);

  const disarmed = fixture();
  disarmed.armed = false;
  assert.match(await invoke(disarmed, "preflight"), /has_pending=false/);

  const halted = fixture();
  halted.halted = true;
  await assert.rejects(invoke(halted, "preflight"), /incident persistant/);

  const incident = fixture();
  await invoke(incident, "canary-incident", { PUBLICATION_ERROR: "generation" });
  assert.equal(incident.halted, true);
  await assert.rejects(invoke(incident, "preflight"), /incident persistant/);

  const unrecorded = fixture();
  unrecorded.dbError = true;
  await assert.rejects(invoke(unrecorded, "canary-incident"), /incident non consigné/);
  unrecorded.dbError = false;
  unrecorded.history.push({ id: 150, status: "completed", conclusion: "failure" });
  await assert.rejects(invoke(unrecorded, "preflight"), /incident GitHub Actions/);

  const failedRun = fixture();
  failedRun.history.push({ id: 150, status: "completed", conclusion: "failure" });
  await assert.rejects(invoke(failedRun, "preflight"), /incident GitHub Actions/);
  assert.equal(failedRun.calls.some((call) => call.path.endsWith("/rpc/claim_publication_canary_batch")), false);
  const cancelledRun = fixture();
  cancelledRun.history.push({ id: 151, status: "completed", conclusion: "cancelled" });
  await assert.rejects(invoke(cancelledRun, "preflight"), /incident GitHub Actions/);

  const apiDown = fixture();
  apiDown.githubError = true;
  await assert.rejects(invoke(apiDown, "preflight"), /historique GitHub Actions inaccessible/);
  const dbDown = fixture();
  dbDown.dbError = true;
  await assert.rejects(invoke(dbDown, "preflight"), /état de sécurité inaccessible/);

  const rerun = fixture();
  await assert.rejects(invoke(rerun, "preflight", { GITHUB_RUN_ATTEMPT: "2" }), /relancement interdit/);
  assert.equal(rerun.calls.length, 0);

  const changed = fixture();
  assert.match(await invoke(changed, "preflight"), /has_pending=true/);
  changed.candidate = null;
  await assert.rejects(invoke(changed, "claim"), /candidat modifié/);
  assert.equal(changed.calls.some((call) => call.path.endsWith("/rpc/claim_publication_canary_batch")), false);

  for (const reason of ["edit", "unpublish", "delete"]) {
    const incompatible = fixture();
    incompatible.candidate = { ...incompatible.row, reason };
    await assert.rejects(invoke(incompatible, "preflight"), /sélection incompatible/);
  }

  const disabled = fixture();
  await assert.rejects(invoke(disabled, "preflight", {
    PUBLICATION_AUTOMATION_ENABLED: "false" }), /mode de publication incompatible/);
  assert.equal(disabled.calls.length, 0);
  const douai = fixture();
  assert.match(await invoke(douai, "preflight", {
    PUBLICATION_DOUAI_MANUAL: "true", PUBLICATION_AUTOMATION_ENABLED: "false",
  }), /has_pending=true/);
  assert.equal(douai.calls.length, 0);
} finally {
  process.chdir(root);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("PASS CANARY précontrôle, quota, incident persistant et réservation unique");
