import {
  randomUUID,
  createHash,
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

const DOUAI_MANUAL =
  process.env.PUBLICATION_DOUAI_MANUAL
  === "true";

const MANUAL_MODE = process.env.PUBLICATION_MANUAL_MODE || "";
const MANUAL_IDS = process.env.PUBLICATION_MANUAL_JOB_IDS || "";
const MANUAL_FINGERPRINT = process.env.PUBLICATION_MANUAL_FINGERPRINT || "";
const MANUAL_CONFIRMATION = process.env.PUBLICATION_MANUAL_CONFIRMATION || "";

const DOUAI_JOB = {
  id: "af1a386a-1b9d-4eeb-b162-6b34c32d667b",
  eventId: "d04e32a8-1f92-4068-bf73-d17e672950aa",
  reason: "validation",
};

const AUTOMATIC_BATCH_LIMIT = 3;

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

async function rpc(name, payload) {
  return request(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

function canaryRun() {
  const runId = Number(process.env.GITHUB_RUN_ID);
  const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (process.env.GITHUB_EVENT_NAME !== "schedule"
      || !Number.isSafeInteger(runId) || runId <= 0 || attempt !== 1
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY || "")
      || !process.env.GITHUB_TOKEN) {
    throw new Error("STOP CANARY : contexte planifié invalide ou relancement interdit");
  }
  return runId;
}

async function canaryStatus() {
  let rows;
  try { rows = await rpc("publication_canary_status", {}); }
  catch { throw new Error("STOP CANARY : état de sécurité inaccessible"); }
  if (!Array.isArray(rows) || rows.length !== 1
      || typeof rows[0].armed !== "boolean"
      || typeof rows[0].halted !== "boolean"
      || !Number.isSafeInteger(Number(rows[0].cleared_through_run_id))) {
    throw new Error("STOP CANARY : état de sécurité illisible");
  }
  return rows[0];
}

async function checkCanaryActionsHistory(clearedThrough, currentRun) {
  // Actions history is the durable fail-closed fallback when Supabase cannot
  // record a preflight failure, cancellation, timeout, or network incident.
  const repo = process.env.GITHUB_REPOSITORY;
  let sawCurrent = false;
  for (let page = 1; page <= 100; page += 1) {
    let body;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/publish-events.yml/runs?event=schedule&per_page=100&page=${page}`,
        { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28" } },
      );
      if (!response.ok) throw new Error("Actions unavailable");
      body = await response.json();
    } catch { throw new Error("STOP CANARY : historique GitHub Actions inaccessible"); }
    const runs = body?.workflow_runs;
    if (!Array.isArray(runs)) throw new Error("STOP CANARY : historique GitHub Actions illisible");
    for (const run of runs) {
      if (!Number.isSafeInteger(run.id)) throw new Error("STOP CANARY : run GitHub illisible");
      if (run.id === currentRun) { sawCurrent = true; continue; }
      if (run.id > currentRun || run.id <= clearedThrough) continue;
      if (run.status !== "completed"
          || !["success", "skipped"].includes(run.conclusion)) {
        throw new Error(`STOP CANARY : incident GitHub Actions non acquitté (run ${run.id})`);
      }
    }
    if (runs.length < 100 || runs.some((run) => run.id <= clearedThrough)) {
      if (!sawCurrent) throw new Error("STOP CANARY : run courant absent de l'historique GitHub");
      return;
    }
  }
  throw new Error("STOP CANARY : historique GitHub Actions incomplet");
}

function noCanaryJobs(reason) {
  setOutput("has_pending", "false");
  console.log(`CANARY : ${reason}`);
}

async function canaryCandidate() {
  let rows;
  try { rows = await rpc("publication_canary_candidate", {}); }
  catch { throw new Error("STOP CANARY : sélection sécurisée inaccessible"); }
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new Error("STOP CANARY : sélection sécurisée illisible");
  }
  const row = rows[0] || null;
  if (row && (row.reason !== "validation" || row.status !== "PENDING"
      || row.attempt_count !== 0 || row.event_id !== row.target_event_id)) {
    throw new Error("STOP CANARY : sélection incompatible");
  }
  return row && !legacyEvents[row.target_event_id] ? row : null;
}

async function canaryGuards() {
  const runId = canaryRun();
  const state = await canaryStatus();
  if (state.halted) throw new Error("STOP CANARY : incident persistant, revue humaine requise");
  if (!state.armed) return { runId, ready: false, reason: "non armé" };
  await checkCanaryActionsHistory(Number(state.cleared_through_run_id), runId);
  if (state.last_reserved_at) {
    const reserved = Date.parse(state.last_reserved_at);
    if (!Number.isFinite(reserved)) throw new Error("STOP CANARY : date de réservation illisible");
    if (Date.now() - reserved < 24 * 60 * 60 * 1000) {
      return { runId, ready: false, reason: "quota 24 h atteint" };
    }
  }
  return { runId, ready: true };
}

async function canaryPreflight() {
  const state = await canaryGuards();
  if (!state.ready) return noCanaryJobs(state.reason);
  const row = await canaryCandidate();
  if (!row) return noCanaryJobs("aucun job validé avec preuve de source admissible");
  setOutput("has_pending", "true");
  console.log(`CANARY : un job éligible (${row.id})`);
}

async function canaryClaim() {
  const state = await canaryGuards();
  if (!state.ready) throw new Error("STOP CANARY : quota ou armement changé avant réservation");
  const row = await canaryCandidate();
  if (!row) throw new Error("STOP CANARY : candidat modifié avant réservation");
  const batchId = randomUUID();
  let claimed;
  try {
    claimed = await rpc("claim_publication_canary_batch", {
      p_expected: [row], p_batch_id: batchId,
      p_run_id: state.runId, p_run_attempt: 1,
    });
  } catch { throw new Error("STOP CANARY : réservation atomique refusée"); }
  if (!Array.isArray(claimed) || claimed.length !== 1
      || claimed[0].id !== row.id || claimed[0].status !== "RUNNING"
      || claimed[0].batch_id !== batchId || claimed[0].reason !== "validation"
      || Number(claimed[0].attempt_count) !== 1) {
    throw new Error("STOP CANARY : résultat de réservation incertain");
  }
  setOutput("depublish_event_ids", "[]");
  setOutput("depublish_paths", "[]");
  setOutput("publication_jobs", JSON.stringify([{
    id: row.id, event_id: row.target_event_id,
    reason: "validation", attempt_count: 1,
  }]));
  setOutput("has_jobs", "true");
  setOutput("batch_id", batchId);
  setOutput("job_count", "1");
  setOutput("blocked_count", "0");
  console.log(`Batch CANARY ${batchId} : 1 job réservé`);
}

async function canaryIncident() {
  const runId = Number(process.env.GITHUB_RUN_ID);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  const batchId = process.env.PUBLICATION_CANARY_BATCH_ID || null;
  const stage = String(process.env.PUBLICATION_ERROR || "unknown failure")
    .replace(/[^A-Za-z0-9 ,.-]/g, "").slice(0, 120);
  if (process.env.GITHUB_EVENT_NAME !== "schedule"
      || !Number.isSafeInteger(runId) || runId <= 0
      || !Number.isSafeInteger(runAttempt) || runAttempt < 1) {
    throw new Error("STOP CANARY : contexte d'incident invalide");
  }
  try {
    await rpc("record_publication_canary_incident", {
      p_run_id: runId, p_run_attempt: runAttempt,
      p_batch_id: batchId, p_reason: `Automatic CANARY failure: ${stage}`,
    });
  } catch {
    throw new Error("STOP CANARY : incident non consigné en base ; historique GitHub requis pour bloquer la reprise");
  }
  console.log(`CANARY : incident enregistré pour le run ${runId}`);
}

async function preflight() {
  if (MANUAL_MODE === "execute") {
    await selectedBatch(true);
    setOutput("has_pending", "true");
    return;
  }
  if (DOUAI_MANUAL) {
    setOutput("has_pending", "true");
    console.log("Mode Douai : précontrôle général ignoré");
    return;
  }
  if (PREACTIVATION_TEST || P0_RECOVERY
      || process.env.PUBLICATION_AUTOMATION_ENABLED !== "true") {
    throw new Error("STOP précontrôle : mode de publication incompatible");
  }

  return canaryPreflight();
}

function selectedIds() {
  const ids = MANUAL_IDS.split(/[\s,]+/).filter(Boolean).map((id) => id.toLowerCase());
  if (ids.length < 1 || ids.length > AUTOMATIC_BATCH_LIMIT
      || ids.some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))
      || new Set(ids).size !== ids.length) {
    throw new Error("STOP manuel : fournir 1 à 3 UUID distincts et valides");
  }
  return ids;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

async function readSelection(path) {
  try { return await request(path); }
  catch { throw new Error("STOP manuel : lecture Supabase impossible"); }
}

async function selectedBatch(execute) {
  if (PREACTIVATION_TEST || P0_RECOVERY || DOUAI_MANUAL
      || !["false", "true"].includes(process.env.PUBLICATION_AUTOMATION_ENABLED)) {
    throw new Error("STOP manuel : mode incompatible ou état d'automatisation inconnu");
  }
  const ids = selectedIds();
  if (execute && (MANUAL_CONFIRMATION !== "EXECUTE"
      || !/^[0-9a-f]{64}$/.test(MANUAL_FINGERPRINT))) {
    throw new Error("STOP manuel : confirmation et empreinte PREVIEW obligatoires");
  }
  const running = await readSelection("event_publication_jobs?status=eq.RUNNING&select=id&limit=1");
  if (!Array.isArray(running) || running.length) {
    throw new Error("STOP manuel : publication concurrente ou état illisible");
  }
  const rows = await readSelection("event_publication_jobs?id=in.("
    + ids.join(",") + ")&select=*");
  if (!Array.isArray(rows) || rows.length !== ids.length) {
    throw new Error("STOP manuel : job absent ou réponse illisible");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const jobs = ids.map((id) => byId.get(id));
  if (jobs.some((row) => !row || row.status !== "PENDING"
      || row.batch_id !== null || row.commit_sha !== null
      || !Number.isInteger(Number(row.attempt_count))
      || Number(row.attempt_count) < 0 || Number(row.attempt_count) >= 3
      || !["validation", "edit", "unpublish", "delete"].includes(row.reason)
      || !row.target_event_id || !row.requested_at
      || (row.event_id !== null && row.event_id !== row.target_event_id)
      || (row.reason === "delete" && row.event_id !== null)
      || (legacyEvents[row.target_event_id] && !isDepublicationReason(row.reason))
      || (shouldAuthorizeCanonicalRemoval(row) && !canonicalDepublicationPath(row)))) {
    throw new Error("STOP manuel : job PENDING incompatible");
  }
  if (new Set(jobs.map((row) => row.target_event_id)).size !== jobs.length) {
    throw new Error("STOP manuel : événements cibles dupliqués");
  }
  const eventIds = [...new Set(jobs.map((row) => row.target_event_id))];
  const events = await readSelection("events?id=in.(" + eventIds.join(",") + ")&select=*");
  if (!Array.isArray(events)) throw new Error("STOP manuel : événements illisibles");
  const eventById = new Map(events.map((event) => [event.id, event]));
  if (jobs.some((row) => {
    const event = eventById.get(row.target_event_id);
    const publicEvent = event?.validated === true && event?.rejected !== true;
    return row.reason === "validation" || row.reason === "edit"
      ? !publicEvent
      : row.reason === "delete" ? Boolean(event) : publicEvent;
  })) throw new Error("STOP manuel : événement incompatible");
  const fingerprint = createHash("sha256").update(JSON.stringify(stable({
    ids, jobs, events: eventIds.map((id) => eventById.get(id) || null),
  }))).digest("hex");
  if (execute && fingerprint !== MANUAL_FINGERPRINT) {
    throw new Error("STOP manuel : données modifiées depuis PREVIEW");
  }
  console.log("Lot manuel : " + jobs.map((row) => `${row.id} ${row.reason} PENDING ${row.target_event_id}`).join(" | "));
  if (!execute) console.log(`Empreinte PREVIEW : ${fingerprint}`);
  return { jobs, fingerprint };
}

async function previewSelected() {
  if (MANUAL_MODE !== "preview") throw new Error("STOP manuel : PREVIEW attendu");
  await selectedBatch(false);
  console.log("PREVIEW lecture seule : aucune réservation ni publication");
}

async function claimSelected() {
  const { jobs } = await selectedBatch(true);
  const batchId = randomUUID();
  let claimed;
  try {
    claimed = await rpc("claim_event_publication_batch", {
      p_expected: jobs, p_batch_id: batchId,
    });
  } catch {
    throw new Error("STOP manuel : réservation RPC refusée ; vérifier les statuts avant toute reprise");
  }
  if (!Array.isArray(claimed) || claimed.length !== jobs.length
      || jobs.some((row) => !claimed.some((item) => item.id === row.id
        && item.status === "RUNNING" && item.batch_id === batchId
        && item.reason === row.reason
        && item.target_event_id === row.target_event_id
        && Number(item.attempt_count) === Number(row.attempt_count) + 1))) {
    throw new Error("STOP manuel : réservation atomique non confirmée");
  }
  const depublishEventIds = [...new Set(claimed.filter(shouldAuthorizeCanonicalRemoval)
    .map(targetEventId))];
  const depublishPaths = depublishEventIds.map((id) => canonicalDepublicationPath({target_event_id:id}));
  if (depublishPaths.some((path) => !path)) {
    throw new Error("STOP manuel : chemin canonical réservé invalide");
  }
  setOutput("depublish_event_ids", JSON.stringify(depublishEventIds));
  setOutput("depublish_paths", JSON.stringify(depublishPaths));
  setOutput("publication_jobs", JSON.stringify(claimed.map((row) => ({
    id: row.id, event_id: targetEventId(row) || null, reason: row.reason,
    attempt_count: Number(row.attempt_count),
  }))));
  setOutput("has_jobs", "true");
  setOutput("batch_id", batchId);
  setOutput("job_count", String(claimed.length));
  setOutput("blocked_count", "0");
  console.log(`Batch ${batchId} : ${claimed.length} job(s) manuel(s) réservé(s)`);
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

async function blockPendingJob(row, payload) {
  const updated = await request(
    `event_publication_jobs?id=eq.${encodeURIComponent(row.id)}`
    + `&status=eq.PENDING&attempt_count=eq.${Number(row.attempt_count)}`
    + '&batch_id=is.null&commit_sha=is.null',
    {method:'PATCH', headers:{Prefer:'return=representation'},
      body:JSON.stringify(payload)}
  );
  if (!Array.isArray(updated) || updated.length !== 1
      || updated[0].id !== row.id || updated[0].status !== 'BLOCKED') {
    throw new Error(`STOP : blocage concurrent non confirmé pour ${row.id}`);
  }
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


  await blockPendingJob(
    row,
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

async function claimDouai() {
  if (PREACTIVATION_TEST || P0_RECOVERY
      || process.env.PUBLICATION_AUTOMATION_ENABLED !== "false") {
    throw new Error("STOP Douai : mode manuel incompatible");
  }

  const running = await request(
    "event_publication_jobs?status=eq.RUNNING&select=id&limit=1"
  );
  if (!Array.isArray(running) || running.length !== 0) {
    throw new Error("STOP Douai : publication déjà en cours");
  }

  const rows = await request(
    `event_publication_jobs?id=eq.${DOUAI_JOB.id}`
    + "&select=id,event_id,target_event_id,reason,status,attempt_count,batch_id,commit_sha,requested_at"
  );
  const events = await request(
    `events?id=eq.${DOUAI_JOB.eventId}&select=id,validated,rejected`
  );
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const event = Array.isArray(events) && events.length === 1 ? events[0] : null;

  if (!row || row.id !== DOUAI_JOB.id
      || row.event_id !== DOUAI_JOB.eventId
      || row.target_event_id !== DOUAI_JOB.eventId
      || row.reason !== DOUAI_JOB.reason
      || row.status !== "PENDING"
      || Number(row.attempt_count) !== 0
      || row.batch_id !== null || row.commit_sha !== null
      || !event || event.id !== DOUAI_JOB.eventId
      || event.validated !== true || event.rejected !== false
      || legacyEvents[DOUAI_JOB.eventId]) {
    throw new Error("STOP Douai : préconditions du job ou de l'événement invalides");
  }

  const batchId = randomUUID();
  const claimed = await rpc("claim_event_publication_batch", {
    p_expected: [row],
    p_batch_id: batchId,
  });
  if (!Array.isArray(claimed) || claimed.length !== 1
      || claimed[0].id !== DOUAI_JOB.id
      || claimed[0].event_id !== DOUAI_JOB.eventId
      || claimed[0].target_event_id !== DOUAI_JOB.eventId
      || claimed[0].reason !== DOUAI_JOB.reason
      || claimed[0].status !== "RUNNING"
      || Number(claimed[0].attempt_count) !== 1
      || claimed[0].batch_id !== batchId) {
    throw new Error("STOP Douai : réservation atomique non confirmée");
  }

  setOutput("depublish_event_ids", "[]");
  setOutput("depublish_paths", "[]");
  setOutput("publication_jobs", JSON.stringify([{
    id: claimed[0].id,
    event_id: DOUAI_JOB.eventId,
    reason: DOUAI_JOB.reason,
    attempt_count: 1,
  }]));
  setOutput("has_jobs", "true");
  setOutput("batch_id", batchId);
  setOutput("job_count", "1");
  setOutput("blocked_count", "0");
  console.log(`Batch ${batchId} : job Douai réservé`);
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


  await blockPendingJob(
    row,
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
  if (PREACTIVATION_TEST) {
    throw new Error("STOP : préactivation réelle retirée ; utiliser les tests PostgreSQL isolés");
  }
  if (P0_RECOVERY) {
    return claimRecovery();
  }
  if (MANUAL_MODE === "execute") {
    return claimSelected();
  }
  if (DOUAI_MANUAL) {
    return claimDouai();
  }
  if (process.env.PUBLICATION_AUTOMATION_ENABLED !== "true") {
    throw new Error("STOP : automatisation désactivée ; aucun claim réel autorisé");
  }
  return canaryClaim();
}

function expectedBatch(batchId) {
  let rows;
  try { rows = JSON.parse(process.env.PUBLICATION_JOBS || ""); }
  catch { throw new Error("STOP : PUBLICATION_JOBS absent ou invalide"); }
  if (!batchId || !Array.isArray(rows) || !rows.length
      || new Set(rows.map((row) => row.id)).size !== rows.length
      || rows.some((row) => !/^[0-9a-f-]{36}$/.test(row.id || "")
        || !Number.isInteger(row.attempt_count) || row.attempt_count < 1
        || row.attempt_count > 3)) {
    throw new Error("STOP : identité du batch invalide");
  }
  return rows.map(({id, attempt_count}) => ({id, attempt_count}));
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

  if (!P0_RECOVERY) {
    const expected = expectedBatch(batchId);
    const proof = JSON.parse(process.env.PUBLICATION_DEPLOYMENT_PROOF || "null");
    if (!proof || proof.sha !== commitSha || !Number.isInteger(proof.pages_run_id)
        || proof.pages_run_id <= 0 || proof.verified !== true
        || proof.job_count !== expected.length) {
      throw new Error("STOP : déploiement et résultat public non confirmés");
    }
    const updated = await rpc("complete_event_publication_batch", {
      p_expected: expected, p_batch_id: batchId, p_outcome: "SUCCESS",
      p_commit_sha: commitSha,
    });
    if (!Array.isArray(updated) || updated.length !== expected.length
        || expected.some((row) => !updated.some((item) => item.id === row.id
          && item.status === "SUCCESS" && item.batch_id === batchId
          && Number(item.attempt_count) === row.attempt_count
          && item.commit_sha === commitSha))) {
      throw new Error("STOP : finalisation atomique non confirmée");
    }
    console.log(`Batch ${batchId} : SUCCESS confirmé`);
    return;
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

  if (!P0_RECOVERY) {
    const expected = expectedBatch(batchId);
    const updated = await rpc("complete_event_publication_batch", {
      p_expected: expected, p_batch_id: batchId,
      p_outcome: "FAILED", p_error: message,
    });
    if (!Array.isArray(updated) || updated.length !== expected.length
        || expected.some((row) => !updated.some((item) => item.id === row.id
          && ["PENDING", "FAILED"].includes(item.status)
          && Number(item.attempt_count) === row.attempt_count))) {
      throw new Error("STOP : échec atomique non confirmé");
    }
    console.log(`Batch ${batchId} : échec avant publication consigné`);
    return;
  }


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
  command === "preflight"
) {
  await preflight();

} else if (
  command === "preview-selected"
) {
  await previewSelected();

} else if (
  command === "claim"
) {
  await claim();

} else if (
  command === "canary-incident"
) {
  await canaryIncident();

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
    + "preflight | claim | success | fail | verify-recovery"
  );
}
