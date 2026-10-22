import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const worker = path.resolve("scripts/publication-jobs.mjs");
const legacy = path.resolve("scripts/event-publisher/legacy-enriched-events.json");
const target = "22222222-2222-4222-8222-222222222222";

async function scenario({ canonical, reason = "delete", permitted }) {
  const job = { id: "11111111-1111-4111-8111-111111111111",
    event_id: reason === "delete" ? null : target, target_event_id: target,
    reason, status: "PENDING", attempt_count: 0, requested_at: "2026-10-14T00:00:00Z",
    batch_id: null, commit_sha: null };
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    calls.push({ method: request.method, path: url.pathname, search: url.search });
    if (url.pathname.endsWith("/rpc/claim_event_publication_batch")) {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      response.end(JSON.stringify([{ ...job, status: "RUNNING", attempt_count: 1,
        batch_id: payload.p_batch_id }]));
    } else if (url.pathname.endsWith("/events")) {
      response.end(JSON.stringify(reason === "delete" ? []
        : [{ id: target, validated: reason !== "unpublish", rejected: reason === "unpublish" }]));
    } else if (url.searchParams.get("status") === "eq.RUNNING") {
      response.end("[]");
    } else {
      response.end(JSON.stringify([job]));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "publication-canonical-"));
  fs.mkdirSync(path.join(fixture, "scripts/event-publisher"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "docs/territoires"), { recursive: true });
  fs.copyFileSync(legacy, path.join(fixture, "scripts/event-publisher/legacy-enriched-events.json"));
  fs.writeFileSync(path.join(fixture, "docs/territoires/event-canonical-map.json"),
    JSON.stringify(canonical));
  const output = path.join(fixture, "github-output.txt");
  const common = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
    SUPABASE_SECRET_KEY: "test-secret", PUBLICATION_AUTOMATION_ENABLED: "false",
    PUBLICATION_DOUAI_MANUAL: "false", PUBLICATION_PREACTIVATION_TEST: "false",
    PUBLICATION_P0_RECOVERY: "false", PUBLICATION_MANUAL_JOB_IDS: job.id,
    GITHUB_OUTPUT: output };
  try {
    const preview = run(process.execPath, [worker, "preview-selected"], {
      cwd: fixture, env: { ...common, PUBLICATION_MANUAL_MODE: "preview" },
    });
    if (!permitted) {
      await assert.rejects(preview, /PENDING incompatible/);
      assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
      return;
    }
    const fingerprint = (await preview).stdout.match(/Empreinte PREVIEW : ([0-9a-f]{64})/)?.[1];
    assert.ok(fingerprint);
    assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
    const claimed = await run(process.execPath, [worker, "claim"], {
      cwd: fixture, env: { ...common, PUBLICATION_MANUAL_MODE: "execute",
        PUBLICATION_MANUAL_FINGERPRINT: fingerprint,
        PUBLICATION_MANUAL_CONFIRMATION: "EXECUTE" },
    });
    assert.match(claimed.stdout, /job_count=1/);
    assert.equal(calls.filter((call) => call.path.endsWith("/rpc/claim_event_publication_batch")).length, 1);
    const expectedPath = canonical[target];
    const outputs = fs.readFileSync(output, "utf8");
    if (expectedPath && (reason === "delete" || reason === "unpublish")) {
      assert.ok(outputs.includes(expectedPath));
    } else {
      assert.match(outputs, /depublish_paths=\[\]/);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

await scenario({ canonical: {}, permitted: false });
await scenario({ canonical: { [target]: "evenement/sous-dossier/page.html" }, permitted: false });
await scenario({ canonical: { [target]: "evenement/page-test.html" }, permitted: true });
await scenario({ canonical: { [target]: "evenement/page-avant-modification.html" },
  reason: "edit", permitted: true });
await scenario({ canonical: {}, reason: "edit", permitted: true });
await scenario({ canonical: { [target]: "evenement/page-test.html" }, reason: "unpublish", permitted: true });

console.log("PASS jobs publication : canonical manuel sûr, PREVIEW sans écriture et RPC unique");
