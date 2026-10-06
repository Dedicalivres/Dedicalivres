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

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      )
      || "";


    if (
      !authorization.startsWith(
        "Bearer "
      )
      || !apikey
      || !supabaseUrl
    ) {
      return json(
        req,
        {
          error:
            "authentication_required",
        },
        401,
      );
    }


    const userResponse =
      await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
          headers: {
            apikey,

            Authorization:
              authorization,
          },
        },
      );


    if (!userResponse.ok) {
      return json(
        req,
        {
          error:
            "invalid_session",
        },
        401,
      );
    }


    const user =
      await userResponse.json();


    if (!user?.id) {
      return json(
        req,
        {
          error:
            "invalid_session",
        },
        401,
      );
    }


    const adminResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/admin_users`
        + `?user_id=eq.${encodeURIComponent(user.id)}`
        + "&select=user_id"
        + "&limit=1",
        {
          headers: {
            apikey,

            Authorization:
              authorization,

            Accept:
              "application/json",
          },
        },
      );


    if (!adminResponse.ok) {
      return json(
        req,
        {
          error:
            "admin_check_failed",
        },
        500,
      );
    }


    const admins =
      await adminResponse.json();


    if (
      !Array.isArray(admins)
      || admins.length !== 1
    ) {
      return json(
        req,
        {
          error:
            "admin_required",
        },
        403,
      );
    }


    let body: {
      event_id?: string;
      reason?: string;
    } = {};


    try {
      body =
        await req.json();

    } catch {
      body = {};
    }


    const githubToken =
      Deno.env.get(
        "GITHUB_DISPATCH_TOKEN",
      );


    if (!githubToken) {
      return json(
        req,
        {
          error:
            "dispatch_not_configured",

          queued:
            true,
        },
        503,
      );
    }


    const response =
      await fetch(
        `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`,
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/vnd.github+json",

            Authorization:
              `Bearer ${githubToken}`,

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


    if (!response.ok) {
      console.error(
        "GitHub dispatch failed",
        response.status,
        (
          await response.text()
        ).slice(
          0,
          500,
        ),
      );

      return json(
        req,
        {
          error:
            "github_dispatch_failed",

          queued:
            true,
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

        event_id:
          body.event_id
          || null,

        reason:
          body.reason
          || null,
      },
      202,
    );
  },
);
