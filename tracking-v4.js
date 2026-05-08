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
})();
