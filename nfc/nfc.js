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

  root.DEDICALIVRES_NFC = { normalizeToken, resolveIntentTarget, intents: INTENTS };

  if (typeof document === "undefined") return;

  const params = new URLSearchParams(root.location.search);
  const token = normalizeToken(params.get("t"));
  const storageKey = "dedicalivres_nfc_context_v1";
  const favoritesKey = "dedicalivres_favorites";
  const feedback = document.querySelector("[data-intent-feedback]");
  const enterLink = document.querySelector("[data-enter-site]");
  const intentButtons = Array.from(document.querySelectorAll("[data-intent]"));
  const navLinks = Array.from(document.querySelectorAll(".scene-nav a"));
  const scenes = Array.from(document.querySelectorAll("[data-scene]"));
  let selectedIntent = "discover";

  function safeRead(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }

  function hasFavorites() {
    const values = safeRead(root.localStorage, favoritesKey, []);
    return Array.isArray(values) && values.length > 0;
  }

  function persistContext() {
    const context = { version: 1, token, intent: selectedIntent, openedAt: new Date().toISOString() };
    try { root.sessionStorage.setItem(storageKey, JSON.stringify(context)); }
    catch (_) { /* Le parcours reste utilisable sans stockage. */ }
  }

  function selectIntent(intent) {
    selectedIntent = Object.prototype.hasOwnProperty.call(INTENTS, intent) ? intent : "discover";
    intentButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.intent === selectedIntent)));
    if (feedback) feedback.textContent = INTENTS[selectedIntent].label;
    if (enterLink) enterLink.href = resolveIntentTarget(selectedIntent, hasFavorites());
    persistContext();
  }

  intentButtons.forEach((button) => button.addEventListener("click", () => selectIntent(button.dataset.intent)));
  enterLink?.addEventListener("click", persistContext);
  selectIntent("discover");

  if ("IntersectionObserver" in root) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => link.removeAttribute("aria-current"));
        const active = navLinks.find((link) => link.getAttribute("href") === `#${entry.target.id}`);
        active?.setAttribute("aria-current", "step");
      });
    }, { threshold: 0.58 });
    scenes.forEach((scene) => observer.observe(scene));
  } else {
    navLinks[0]?.setAttribute("aria-current", "step");
  }
})(typeof window !== "undefined" ? window : globalThis);
