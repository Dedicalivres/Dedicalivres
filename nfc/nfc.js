(function exposeNfcPassage(root) {
  "use strict";

  const TOKEN_PATTERN = /^[A-Z0-9]{8,24}$/;
  const INTENTS = Object.freeze({
    nearby: { target: "/index.html#agenda", label: "L’agenda proche de toi t’attend." },
    favorites: { target: "/index.html#saved-events", label: "Retrouve et garde tes prochaines rencontres." },
    organizer: { target: "/soumettre.html", label: "Propose une rencontre à la communauté." },
    discover: { target: "/index.html", label: "Découvre librement Dédicalivres." }
  });

  function normalizeToken(value) {
    const token = String(value || "").trim().toUpperCase();
    return TOKEN_PATTERN.test(token) ? token : null;
  }

  function resolveIntentTarget(intent, hasFavorites) {
    if (intent === "favorites" && !hasFavorites) return "/index.html#agenda";
    return INTENTS[intent]?.target || INTENTS.discover.target;
  }

  function deviceClass(width) {
    if (width <= 640) return "mobile";
    if (width <= 1024) return "tablet";
    return "desktop";
  }

  function createSessionId(cryptoApi) {
    return cryptoApi && typeof cryptoApi.randomUUID === "function" ? cryptoApi.randomUUID() : null;
  }

  root.DEDICALIVRES_NFC = { normalizeToken, resolveIntentTarget, deviceClass, createSessionId, intents: INTENTS };

  if (typeof document === "undefined") return;

  const params = new URLSearchParams(root.location.search);
  const token = normalizeToken(params.get("t"));
  const storageKey = "dedicalivres_nfc_context_v2";
  const favoritesKey = "dedicalivres_favorites";
  const feedback = document.querySelector("[data-intent-feedback]");
  const enterLink = document.querySelector("[data-enter-site]");
  const intentButtons = Array.from(document.querySelectorAll("[data-intent]"));
  const navLinks = Array.from(document.querySelectorAll(".scene-nav a"));
  const scenes = Array.from(document.querySelectorAll("[data-scene]"));
  let selectedIntent = "discover";
  let publicContext = null;
  let sessionId = null;
  const sent = new Set();

  const client = typeof root.getDedicalivresSupabaseClient === "function"
    ? root.getDedicalivresSupabaseClient()
    : null;

  function safeRead(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }

  function hasFavorites() {
    const values = safeRead(root.localStorage, favoritesKey, []);
    return Array.isArray(values) && values.length > 0;
  }

  function persistContext() {
    const context = { version: 2, token, sessionId, intent: selectedIntent, openedAt: new Date().toISOString() };
    try { root.sessionStorage.setItem(storageKey, JSON.stringify(context)); }
    catch (_) { /* Le parcours reste utilisable sans stockage. */ }
  }

  async function track(eventName, eventKey, details = {}) {
    if (!client || !token || !sessionId) return false;
    const dedupeKey = `${eventName}:${eventKey}`;
    if (sent.has(dedupeKey)) return true;
    sent.add(dedupeKey);
    const response = await client.rpc("nfc_track_event", {
      p_token: token,
      p_session_id: sessionId,
      p_event_name: eventName,
      p_event_key: eventKey,
      p_scene_id: details.sceneId || null,
      p_intent_id: details.intentId || null,
      p_progress_bucket: details.progressBucket || null,
      p_activation_type: null,
      p_device_class: deviceClass(root.innerWidth || 1024)
    });
    if (response.error || response.data !== true) {
      sent.delete(dedupeKey);
      return false;
    }
    return true;
  }

  async function initializeTracking() {
    if (!client || !token) return;
    const resolved = await client.rpc("nfc_resolve_tag", { p_token: token });
    publicContext = !resolved.error && Array.isArray(resolved.data) ? resolved.data[0] || null : null;
    if (!publicContext) return;
    const stored = safeRead(root.sessionStorage, storageKey, {});
    sessionId = stored.token === token ? stored.sessionId : null;
    sessionId = sessionId || createSessionId(root.crypto);
    persistContext();
    await track("nfc_open", "open");
    await track("nfc_scene_view", "door", { sceneId: "door" });
  }

  function progressForScene(sceneId) {
    return ({ encounter: 25, mission: 50, intent: 75, exit: 100 })[sceneId] || null;
  }

  function selectIntent(intent) {
    selectedIntent = Object.prototype.hasOwnProperty.call(INTENTS, intent) ? intent : "discover";
    intentButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.intent === selectedIntent)));
    if (feedback) feedback.textContent = INTENTS[selectedIntent].label;
    if (enterLink) enterLink.href = resolveIntentTarget(selectedIntent, hasFavorites());
    persistContext();
    void track("nfc_intent_select", intent, { intentId: selectedIntent });
  }

  intentButtons.forEach((button) => button.addEventListener("click", () => selectIntent(button.dataset.intent)));
  enterLink?.addEventListener("click", () => {
    persistContext();
    void track("nfc_cta_click", "enter_site", { intentId: selectedIntent });
    void track("nfc_enter_site", selectedIntent, { intentId: selectedIntent });
  });
  selectIntent("discover");

  if ("IntersectionObserver" in root) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => link.removeAttribute("aria-current"));
        const active = navLinks.find((link) => link.getAttribute("href") === `#${entry.target.id}`);
        active?.setAttribute("aria-current", "step");
        const sceneId = String(entry.target.dataset.scene);
        void track("nfc_scene_view", sceneId, { sceneId });
        const progressBucket = progressForScene(sceneId);
        if (progressBucket) void track("nfc_progress", String(progressBucket), { sceneId, progressBucket });
        if (sceneId === "exit") void track("nfc_cta_impression", "enter_site", { sceneId });
      });
    }, { threshold: 0.58 });
    scenes.forEach((scene) => observer.observe(scene));
  } else {
    navLinks[0]?.setAttribute("aria-current", "step");
  }
  void initializeTracking();
})(typeof window !== "undefined" ? window : globalThis);
