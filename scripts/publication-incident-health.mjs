import { pathToFileURL } from "node:url";

const PAGE_SIZE = 100;
const DELAY_MINUTES = 45;
const ALLOWED_STATUSES = new Set(["PENDING", "RUNNING", "FAILED", "BLOCKED"]);

class HealthError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function parseDate(value, nowMs, code) {
  if (typeof value !== "string" || !value) throw new HealthError(code);
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) throw new HealthError(code);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
      || hour > 23 || minute > 59 || second > 59) {
    throw new HealthError(code);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > nowMs) throw new HealthError(code);
  return timestamp;
}

function parseReference(value, nowMs) {
  if (!value) return null;
  return parseDate(value, nowMs, "REFERENCE_DATE_INVALID");
}

function emptyCounts() {
  return {
    active: { pending: 0, running: 0, failed: 0, blocked: 0 },
    signals: {
      running_in_progress: 0,
      running_suspect: 0,
      pending_delayed: 0,
      pending_suppressed: 0,
      failed_recent: 0,
      failed_historical: 0,
      blocked_recent: 0,
      blocked_historical: 0,
      anomaly: 0,
      baseline_unknown: 0,
    },
  };
}

export function classifyPublicationHealth(rows, {
  now = () => new Date(),
  automationEnabled = false,
  incidentReferenceAt = null,
} = {}) {
  if (!Array.isArray(rows)) throw new HealthError("DATA_INCOMPLETE");
  const nowValue = now();
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) throw new HealthError("CLOCK_INVALID");
  const referenceMs = parseReference(incidentReferenceAt, nowMs);
  const counts = emptyCounts();
  const seen = new Set();

  for (const row of rows) {
    if (!row || typeof row.id !== "string" || seen.has(row.id)
        || !ALLOWED_STATUSES.has(row.status)) {
      throw new HealthError("DATA_INCOMPLETE");
    }
    seen.add(row.id);
    counts.active[row.status.toLowerCase()] += 1;

    try {
      if (row.status === "RUNNING") {
        const started = parseDate(row.started_at, nowMs, "RUNNING_DATE_INVALID");
        const age = (nowMs - started) / 60000;
        counts.signals[age >= DELAY_MINUTES ? "running_suspect" : "running_in_progress"] += 1;
      } else if (row.status === "PENDING") {
        const requested = parseDate(row.requested_at, nowMs, "PENDING_DATE_INVALID");
        if (!automationEnabled) {
          counts.signals.pending_suppressed += 1;
        } else {
          if ((nowMs - requested) / 60000 >= DELAY_MINUTES) {
            counts.signals.pending_delayed += 1;
          }
        }
      } else {
        if (referenceMs === null) {
          counts.signals.baseline_unknown += 1;
          continue;
        }
        const finished = parseDate(row.finished_at, nowMs, `${row.status}_DATE_INVALID`);
        const suffix = finished >= referenceMs ? "recent" : "historical";
        counts.signals[`${row.status.toLowerCase()}_${suffix}`] += 1;
      }
    } catch (error) {
      if (!(error instanceof HealthError)) throw error;
      counts.signals.anomaly += 1;
    }
  }

  const attention = counts.signals.running_suspect
    + counts.signals.pending_delayed
    + counts.signals.failed_recent
    + counts.signals.blocked_recent
    + counts.signals.anomaly;
  const state = counts.signals.baseline_unknown > 0 || counts.signals.anomaly > 0
    ? "UNKNOWN"
    : attention > 0 ? "ATTENTION" : "HEALTHY";

  return {
    state,
    threshold_minutes: DELAY_MINUTES,
    automation_enabled: automationEnabled,
    counts,
    human_review_required: state !== "HEALTHY",
    mutations_performed: 0,
  };
}

function contentRange(headers) {
  const raw = headers?.get?.("content-range");
  if (raw === "*/0") return { start: 0, end: -1, total: 0 };
  const match = typeof raw === "string" && raw.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (!match) throw new HealthError("PAGINATION_UNKNOWN");
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

export async function readPublicationJobs({ url, key, fetchImpl = fetch }) {
  if (!url || !key || typeof fetchImpl !== "function") {
    throw new HealthError("CONFIG_MISSING");
  }
  const rows = [];
  let offset = 0;
  let total = null;

  while (total === null || offset < total) {
    let response;
    try {
      const headers = {
        apikey: key,
        Prefer: "count=exact",
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
      };
      if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
      response = await fetchImpl(
        `${url}/rest/v1/event_publication_jobs`
        + "?status=in.(PENDING,RUNNING,FAILED,BLOCKED)"
        + "&select=id,status,requested_at,started_at,finished_at"
        + "&order=id.asc",
        {
          method: "GET",
          headers,
        },
      );
    } catch {
      throw new HealthError("NETWORK_UNAVAILABLE");
    }
    if (!response?.ok) {
      throw new HealthError(response?.status === 401 ? "HTTP_401" : "HTTP_ERROR");
    }
    const range = contentRange(response.headers);
    if (range.start !== offset || (range.total > 0 && range.end < range.start)
        || (total !== null && range.total !== total)) {
      throw new HealthError("PAGINATION_TRUNCATED");
    }
    total = range.total;
    let page;
    try {
      page = JSON.parse(await response.text());
    } catch {
      throw new HealthError("JSON_INVALID");
    }
    if (!Array.isArray(page) || page.length !== range.end - range.start + 1
        || rows.length + page.length > total) {
      throw new HealthError("PAGINATION_TRUNCATED");
    }
    rows.push(...page);
    offset += page.length;
    if (page.length === 0 && offset < total) throw new HealthError("PAGINATION_TRUNCATED");
  }
  if (rows.length !== total) throw new HealthError("PAGINATION_TRUNCATED");
  return rows;
}

export async function runPublicationHealth(options = {}) {
  const rows = await readPublicationJobs(options);
  return classifyPublicationHealth(rows, options);
}

async function main() {
  try {
    const report = await runPublicationHealth({
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SECRET_KEY,
      automationEnabled: process.env.PUBLICATION_AUTOMATION_ENABLED === "true",
      incidentReferenceAt: process.env.PUBLICATION_INCIDENT_REFERENCE_AT || null,
    });
    console.log(JSON.stringify(report));
  } catch (error) {
    const category = error instanceof HealthError ? error.code : "UNEXPECTED_ERROR";
    console.error(JSON.stringify({ state: "UNKNOWN", category, mutations_performed: 0 }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
