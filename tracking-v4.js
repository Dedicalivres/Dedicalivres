/*
  DÉDICALIVRES — Tracking V4
  Visites globales + visites fiches événements
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.warn("Tracking V4 désactivé : configuration Supabase manquante.");
    return;
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  trackSiteVisit();

  const eventId = new URLSearchParams(window.location.search).get("id");
  if (eventId && location.pathname.includes("event")) {
    trackEventVisit(eventId);
  }

  async function trackSiteVisit() {
    try {
      const key = `dedicalivres_site_visit_${location.pathname}_${location.search}`;

      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");

      await client.from("site_visits").insert([
        {
          path: location.pathname + location.search,
          page_title: document.title || null,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null
        }
      ]);
    } catch (error) {
      console.warn("Tracking visite site non enregistré :", error);
    }
  }

  async function trackEventVisit(eventId) {
    try {
      const key = `dedicalivres_event_visit_${eventId}`;

      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");

      await client.from("event_visits").insert([
        {
          event_id: eventId,
          path: location.pathname + location.search,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null
        }
      ]);
    } catch (error) {
      console.warn("Tracking visite événement non enregistré :", error);
    }
  }
})();
