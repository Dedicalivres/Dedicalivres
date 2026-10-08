import assert from "node:assert/strict";
import {
  execFile,
} from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  promisify,
} from "node:util";


const run =
  promisify(
    execFile
  );

const worker =
  path.resolve(
    "scripts/publication-jobs.mjs"
  );

const legacySource =
  path.resolve(
    "scripts/event-publisher/legacy-enriched-events.json"
  );


async function scenario({
  canonical,
  expectedStatus,
  expectedPath,
  preactivation = false,
  row = {
    id:
      "11111111-1111-4111-8111-111111111111",
    event_id:
      null,
    target_event_id:
      "22222222-2222-4222-8222-222222222222",
    reason:
      "delete",
    attempt_count:
      0,
    requested_at:
      "2026-10-07T00:00:00Z",
  },
}) {
  const patches = [];
  const filters = [];

  const server =
    http.createServer(
      (request, response) => {
        const url =
          new URL(
            request.url,
            "http://127.0.0.1"
          );

        if (
          request.method === "GET"
          && url.searchParams.get("status") === "eq.RUNNING"
        ) {
          response.end("[]");
          return;
        }

        if (request.method === "GET") {
          filters.push(
            url.search
          );

          response.end(
            JSON.stringify([
              row,
            ])
          );
          return;
        }

        let body = "";

        request.on(
          "data",
          (chunk) => {
            body += chunk;
          }
        );

        request.on(
          "end",
          () => {
            patches.push(
              JSON.parse(body)
            );
            response.end("[]");
          }
        );
      }
    );

  await new Promise(
    (resolve) =>
      server.listen(
        0,
        "127.0.0.1",
        resolve
      )
  );

  const fixture =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "publication-canonical-"
      )
    );

  fs.mkdirSync(
    path.join(
      fixture,
      "scripts/event-publisher"
    ),
    {
      recursive:
        true,
    }
  );

  fs.mkdirSync(
    path.join(
      fixture,
      "docs/territoires"
    ),
    {
      recursive:
        true,
    }
  );

  fs.copyFileSync(
    legacySource,
    path.join(
      fixture,
      "scripts/event-publisher/legacy-enriched-events.json"
    )
  );

  fs.writeFileSync(
    path.join(
      fixture,
      "docs/territoires/event-canonical-map.json"
    ),
    JSON.stringify(
      canonical
    )
  );

  const output =
    path.join(
      fixture,
      "github-output.txt"
    );

  try {
    const address =
      server.address();

    await run(
      process.execPath,
      [
        worker,
        "claim",
      ],
      {
        cwd:
          fixture,

        env: {
          ...process.env,
          SUPABASE_URL:
            `http://127.0.0.1:${address.port}`,
          SUPABASE_SECRET_KEY:
            "test-secret",
          GITHUB_OUTPUT:
            output,
          PUBLICATION_PREACTIVATION_TEST:
            preactivation
              ? "true"
              : "false",
        },
      }
    );

    assert.equal(
      patches.length,
      1
    );

    assert.equal(
      patches[0].status,
      expectedStatus
    );

    assert.match(
      filters[0],
      preactivation
        ? /reason=eq\.manual.*event_id=is\.null/
        : /reason=neq\.manual/
    );

    const outputs =
      fs.readFileSync(
        output,
        "utf8"
      );

    if (expectedPath) {
      assert.match(
        outputs,
        new RegExp(
          `depublish_paths=.*${expectedPath.replace(".", "\\.")}`
        )
      );
    } else if (
      expectedStatus === "BLOCKED"
    ) {
      assert.match(
        patches[0].last_error,
        /target_event_id=22222222-2222-4222-8222-222222222222/
      );
      assert.match(
        outputs,
        /has_jobs=false/
      );
    }

  } finally {
    await new Promise(
      (resolve) =>
        server.close(resolve)
    );

    fs.rmSync(
      fixture,
      {
        recursive:
          true,
        force:
          true,
      }
    );
  }
}


await scenario({
  canonical: {},
  expectedStatus:
    "BLOCKED",
});

await scenario({
  canonical: {
    "22222222-2222-4222-8222-222222222222":
      "evenement/sous-dossier/page.html",
  },
  expectedStatus:
    "BLOCKED",
});

await scenario({
  canonical: {
    "22222222-2222-4222-8222-222222222222":
      "evenement/page-test.html",
  },
  expectedStatus:
    "RUNNING",
  expectedPath:
    "evenement/page-test.html",
});

await scenario({
  canonical: {},
  expectedStatus:
    "RUNNING",
  preactivation:
    true,
  row: {
    id:
      "33333333-3333-4333-8333-333333333333",
    event_id:
      null,
    target_event_id:
      null,
    reason:
      "manual",
    attempt_count:
      0,
    requested_at:
      "2026-10-07T00:00:00Z",
  },
});


console.log(
  "PASS jobs publication : canonical sûr et manual isolé du mode normal"
);
