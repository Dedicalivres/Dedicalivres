/*
  DÉDICALIVRES — Tracking V4.1 / Correctif V7.6.5
  Visites globales + visites fiches événements

  Correctif : la table site_visits réelle contient :
  id, created_at, page, path, referrer, user_agent.
  On n'envoie donc plus page_title.
*/

(function () {
  "use strict";

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

  trackSiteVisit();
  trackNfcArrival();
  installNfcActivationTracking();

  const eventId = new URLSearchParams(window.location.search).get("id");
  if (eventId && location.pathname.includes("event")) {
    trackEventVisit(eventId);
  }

  async function trackSiteVisit() {
    try {
      const key = `dedicalivres_site_visit_${location.pathname}_${location.search}`;

      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");

      const payload = {
        page: document.title || location.pathname || null,
        path: location.pathname + location.search,
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

  async function trackEventVisit(eventId) {
    try {
      const key = `dedicalivres_event_visit_${eventId}`;

      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");

      const { error } = await client.from("event_visits").insert([
        {
          event_id: eventId,
          path: location.pathname + location.search,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null
        }
      ]);

      if (error) throw error;
    } catch (error) {
      console.warn("Tracking visite événement non enregistré :", error);
    }
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
