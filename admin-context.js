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
    eventCatalog: { status: "idle", loaded: 0, total: null, revision: 0, error: null },
    eventPage: { rows: [], total: 0, page: 0, size: 50, key: "", loading: false, error: null },
    modules: { traffic: { status: "idle" }, community: { status: "idle" } },
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
      visitsStatus: "Trafic chargé à l’ouverture de l’onglet"
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
    refreshedAt: null,
    refreshing: false
  };

  const listeners = new Set();
  let authSubscription = null;
  let authEpoch = 0;
  let expiryTimer = null;
  let catalogGeneration = 0;
  let pageSequence = 0;
  let catalogTask = null;
  let refreshTask = null;
  const moduleTasks = new Map();
  const moduleSequences = { traffic: 0, community: 0 };
  const EVENT_COLUMNS = "id,created_at,title,type,city,region,start_date,end_date,validated,rejected,featured,verified,country_code,image_url,registration_force_status,registration_note,registration_audience,registration_url,registration_deadline,registration_open_date,registration_enabled,description,website,lat,lng,source_label,imported_source";
  const EMPTY_PAGE = () => ({ rows: [], total: 0, page: 0, size: 50, key: "", loading: false, error: null });

  function expiresAtMs(session) {
    const seconds = session?.expires_at;
    return Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000
      : null;
  }

  function cancelExpiryTimer() {
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    expiryTimer = null;
  }

  function lockIfExpired() {
    if (state.authenticated !== true) return false;
    const deadline = expiresAtMs(state.session);
    if (deadline !== null && Date.now() < deadline) return false;
    authEpoch += 1;
    cancelExpiryTimer();
    clearPrivateState({ status: "expired", error: null });
    return true;
  }

  function scheduleExpiry(session) {
    cancelExpiryTimer();
    const deadline = expiresAtMs(session);
    if (deadline === null) return;
    const epoch = authEpoch;
    const token = session.access_token;
    const check = () => {
      if (epoch !== authEpoch || state.session?.access_token !== token) return;
      if (!lockIfExpired()) {
        expiryTimer = window.setTimeout(check,
          Math.min(Math.max(1, deadline - Date.now()), 2147483647));
      }
    };
    expiryTimer = window.setTimeout(check,
      Math.min(Math.max(1, deadline - Date.now()), 2147483647));
  }

  function canCommit(epoch) {
    const token = typeof epoch === "object" ? epoch : { epoch };
    return !lockIfExpired() && token.epoch === authEpoch && state.authenticated === true &&
      (!token.module || moduleSequences[token.module] === token.sequence);
  }

  function clearPrivateState(values = {}) {
    cancelExpiryTimer();
    catalogGeneration += 1;
    pageSequence += 1;
    eventRefreshTokens.clear();
    catalogTask = null;
    refreshTask = null;
    moduleTasks.clear();
    moduleSequences.traffic += 1;
    moduleSequences.community += 1;
    state.eventCatalog = { status: "idle", loaded: 0, total: null, revision: catalogGeneration, error: null };
    state.eventPage = EMPTY_PAGE();
    state.modules = { traffic: { status: "idle" }, community: { status: "idle" } };
    state.events = [];
    state.metrics = {
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
      visitsStatus: "Trafic chargé à l’ouverture de l’onglet"
    };
    state.trafficDetails = { topPages: [], topReferrers: [] };
    state.community = { presences: [], authors: [], testimonials: [] };
    state.communityMetrics = {
      presenceTotal: null,
      presencePending: null,
      presenceValidated: null,
      presenceRejected: null,
      authorsTotal: null,
      testimonialsTotal: null
    };
    setState({
      authenticated: false,
      session: null,
      refreshedAt: null,
      refreshing: false,
      ...values
    });
  }

  function snapshot() {
    return {
      mode: state.mode,
      version: state.version,
      status: state.status,
      authenticated: state.authenticated,
      session: state.session,
      client: state.client,
      events: [...state.events],
      eventCatalog: { ...state.eventCatalog },
      eventPage: { ...state.eventPage, rows: [...state.eventPage.rows] },
      modules: { traffic: { ...state.modules.traffic }, community: { ...state.modules.community } },
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
      refreshedAt: state.refreshedAt,
      refreshing: state.refreshing
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
    if (state.client) {
      ensureAuthListener(state.client);
      return state.client;
    }

    if (typeof window.getDedicalivresSupabaseClient === "function") {
      state.client = window.getDedicalivresSupabaseClient();
    }

    ensureAuthListener(state.client);

    return state.client;
  }

  // Keep only an already server-authorized, unexpired view during same-user renewal.
  // The replacement session is never adopted until getUser + admin_users succeed.
  function canKeepAuthorizedView(session) {
    const previous = expiresAtMs(state.session);
    const next = expiresAtMs(session);
    return state.authenticated === true && state.status === "ready" &&
      Boolean(state.session?.user?.id) && state.session.user.id === session?.user?.id &&
      previous !== null && next !== null && Date.now() < previous && next >= previous;
  }

  function ensureAuthListener(client) {
    if (!client || authSubscription || !client.auth?.onAuthStateChange) {
      return;
    }

    const result = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" ||
          (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event) && !session)) {
        authEpoch += 1;
        clearPrivateState({ status: "unauthenticated", error: null });
        return;
      }

      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        // Supabase auth callbacks must not await another auth request.
        authEpoch += 1;
        const eventEpoch = authEpoch;
        const keepView = event === "TOKEN_REFRESHED" && canKeepAuthorizedView(session);
        if (keepView) scheduleExpiry(state.session);
        else clearPrivateState({ status: "loading", error: null });
        window.setTimeout(() => {
          if (eventEpoch === authEpoch) {
            authorizeSession(session, keepView).catch(console.error);
          }
        }, 0);
      }
    });

    authSubscription = result?.data?.subscription || true;
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


  async function loadGlobalEventMetrics(epoch) {
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

    if (!canCommit(epoch)) return;

    state.metrics.eventsTotal = totalResult.count || 0;
    state.metrics.eventsValidated = validatedResult.count || 0;
    state.metrics.eventsPending = pendingResult.count || 0;
    state.metrics.eventsRejected = rejectedResult.count || 0;
  }

  async function loadTrafficMetrics(epoch) {
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

    if (!canCommit(epoch)) return;

    if (failed) {
      state.metrics.visitsStatus = "Tracking indisponible";
      throw Object.assign(new Error(failed.error.message || "Trafic indisponible"), failed.error, { status: failed.status || failed.error.status });
    }

    state.metrics.visitsTotal = totalResult.count || 0;
    state.metrics.visitsToday = todayResult.count || 0;
    state.metrics.visits7d = sevenResult.count || 0;
    state.metrics.visits30d = thirtyResult.count || 0;
    state.metrics.visitsStatus = "Pages vues enregistrées";
  }


  async function loadTrafficDetails(epoch) {
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

    if (!canCommit(epoch)) return;

    if (response.error) throw Object.assign(new Error(response.error.message || "Trafic indisponible"), response.error, { status: response.status || response.error.status });
    if (!Array.isArray(response.data)) {
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


  async function loadCommunity(epoch) {
    const client = getClient();

    if (!client) {
      throw new Error("Client Supabase indisponible");
    }

    const communityArchiveEnabled =
      window.DEDICALIVRES_CONFIG
        ?.adminV11CommunityArchiveEnabled === true;

    const presenceColumns = [
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
      "presence_verified",
      "events(id,title,city,country_code,start_date,end_date,type)"
    ];

    const testimonialColumns = [
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
    ];

    if (communityArchiveEnabled) {
      presenceColumns.push("archived_at", "archived_by", "archive_reason");
      testimonialColumns.push("archived_at", "archived_by", "archive_reason");
    }

    // Paging prevents silent truncation at 250 presences, 500 authors, 100 testimonials.
    // Fixed sort on timestamp + UUID prevents unstable ordering on equal timestamps.
    async function readAllCommunity(table, columns, pageSize) {
      const rows = [];
      const seen = new Set();
      let expectedTotal = null;
      for (let offset = 0; ; offset += pageSize) {
        if (!canCommit(epoch)) return { data: [], error: null };
        const response = await checked(
          client.from(table)
            .select(columns, offset === 0 ? { count: "exact" } : {})
            .order("created_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .range(offset, offset + pageSize - 1)
        );
        if (!canCommit(epoch)) return { data: [], error: null };
        if (offset === 0) {
          expectedTotal = response.count;
          if (!Number.isInteger(expectedTotal) || expectedTotal < 0) {
            throw new Error("Total Communauté indisponible : " + table);
          }
        }
        const chunk = response.data || [];
        if (!Array.isArray(chunk)) throw new Error("Réponse Communauté invalide : " + table);
        for (const row of chunk) {
          if (!row || row.id == null || seen.has(row.id)) {
            throw new Error("Pagination Communauté incohérente : " + table);
          }
          seen.add(row.id);
          rows.push(row);
        }
        if (chunk.length < pageSize) {
          // Offset pages can shift under concurrent additions/removals.
          // Reject an inconsistent result instead of publishing a partial list.
          const after = await checked(client.from(table).select("id", { count: "exact", head: true }));
          if (!canCommit(epoch)) return { data: [], error: null };
          if (!Number.isInteger(after.count) ||
              rows.length !== expectedTotal || after.count !== expectedTotal) {
            throw new Error("Communauté modifiée pendant la pagination : " + table + "; actualisez.");
          }
          return { data: rows, error: null };
        }
        if (rows.length > expectedTotal) {
          throw new Error("Pagination Communauté incohérente : " + table);
        }
      }
    }

    const [presencesResult, authorsResult, testimonialsResult] = await Promise.all([
      readAllCommunity("event_authors_presence", presenceColumns.join(", "), 250),
      readAllCommunity("authors", [
        "id", "pseudo", "slug", "published_by", "published_at",
        "publication_ready_by", "publication_ready_at", "merged_at",
        "shop_url", "bio", "website", "validated", "profile_type",
        "publication_ready", "published", "editorial_status", "editorial_review",
        "editorial_status_at", "editorial_status_by", "avatar_url",
        "location", "merged_into", "created_at"
      ].join(", "), 250),
      readAllCommunity("testimonials", testimonialColumns.join(", "), 100)
    ]);

    if (presencesResult.error) {
      throw Object.assign(new Error(presencesResult.error.message || "Communauté indisponible"), presencesResult.error, { status: presencesResult.status || presencesResult.error.status });
    }

    if (authorsResult.error) {
      throw Object.assign(new Error(authorsResult.error.message || "Communauté indisponible"), authorsResult.error, { status: authorsResult.status || authorsResult.error.status });
    }

    if (testimonialsResult.error) {
      throw Object.assign(new Error(testimonialsResult.error.message || "Communauté indisponible"), testimonialsResult.error, { status: testimonialsResult.status || testimonialsResult.error.status });
    }

    if (!canCommit(epoch)) return;

    state.community.presences =
      Array.isArray(presencesResult.data)
        ? presencesResult.data.filter((item) => !item.archived_at)
        : [];

    state.community.authors =
      Array.isArray(authorsResult.data)
        ? authorsResult.data
        : [];

    state.community.testimonials =
      Array.isArray(testimonialsResult.data)
        ? testimonialsResult.data.filter((item) => !item.archived_at)
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

  // Only database-owned cursor values enter PostgREST grammar. User search never does.
  function cursorLiteral(value) {
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function eventQuery(cursor, size, exact = false) {
    let query = getClient().from("events")
      .select(EVENT_COLUMNS, exact ? { count: "exact" } : {})
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/i.test(cursor.id)) throw new Error("Curseur UUID invalide");
      if (cursor.created_at == null) {
        query = query.is("created_at", null).lt("id", cursor.id);
      } else {
        const date = cursorLiteral(cursor.created_at);
        query = query.or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${cursor.id}),created_at.is.null`);
      }
    }
    return query.limit(size);
  }

  async function checked(query) {
    let timer;
    try {
      const response = await Promise.race([Promise.resolve(query), new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("Lecture trop longue ; réessayez ou actualisez.")), 10000);
      })]);
      if (response.error) throw Object.assign(new Error(response.error.message || "Lecture impossible"), response.error, { status: response.status || response.error.status });
      return response;
    } finally { window.clearTimeout(timer); }
  }

  function handleReadFailure(error, epoch) {
    if (!canCommit(epoch)) return;
    if ([401, 403].includes(Number(error?.status))) {
      authEpoch += 1;
      clearPrivateState({ status: Number(error.status) === 403 ? "forbidden" : "unauthenticated", error: null });
    }
  }

  async function loadEvents(epoch) {
    const generation = ++catalogGeneration;
    pageSequence += 1;
    state.eventPage = EMPTY_PAGE();
    const response = await checked(eventQuery(null, 50, true));
    if (!canCommit(epoch) || generation !== catalogGeneration) return;
    state.events = response.data || [];
    state.eventCatalog = { status: "loading", loaded: state.events.length, total: response.count, revision: generation, error: null };
    // Global quality metrics must not be computed from the first page.
    for (const key of ["eventsActive", "qualityMissingImage", "qualityMissingCoords", "qualityMissingWebsite", "qualitySoon", "qualityFeaturedPast"]) state.metrics[key] = null;
  }

  function ensureEventCatalog() {
    if (!canCommit(authEpoch)) return Promise.resolve(snapshot());
    if (state.eventCatalog.status === "ready") return Promise.resolve(snapshot());
    if (catalogTask) return catalogTask;
    const epoch = authEpoch;
    const generation = catalogGeneration;
    const task = (async () => {
      state.eventCatalog = { ...state.eventCatalog, status: "loading", error: null };
      notify();
      try {
        const rows = [...state.events];
        const ids = new Set(rows.map(row => row.id));
        let cursor = rows.at(-1) || null;
        // Read until an empty page, even if an API cap returns fewer than requested.
        while (rows.length) {
          const response = await checked(eventQuery(cursor, 150));
          if (!canCommit(epoch) || generation !== catalogGeneration) return snapshot();
          const chunk = response.data || [];
          if (!chunk.length) break;
          for (const row of chunk) {
            if (ids.has(row.id)) throw new Error("Pagination incohérente : UUID répété ; actualisez le catalogue.");
            ids.add(row.id);
            rows.push(row);
          }
          cursor = chunk.at(-1);
          state.eventCatalog.loaded = rows.length;
          notify();
        }
        if (!canCommit(epoch) || generation !== catalogGeneration) return snapshot();
        const expectedTotal = state.eventCatalog.total;
        if (!Number.isInteger(expectedTotal) || ids.size !== rows.length || rows.length !== expectedTotal) {
          throw new Error("Catalogue incomplet ou modifié pendant la lecture : " +
            rows.length + " / " + String(expectedTotal ?? "?") + "; actualisez.");
        }
        state.events = rows;
        state.eventCatalog = { status: "ready", loaded: rows.length, total: expectedTotal, revision: generation, error: null };
        computeMetrics(rows);
      } catch (error) {
        handleReadFailure(error, epoch);
        if (canCommit(epoch) && generation === catalogGeneration) {
          state.eventCatalog = { ...state.eventCatalog, status: "error", error };
        }
      }
      if (canCommit(epoch) && generation === catalogGeneration) notify();
      return snapshot();
    })();
    catalogTask = task;
    task.finally(() => { if (catalogTask === task) catalogTask = null; });
    return task;
  }

  async function selectEventPage({ ids, page = 0, size = 50, key, initial = false }) {
    const epoch = authEpoch;
    if (!canCommit(epoch) || (initial
      ? state.eventCatalog.status !== "loading"
      : state.eventCatalog.status !== "ready")) return snapshot();
    const generation = catalogGeneration;
    const sequence = ++pageSequence;
    size = [25, 50, 100, 150].includes(Number(size)) ? Number(size) : 50;
    const allowed = new Set(state.events.map(row => row.id));
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !allowed.has(id))) throw new Error("Sélection hors catalogue autorisé");
    if (initial && (page !== 0 || size !== 50 || ids.length !== state.events.length ||
      ids.some((id, index) => id !== state.events[index].id))) {
      throw new Error("Aperçu initial hors première page autorisée");
    }
    page = Math.max(0, Math.min(Math.trunc(page) || 0, Math.max(0, Math.ceil(ids.length / size) - 1)));
    const selected = ids.slice(page * size, (page + 1) * size);
    const current = () => canCommit(epoch) && generation === catalogGeneration && sequence === pageSequence &&
      state.eventCatalog.status === (initial ? "loading" : "ready");
    state.eventPage = { rows: [], total: initial ? null : ids.length, page, size, key, loading: true, error: null };
    notify();
    try {
      let rows = [];
      if (selected.length) {
        if (initial) {
          const mapped = new Map(state.events.map(row => [row.id, row]));
          rows = selected.map(id => mapped.get(id));
        } else {
          const result = await checked(getClient().from("events").select(EVENT_COLUMNS)
            .in("id", selected).order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(size));
          if (!current()) return snapshot();
          const mapped = new Map((result.data || []).map(row => [row.id, row]));
          if (mapped.size !== selected.length) throw new Error("Catalogue modifié ou accès changé ; actualisez avant de poursuivre.");
          rows = selected.map(id => mapped.get(id));
        }
        const contacts = await checked(getClient().from("event_submission_contacts")
          .select("event_id,submitter_name,submitter_email").in("event_id", selected));
        if (!current()) return snapshot();
        const byId = new Map((contacts.data || []).map(row => [row.event_id, row]));
        rows = rows.map(row => ({ ...row, ...(byId.get(row.id) || {}) }));
      }
      if (!current()) return snapshot();
      const updated = new Map(rows.map(row => [row.id, row]));
      state.events = state.events.map(row => updated.get(row.id) || row);
      state.eventPage = { rows, total: initial ? null : ids.length, page, size, key, loading: false, error: null };
      notify();
    } catch (error) {
      handleReadFailure(error, epoch);
      if (current()) {
        state.eventPage = { ...state.eventPage, rows: [], loading: false, error };
        notify();
      }
    }
    return snapshot();
  }

  function ensureModule(name, force = false) {
    if (!["traffic", "community"].includes(name)) return Promise.reject(new Error("Module inconnu"));
    const epoch = authEpoch;
    if (!canCommit(epoch)) return Promise.resolve(snapshot());
    if (moduleTasks.has(name)) return moduleTasks.get(name);
    if (!force && state.modules[name].status === "ready") return Promise.resolve(snapshot());
    const previous = state.modules[name];
    const hadReady = previous.status === "ready";
    const token = { epoch, module: name, sequence: ++moduleSequences[name] };
    const task = Promise.resolve().then(async () => {
      if (!canCommit(token)) return snapshot();
      // Cached private data remains available to the SAME authorized session.
      state.modules[name] = hadReady
        ? { ...previous, status: "ready", refreshing: true, stale: false, error: null }
        : { status: "loading", refreshing: true, error: null };
      notify();
      let timer;
      try {
        const work = name === "traffic"
          ? Promise.all([loadTrafficMetrics(token), loadTrafficDetails(token)]) : loadCommunity(token);
        await Promise.race([work, new Promise((_, reject) => {
          timer = window.setTimeout(() => reject(new Error("Module trop long ; réessayez.")), 10000);
        })]);
        if (canCommit(token)) {
          state.modules[name] = {
            status: "ready", refreshedAt: new Date().toISOString(),
            revision: (previous.revision || 0) + 1,
            refreshing: false, stale: false, error: null
          };
          notify();
        }
      } catch (error) {
        handleReadFailure(error, token);
        if (canCommit(token)) {
          moduleSequences[name] += 1; // Late replies must never overwrite this result.
          state.modules[name] = hadReady
            ? { ...previous, status: "ready", refreshing: false, stale: true, error }
            : { status: "error", refreshing: false, error };
          notify();
        }
      } finally { window.clearTimeout(timer); }
      return snapshot();
    });
    moduleTasks.set(name, task);
    task.finally(() => { if (moduleTasks.get(name) === task) moduleTasks.delete(name); });
    return task;
  }


  // Refresh a successfully updated event without restarting the authorized shell.
  // The full catalog is required to maintain existing JS filters and counters.
  const eventRefreshTokens = new Map();

  async function refreshEvent(id) {
    if (lockIfExpired() || state.authenticated !== true) return snapshot();
    if (!id) throw new Error("Identifiant d’événement manquant.");

    const epoch = authEpoch;
    const key = String(id);
    const token = (eventRefreshTokens.get(key) || 0) + 1;
    eventRefreshTokens.set(key, token);
    const stillCurrent = () => canCommit(epoch) && eventRefreshTokens.get(key) === token;

    try {
      if (refreshTask) await refreshTask;
      if (!stillCurrent()) return snapshot();
      // Do not restart the entire admin when catalog loading is already underway.
      // Wait for its current scan, then read the changed row LAST.
      if (state.eventCatalog.status !== "ready") {
        await ensureEventCatalog();
      }
      if (!stillCurrent()) return snapshot();
      if (state.eventCatalog.status !== "ready") {
        throw new Error("Catalogue incomplet. Modification enregistrée ; utilisez Actualiser pour synchroniser.");
      }

      const previous = state.events.find(row => String(row.id) === key);
      if (!previous) {
        throw new Error("Fiche absente du catalogue courant. Modification enregistrée ; utilisez Actualiser.");
      }

      const result = await checked(getClient().from("events")
        .select(EVENT_COLUMNS).eq("id", key).single());
      if (!stillCurrent()) return snapshot();
      if (!result.data || String(result.data.id) !== key) {
        throw new Error("La fiche mise à jour est introuvable. Actualisez le catalogue.");
      }

      // Preserve private submitter fields previously loaded for this page.
      const updated = { ...previous, ...result.data };
      state.events = state.events.map(row => String(row.id) === key ? updated : row);
      state.eventPage = {
        ...state.eventPage,
        rows: state.eventPage.rows.map(row => String(row.id) === key ? updated : row)
      };

      // Catalog is complete: compute coherent snapshot-level metrics locally.
      // No global event metrics, traffic or community requests are needed here.
      const events = state.events;
      state.metrics.eventsTotal = events.length;
      state.metrics.eventsPending = events.filter(row => row.validated === false && row.rejected === false).length;
      state.metrics.eventsValidated = events.filter(row => row.validated === true && row.rejected !== true).length;
      state.metrics.eventsRejected = events.filter(row => row.rejected === true).length;
      computeMetrics(events);

      // Invalidate any in-flight page read and the shell's cached rendered key.
      // The shell re-evaluates the existing filters and fetches only the visible page.
      pageSequence += 1;
      state.eventCatalog = {
        ...state.eventCatalog,
        revision: state.eventCatalog.revision + 1
      };
      notify();
      return snapshot();
    } catch (error) {
      handleReadFailure(error, epoch);
      throw error;
    } finally {
      if (eventRefreshTokens.get(key) === token) eventRefreshTokens.delete(key);
    }
  }

  function refresh(options = {}) {
    if (refreshTask) return refreshTask;
    const task = Promise.resolve().then(() => refreshData(options));
    refreshTask = task;
    task.finally(() => { if (refreshTask === task) refreshTask = null; });
    return task;
  }

  // Read a complete coherent catalog off-state. Old cards remain visible until commit.
  // Exact count protects against silent truncation, but not against all concurrent edits.
  async function readEventCatalogSnapshot(epoch) {
    const first = await checked(eventQuery(null, 50, true));
    if (!canCommit(epoch)) return null;
    const rows = [...(first.data || [])];
    const ids = new Set(rows.map(row => row.id));
    if (ids.size !== rows.length) throw new Error("Actualisation incohérente : événement répété.");
    let cursor = rows.at(-1) || null;
    while (cursor) {
      const response = await checked(eventQuery(cursor, 150));
      if (!canCommit(epoch)) return null;
      const chunk = response.data || [];
      if (!chunk.length) break;
      for (const row of chunk) {
        if (ids.has(row.id)) throw new Error("Actualisation incohérente : UUID répété.");
        ids.add(row.id);
        rows.push(row);
      }
      cursor = chunk.at(-1);
    }
    if (Number.isInteger(first.count) && first.count !== rows.length) {
      throw new Error("Le catalogue a changé pendant la lecture ; réessayez l'actualisation.");
    }
    return rows;
  }

  async function refreshData(options = {}) {
    if (lockIfExpired() || state.authenticated !== true) return snapshot();

    // Keep a verified same-user view even while the background catalog is still loading.
    // Only the complete-catalog path may perform an atomic full-snapshot swap.
    const keepView = options?.keepAuthorizedView !== false && state.status === "ready";
    const fullCatalogReady = state.eventCatalog.status === "ready";
    const epoch = ++authEpoch;
    scheduleExpiry(state.session);
    const requestedModules = ["traffic", "community"].filter(name => state.modules[name].status !== "idle");
    moduleTasks.clear();
    // Invalidate old secondary requests even if an earlier task is still in flight.
    for (const name of ["traffic", "community"]) {
      moduleSequences[name] += 1;
      const old = state.modules[name];
      if (old.status !== "ready") {
        state.modules[name] = { status: "idle" };
      } else {
        state.modules[name] = { ...old, refreshing: false };
      }
    }
    setState({ status: keepView ? "ready" : "loading", refreshing: true, error: null });
    let watchdogTriggered = false;
    const watchdog = window.setTimeout(() => {
      if (epoch === authEpoch && state.refreshing) {
        watchdogTriggered = true;
        // A timeout must never erase a previously authorized screen.
        setState({
          status: keepView ? "ready" : "error", refreshing: false,
          error: new Error("Le chargement global V11 a dépassé 15 secondes")
        });
      }
    }, 15000);
    try {
      if (keepView && fullCatalogReady) {
        const rows = await readEventCatalogSnapshot(epoch);
        if (!canCommit(epoch) || watchdogTriggered || !rows) return snapshot();
        catalogGeneration += 1;
        pageSequence += 1;
        catalogTask = null;
        state.events = rows;
        state.eventPage = EMPTY_PAGE();
        state.eventCatalog = {
          status: "ready", loaded: rows.length, total: rows.length,
          revision: catalogGeneration, error: null
        };
        state.metrics.eventsTotal = rows.length;
        state.metrics.eventsPending = rows.filter(row => row.validated === false && row.rejected === false).length;
        state.metrics.eventsValidated = rows.filter(row => row.validated === true && row.rejected !== true).length;
        state.metrics.eventsRejected = rows.filter(row => row.rejected === true).length;
        computeMetrics(rows);
      } else {
        // The old catalog scan belongs to an earlier auth epoch; start a new one.
        catalogTask = null;
        await Promise.all([loadEvents(epoch), loadGlobalEventMetrics(epoch)]);
      }
      if (!watchdogTriggered && canCommit(epoch)) {
        setState({ status: "ready", refreshing: false, error: null, refreshedAt: new Date().toISOString() });
        if (!(keepView && fullCatalogReady)) void ensureEventCatalog();
        for (const name of requestedModules) void ensureModule(name, true);
      }
    } catch (error) {
      handleReadFailure(error, epoch);
      if (canCommit(epoch)) {
        setState({ status: keepView ? "ready" : "error", refreshing: false, error });
      }
    } finally {
      window.clearTimeout(watchdog);
    }
    return snapshot();
  }

  async function authorizeSession(session, retainView = false) {
    const keepView = retainView && canKeepAuthorizedView(session);
    const epoch = ++authEpoch;
    if (keepView) scheduleExpiry(state.session);
    else clearPrivateState({ status: "loading", error: null });

    if (expiresAtMs(session) === null || Date.now() >= expiresAtMs(session)) {
      clearPrivateState({ status: "expired", error: null });
      return snapshot();
    }

    try {
      const client = getClient();
      const identity = await client.auth.getUser();
      if (epoch !== authEpoch) return snapshot();
      if (Date.now() >= expiresAtMs(session)) {
        clearPrivateState({ status: "expired", error: null });
        return snapshot();
      }

      if (identity.error || !identity.data?.user) {
        const error = identity.error;
        if (error && ![401, 403].includes(error.status)) throw error;
        clearPrivateState({ status: "unauthenticated", error: null });
        return snapshot();
      }

      const userId = identity.data.user.id;
      if (!session?.user || session.user.id !== userId) {
        clearPrivateState({ status: "unauthenticated", error: null });
        return snapshot();
      }

      // Existing admin_users SELECT policy returns only the caller's row.
      const result = await client.from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1);
      if (epoch !== authEpoch) return snapshot();
      if (Date.now() >= expiresAtMs(session)) {
        clearPrivateState({ status: "expired", error: null });
        return snapshot();
      }
      if (result.error) throw result.error;

      if (!result.data?.some((row) => row.user_id === userId)) {
        clearPrivateState({ status: "forbidden", session, error: null });
        return snapshot();
      }

      setState({ authenticated: true, session, status: keepView ? "ready" : "loading", error: null });
      scheduleExpiry(session);
      return await refresh({ keepAuthorizedView: keepView });
    } catch (error) {
      if (epoch === authEpoch) {
        clearPrivateState({ status: "error", session, error });
      }
      return snapshot();
    }
  }

  async function restoreSession() {
    const client = getClient();
    const epoch = authEpoch;

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
      if (epoch !== authEpoch) return snapshot();
      const session =
        result && result.data
          ? result.data.session
          : null;

      if (!session) {
        clearPrivateState({ status: "unauthenticated", error: null });

        return snapshot();
      }

      return await authorizeSession(session);
    } catch (error) {
      if (epoch === authEpoch) {
        clearPrivateState({ status: "error", error });
      }

      return snapshot();
    }
  }

  async function signIn(email, password) {
    const client = getClient();
    const epoch = authEpoch;

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

    if (epoch !== authEpoch) return snapshot();

    return await authorizeSession(result.data.session || null);
  }

  async function signOut() {
    const client = getClient();
    const session = state.session;
    authEpoch += 1;
    const epoch = authEpoch;
    clearPrivateState({ status: "loading", session, error: null });
    if (client) {
      const result = await client.auth.signOut();
      if (result?.error) {
        if (epoch === authEpoch) {
          clearPrivateState({ status: "error", session, error: result.error });
        }
        throw result.error;
      }
    }

    if (epoch === authEpoch) {
      clearPrivateState({ status: "unauthenticated", error: null });
    }

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
    getState() {
      lockIfExpired();
      return snapshot();
    },
    getClient,
    refresh,
    refreshEvent,
    ensureEventCatalog,
    selectEventPage,
    ensureModule,
    restoreSession,
    signIn,
    signOut,
    subscribe
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") lockIfExpired();
    });
    for (const event of ["pointerdown", "keydown", "submit"]) {
      document.addEventListener(event, (input) => {
        if (lockIfExpired()) {
          input.preventDefault();
          input.stopImmediatePropagation();
        }
      }, true);
    }
  }
})();
