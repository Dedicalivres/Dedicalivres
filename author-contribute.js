(function initAuthorContribution() {
  "use strict";

  const form = document.getElementById("author-profile-submission-form");
  const target = document.getElementById("author-target");
  const targetWrap = document.getElementById("author-target-wrap");
  const photoInput = document.getElementById("author-contribution-photo");
  const preview = document.getElementById("author-contribution-preview");
  const feedback = document.getElementById("author-contribution-feedback");
  const config = window.DEDICALIVRES_CONFIG;
  const core = window.DEDICALIVRES_AUTHOR_CONTRIBUTION;
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
  const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  let authors = [];
  let previewObjectUrl = "";

  if (!form || !target || !config || !window.supabase || !core) return;

  const client =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  loadAuthors();
  syncMode();

  form.addEventListener("change", (event) => {
    if (event.target.name === "request_type") syncMode();
    if (event.target === target) applySelectedAuthor();
    if (event.target === photoInput) previewSelectedPhoto();
  });
  form.addEventListener("submit", submitContribution);

  async function loadAuthors() {
    const response = await client
      .from("authors")
      .select("id,pseudo,slug,website,bio,avatar_url,location,shop_url,profile_type,updated_at")
      .order("pseudo", { ascending: true });

    if (response.error) {
      setFeedback("Impossible de charger les fiches auteurs publiées.", "error");
      return;
    }

    authors = Array.isArray(response.data) ? response.data : [];
    authors.forEach((author) => {
      const option = document.createElement("option");
      option.value = author.id;
      option.textContent = author.pseudo || author.slug;
      target.appendChild(option);
    });
  }

  function currentMode() {
    return form.elements.namedItem("request_type")?.value === "modify"
      ? "modify"
      : "create";
  }

  function syncMode() {
    const modifying = currentMode() === "modify";
    targetWrap.hidden = !modifying;
    target.required = modifying;
    if (!modifying) {
      target.value = "";
      clearAuthorFields();
    } else {
      applySelectedAuthor();
    }
  }

  function selectedAuthor() {
    return authors.find((author) => String(author.id) === String(target.value)) || null;
  }

  function clearAuthorFields() {
    ["pseudo", "bio", "location", "website", "shop_url"].forEach((name) => {
      const field = form.elements.namedItem(name);
      if (field) field.value = "";
    });
    form.elements.namedItem("profile_type").value = "author";
    renderPreview("");
  }

  function applySelectedAuthor() {
    const author = selectedAuthor();
    if (!author) {
      clearAuthorFields();
      return;
    }

    ["pseudo", "bio", "location", "website", "shop_url", "profile_type"].forEach((name) => {
      const field = form.elements.namedItem(name);
      if (field) field.value = author[name] || (name === "profile_type" ? "author" : "");
    });
    renderPreview(author.avatar_url || "", `Photo publiée de ${author.pseudo || "l’auteur"}`);
  }

  function validatePhoto(file) {
    if (!(file instanceof File) || !file.size) return false;
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      throw new Error("Utilisez une photo JPG, PNG ou WEBP.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error("La photo dépasse la limite de 4 Mo.");
    }
    return true;
  }

  function previewSelectedPhoto() {
    try {
      const file = photoInput.files?.[0];
      if (!validatePhoto(file)) {
        applySelectedAuthor();
        return;
      }
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = URL.createObjectURL(file);
      renderPreview(previewObjectUrl, "Nouvelle photo proposée");
      setFeedback("Aperçu local : la photo publique reste inchangée.", "");
    } catch (error) {
      photoInput.value = "";
      applySelectedAuthor();
      setFeedback(error.message, "error");
    }
  }

  function renderPreview(url, alt = "") {
    if (!preview) return;
    preview.innerHTML = url
      ? `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" />`
      : "";
  }

  async function submitContribution(event) {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    try {
      if (formData.get("legal_accept") !== "on") {
        throw new Error("Merci d’accepter la relecture et la modération de la proposition.");
      }

      const mode = currentMode();
      const currentAuthor = mode === "modify" ? selectedAuthor() : null;
      if (mode === "modify" && !currentAuthor) {
        throw new Error("Sélectionnez une fiche auteur existante.");
      }

      const input = {
        pseudo: formData.get("pseudo"),
        bio: formData.get("bio"),
        location: formData.get("location"),
        website: formData.get("website"),
        shop_url: formData.get("shop_url"),
        profile_type: formData.get("profile_type")
      };
      const file = formData.get("author_portrait");
      const hasPhoto = validatePhoto(file);

      // Valide les champs avant tout upload ; un marqueur HTTP temporaire permet
      // de valider le cas « photo seule » sans modifier la fiche publique.
      core.buildSubmission({
        mode,
        input,
        currentAuthor,
        proposedAvatarUrl: hasPhoto ? "https://pending.invalid/portrait.jpg" : ""
      });

      button.disabled = true;
      button.textContent = "Envoi…";
      setFeedback("Envoi de la proposition…", "");

      const proposedAvatarUrl = hasPhoto
        ? await uploadPortrait(file, core.slugify(input.pseudo))
        : "";
      const submission = core.buildSubmission({ mode, input, currentAuthor, proposedAvatarUrl });
      const response = await client.from("author_profile_submissions").insert([submission]);
      if (response.error) throw response.error;

      form.reset();
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = "";
      syncMode();
      setFeedback("Proposition enregistrée. Elle sera comparée puis traitée par l’administration.", "success");
    } catch (error) {
      setFeedback(error.message || "Impossible d’envoyer la proposition.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Envoyer la proposition";
    }
  }

  async function uploadPortrait(file, identityKey) {
    if (config.imageUploadProvider !== "r2" || !/^https?:\/\//i.test(config.imageUploadEndpoint || "")) {
      throw new Error("L’upload R2 du portrait est indisponible.");
    }

    const compressed = await compressPortrait(file, identityKey);
    const body = new FormData();
    body.append("file", compressed, compressed.name);
    body.append("folder", "author-portraits");
    body.append("file_name", compressed.name);
    body.append("identity_key", identityKey || "auteur");

    const response = await fetch(config.imageUploadEndpoint, { method: "POST", body });
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok || !/^https?:\/\//i.test(payload?.url || "")) {
      throw new Error(payload?.error || `Upload R2 impossible (${response.status}).`);
    }
    return payload.url;
  }

  function compressPortrait(file, identityKey) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const image = new Image();
      reader.onerror = () => reject(new Error("Lecture du portrait impossible."));
      reader.onload = () => { image.src = reader.result; };
      image.onerror = () => reject(new Error("Portrait invalide."));
      image.onload = () => {
        const ratio = Math.min(1, 900 / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Compression du portrait impossible."));
          const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          resolve(new File([blob], `${identityKey || "auteur"}-${stamp}.jpg`, { type: "image/jpeg" }));
        }, "image/jpeg", 0.82);
      };
      reader.readAsDataURL(file);
    });
  }

  function setFeedback(message, status) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `form-feedback${status ? ` ${status}` : ""}`;
  }

  function escapeAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
