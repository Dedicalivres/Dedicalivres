import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const worker = pathToFileURL(path.resolve("scripts/publication-jobs.mjs"));
const workflow = fs.readFileSync(".github/workflows/publish-events.yml", "utf8");
assert.match(workflow, /manual_mode:[\s\S]*?default: preview/);
assert.match(workflow, /manual-preview:[\s\S]*?permissions:\s*contents: read[\s\S]*?preview-selected/);
assert.match(workflow, /inputs\.manual_mode == 'execute'/);
assert.match(workflow, /vars\.PUBLICATION_AUTOMATION_ENABLED == 'true'/);
assert.match(workflow, /- name: Preflight publication queue[\s\S]*?- name: Install publisher dependencies/);
assert.match(workflow, /Recheck public event source before push[\s\S]*?Recheck Finistellaire excluded jobs before publication[\s\S]*?Commit and push publication/);
const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const finistellaireJob = "a47786e2-16b0-4c0f-abae-a5ba698830ec";
const finistellaireEvent = "316861b7-0dd1-4ea7-b458-9fd8da849881";
const excluded = [
  {id:"8c3a9b53-fae8-482e-bfa9-be1c2cb2d397", event_id:"3807ee7e-96fd-49bd-b909-0708f0fcf131"},
  {id:"18d9141a-917e-42d2-9f41-c598231ef6f3", event_id:"9acc76bd-9356-485f-a8fb-f95d6cfad346"},
  {id:"dca88c9e-cffb-44e5-9453-e03bbf6bf0a4", event_id:"77ccedcc-655f-424b-a8fe-829115b93ed6"},
].map((row) => ({...row, target_event_id:row.event_id, reason:"validation",
  status:"PENDING", attempt_count:0, batch_id:null, commit_sha:null}));
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
  return { jobs, events, excluded:structuredClone(excluded), calls, partial: false,
    verifyRunning:false, async fetch(raw, options = {}) {
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
      }));
    } else if (url.searchParams.has("or")) {
      result = this.excluded;
    } else if (url.pathname.endsWith("/events")) {
      result = events;
    } else if (url.searchParams.get("status") === "eq.RUNNING") {
      result = this.verifyRunning ? this.jobs.filter((row) => row.status === "RUNNING") : [];
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
  JSON.stringify({[finistellaireEvent]: "evenement/festival-finistellaire-2026-quimper-3479.html"}));
process.chdir(tmp);

