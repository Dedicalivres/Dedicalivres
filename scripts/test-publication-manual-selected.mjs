import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { sealIsolation } from "./targeted-source-isolation.mjs";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const worker = pathToFileURL(path.resolve("scripts/publication-jobs.mjs"));
const workflow = fs.readFileSync(".github/workflows/publish-events.yml", "utf8");
assert.match(workflow, /manual_mode:[\s\S]*?default: preview/);
assert.match(workflow, /manual-preview:[\s\S]*?permissions:\s*contents: read[\s\S]*?preview-selected/);
assert.match(workflow, /inputs\.manual_mode == 'execute'/);
assert.match(workflow, /vars\.PUBLICATION_AUTOMATION_ENABLED == 'true'/);
assert.match(workflow, /- name: Preflight publication queue[\s\S]*?- name: Install publisher dependencies/);
assert.match(workflow, /Recheck public event source before push[\s\S]*?Commit and push publication/);
const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const legacy = JSON.parse(fs.readFileSync("scripts/event-publisher/legacy-enriched-events.json", "utf8")).events;
const legacyIds = Object.keys(legacy);
assert.equal(legacyIds.length, 282);
let imports = 0;

function fixture(count = 1) {
  const jobs = ids.slice(0, count).map((id, index) => ({
    id, event_id: ids[index], target_event_id: ids[index], reason: "validation",
    status: "PENDING", attempt_count: 0, batch_id: null, commit_sha: null,
    requested_at: "2026-10-12T00:00:00Z",
  }));
  const events = ids.slice(0, count).map((id) => ({
    id, validated: true, rejected: false, title: `Event ${id}`,
  }));
  const calls = [];
  return { jobs, events, calls, partial: false, async fetch(raw, options = {}) {
    const url = new URL(raw);
    const method = options.method || "GET";
    calls.push({ method, url: url.pathname + url.search });
    let result;
    if (url.pathname.endsWith("/rpc/claim_event_publication_batch")) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_expected.length, count);
      result = jobs.slice(0, this.partial ? count - 1 : count).map((job) => ({
        ...job, status: "RUNNING", attempt_count: job.attempt_count + 1,
        batch_id: body.p_batch_id,
        ...this.claimDelta,
      }));
    this.claimed = result;
    } else if (url.pathname.endsWith("/events")) {
      result = events;
    } else if (url.searchParams.get("status") === "eq.RUNNING") {
      result = [];
    } else {
      const selected = url.searchParams.get("id") || "";
      result = jobs.filter((job) => selected.includes(job.id));
    }
    return { ok: true, text: async () => JSON.stringify(result) };
  }};
}

async function invoke(state, command, jobIds, extra = {}) {
  const previousArgv = process.argv;
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "PUBLICATION_AUTOMATION_ENABLED",
    "PUBLICATION_MANUAL_MODE", "PUBLICATION_MANUAL_JOB_IDS",
    "PUBLICATION_MANUAL_FINGERPRINT", "PUBLICATION_MANUAL_CONFIRMATION",
    "PUBLICATION_DOUAI_MANUAL", "PUBLICATION_PREACTIVATION_TEST",
    "PUBLICATION_P0_RECOVERY", "PUBLICATION_BATCH_ID", "PUBLICATION_JOBS", "GITHUB_OUTPUT"];
  const previousEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const logs = [];
  process.argv = [process.execPath, worker.pathname, command];
  global.fetch = state.fetch.bind(state);
  console.log = (...parts) => logs.push(parts.join(" "));
  Object.assign(process.env, { SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "test-secret", PUBLICATION_AUTOMATION_ENABLED: "false",
    PUBLICATION_MANUAL_MODE: command === "preview-selected" ? "preview" : "execute",
    PUBLICATION_MANUAL_JOB_IDS: jobIds, PUBLICATION_MANUAL_FINGERPRINT: "",
    PUBLICATION_MANUAL_CONFIRMATION: "", PUBLICATION_DOUAI_MANUAL: "false",
    PUBLICATION_PREACTIVATION_TEST: "false", PUBLICATION_P0_RECOVERY: "false",
    ...extra });
  delete process.env.GITHUB_OUTPUT;
  try { await import(`${worker.href}?manual=${++imports}`); return logs; }
  finally {
    process.argv = previousArgv;
    global.fetch = previousFetch;
    console.log = previousLog;
    for (const key of keys) previousEnv[key] === undefined
      ? delete process.env[key] : process.env[key] = previousEnv[key];
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "publication-selected-"));
fs.mkdirSync(path.join(tmp, "scripts/event-publisher"), { recursive: true });
fs.mkdirSync(path.join(tmp, "docs/territoires"), { recursive: true });
fs.copyFileSync(path.join(root, "scripts/event-publisher/legacy-enriched-events.json"),
  path.join(tmp, "scripts/event-publisher/legacy-enriched-events.json"));
