import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const worker = pathToFileURL(path.resolve("scripts/publication-jobs.mjs"));
let imports = 0;

function jobs(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
    event_id: `${String(index + 1).padStart(8, "0")}-2222-4222-8222-222222222222`,
    target_event_id: `${String(index + 1).padStart(8, "0")}-2222-4222-8222-222222222222`,
    reason: "validation", status: "PENDING", attempt_count: 0,
    batch_id: null, commit_sha: null,
    requested_at: index < 2 ? "2026-10-12T00:00:00Z" : "2026-10-12T00:00:01Z",
  }));
}

function fixture(count, { failed = false, running = false, response = null } = {}) {
  const rows = jobs(count);
  if (failed) rows.push({ ...jobs(1)[0], id: "90000000-1111-4111-8111-111111111111", status: "FAILED" });
  if (running) rows.push({ ...jobs(1)[0], id: "80000000-1111-4111-8111-111111111111", status: "RUNNING" });
  const calls = [];
  return { rows, calls, async fetch(raw, options = {}) {
    const url = new URL(raw);
    const method = options.method || "GET";
    calls.push({ method, path: url.pathname, search: url.search });
    if (response) return response();
    if (url.pathname.endsWith("/rpc/claim_event_publication_batch")) {
      const body = JSON.parse(options.body);
      calls.at(-1).expected = body.p_expected;
      const claimed = body.p_expected.map((expected) => ({ ...expected,
        status: "RUNNING", attempt_count: expected.attempt_count + 1,
        batch_id: body.p_batch_id }));
      return { ok: true, text: async () => JSON.stringify(claimed) };
    }
    const status = url.searchParams.get("status")?.slice(3);
    let selected = rows.filter((row) => row.status === status);
    selected.sort((a, b) => a.requested_at.localeCompare(b.requested_at)
      || a.id.localeCompare(b.id));
    const limit = Number(url.searchParams.get("limit") || selected.length);
    selected = selected.slice(0, limit);
    return { ok: true, text: async () => JSON.stringify(selected) };
  }};
}

async function invoke(state, command, env = {}) {
  const oldArgv = process.argv;
  const oldFetch = global.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "PUBLICATION_DOUAI_MANUAL",
    "PUBLICATION_AUTOMATION_ENABLED", "PUBLICATION_PREACTIVATION_TEST",
    "PUBLICATION_P0_RECOVERY", "GITHUB_OUTPUT"];
  const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const output = path.join(process.cwd(), `output-${++imports}.txt`);
  process.argv = [process.execPath, worker.pathname, command];
  global.fetch = state.fetch;
  Object.assign(process.env, { SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "test-secret", PUBLICATION_DOUAI_MANUAL: "false",
    PUBLICATION_AUTOMATION_ENABLED: "true", PUBLICATION_PREACTIVATION_TEST: "false",
    PUBLICATION_P0_RECOVERY: "false", GITHUB_OUTPUT: output, ...env });
  try {
    await import(`${worker.href}?batch=${imports}`);
    return fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  } finally {
    process.argv = oldArgv;
    global.fetch = oldFetch;
    for (const key of keys) oldEnv[key] === undefined
      ? delete process.env[key] : process.env[key] = oldEnv[key];
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "publication-batch-"));
fs.mkdirSync(path.join(tmp, "scripts/event-publisher"), { recursive: true });
fs.mkdirSync(path.join(tmp, "docs/territoires"), { recursive: true });
fs.copyFileSync(path.join(root, "scripts/event-publisher/legacy-enriched-events.json"),
  path.join(tmp, "scripts/event-publisher/legacy-enriched-events.json"));
fs.writeFileSync(path.join(tmp, "docs/territoires/event-canonical-map.json"), "{}");
process.chdir(tmp);

try {
  for (const count of [0, 1, 3, 4, 10]) {
    const state = fixture(count);
    const preflight = await invoke(state, "preflight");
    assert.match(preflight, new RegExp(`has_pending=${count > 0}`));
    assert.equal(state.calls.filter((call) => call.method !== "GET").length, 0);
    if (count === 0) continue;
    const claimed = await invoke(state, "claim");
    assert.match(claimed, new RegExp(`job_count=${Math.min(count, 3)}`));
    assert.equal(state.calls.filter((call) =>
      call.path.endsWith("/rpc/claim_event_publication_batch")).length, 1);
    const rpc = state.calls.find((call) =>
      call.path.endsWith("/rpc/claim_event_publication_batch"));
    assert.deepEqual(rpc.expected.map((row) => row.id),
      state.rows.filter((row) => row.status === "PENDING").slice(0, 3).map((row) => row.id));
    assert.match(state.calls.find((call) => call.search.includes("limit=3")).search,
      /order=requested_at\.asc,id\.asc/);
  }

  const changedAfterPreflight = fixture(1);
  await invoke(changedAfterPreflight, "preflight");
  changedAfterPreflight.rows[0].status = "SUCCESS";
  const afterChange = await invoke(changedAfterPreflight, "claim");
  assert.match(afterChange, /has_jobs=false/);
  assert.equal(changedAfterPreflight.calls.filter((call) =>
    call.path.endsWith("/rpc/claim_event_publication_batch")).length, 0);

  for (const options of [{ failed: true }, { running: true }, { failed: true, running: true }]) {
    const state = fixture(0, options);
    const output = await invoke(state, "preflight");
    assert.match(output, /has_pending=false/);
    assert.equal(state.calls.filter((call) => call.method !== "GET").length, 0);
  }

  for (const response of [
    () => { throw new Error("network down"); },
    () => ({ ok: false, status: 401, text: async () => "invalid api key" }),
    () => ({ ok: true, text: async () => "not-json" }),
  ]) {
    const state = fixture(0, { response });
    await assert.rejects(invoke(state, "preflight"), /STOP précontrôle/);
    assert.equal(state.calls.filter((call) => call.method !== "GET").length, 0);
  }

  const disabled = fixture(1);
  await assert.rejects(invoke(disabled, "preflight",
    { PUBLICATION_AUTOMATION_ENABLED: "false" }), /mode de publication incompatible/);
  assert.equal(disabled.calls.length, 0);

  const douai = fixture(0);
  const output = await invoke(douai, "preflight", { PUBLICATION_DOUAI_MANUAL: "true",
    PUBLICATION_AUTOMATION_ENABLED: "false" });
  assert.match(output, /has_pending=true/);
  assert.equal(douai.calls.length, 0);
} finally {
  process.chdir(root);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("PASS batch 3 et précontrôle non destructif");
