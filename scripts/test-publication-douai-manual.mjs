import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const worker = pathToFileURL(path.resolve("scripts/publication-jobs.mjs"));
const jobId = "af1a386a-1b9d-4eeb-b162-6b34c32d667b";
const eventId = "d04e32a8-1f92-4068-bf73-d17e672950aa";
let imports = 0;

function fixture() {
  const job = { id: jobId, event_id: eventId, target_event_id: eventId,
    reason: "validation", status: "PENDING", attempt_count: 0,
    batch_id: null, commit_sha: null, requested_at: "2026-10-12T00:00:00Z" };
  const event = { id: eventId, validated: true, rejected: false };
  const other = { id: "99999999-9999-4999-8999-999999999999",
    status: "PENDING", attempt_count: 0 };
  const calls = [];
  return { job, event, other, calls, async fetch(raw, options = {}) {
    const url = new URL(raw);
    const method = options.method || "GET";
    calls.push({ method, pathname: url.pathname, search: url.search });
    if (url.pathname.endsWith("/rpc/claim_event_publication_batch")) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.p_expected, [job]);
      job.status = "RUNNING";
      job.attempt_count = 1;
      job.batch_id = body.p_batch_id;
      return { ok: true, text: async () => JSON.stringify([job]) };
    }
    if (url.pathname.endsWith("/events")) {
      return { ok: true, text: async () => JSON.stringify([event]) };
    }
    if (url.searchParams.get("status") === "eq.RUNNING") {
      const rows = job.status === "RUNNING" ? [job] : [];
      return { ok: true, text: async () => JSON.stringify(rows) };
    }
    assert.equal(url.searchParams.get("id"), `eq.${jobId}`);
    return { ok: true, text: async () => JSON.stringify([job]) };
  }};
}

async function invoke(state, env = {}) {
  const previousArgv = process.argv;
  const previousFetch = global.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "PUBLICATION_DOUAI_MANUAL",
    "PUBLICATION_AUTOMATION_ENABLED", "PUBLICATION_PREACTIVATION_TEST",
    "PUBLICATION_P0_RECOVERY", "GITHUB_OUTPUT"];
  const previousEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.argv = [process.execPath, worker.pathname, "claim"];
  global.fetch = state.fetch;
  Object.assign(process.env, { SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "test-secret", PUBLICATION_DOUAI_MANUAL: "true",
    PUBLICATION_AUTOMATION_ENABLED: "false", PUBLICATION_PREACTIVATION_TEST: "false",
    PUBLICATION_P0_RECOVERY: "false", ...env });
  delete process.env.GITHUB_OUTPUT;
  const logs=[],log=console.log;console.log=(...p)=>logs.push(p.join(" "));
  try { await import(`${worker.href}?douai=${++imports}`); return logs; }
  finally {
    console.log=log;
    process.argv = previousArgv;
    global.fetch = previousFetch;
    for (const key of keys) previousEnv[key] === undefined
      ? delete process.env[key] : process.env[key] = previousEnv[key];
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "publication-douai-"));
fs.mkdirSync(path.join(tmp, "scripts/event-publisher"), { recursive: true });
fs.mkdirSync(path.join(tmp, "docs/territoires"), { recursive: true });
fs.copyFileSync(path.join(root, "scripts/event-publisher/legacy-enriched-events.json"),
  path.join(tmp, "scripts/event-publisher/legacy-enriched-events.json"));
fs.writeFileSync(path.join(tmp, "docs/territoires/event-canonical-map.json"), "{}");
process.chdir(tmp);

try {
  const valid = fixture();
  const output=await invoke(valid);
  const selected=JSON.parse(output.find(l=>l.startsWith("publication_jobs=")).split("=").slice(1).join("="));
  assert.equal(selected[0].batch_id,valid.job.batch_id);
  assert.equal(valid.job.status, "RUNNING");
  assert.equal(valid.job.attempt_count, 1);
  assert.equal(valid.other.status, "PENDING");
  assert.equal(valid.calls.filter((call) => call.method !== "GET").length, 1);

  for (const change of [
    (s) => { s.job.id = "88888888-8888-4888-8888-888888888888"; },
    (s) => { s.job.event_id = "88888888-8888-4888-8888-888888888888"; },
    (s) => { s.job.target_event_id = "88888888-8888-4888-8888-888888888888"; },
    (s) => { s.job.reason = "edit"; },
    (s) => { s.job.attempt_count = 1; },
    (s) => { s.job.batch_id = "77777777-7777-4777-8777-777777777777"; },
    (s) => { s.job.commit_sha = "a".repeat(40); },
    (s) => { s.job.status = "RUNNING"; },
    (s) => { s.job.status = "SUCCESS"; },
    (s) => { s.event.validated = false; },
    (s) => { s.event.rejected = true; },
  ]) {
    const state = fixture();
    change(state);
    await assert.rejects(invoke(state), /STOP Douai/);
    assert.equal(state.calls.filter((call) => call.method !== "GET").length, 0);
  }

  const concurrent = fixture();
  concurrent.job.status = "RUNNING";
  await assert.rejects(invoke(concurrent), /publication déjà en cours/);
  assert.equal(concurrent.calls.filter((call) => call.method !== "GET").length, 0);

  const disabled = fixture();
  await assert.rejects(invoke(disabled, { PUBLICATION_DOUAI_MANUAL: "false" }),
    /automatisation désactivée/);
  assert.equal(disabled.calls.length, 0);

  const incompatible = fixture();
  await assert.rejects(invoke(incompatible, { PUBLICATION_AUTOMATION_ENABLED: "true" }),
    /mode manuel incompatible/);
  assert.equal(incompatible.calls.length, 0);
} finally {
  process.chdir(root);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("PASS Douai manuel : sélection unique, refus strict et RPC atomique");
