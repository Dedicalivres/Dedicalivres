(function exposeAuthorContributionCore(root) {
  "use strict";

  const EDITABLE_FIELDS = [
    "pseudo",
    "bio",
    "location",
    "website",
    "shop_url",
    "profile_type"
  ];
  const PROFILE_TYPES = new Set(["author", "artist_author", "hybrid"]);

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function cleanMultiline(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n").trim();
  }

  function slugify(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  function normalizeUrl(value, label) {
    try {
      return root.DEDICALIVRES_URLS.normalizeOptional(value);
    } catch (_) {
      throw new Error("Adresse web invalide");
    }
  }

  function normalizeProfileType(value) {
    const type = cleanText(value);
    if (!PROFILE_TYPES.has(type)) {
      throw new Error("Choisis un type de profil valide.");
    }
    return type;
  }

  function normalizeFields(input = {}) {
    const pseudo = cleanText(input.pseudo).replace(/\s+/g, " ");
    if (pseudo.length < 2 || pseudo.length > 120) {
      throw new Error("Le nom public doit contenir entre 2 et 120 caractères.");
    }

    return {
      pseudo,
      bio: cleanMultiline(input.bio).slice(0, 5000),
      location: cleanText(input.location).replace(/\s+/g, " ").slice(0, 200),
      website: normalizeUrl(input.website, "Le site"),
      shop_url: normalizeUrl(input.shop_url, "La boutique"),
      profile_type: normalizeProfileType(input.profile_type)
    };
  }

  function comparable(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function comparableField(field, value) {
    const raw = comparable(value);
    if (!raw || !["website", "shop_url"].includes(field)) return raw;
    try {
      return new URL(root.DEDICALIVRES_URLS.normalizeOptional(raw)).href;
    } catch {
      return raw;
    }
  }

  function buildSubmission({ mode, input, currentAuthor = null, proposedAvatarUrl = "" }) {
    const requestType = mode === "modify" ? "modify" : "create";
    const normalized = normalizeFields(input);
    const avatarUrl = proposedAvatarUrl
      ? normalizeUrl(proposedAvatarUrl, "La photo")
      : "";
    const payload = {};

    if (requestType === "create") {
      Object.assign(payload, normalized, { slug: slugify(normalized.pseudo) });
      if (!payload.slug) throw new Error("Impossible de créer un identifiant auteur valide.");
      return {
        request_type: "create",
        target_author_id: null,
        base_author_updated_at: null,
        payload,
        proposed_avatar_url: avatarUrl || null,
        consent_accepted: true
      };
    }

    if (!currentAuthor?.id || !currentAuthor?.updated_at) {
      throw new Error("Sélectionne une fiche auteur existante.");
    }

    EDITABLE_FIELDS.forEach((field) => {
      if (comparableField(field, normalized[field]) !== comparableField(field, currentAuthor[field])) {
        payload[field] = normalized[field];
      }
    });

    if (!Object.keys(payload).length && !avatarUrl) {
      throw new Error("Aucune modification à proposer.");
    }

    return {
      request_type: "modify",
      target_author_id: currentAuthor.id,
      base_author_updated_at: currentAuthor.updated_at,
      payload,
      proposed_avatar_url: avatarUrl || null,
      consent_accepted: true
    };
  }

  function compareSubmission(submission, currentAuthor = null) {
    const rows = [];
    const payload = submission?.payload && typeof submission.payload === "object"
      ? submission.payload
      : {};

    Object.keys(payload)
      .filter((field) => [...EDITABLE_FIELDS, "slug"].includes(field))
      .forEach((field) => {
        rows.push({
          field,
          current: currentAuthor ? comparable(currentAuthor[field]) : "",
          proposed: comparable(payload[field])
        });
      });

    if (submission?.proposed_avatar_url) {
      rows.push({
        field: "avatar_url",
        current: currentAuthor ? comparable(currentAuthor.avatar_url) : "",
        proposed: comparable(submission.proposed_avatar_url)
      });
    }

    return rows;
  }

  const api = {
    EDITABLE_FIELDS,
    PROFILE_TYPES: [...PROFILE_TYPES],
    buildSubmission,
    compareSubmission,
    slugify
  };

  root.DEDICALIVRES_AUTHOR_CONTRIBUTION = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