fs.writeFileSync(path.join(tmp, "docs/territoires/event-canonical-map.json"),
  JSON.stringify({}));
fs.writeFileSync(path.join(tmp, "docs/territoires/catalogue-public.json"), JSON.stringify({events:[]}));
const git = (...args) => execFileSync("git",args,{cwd:tmp,stdio:"pipe"});
git("init","-q"); git("add",".");
git("-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","fixture");
process.chdir(tmp);

try {
  for (const legacyId of legacyIds) {
    const state = fixture();
    Object.assign(state.jobs[0], {reason: "edit", event_id: legacyId,
      target_event_id: legacyId});
    state.events[0].id = legacyId;
    await assert.rejects(invoke(state, "preview-selected", ids[0]), /PENDING incompatible/);
    assert.ok(state.calls.every((call) => call.method === "GET"));
  }
  const ordinaryEdit = fixture();
  ordinaryEdit.jobs[0].reason = "edit";
  const editPreview = await invoke(ordinaryEdit, "preview-selected", ids[0]);
  assert.match(editPreview.join(" "), /Empreinte PREVIEW/);
  assert.ok(ordinaryEdit.calls.every((call) => call.method === "GET"));

  // Exercise the real claim output -> isolation boundary, including PENDING/1 retry.
  const outputValue = (logs, key) => JSON.parse(logs.find(line => line.startsWith(key + "=")).slice(key.length + 1));
  for (const previousAttempt of [0, 1]) {
    const state = fixture(2);
    state.jobs[1].reason = "edit";
    for (const j of state.jobs) j.attempt_count = previousAttempt;
    const before = JSON.stringify(state.jobs), chosen = ids.slice(0,2).join(",");
    const preview = await invoke(state,"preview-selected",chosen);
    const claimed = await invoke(state,"claim",chosen,{
      PUBLICATION_MANUAL_FINGERPRINT:preview.join("\n").match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1],
      PUBLICATION_MANUAL_CONFIRMATION:"EXECUTE",
    });
    const selected = outputValue(claimed,"publication_jobs");
    // This failed on main: ordinary claim omitted batch_id, while the reserved queue had it.
    const proof = sealIsolation(state.events,state.claimed,selected,tmp);
    assert.equal(new Set(selected.map(j=>j.batch_id)).size,1);
    assert.equal(selected[0].batch_id,state.claimed[0].batch_id);
    assert.equal(selected[0].attempt_count,previousAttempt+1);
    assert.deepEqual(outputValue(claimed,"depublish_paths"),[]);
    assert.deepEqual(outputValue(claimed,"depublish_event_ids"),[]);
    assert.equal(JSON.stringify(state.jobs),before,"fixture source jobs untouched");
    assert.equal(state.calls.filter(c=>c.method==="POST").length,1);
    assert.deepEqual(proof.source,state.events);
    for (const delta of [{batch_id:undefined},{batch_id:null},{batch_id:ids[3]},
        {attempt_count:previousAttempt+2},{reason:"delete"},{event_id:ids[3]}]) {
      assert.throws(()=>sealIsolation(state.events,state.claimed,[{...selected[0],...delta},selected[1]],tmp),/STOP/);
    }
    for (const delta of [{batch_id:null},{batch_id:ids[3]},{status:"SUCCESS"},
        {attempt_count:3},{event_id:ids[3]},{target_event_id:ids[3]},{commit_sha:"a".repeat(40)}]) {
      assert.throws(()=>sealIsolation(state.events,[{...state.claimed[0],...delta},state.claimed[1]],selected,tmp),/STOP/);
    }
    const contradictory=state.claimed.map((j,i)=>({...j,batch_id:ids[i]}));
    assert.throws(()=>sealIsolation(state.events,contradictory,contradictory,tmp),/STOP/);
    const absent=state.claimed.map(j=>({...j,batch_id:undefined}));
    assert.throws(()=>sealIsolation(state.events,absent,absent,tmp),/STOP/);
  }
  for (const claimDelta of [{batch_id:null},{batch_id:ids[3]},{status:"PENDING"},
      {attempt_count:3},{event_id:ids[3]},{target_event_id:ids[3]},{commit_sha:"a".repeat(40)}]) {
    const state=fixture(2),chosen=ids.slice(0,2).join(",");
    const preview=await invoke(state,"preview-selected",chosen);
    state.claimDelta=claimDelta;
    await assert.rejects(invoke(state,"claim",chosen,{
      PUBLICATION_MANUAL_FINGERPRINT:preview.join("\n").match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1],
      PUBLICATION_MANUAL_CONFIRMATION:"EXECUTE",
    }),/réservation atomique non confirmée/);
  }

  for (const count of [1, 3]) {
    const state = fixture(count);
    const chosen = ids.slice(0, count).join(",");
    const preview = await invoke(state, "preview-selected", chosen);
    const fingerprint = preview.join("\n").match(/Empreinte PREVIEW : ([0-9a-f]{64})/)?.[1];
    assert.ok(fingerprint);
    assert.ok(preview.some((line) => line.includes("lecture seule")));
    assert.ok(state.calls.every((call) => call.method === "GET"));
    await invoke(state, "preflight", chosen, {
      PUBLICATION_MANUAL_FINGERPRINT: fingerprint, PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
    });
    assert.ok(state.calls.every((call) => call.method === "GET"));
    await invoke(state, "claim", chosen, {
      PUBLICATION_MANUAL_FINGERPRINT: fingerprint, PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
    });
    assert.equal(state.calls.filter((call) => call.method === "POST").length, 1);
    assert.ok(state.calls.some((call) => call.url.endsWith("/rpc/claim_event_publication_batch")));
  }

  for (const [name, chosen, change, pattern] of [
    ["empty", "", () => {}, /1 à 3 UUID/],
    ["four", ids.join(","), () => {}, /1 à 3 UUID/],
    ["duplicate", `${ids[0]},${ids[0]}`, () => {}, /distincts/],
    ["bad uuid", "not-an-uuid", () => {}, /UUID/],
    ["missing", ids[3], () => {}, /job absent/],
    ["success", ids[0], (s) => { s.jobs[0].status = "SUCCESS"; }, /PENDING incompatible/],
    ["not pending", ids[0], (s) => { s.jobs[0].status = "RUNNING"; }, /PENDING incompatible/],
  ]) {
    const state = fixture(name === "four" ? 4 : 1);
    change(state);
    await assert.rejects(invoke(state, "preview-selected", chosen), pattern);
    assert.ok(state.calls.every((call) => call.method === "GET"));
  }

  const stale = fixture();
  const preview = await invoke(stale, "preview-selected", ids[0]);
  const fingerprint = preview.join("\n").match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1];
  stale.events[0].title = "Changed since preview";
  await assert.rejects(invoke(stale, "claim", ids[0], {
    PUBLICATION_MANUAL_FINGERPRINT: fingerprint, PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
  }), /données modifiées/);
  assert.ok(stale.calls.every((call) => call.method === "GET"));

  const changedStatus = fixture();
  const statusPreview = await invoke(changedStatus, "preview-selected", ids[0]);
  changedStatus.jobs[0].status = "SUCCESS";
  await assert.rejects(invoke(changedStatus, "claim", ids[0], {
    PUBLICATION_MANUAL_FINGERPRINT: statusPreview.join("\n").match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1],
    PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
  }), /PENDING incompatible/);
  assert.ok(changedStatus.calls.every((call) => call.method === "GET"));

  const concurrent = fixture();
  concurrent.fetch = async function (raw, options = {}) {
    this.calls.push({ method: options.method || "GET", url: raw });
    return { ok: true, text: async () => JSON.stringify([{ id: ids[3] }]) };
  };
  await assert.rejects(invoke(concurrent, "preview-selected", ids[0]), /publication concurrente/);
  assert.ok(concurrent.calls.every((call) => call.method === "GET"));

  const partial = fixture(3);
  const partialPreview = await invoke(partial, "preview-selected", ids.slice(0, 3).join(","));
  partial.partial = true;
  await assert.rejects(invoke(partial, "claim", ids.slice(0, 3).join(","), {
    PUBLICATION_MANUAL_FINGERPRINT: partialPreview.join("\n").match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1],
    PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
  }), /réservation atomique non confirmée/);
  assert.equal(partial.calls.filter((call) => call.method === "POST").length, 1);

  const noConfirmation = fixture();
  await assert.rejects(invoke(noConfirmation, "claim", ids[0]), /confirmation/);
  assert.equal(noConfirmation.calls.length, 0);
  const autoEnabled = fixture();
  const autoPreview = await invoke(autoEnabled, "preview-selected", ids[0], {
    PUBLICATION_AUTOMATION_ENABLED: "true",
  });
  assert.ok(autoEnabled.calls.every((call) => call.method === "GET"));
  await invoke(autoEnabled, "claim", ids[0], {
    PUBLICATION_AUTOMATION_ENABLED: "true",
    PUBLICATION_MANUAL_FINGERPRINT: autoPreview.join("\n").match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1],
    PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
  });
  assert.equal(autoEnabled.calls.filter((call) => call.method === "POST").length, 1);
} finally {
  process.chdir(root);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("PASS sélection manuelle : PREVIEW, EXECUTE, limites, refus et RPC unique");
