/*
  DÉDICALIVRES — Tracking V4.1 / Correctif V7.6.5
  Visites globales + visites fiches événements

  Correctif : la table site_visits réelle contient :
  id, created_at, page, path, referrer, user_agent.
  On n'envoie donc plus page_title.
*/

(function () {
  "use strict";

  window.DEDICALIVRES_TRACKING = {
    classifyAutomatedAgent,
    isAutomatedAgent,
    normalizePath,
    getTrackedPath,
    getEventId
  };

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.warn("Tracking V4 désactivé : configuration Supabase manquante.");
    return;
  }

  const client =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = client;
  }

  const trackedPath = getTrackedPath();
  const eventId = getEventId();
  const crawler = classifyAutomatedAgent(navigator.userAgent);

  if (crawler) {
    trackCrawlerVisit(crawler, eventId, trackedPath);
  } else {
    if (eventId) trackEventVisit(eventId, trackedPath);
    else trackSiteVisit(trackedPath);
  }
  trackNfcArrival();
  installNfcActivationTracking();

  function isAutomatedAgent(userAgent) {
    return Boolean(classifyAutomatedAgent(userAgent));
  }

  function classifyAutomatedAgent(userAgent) {
    const value = String(userAgent || "").toLowerCase();
    const agents = [
      ["meta-webindexer", "social", "Meta"],
      ["meta-externalagent", "social", "Meta"],
      ["facebookexternalhit", "social", "Meta"],
      ["googlebot", "search", "Google"],
      ["adsbot-google", "search", "Google"],
      ["bingbot", "search", "Bing"],
      ["bingpreview", "search", "Bing"],
      ["duckduckbot", "search", "DuckDuckGo"],
      ["yandexbot", "search", "Yandex"],
      ["baiduspider", "search", "Baidu"],
      ["petalbot", "search", "Petal"],
      ["applebot", "search", "Apple"],
      ["qwantbot", "search", "Qwant"],
      ["gptbot", "ai", "OpenAI"],
      ["oai-searchbot", "ai", "OpenAI"],
      ["chatgpt-user", "ai", "OpenAI"],
      ["claudebot", "ai", "Anthropic"],
      ["claude-searchbot", "ai", "Anthropic"],
      ["claude-user", "ai", "Anthropic"],
      ["perplexitybot", "ai", "Perplexity"],
      ["bytespider", "ai", "ByteDance"],
      ["amazonbot", "ai", "Amazon"],
      ["ahrefsbot", "seo", "Ahrefs"],
      ["semrushbot", "seo", "Semrush"],
      ["mj12bot", "seo", "Majestic"],
      ["dotbot", "seo", "DotBot"],
      ["certsignalbot", "seo", "CertSignal"],
      ["hubspot crawler", "seo", "HubSpot"],
      ["linkedinbot", "social", "LinkedIn"],
      ["twitterbot", "social", "Twitter"],
      ["crawler", "other", "Other"],
      ["spider", "other", "Other"]
    ];

    const match = agents.find(([marker]) => value.includes(marker));
    return match
      ? { agent: match[0], category: match[1], family: match[2] }
      : null;
  }

  async function trackCrawlerVisit(crawler, eventId, path) {
    try {
      const key = `dedicalivres_crawler_visit_${crawler.agent}_${path}`;

      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");

      const { error } = await client.from("crawler_visits").insert([
        {
          visit_kind: eventId ? "event" : "site",
          event_id: eventId || null,
          page: document.title || null,
          path,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent,
          crawler_category: crawler.category,
          crawler_family: crawler.family,
          crawler_agent: crawler.agent
        }
      ]);

      if (error) throw error;
    } catch (error) {
      console.warn("Tracking crawler non enregistré :", error);
    }
  }

  async function trackSiteVisit(path) {
    try {
      const key = `dedicalivres_site_visit_${path}`;

      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");

      const payload = {
        page: document.title || location.pathname || null,
        path,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent || null
      };

      const { error } = await client
        .from("site_visits")
        .insert([payload]);

      if (error) throw error;
    } catch (error) {
      console.warn("Tracking visite site non enregistré :", error);
    }
  }

  async function trackEventVisit(eventId, path) {
    try {
      const key = `dedicalivres_event_visit_${eventId}`;

      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");

      const { error } = await client.from("event_visits").insert([
        {
          event_id: eventId,
          path,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null
        }
      ]);

      if (error) throw error;
    } catch (error) {
      console.warn("Tracking visite événement non enregistré :", error);
    }
  }

  function normalizePath(value) {
    const path = String(value || "/").split(/[?#]/, 1)[0] || "/";
    const normalized = `/${path}`.replace(/\/{2,}/g, "/");
    return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
  }

  function getTrackedPath() {
    const path = normalizePath(location.pathname);
    const isTerritorial = Boolean(document.body?.matches?.(".territorial-page[data-country-code]"));
    const isStaticEvent = /^\/evenement\/(?!index(?:\.html)?$)[^/]+(?:\.html)?$/.test(path);
    const eventId = getEventId();

    if (isTerritorial || isStaticEvent) {
      try {
        const canonical = document.querySelector('link[rel="canonical"]')?.href;
        const url = new URL(canonical, location.origin);
        if (url.origin === location.origin) return normalizePath(url.pathname);
      } catch (_) {}
      return path;
    }

    if (eventId) return `${path}?id=${encodeURIComponent(eventId)}`;
    return path + location.search;
  }

  function getEventId() {
    const path = normalizePath(location.pathname);
    const candidate = path === "/event.html"
      ? new URLSearchParams(location.search).get("id")
      : document.body?.dataset?.eventId || null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(candidate || ""))
      ? String(candidate)
      : null;
  }

  async function trackNfcArrival() {
    try {
      const raw = sessionStorage.getItem("dedicalivres_nfc_context_v2");
      if (!raw) return;
      const context = JSON.parse(raw);
      if (!context.token || !context.sessionId) return;
      const key = `dedicalivres_nfc_arrival_${context.sessionId}`;
      if (sessionStorage.getItem(key)) return;
      const { data, error } = await client.rpc("nfc_track_event", {
        p_token: context.token,
        p_session_id: context.sessionId,
        p_event_name: "nfc_site_arrival",
        p_event_key: "arrival",
        p_scene_id: null,
        p_intent_id: context.intent || null,
        p_progress_bucket: null,
        p_activation_type: null,
        p_device_class: window.innerWidth <= 640 ? "mobile" : window.innerWidth <= 1024 ? "tablet" : "desktop"
      });
      if (error || data !== true) throw error || new Error("Événement NFC refusé");
      sessionStorage.setItem(key, "1");
    } catch (error) {
      console.warn("Attribution NFC non enregistrée :", error);
    }
  }

  function readNfcContext() {
    try { return JSON.parse(sessionStorage.getItem("dedicalivres_nfc_context_v2") || "null"); }
    catch (_) { return null; }
  }

  function installNfcActivationTracking() {
    if (!readNfcContext()) return;
    document.addEventListener("click", (event) => {
      const target = event.target.closest("a,button");
      if (!target) return;
      let type = null;
      if (target.id === "locate-me") type = "nearby_used";
      else if (target.matches("[data-favorite-id],#detail-favorite-btn")) type = "favorite_added";
      else if ((target.getAttribute("href") || "").includes("event.html?id=")) type = "event_opened";
      else if ((target.getAttribute("href") || "").includes("soumettre.html")) type = "submission_started";
      if (type) void trackNfcActivation(type);
    }, { passive: true });
  }

  async function trackNfcActivation(type) {
    try {
      const context = readNfcContext();
      if (!context?.token || !context?.sessionId) return;
      const key = `dedicalivres_nfc_activation_${context.sessionId}_${type}`;
      if (sessionStorage.getItem(key)) return;
      const { data, error } = await client.rpc("nfc_track_event", {
        p_token: context.token, p_session_id: context.sessionId,
        p_event_name: "nfc_activation", p_event_key: type,
        p_scene_id: null, p_intent_id: context.intent || null,
        p_progress_bucket: null, p_activation_type: type,
        p_device_class: window.innerWidth <= 640 ? "mobile" : window.innerWidth <= 1024 ? "tablet" : "desktop"
      });
      if (error || data !== true) throw error || new Error("Activation NFC refusée");
      sessionStorage.setItem(key, "1");
    } catch (error) { console.warn("Activation NFC non enregistrée :", error); }
  }
})();
