"use strict";

(function createAdminContext() {
  const state = {
    mode: "real-readonly",
    version: "11.8.4",
    status: "booting",
    authenticated: false,
    session: null,
    client: null,
    events: [],
    metrics: {
      eventsTotal: null,
      eventsPending: null,
      eventsValidated: null,
      eventsRejected: null,
      eventsActive: null,
      qualityMissingImage: null,
      qualityMissingCoords: null,
      qualityMissingWebsite: null,
      qualitySoon: null,
      qualityFeaturedPast: null,
      visitsToday: null,
      visits7d: null,
      visits30d: null,
      visitsTotal: null,
      visitsStatus: "Chargement du trafic"
    },
    trafficDetails: {
      topPages: [],
      topReferrers: []
    },
    community: {
      presences: [],
      authors: [],
      testimonials: []
    },
    communityMetrics: {
      presenceTotal: null,
      presencePending: null,
      presenceValidated: null,
      presenceRejected: null,
      authorsTotal: null,
      testimonialsTotal: null
    },
    error: null,
    refreshedAt: null
  };

  const listeners = new Set();

  function snapshot() {
    return {
      mode: state.mode,
      version: state.version,
      status: state.status,
      authenticated: state.authenticated,
      session: state.session,
      client: state.client,
      events: [...state.events],
      metrics: { ...state.metrics },
      trafficDetails: {
        topPages: [...state.trafficDetails.topPages],
        topReferrers: [...state.trafficDetails.topReferrers]
      },
      community: {
        presences: [...state.community.presences],
        authors: [...state.community.authors],
        testimonials: [...state.community.testimonials]
      },
      communityMetrics: { ...state.communityMetrics },
      error: state.error,
      refreshedAt: state.refreshedAt
    };
  }

  function notify() {
    const value = snapshot();

    listeners.forEach((listener) => {
      try {
        listener(value);
      } catch (error) {
        console.warn("V11 listener indisponible", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent("dedicalivres:v11-state", {
        detail: value
      })
    );
  }

  function setState(values) {
    Object.assign(state, values);
    notify();
  }

  function emitDebug(step, detail = {}) {
    window.dispatchEvent(
      new CustomEvent("dedicalivres:v11-debug", {
        detail: {
          step,
          ...detail
        }
      })
    );
  }

  function getClient() {
    if (state.client) return state.client;

    if (typeof window.getDedicalivresSupabaseClient === "function") {
      state.client = window.getDedicalivresSupabaseClient();
    }

    return state.client;
  }

  function isPastEvent(event) {
    const raw = event.end_date || event.start_date || "";

    if (!raw) return false;

    const date = new Date(
      String(raw).slice(0, 10) + "T00:00:00"
    );

    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return date < today;
  }

  function computeMetrics(events) {
    const pending = events.filter((event) => {
      return event.validated === false && event.rejected === false;
    });

    const validated = events.filter((event) => {
      return event.validated === true && event.rejected !== true;
    });

    const rejected = events.filter((event) => {
      return event.rejected === true;
    });

    const active = validated.filter((event) => {
      return isPastEvent(event) === false;
    });

    state.metrics.eventsActive = active.length;

    const upcoming = events.filter((event) => {
      return (
        event.validated === true &&
        event.rejected !== true &&
        isPastEvent(event) === false
      );
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const fourteenDays = new Date(now);
    fourteenDays.setDate(
      fourteenDays.getDate() + 14
    );

    state.metrics.qualityMissingImage =
      upcoming.filter((event) => {
        return !String(
          event.image_url || ""
        ).trim();
      }).length;

    state.metrics.qualityMissingCoords =
      upcoming.filter((event) => {
        const lat = Number(event.lat);
        const lng = Number(event.lng);

        return !(
          Number.isFinite(lat) &&
          Number.isFinite(lng)
        );
      }).length;

    state.metrics.qualityMissingWebsite =
      upcoming.filter((event) => {
        return !String(
          event.website || ""
        ).trim();
      }).length;

    state.metrics.qualitySoon =
      upcoming.filter((event) => {
        const raw =
          event.start_date ||
          event.end_date ||
          "";

        if (!raw) return false;

        const date = new Date(
          String(raw).slice(0, 10) +
          "T00:00:00"
        );

        if (Number.isNaN(date.getTime())) {
          return false;
        }

        return (
          date >= now &&
          date <= fourteenDays
        );
      }).length;

    state.metrics.qualityFeaturedPast =
      events.filter((event) => {
        return (
          event.featured === true &&
          isPastEvent(event) === true
        );
      }).length;

    return state.metrics;
  }

  function timeoutAfter(ms, label) {
    return new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(
          new Error(label + " après " + String(ms) + " ms")
        );
      }, ms);
    });
  }


  async function loadGlobalEventMetrics() {
    const client = getClient();

    if (!client) {
      throw new Error("Client Supabase indisponible");
    }

    const [
      totalResult,
      validatedResult,
      pendingResult,
      rejectedResult
    ] = await Promise.all([
      client
        .from("events")
        .select("id", { count: "exact", head: true }),

      client
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("validated", true)
        .eq("rejected", false),

      client
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("validated", false)
        .eq("rejected", false),

      client
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("rejected", true)
    ]);

    const results = [
      totalResult,
      validatedResult,
      pendingResult,
      rejectedResult
    ];

    const failed = results.find((item) => item.error);

    if (failed) {
      throw failed.error;
    }

    state.metrics.eventsTotal = totalResult.count || 0;
    state.metrics.eventsValidated = validatedResult.count || 0;
    state.metrics.eventsPending = pendingResult.count || 0;
    state.metrics.eventsRejected = rejectedResult.count || 0;
  }

  async function loadTrafficMetrics() {
    const client = getClient();

    if (!client) {
      throw new Error("Client Supabase indisponible");
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const sevenDays = new Date(today);
    sevenDays.setDate(sevenDays.getDate() - 6);

    const thirtyDays = new Date(today);
    thirtyDays.setDate(thirtyDays.getDate() - 29);

    const [
      totalResult,
      todayResult,
      sevenResult,
      thirtyResult
    ] = await Promise.all([
      client
        .from("site_visits")
        .select("id", { count: "exact", head: true }),

      client
        .from("site_visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),

      client
        .from("site_visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDays.toISOString()),

      client
        .from("site_visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDays.toISOString())
    ]);

    const results = [
      totalResult,
      todayResult,
      sevenResult,
      thirtyResult
    ];

    const failed = results.find((item) => item.error);

    if (failed) {
      state.metrics.visitsStatus = "Tracking indisponible";
      return;
    }

    state.metrics.visitsTotal = totalResult.count || 0;
    state.metrics.visitsToday = todayResult.count || 0;
    state.metrics.visits7d = sevenResult.count || 0;
    state.metrics.visits30d = thirtyResult.count || 0;
    state.metrics.visitsStatus = "Pages vues enregistrées";
  }


  async function loadTrafficDetails() {
    const client = getClient();

    if (!client) {
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const response = await client
      .from("site_visits")
      .select("page,path,referrer,created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    if (response.error || !Array.isArray(response.data)) {
      state.trafficDetails = {
        topPages: [],
        topReferrers: []
      };
      return;
    }

    const pageCounts = new Map();
    const referrerCounts = new Map();

    response.data.forEach((row) => {
      const page =
        String(row.path || row.page || "(inconnu)").trim() ||
        "(inconnu)";

      pageCounts.set(
        page,
        (pageCounts.get(page) || 0) + 1
      );

      let source = "Direct / inconnu";
      const raw = String(row.referrer || "").trim();

      if (raw) {
        const lower = raw.toLowerCase();

        if (lower.includes("dedicalivres.fr")) {
          source = "Interne Dédicalivres";
        } else if (lower.includes("facebook.com") || lower.includes("fb.com")) {
          source = "Facebook";
        } else if (lower.includes("instagram.com")) {
          source = "Instagram";
        } else if (lower.includes("google.")) {
          source = "Google";
        } else if (lower.includes("bing.com")) {
          source = "Bing";
        } else if (lower.includes("yahoo.")) {
          source = "Yahoo";
        } else if (lower.includes("duckduckgo.com")) {
          source = "DuckDuckGo";
        } else if (lower.includes("ecosia.org")) {
          source = "Ecosia";
        } else {
          try {
            source = new URL(raw).hostname || "Autre";
          } catch (_) {
            source = "Autre";
          }
        }
      }

      referrerCounts.set(
        source,
        (referrerCounts.get(source) || 0) + 1
      );
    });

    state.trafficDetails.topPages =
      [...pageCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value }));

    state.trafficDetails.topReferrers =
      [...referrerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value }));
  }


  async function loadCommunity() {
    const client = getClient();

    if (!client) {
      throw new Error("Client Supabase indisponible");
    }

    const [
      presencesResult,
      authorsResult,
      testimonialsResult
    ] = await Promise.all([
      client
        .from("event_authors_presence")
        .select(
          [
            "id",
            "event_id",
            "pseudo",
            "admin_note",
            "contact_email",
            "contact_name",
            "author_identity_key",
            "author_slug",
            "book_or_publisher_url_type",
            "book_or_publisher_url",
            "author_profile_url_type",
            "author_profile_url",
            "website",
            "validated",
            "rejected",
            "created_at",
            "author_id",
            "source",
            "publication_mode",
            "publisher_name",
            "author_portrait_url",
            "participant_type",
            "organization_name",
            "presence_verified"
          ].join(", ")
        )
        .order("created_at", { ascending: false })
        .limit(250),

      client
        .from("authors")
        .select(
          [
            "id",
            "pseudo",
            "slug",
            "published_by",
            "published_at",
            "publication_ready_by",
            "publication_ready_at",
            "merged_at",
            "shop_url",
            "bio",
            "website",
            "validated",
            "profile_type",
            "publication_ready",
            "published",
            "avatar_url",
            "location",
            "merged_into",
            "created_at"
          ].join(", ")
        )
        .order("created_at", { ascending: false })
        .limit(100),

      client
        .from("testimonials")
        .select(
          [
            "id",
            "pseudo",
            "message",
            "event_title",
            "image_url",
            "validated",
            "rejected",
            "moderated_at",
            "moderated_by",
            "created_at"
          ].join(", ")
        )
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

    if (presencesResult.error) {
      throw presencesResult.error;
    }

    if (authorsResult.error) {
      throw authorsResult.error;
    }

    if (testimonialsResult.error) {
      throw testimonialsResult.error;
    }

    state.community.presences =
      Array.isArray(presencesResult.data)
        ? presencesResult.data
        : [];

    state.community.authors =
      Array.isArray(authorsResult.data)
        ? authorsResult.data
        : [];

    state.community.testimonials =
      Array.isArray(testimonialsResult.data)
        ? testimonialsResult.data
        : [];

    const presences = state.community.presences;

    state.communityMetrics = {
      presenceTotal: presences.length,

      presencePending: presences.filter((item) => {
        return item.validated === false && item.rejected !== true;
      }).length,

      presenceValidated: presences.filter((item) => {
        return item.validated === true && item.rejected !== true;
      }).length,

      presenceRejected: presences.filter((item) => {
        return item.rejected === true;
      }).length,

      authorsTotal: state.community.authors.filter((item) => {
        return !item.merged_into;
      }).length,

      testimonialsTotal: state.community.testimonials.length
    };
  }

  async function loadEvents() {
    const client = getClient();

    if (!client) {
      throw new Error("Client Supabase indisponible");
    }

    const columns = [
      "id",
      "created_at",
      "title",
      "type",
      "city",
      "region",
      "start_date",
      "end_date",
      "validated",
      "rejected",
      "featured",
      "verified",
      "country_code",
      "image_url",
      "registration_force_status",
      "registration_note",
      "registration_audience",
      "registration_url",
      "registration_deadline",
      "registration_open_date",
      "registration_enabled",
      "description",
      "website",
      "lat",
      "lng"
    ].join(", ");

    const startedAt = Date.now();

    emitDebug("events-query-start", {
      elapsed: 0
    });

    const query = client
      .from("events")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(1000);

    const response = await Promise.race([
      Promise.resolve(query),
      timeoutAfter(10000, "Timeout Supabase events")
    ]);

    const elapsed = Date.now() - startedAt;

    emitDebug("events-query-end", {
      elapsed,
      count:
        response && Array.isArray(response.data)
          ? response.data.length
          : 0,
      errorCode:
        response && response.error
          ? String(response.error.code || "")
          : ""
    });

    if (response && response.error) {
      throw response.error;
    }

    state.events =
      response && Array.isArray(response.data)
        ? response.data
        : [];

    state.metrics = computeMetrics(state.events);
  }

  async function refresh() {
    if (state.authenticated === false) {
      return snapshot();
    }

    setState({
      status: "loading",
      error: null
    });

    let watchdogTriggered = false;

    const watchdog = window.setTimeout(() => {
      if (state.status === "loading") {
        watchdogTriggered = true;

        setState({
          status: "error",
          error: new Error(
            "Le chargement global V11 a dépassé 15 secondes"
          )
        });
      }
    }, 15000);

    try {
      await Promise.all([
        loadEvents(),
        loadGlobalEventMetrics(),
        loadTrafficMetrics(),
        loadTrafficDetails(),
        loadCommunity()
      ]);

      if (!watchdogTriggered) {
        setState({
          status: "ready",
          error: null,
          refreshedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      setState({
        status: "error",
        error
      });
    } finally {
      window.clearTimeout(watchdog);
    }

    return snapshot();
  }

  async function restoreSession() {
    const client = getClient();

    if (!client) {
      setState({
        status: "error",
        authenticated: false,
        error: new Error(
          "Configuration Supabase indisponible"
        )
      });

      return snapshot();
    }

    try {
      const result = await client.auth.getSession();
      const session =
        result && result.data
          ? result.data.session
          : null;

      if (!session) {
        setState({
          status: "unauthenticated",
          authenticated: false,
          session: null,
          error: null
        });

        return snapshot();
      }

      setState({
        status: "loading",
        authenticated: true,
        session,
        error: null
      });

      return await refresh();
    } catch (error) {
      setState({
        status: "error",
        authenticated: false,
        session: null,
        error
      });

      return snapshot();
    }
  }

  async function signIn(email, password) {
    const client = getClient();

    if (!client) {
      throw new Error("Client Supabase indisponible");
    }

    const result =
      await client.auth.signInWithPassword({
        email,
        password
      });

    if (result.error) {
      throw result.error;
    }

    setState({
      authenticated: true,
      session: result.data.session || null,
      status: "loading",
      error: null
    });

    return await refresh();
  }

  async function signOut() {
    const client = getClient();

    if (client) {
      await client.auth.signOut();
    }

    state.events = [];
    state.metrics = {
      eventsTotal: null,
      eventsPending: null,
      eventsValidated: null,
      eventsRejected: null,
      eventsActive: null,
      visitsToday: null,
      visits7d: null,
      visits30d: null,
      visitsTotal: null,
      visitsStatus: "Chargement du trafic"
    };

    setState({
      authenticated: false,
      session: null,
      status: "unauthenticated",
      error: null,
      refreshedAt: null
    });

    return snapshot();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(snapshot());

    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  window.DEDICALIVRES_ADMIN_CONTEXT = {
    getState: snapshot,
    getClient,
    refresh,
    restoreSession,
    signIn,
    signOut,
    subscribe
  };
})();