try {
  const finistellaire = fixture();
  Object.assign(finistellaire.jobs[0], {id: finistellaireJob,
    event_id: finistellaireEvent, target_event_id: finistellaireEvent, reason: "edit"});
  finistellaire.events[0].id = finistellaireEvent;
  const finistellairePreview = await invoke(finistellaire, "preview-selected", finistellaireJob);
  const finistellaireFingerprint = finistellairePreview.join("\n")
    .match(/Empreinte PREVIEW : ([0-9a-f]{64})/)?.[1];
  assert.ok(finistellaireFingerprint);
  assert.ok(finistellaire.calls.some((call) => call.url.includes('or=')));
  assert.ok(finistellaire.calls.every((call) => call.method === "GET"));
  await assert.rejects(invoke(finistellaire, "claim", finistellaireJob), /confirmation/);
  await assert.rejects(invoke(finistellaire, "claim", finistellaireJob, {
    PUBLICATION_MANUAL_FINGERPRINT: "0".repeat(64), PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
  }), /données modifiées/);
  assert.ok(finistellaire.calls.every((call) => call.method === "GET"));
  const finistellaireClaim = await invoke(finistellaire, "claim", finistellaireJob, {
    PUBLICATION_MANUAL_FINGERPRINT: finistellaireFingerprint,
    PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
  });
  assert.ok(finistellaireClaim.includes("depublish_paths=[]"));
  assert.equal(finistellaire.calls.filter((call) => call.method === "POST").length, 1);
  for (const mutate of [
    (s) => { s.excluded[0].status = 'RUNNING'; },
    (s) => { s.excluded[0].attempt_count = 1; },
    (s) => { s.excluded[0].batch_id = 'other'; },
    (s) => { s.excluded[0].commit_sha = 'abc'; },
    (s) => { s.excluded[0].reason = 'edit'; },
    (s) => { s.excluded[0].event_id = ids[0]; },
    (s) => { s.excluded[0].id = ids[0]; },
    (s) => { s.excluded.push({...s.excluded[0], id:ids[1]}); },
  ]) {
    const state = fixture();
    Object.assign(state.jobs[0], {id:finistellaireJob, event_id:finistellaireEvent,
      target_event_id:finistellaireEvent, reason:'edit'});
    state.events[0].id = finistellaireEvent;
    mutate(state);
    await assert.rejects(invoke(state, 'claim', finistellaireJob, {
      PUBLICATION_MANUAL_FINGERPRINT:finistellaireFingerprint,
      PUBLICATION_MANUAL_CONFIRMATION:'EXECUTE',
    }), /trois jobs exclus/);
    assert.ok(state.calls.every((call) => call.method === 'GET'));
  }
  const beforePush = fixture();
  Object.assign(beforePush.jobs[0], {id:finistellaireJob, event_id:finistellaireEvent,
    target_event_id:finistellaireEvent, reason:'edit', status:'RUNNING', attempt_count:1,
    batch_id:'batch-test'});
  beforePush.events[0].id = finistellaireEvent;
  beforePush.verifyRunning = true;
  const claimedJob = JSON.stringify([{id:finistellaireJob, event_id:finistellaireEvent,
    reason:'edit', attempt_count:1}]);
  const nearEnv = {PUBLICATION_JOBS:claimedJob, PUBLICATION_BATCH_ID:'batch-test'};
  assert.match((await invoke(beforePush, 'verify-finistellaire-excluded', finistellaireJob, nearEnv)).join(' '),
    /trois jobs exclus inchangés/);
  assert.ok(beforePush.calls.every((call) => call.method === 'GET'));
  await assert.rejects(invoke(beforePush, 'verify-finistellaire-excluded', finistellaireJob,
    {...nearEnv, PUBLICATION_BATCH_ID:'wrong-batch'}), /publication concurrente/);
  beforePush.excluded.pop();
  await assert.rejects(invoke(beforePush, 'verify-finistellaire-excluded', finistellaireJob, nearEnv),
    /trois jobs exclus/);
  beforePush.excluded = structuredClone(excluded);
  beforePush.excluded[1].commit_sha = 'changed';
  await assert.rejects(invoke(beforePush, 'verify-finistellaire-excluded', finistellaireJob, nearEnv),
    /trois jobs exclus/);
  beforePush.excluded[1].commit_sha = null;
  beforePush.jobs.push({...beforePush.jobs[0], id:ids[3]});
  await assert.rejects(invoke(beforePush, 'verify-finistellaire-excluded', finistellaireJob, nearEnv),
    /publication concurrente/);
  finistellaire.events[0].title = "Modifié depuis PREVIEW";
  await assert.rejects(invoke(finistellaire, "claim", finistellaireJob, {
    PUBLICATION_MANUAL_FINGERPRINT: finistellaireFingerprint,
    PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE",
  }), /données modifiées/);
  assert.equal(finistellaire.calls.filter((call) => call.method === "POST").length, 1);

  for (const change of [
    (state) => { state.jobs[0].id = ids[0]; },
    (state) => { state.jobs[0].reason = "validation"; },
    (state) => { state.jobs[0].event_id = ids[0]; state.jobs[0].target_event_id = ids[0]; },
    (state) => { state.jobs[0].status = "SUCCESS"; },
  ]) {
    const state = fixture();
    Object.assign(state.jobs[0], {id: finistellaireJob, event_id: finistellaireEvent,
      target_event_id: finistellaireEvent, reason: "edit"});
    state.events[0].id = finistellaireEvent;
    change(state);
    await assert.rejects(invoke(state, "preview-selected", state.jobs[0].id), /PENDING incompatible/);
    assert.ok(state.calls.every((call) => call.method === "GET"));
  }
  const protectedIds = Object.keys(JSON.parse(fs.readFileSync(
    path.join(tmp, "scripts/event-publisher/legacy-enriched-events.json"))).events)
    .filter((id) => id !== finistellaireEvent);
  assert.equal(protectedIds.length, 281);
  for (const protectedId of protectedIds) {
    const otherLegacy = fixture();
    Object.assign(otherLegacy.jobs[0], {reason: "edit",
      event_id: protectedId, target_event_id: protectedId});
    otherLegacy.events[0].id = protectedId;
    await assert.rejects(invoke(otherLegacy, "preview-selected", ids[0]), /PENDING incompatible/);
    assert.ok(otherLegacy.calls.every((call) => call.method === "GET"));
  }
  const automationEnabled = fixture();
  Object.assign(automationEnabled.jobs[0], {id: finistellaireJob,
    event_id: finistellaireEvent, target_event_id: finistellaireEvent, reason: "edit"});
  automationEnabled.events[0].id = finistellaireEvent;
  await assert.rejects(invoke(automationEnabled, "preview-selected", finistellaireJob, {
    PUBLICATION_AUTOMATION_ENABLED: "true",
  }), /PENDING incompatible/);
  const mixed = fixture(2);
  Object.assign(mixed.jobs[0], {id: finistellaireJob,
    event_id: finistellaireEvent, target_event_id: finistellaireEvent, reason: "edit"});
  mixed.events[0].id = finistellaireEvent;
  await assert.rejects(invoke(mixed, "preview-selected", `${finistellaireJob},${ids[1]}`),
    /PENDING incompatible/);

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
