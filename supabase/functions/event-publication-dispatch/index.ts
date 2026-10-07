const REPOSITORY =
  "Dedicalivres/Dedicalivres";

const WORKFLOW =
  "publish-events.yml";

const ALLOWED_ORIGINS =
  new Set([
    "https://dedicalivres.fr",
    "https://www.dedicalivres.fr",
  ]);


function corsHeaders(
  req: Request,
) {
  const origin =
    req.headers.get("Origin")
    || "";

  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGINS.has(origin)
        ? origin
        : "https://dedicalivres.fr",

    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Content-Type":
      "application/json",

    "Vary":
      "Origin",
  };
}


function json(
  req: Request,
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:
        corsHeaders(req),
    },
  );
}


async function databaseRequestIsValid(
  body: any,
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  if (
    !body?.job_id
    || !body?.dispatch_secret
  ) {
    return null;
  }

  const secretResponse =
    await fetch(
      supabaseUrl
      + "/rest/v1/rpc/verify_publication_dispatch_secret",
      {
        method:
          "POST",

        headers: {
          apikey:
            serviceRoleKey,

          Authorization:
            "Bearer "
            + serviceRoleKey,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            candidate:
              body.dispatch_secret,
          }),
      },
    );

  if (!secretResponse.ok) {
    return null;
  }

  const secretValid =
    await secretResponse.json();

  if (secretValid !== true) {
    return null;
  }

  const jobResponse =
    await fetch(
      supabaseUrl
      + "/rest/v1/event_publication_jobs"
      + "?id=eq."
      + encodeURIComponent(
        body.job_id,
      )
      + "&select=id,event_id,reason,status,attempt_count"
      + "&limit=1",
      {
        headers: {
          apikey:
            serviceRoleKey,

          Authorization:
            "Bearer "
            + serviceRoleKey,
        },
      },
    );

  if (!jobResponse.ok) {
    return null;
  }

  const jobs =
    await jobResponse.json();

  if (
    !Array.isArray(jobs)
    || jobs.length !== 1
  ) {
    return null;
  }

  const job =
    jobs[0];

  if (
    job.status !== "PENDING"
    || !job.event_id
    || ![
      "validation",
      "edit",
    ].includes(
      job.reason,
    )
    || Number(
      job.attempt_count
      || 0
    ) >= 3
  ) {
    return null;
  }

  return job;
}


async function adminRequestIsValid(
  req: Request,
  supabaseUrl: string,
) {
  const authorization =
    req.headers.get(
      "Authorization",
    )
    || "";

  const apikey =
    req.headers.get(
      "apikey",
    )
    || "";

  if (
    !authorization.startsWith(
      "Bearer "
    )
    || !apikey
  ) {
    return false;
  }

  const userResponse =
    await fetch(
      supabaseUrl
      + "/auth/v1/user",
      {
        headers: {
          apikey,

          Authorization:
            authorization,
        },
      },
    );

  if (!userResponse.ok) {
    return false;
  }

  const user =
    await userResponse.json();

  if (!user?.id) {
    return false;
  }

  const adminResponse =
    await fetch(
      supabaseUrl
      + "/rest/v1/admin_users"
      + "?user_id=eq."
      + encodeURIComponent(
        user.id,
      )
      + "&select=user_id"
      + "&limit=1",
      {
        headers: {
          apikey,

          Authorization:
            authorization,
        },
      },
    );

  if (!adminResponse.ok) {
    return false;
  }

  const admins =
    await adminResponse.json();

  return (
    Array.isArray(admins)
    && admins.length === 1
  );
}


Deno.serve(
  async (
    req: Request,
  ) => {

    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders(req),
        },
      );
    }


    if (
      req.method !== "POST"
    ) {
      return json(
        req,
        {
          error:
            "method_not_allowed",
        },
        405,
      );
    }


    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      )
      || "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      )
      || "";

    const githubToken =
      Deno.env.get(
        "GITHUB_DISPATCH_TOKEN",
      )
      || "";


    if (
      !supabaseUrl
      || !serviceRoleKey
      || !githubToken
    ) {
      return json(
        req,
        {
          error:
            "server_configuration_missing",
        },
        503,
      );
    }


    let body: any = {};

    try {
      body =
        await req.json();

    } catch {
      body = {};
    }


    const databaseJob =
      await databaseRequestIsValid(
        body,
        supabaseUrl,
        serviceRoleKey,
      );


    let mode =
      "database";

    let eventId =
      databaseJob?.event_id
      || null;

    let reason =
      databaseJob?.reason
      || null;


    if (!databaseJob) {

      mode =
        "admin";

      const adminValid =
        await adminRequestIsValid(
          req,
          supabaseUrl,
        );

      if (!adminValid) {
        return json(
          req,
          {
            error:
              "dispatch_forbidden",
          },
          403,
        );
      }

      eventId =
        body.event_id
        || null;

      reason =
        body.reason
        || null;
    }


    const githubResponse =
      await fetch(
        "https://api.github.com/repos/"
        + REPOSITORY
        + "/actions/workflows/"
        + WORKFLOW
        + "/dispatches",
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/vnd.github+json",

            Authorization:
              "Bearer "
              + githubToken,

            "X-GitHub-Api-Version":
              "2022-11-28",

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              ref:
                "main",
            }),
        },
      );


    if (!githubResponse.ok) {

      console.error(
        "GitHub dispatch failed",
        githubResponse.status,
      );

      return json(
        req,
        {
          error:
            "github_dispatch_failed",

          queued:
            true,

          mode,
        },
        502,
      );
    }


    return json(
      req,
      {
        queued:
          true,

        dispatched:
          true,

        mode,

        job_id:
          databaseJob?.id
          || null,

        event_id:
          eventId,

        reason,
      },
      202,
    );
  },
);
