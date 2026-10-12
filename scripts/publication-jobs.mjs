import {
  randomUUID,
} from "node:crypto";

import fs from "node:fs";


const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;


const PREACTIVATION_TEST =
  process.env.PUBLICATION_PREACTIVATION_TEST
  === "true";

const P0_RECOVERY =
  process.env.PUBLICATION_P0_RECOVERY
  === "true";

const RECOVERY_JOBS = [
  {
    id: "c098bfc8-4482-4452-857d-d9227b422a41",
    eventId: "c69b157c-bf2f-4ddf-affa-a57497d261c2",
    reason: "unpublish",
    validated: false,
    rejected: true,
  },
  {
    id: "21d2d1eb-5b65-46e3-9624-0e877df1702d",
    eventId: "14b81335-1dab-4f6d-9667-5e88675c6f98",
    reason: "validation",
    validated: true,
    rejected: false,
  },
];


if (
  !SUPABASE_URL
  || !SECRET_KEY
) {
  throw new Error(
    "SUPABASE_URL et SUPABASE_SECRET_KEY sont requis"
  );
}


const legacyManifest =
  JSON.parse(
    fs.readFileSync(
      "scripts/event-publisher/legacy-enriched-events.json",
      "utf8"
    )
  );


const legacyEvents =
  legacyManifest.events
  || {};


const canonicalMap =
  JSON.parse(
    fs.readFileSync(
      "docs/territoires/event-canonical-map.json",
      "utf8"
    )
  );


if (
  Object.keys(
    legacyEvents
  ).length !== 282
) {
  throw new Error(
    "Le manifeste legacy doit contenir 282 événements"
  );
}



function targetEventId(
  row
) {
  return String(
    row?.target_event_id
    || row?.event_id
    || ""
  );
}


function isDepublicationReason(
  reason
) {
  return (
    reason === "unpublish"
    || reason === "delete"
  );
}


function shouldAuthorizeCanonicalRemoval(
  row
) {
  return (
    isDepublicationReason(row.reason)
    || (
      row.reason === "edit"
      && canonicalDepublicationPath(row) !== null
    )
  );
}


function canonicalDepublicationPath(
  row
) {
  const identifier =
    targetEventId(
      row
    );

  const value =
    canonicalMap[
      identifier
    ];


  if (
    typeof value !== "string"
    || !/^evenement\/[^/]+\.html$/.test(
      value
    )
    || value === "evenement/index.html"
  ) {
    return null;
  }


  return value;
}


function headers(
  extra = {},
) {
  const result = {
    apikey:
      SECRET_KEY,

    "Content-Type":
      "application/json",

    ...extra,
  };


  if (
    !SECRET_KEY.startsWith(
      "sb_secret_"
    )
  ) {
    result.Authorization =
      `Bearer ${SECRET_KEY}`;
  }


  return result;
}


