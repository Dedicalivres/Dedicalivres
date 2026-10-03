(function exposeDedicalivresUrlNormalizer(root) {
  "use strict";

  const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
  const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
  const ERROR_MESSAGE = "Adresse web invalide";

  function normalize(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const hasScheme = SCHEME_PATTERN.test(raw);
    const candidate = hasScheme
      ? raw
      : raw.startsWith("//")
        ? `https:${raw}`
        : `https://${raw}`;

    if (/\s/.test(candidate)) {
      throw new Error(ERROR_MESSAGE);
    }

    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(ERROR_MESSAGE);
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) {
      throw new Error(ERROR_MESSAGE);
    }

    return candidate;
  }

  function isValid(value) {
    try {
      normalize(value);
      return true;
    } catch {
      return false;
    }
  }

  function normalizeInput(input) {
    if (!input || String(input.type || "").toLowerCase() !== "url") return true;

    try {
      input.value = normalize(input.value);
      input.setCustomValidity("");
      return true;
    } catch {
      input.setCustomValidity(ERROR_MESSAGE);
      return false;
    }
  }

  function normalizeForm(form) {
    if (!form?.querySelectorAll) return true;
    const inputs = Array.from(form.querySelectorAll('input[type="url"]'));
    const invalid = inputs.find((input) => !normalizeInput(input));
    if (!invalid) return true;
    invalid.reportValidity?.();
    invalid.focus?.();
    return false;
  }

  const api = Object.freeze({
    ERROR_MESSAGE,
    normalize,
    normalizeOptional: normalize,
    isValid,
    normalizeInput,
    normalizeForm
  });

  root.DEDICALIVRES_URLS = api;

  if (!root.document?.addEventListener) return;

  root.document.addEventListener("blur", (event) => {
    if (event.target?.matches?.('input[type="url"]')) {
      normalizeInput(event.target);
    }
  }, true);

  root.document.addEventListener("input", (event) => {
    if (event.target?.matches?.('input[type="url"]')) {
      event.target.setCustomValidity("");
    }
  }, true);

  root.document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target?.matches?.('input[type="url"]')) {
      normalizeInput(event.target);
    }
  }, true);

  root.document.addEventListener("submit", (event) => {
    if (!normalizeForm(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})(typeof window !== "undefined" ? window : globalThis);
