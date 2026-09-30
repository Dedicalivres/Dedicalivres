"use strict";

(function createAdminEventImageUpload() {
  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

  function validate(file) {
    if (!(file instanceof File) || !file.size) {
      throw new Error("Sélectionne une image JPG, PNG ou WEBP.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error("Format non accepté. Utilise JPG, PNG ou WEBP.");
    }

    if (file.size > MAX_BYTES) {
      throw new Error("L’image dépasse la limite de 5 Mo.");
    }
  }

  function validUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  async function upload(file, options = {}) {
    validate(file);

    const config = options.config || window.DEDICALIVRES_CONFIG || {};
    const endpoint = validUrl(config.imageUploadEndpoint);

    if (config.imageUploadProvider !== "r2" || !endpoint) {
      throw new Error("Upload R2 indisponible.");
    }

    const fetcher = options.fetcher || window.fetch?.bind(window);
    if (typeof fetcher !== "function") {
      throw new Error("Connexion au stockage R2 indisponible.");
    }

    const formData = new FormData();
    formData.append("file", file, file.name || "image-evenement.jpg");
    formData.append("folder", "event-images");

    let response;
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        body: formData
      });
    } catch (error) {
      throw new Error(
        "Connexion au stockage R2 impossible : " +
        (error?.message || "erreur réseau")
      );
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const uploadedUrl = validUrl(payload?.url);
    if (!response.ok || !uploadedUrl) {
      throw new Error(
        payload?.error ||
        `Upload R2 impossible (${response.status}).`
      );
    }

    return uploadedUrl;
  }

  async function resolve(previousUrl, file, options = {}) {
    if (!file) return previousUrl || null;
    return upload(file, options);
  }

  window.DEDICALIVRES_ADMIN_EVENT_IMAGE = {
    MAX_BYTES,
    validate,
    upload,
    resolve
  };
})();
