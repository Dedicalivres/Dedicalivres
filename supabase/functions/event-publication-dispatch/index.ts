const REPOSITORY =
  "Dedicalivres/Dedicalivres";

const WORKFLOW =
  "publish-events.yml";


function json(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}


function getServiceKey() {

  const legacy =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )
    || "";

  if (legacy) {
    return legacy;
  }


  try {

    const parsed =
      JSON.parse(
        Deno.env.get(
          "SUPABASE_SECRET_KEYS",
        )
        || "{}",
      );

    const defaultKey =
      parsed?.default;

    if (
      typeof defaultKey === "string"
      && defaultKey
    ) {
      return defaultKey;
    }


    const first =
      Object.values(parsed)
        .find(
          (value) =>
            typeof value === "string"
            && value.length > 0
        );

    return (
      typeof first === "string"
        ? first
        : ""
    );

  } catch {

    return "";
  }
}


async function claimJob(
  supabaseUrl: string,
  serviceKey: string,
  jobId: string,
) {

  const response =
    await fetch(
      supabaseUrl
      + "/rest/v1/rpc/claim_event_publication_dispatch",
      {
        method:
          "POST",

        headers: {
          apikey:
            serviceKey,

          Authorization:
            "Bearer "
            + serviceKey,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            p_job_id:
              jobId,
          }),
      },
    );


  if (!response.ok) {

    console.error(
      "claim publication dispatch failed",
      response.status,
    );

    return null;
  }


  const rows =
    await response.json();


  if (
    !Array.isArray(rows)
    || rows.length !== 1
  ) {
    return null;
  }


  return rows[0];
}


async function releaseJob(
  supabaseUrl: string,
  serviceKey: string,
  jobId: string,
) {

  try {

    await fetch(
      supabaseUrl
      + "/rest/v1/rpc/release_event_publication_dispatch",
      {
        method:
          "POST",

        headers: {
          apikey:
            serviceKey,

          Authorization:
            "Bearer "
            + serviceKey,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            p_job_id:
              jobId,
          }),
      },
    );

  } catch (
    error
  ) {

    console.error(
      "release publication dispatch failed",
      error,
    );
  }
}


async function dispatchGithub(
  githubToken: string,
) {

  for (
    let attempt = 1;
    attempt <= 2;
    attempt += 1
  ) {

    const response =
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


    if (response.ok) {
      return true;
    }


    console.error(
      "GitHub dispatch failed",
      response.status,
      "attempt",
      attempt,
    );


    if (attempt < 2) {

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            1000,
          ),
      );
    }
  }


  return false;
}


Deno.serve(
  async (
    req: Request,
  ) => {

    if (
      req.method !== "POST"
    ) {

      return json(
        {
          error:
            "method_not_allowed",
        },
        405,
      );
    }


    let body: {
      job_id?: string;
    } = {};


    try {

      body =
        await req.json();

    } catch {

      return json(
        {
          error:
            "invalid_json",
        },
        400,
      );
    }


    const jobId =
      String(
        body.job_id
        || "",
      );


    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(
          jobId,
        )
    ) {

      return json(
        {
          error:
            "invalid_job_id",
        },
        400,
      );
    }


    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      )
      || "";

    const serviceKey =
      getServiceKey();

    const githubToken =
      Deno.env.get(
        "GITHUB_DISPATCH_TOKEN",
      )
      || "";


    if (
      !supabaseUrl
      || !serviceKey
      || !githubToken
    ) {

      return json(
        {
          error:
            "server_configuration_missing",
        },
        503,
      );
    }


    const job =
      await claimJob(
        supabaseUrl,
        serviceKey,
        jobId,
      );


    if (!job) {

      return json(
        {
          queued:
            true,

          dispatched:
            false,

          reason:
            "job_not_dispatchable",
        },
        200,
      );
    }


    const dispatched =
      await dispatchGithub(
        githubToken,
      );


    if (!dispatched) {

      await releaseJob(
        supabaseUrl,
        serviceKey,
        jobId,
      );


      return json(
        {
          queued:
            true,

          dispatched:
            false,

          error:
            "github_dispatch_failed",
        },
        502,
      );
    }


    return json(
      {
        queued:
          true,

        dispatched:
          true,

        job_id:
          jobId,

        event_id:
          job.event_id,

        reason:
          job.reason,
      },
      202,
    );
  },
);
