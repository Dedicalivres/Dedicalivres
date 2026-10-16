// Disposable PostgreSQL only. The first HTTP response is lost after COMMIT;
// subsequent HTTP retries execute the real RPC against the same database.
import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";

const container = process.env.C3C_TEST_CONTAINER;
const statement = process.env.C3C_TEST_SQL;
if (!container || !statement) throw new Error("Isolated container and SQL required");

function sql(query) {
  const result = spawnSync("docker", ["exec", container, "psql", "-X", "-U", "postgres",
    "-Atq", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim().split("\n").at(-1);
}

let requests = 0;
const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/rpc") {
    res.writeHead(404).end();
    return;
  }
  req.resume();
  req.on("end", () => {
    const proofId = sql(statement); // psql returns only after transaction COMMIT.
    requests += 1;
    if (requests === 1) {
      res.destroy(); // Simulate the lost network response, not a SQL rollback.
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" }).end(proofId);
  });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

function post() {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: "/rpc", method: "POST" }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.end();
  });
}

try {
  await assert.rejects(post(), /socket hang up|ECONNRESET/);
  const firstId = sql(`select p.id from private.publication_canary_evidence p
    where p.proof_type='DIRECT_VERIFIED' order by p.id desc limit 1`);
  assert.match(firstId, /^\d+$/);
  for (let i = 0; i < 6; i += 1) assert.equal(await post(), firstId);
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => post()));
  assert.deepEqual(concurrent, Array(6).fill(firstId));
  assert.equal(requests, 13);
  process.stdout.write(`${firstId}\n`);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
