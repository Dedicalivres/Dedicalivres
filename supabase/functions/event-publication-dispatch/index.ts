// Server-side GitHub wake-up is retired: publication uses a manual
// selected-job PREVIEW/EXECUTE or the separately gated scheduled CANARY.
// Creating a PENDING job never authorizes this endpoint to start Actions.
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: { job_id?: string; dispatch_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!uuidPattern.test(String(body.job_id || ""))) {
    return json({ error: "invalid_job_id" }, 400);
  }
  if (!uuidPattern.test(String(body.dispatch_token || ""))) {
    return json({ error: "invalid_dispatch_token" }, 401);
  }

  // No database claim, reservation, GitHub API call, or secret access.
  // The queue remains authoritative in public.event_publication_jobs.
  return json({
    queued: true,
    dispatched: false,
    reason: "manual_publication_required",
  });
});