async function request(
  path,
  options = {},
) {
  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        ...options,

        headers:
          headers(
            options.headers
            || {}
          ),
      },
    );


  const text =
    await response.text();


  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: `
      + text.slice(
        0,
        1000
      )
    );
  }


  return (
    text
      ? JSON.parse(text)
      : null
  );
}


function setOutput(
  key,
  value,
) {
  const file =
    process.env.GITHUB_OUTPUT;


  if (file) {
    fs.appendFileSync(
      file,
      `${key}=${value}\n`
    );
  }


  console.log(
    `${key}=${value}`
  );
}


function publicationJobFilter(
  status,
) {
  let path =
    "event_publication_jobs"
    + `?status=eq.${encodeURIComponent(status)}`;


  if (
    PREACTIVATION_TEST
  ) {
    path +=
      "&reason=eq.manual"
      + "&event_id=is.null";

  } else {
    path +=
      "&reason=neq.manual";
  }


  return path;
}


async function patchJob(
  id,
  payload,
) {
  return request(
    "event_publication_jobs"
    + `?id=eq.${encodeURIComponent(id)}`,
    {
      method:
        "PATCH",

      headers: {
        Prefer:
          "return=representation",
      },

      body:
        JSON.stringify(
          payload
        ),
    },
  );
}

async function recoveryState(status, attempts, batchId = null) {
  const ids = RECOVERY_JOBS.map((job) => job.id).join(",");
  const eventIds = RECOVERY_JOBS.map((job) => job.eventId).join(",");
  const rows = await request(
    `event_publication_jobs?id=in.(${ids})`
    + "&select=id,event_id,target_event_id,reason,status,attempt_count,batch_id,commit_sha,last_error,requested_at"
  );
  const events = await request(
    `events?id=in.(${eventIds})&select=id,validated,rejected`
  );

  if (!Array.isArray(rows) || rows.length !== 2
      || !Array.isArray(events) || events.length !== 2) {
    throw new Error("STOP reprise P0 : jobs ou événements incomplets");
  }

  for (const expected of RECOVERY_JOBS) {
    const row = rows.find((item) => item.id === expected.id);
    const event = events.find((item) => item.id === expected.eventId);
    if (!row || row.event_id !== expected.eventId
        || row.target_event_id !== expected.eventId
        || row.reason !== expected.reason
        || row.status !== status
        || Number(row.attempt_count) !== attempts
        || row.batch_id !== batchId
        || row.commit_sha !== null
        || !event || event.validated !== expected.validated
        || event.rejected !== expected.rejected
        || legacyEvents[expected.eventId]) {
      throw new Error(`STOP reprise P0 : état inattendu pour ${expected.id}`);
    }
  }

  return rows;
}

async function claimRecovery() {
  if (PREACTIVATION_TEST
      || process.env.PUBLICATION_AUTOMATION_ENABLED !== "false") {
    throw new Error("STOP reprise P0 : automatisation ou préactivation incompatible");
  }

  const running = await request(
    "event_publication_jobs?status=eq.RUNNING&select=id&limit=1"
  );
  if (!Array.isArray(running) || running.length) {
    throw new Error("STOP reprise P0 : publication déjà en cours");
  }

  const rows = await recoveryState("FAILED", 3);
  const withdrawn = rows.find((row) => row.reason === "unpublish");
  const path = canonicalDepublicationPath(withdrawn);
  if (!path || !fs.existsSync(path)) {
    throw new Error("STOP reprise P0 : fiche canonique à retirer absente ou invalide");
  }

  const batchId = randomUUID();
  const ids = RECOVERY_JOBS.map((job) => job.id).join(",");
  const claimed = await request(
    `event_publication_jobs?id=in.(${ids})`
    + "&status=eq.FAILED&attempt_count=eq.3&batch_id=is.null&commit_sha=is.null",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "RUNNING",
        attempt_count: 4,
        batch_id: batchId,
        started_at: new Date().toISOString(),
        finished_at: null,
      }),
    }
  );
  if (!Array.isArray(claimed) || claimed.length !== 2
      || RECOVERY_JOBS.some((job) =>
        !claimed.some((row) => row.id === job.id
          && row.status === "RUNNING"
          && Number(row.attempt_count) === 4
          && row.batch_id === batchId))) {
    throw new Error("STOP reprise P0 : prise en charge incomplète");
  }

  setOutput("depublish_event_ids", JSON.stringify([withdrawn.target_event_id]));
  setOutput("depublish_paths", JSON.stringify([path]));
  setOutput("publication_jobs", JSON.stringify(rows.map((row) => ({
    id: row.id,
    event_id: targetEventId(row),
    reason: row.reason,
  }))));
  setOutput("has_jobs", "true");
  setOutput("batch_id", batchId);
  setOutput("job_count", "2");
  setOutput("blocked_count", "0");
}

async function verifyRecovery(batchId) {
  if (!P0_RECOVERY || !batchId) {
    throw new Error("STOP reprise P0 : vérification hors mode récupération");
  }
  await recoveryState("RUNNING", 4, batchId);
  console.log("PASS reprise P0 : états métier toujours cohérents");
}

async function recoveryBatch(batchId) {
  const rows = await request(
    "event_publication_jobs"
    + `?batch_id=eq.${encodeURIComponent(batchId)}`
    + "&status=eq.RUNNING"
    + "&select=id,attempt_count,last_error"
  );
  if (!Array.isArray(rows) || rows.length !== 2
      || RECOVERY_JOBS.some((job) =>
        !rows.some((row) => row.id === job.id
          && Number(row.attempt_count) === 4))) {
    throw new Error("STOP reprise P0 : batch non conforme");
  }
  return rows;
}


async function recoverStaleJobs() {
  const staleBefore =
    new Date(
      Date.now()
      - 30 * 60 * 1000
    ).toISOString();


  const rows =
    await request(
      publicationJobFilter(
        "RUNNING"
      )
      + `&started_at=lt.${encodeURIComponent(staleBefore)}`
      + "&select=id,attempt_count"
    );


  for (
    const row
    of Array.isArray(rows)
      ? rows
      : []
  ) {
    const attempts =
      Number(
        row.attempt_count
        || 0
      );


    if (
      attempts >= 3
    ) {
      await patchJob(
        row.id,
        {
          status:
            "FAILED",

          finished_at:
            new Date()
              .toISOString(),

          batch_id:
            null,

          last_error:
            "Publication interrompue après trois tentatives.",
        },
      );


    } else {

      await patchJob(
        row.id,
        {
          status:
            "PENDING",

          started_at:
            null,

          finished_at:
            null,

          batch_id:
            null,

          last_error:
            "Run précédent interrompu ; nouvelle tentative planifiée.",
        },
      );

    }
  }
}


async function blockLegacyJob(
  row
) {
  if (
    isDepublicationReason(
      row.reason
    )
  ) {
    return false;
  }


  const identifier =
    targetEventId(
      row
    );


  const filename =
    legacyEvents[
      identifier.toLowerCase()
    ];


  if (!filename) {
    return false;
  }


  await patchJob(
    row.id,
    {
      status:
        "BLOCKED",

      started_at:
        null,

      finished_at:
        new Date()
          .toISOString(),

      batch_id:
        null,

      commit_sha:
        null,

      last_error:
        "Fiche legacy enrichie protégée : "
        + "republication cloud bloquée pour éviter "
        + "une perte d'adresse, lieu, code postal, "
        + "auteurs ou provenance. "
        + filename,
    },
  );


  console.log(
    `BLOCKED legacy : ${identifier} -> ${filename}`
  );


  return true;
}


async function blockInvalidDepublicationJob(
  row
) {
  if (
    !isDepublicationReason(
      row.reason
    )
  ) {
    return false;
  }


  const identifier =
    targetEventId(
      row
    );


  if (
    canonicalDepublicationPath(
      row
    )
  ) {
    return false;
  }


  await patchJob(
    row.id,
    {
      status:
        "BLOCKED",

      started_at:
        null,

      finished_at:
        new Date()
          .toISOString(),

      batch_id:
        null,

      commit_sha:
        null,

      last_error:
        "Dépublication bloquée : chemin canonical absent ou invalide pour target_event_id="
        + identifier,
    },
  );


  console.log(
    `BLOCKED canonical : ${identifier}`
  );


  return true;
}


async function claim() {
  if (P0_RECOVERY) {
    return claimRecovery();
  }

  await recoverStaleJobs();


  setOutput(
    "depublish_event_ids",
    "[]"
  );

  setOutput(
    "depublish_paths",
    "[]"
  );


  const rows =
    await request(
      publicationJobFilter(
        "PENDING"
      )
      + "&select=id,event_id,target_event_id,reason,attempt_count,requested_at"
      + "&order=requested_at.asc"
      + "&limit=500"
    );


  if (
    !Array.isArray(rows)
    || rows.length === 0
  ) {
    setOutput(
      "has_jobs",
      "false"
    );

    setOutput(
      "batch_id",
      ""
    );

    setOutput(
      "job_count",
      "0"
    );

    setOutput(
      "blocked_count",
      "0"
    );

    console.log(
      "Aucun job en attente."
    );

    return;
  }


  if (
    PREACTIVATION_TEST
  ) {
    const unsafeRows =
      rows.filter(
        (row) =>
          row.event_id !== null
          || row.target_event_id !== null
          || row.reason !== "manual"
      );


    if (
      unsafeRows.length
    ) {
      throw new Error(
        "PREACTIVATION isolation violated: "
        + "only manual jobs with event_id=null are allowed"
      );
    }


    console.log(
      `PREACTIVATION_TEST=true : ${rows.length} job(s) manuel(s) isolé(s)`
    );
  }


  const publishable = [];
  let blockedCount = 0;


  for (
    const row
    of rows
  ) {
    if (
      await blockInvalidDepublicationJob(
        row
      )
    ) {
      blockedCount += 1;

      continue;
    }


    if (
      await blockLegacyJob(
        row
      )
    ) {
      blockedCount += 1;

      continue;
    }

    publishable.push(
      row
    );
  }


  setOutput(
    "blocked_count",
    String(
      blockedCount
    )
  );


  if (
    publishable.length === 0
  ) {
    setOutput(
      "has_jobs",
      "false"
    );

    setOutput(
      "batch_id",
      ""
    );

    setOutput(
      "job_count",
      "0"
    );

    console.log(
      `${blockedCount} job(s) legacy bloqué(s), aucun job publiable.`
    );

    return;
  }



  const depublishEventIds =
    [
      ...new Set(
        publishable
          .filter(
            (row) =>
              shouldAuthorizeCanonicalRemoval(row)
          )
          .map(
            (row) =>
              targetEventId(
                row
              )
          )
          .filter(Boolean)
      ),
    ];


  const depublishPaths =
    [
      ...new Set(
        depublishEventIds
          .map(
            (identifier) =>
              canonicalDepublicationPath({
                target_event_id:
                  identifier,
              })
          )
      ),
    ];


  if (
    depublishEventIds.length
    !== depublishPaths.length
  ) {
    throw new Error(
      "STOP : incohérence entre événements et chemins de dépublication"
    );
  }


  setOutput(
    "depublish_event_ids",
    JSON.stringify(
      depublishEventIds
    )
  );


  setOutput(
    "depublish_paths",
    JSON.stringify(
      depublishPaths
    )
  );


  const batchId =
    randomUUID();

  const startedAt =
    new Date()
      .toISOString();


  for (
    const row
    of publishable
  ) {
    await patchJob(
      row.id,
      {
        status:
          "RUNNING",

        batch_id:
          batchId,

        started_at:
          startedAt,

        finished_at:
          null,

        attempt_count:
          Number(
            row.attempt_count
            || 0
          )
          + 1,

        last_error:
          null,
      },
    );
  }


  setOutput(
    "has_jobs",
    "true"
  );

  setOutput(
    "publication_jobs",
    JSON.stringify(publishable.map((row) => ({
      id: row.id,
      event_id: targetEventId(row) || null,
      reason: row.reason,
    })))
  );

  setOutput(
    "batch_id",
    batchId
  );

  setOutput(
    "job_count",
    String(
      publishable.length
    )
  );


  console.log(
    `Batch ${batchId} : `
    + `${publishable.length} publiable(s), `
    + `${blockedCount} legacy bloqué(s)`
  );
}


async function success() {
  const batchId =
    process.argv[3];

  const commitSha =
    process.argv[4];


  if (
    !batchId
    || !commitSha
  ) {
    throw new Error(
      "batch_id et commit_sha requis"
    );
  }

  if (P0_RECOVERY) {
    await recoveryBatch(batchId);
  }


  await request(
    "event_publication_jobs"
    + `?batch_id=eq.${encodeURIComponent(batchId)}`
    + "&status=eq.RUNNING"
    + (P0_RECOVERY
      ? `&id=in.(${RECOVERY_JOBS.map((job) => job.id).join(",")})`
      : ""),
    {
      method:
        "PATCH",

      headers: {
        Prefer:
          "return=representation",
      },

      body:
        JSON.stringify({
          status:
            "SUCCESS",

          finished_at:
            new Date()
              .toISOString(),

          commit_sha:
            commitSha,

          ...(P0_RECOVERY ? {} : { last_error: null }),
        }),
    },
  );


  console.log(
    `Batch ${batchId} : SUCCESS`
  );
}


async function fail() {
  const batchId =
    process.argv[3];


  if (!batchId) {
    throw new Error(
      "batch_id requis"
    );
  }


  const message =
    (
      process.env.PUBLICATION_ERROR
      || "GitHub Actions publication failed"
    ).slice(
      0,
      2000
    );


  const rows = P0_RECOVERY
    ? await recoveryBatch(batchId)
    : await request(
      "event_publication_jobs"
      + `?batch_id=eq.${encodeURIComponent(batchId)}`
      + "&status=eq.RUNNING"
      + "&select=id,attempt_count,last_error"
    );


  for (
    const row
    of Array.isArray(rows)
      ? rows
      : []
  ) {
    const attempts =
      Number(
        row.attempt_count
        || 0
      );

    const retry =
      PREACTIVATION_TEST
        ? false
        : attempts < 3;


    const payload = {
      status:
        retry
          ? "PENDING"
          : "FAILED",

      batch_id:
        null,

      finished_at:
        retry
          ? null
          : new Date()
              .toISOString(),

      last_error:
        P0_RECOVERY
          ? [row.last_error, message].filter(Boolean).join(" | ").slice(0, 2000)
          : message,
    };


    if (retry) {
      payload.started_at =
        null;
    }


    await patchJob(
      row.id,
      payload
    );
  }


  console.log(
    `Batch ${batchId} : échec traité`
  );
}


const command =
  process.argv[2];


if (
  command === "claim"
) {
  await claim();

} else if (
  command === "success"
) {
  await success();

} else if (
  command === "fail"
) {
  await fail();

} else if (
  command === "verify-recovery"
) {
  await verifyRecovery(process.argv[3]);

} else {
  throw new Error(
    "Commande attendue : "
    + "claim | success | fail | verify-recovery"
  );
}
