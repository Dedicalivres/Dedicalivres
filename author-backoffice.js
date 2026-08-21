(function (global) {
  "use strict";

  const PROFILE_LABELS = {
    author: "Auteur",
    artist_author: "Artiste-auteur",
    hybrid: "Hybride",
    publisher: "Maison d’édition"
  };

  const MISSING_LABELS = {
    identity: "identité",
    photo: "photo",
    bio: "bio",
    links: "liens",
    validation: "validation",
    presence: "présence ou référence fiable",
    duplicate: "doublon à résoudre",
    profile: "profil auteur compatible"
  };

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .toLowerCase()
      .trim();
  }

  function normalizeProfileType(value) {
    return Object.prototype.hasOwnProperty.call(PROFILE_LABELS, value) ? value : "author";
  }

  function getPresenceName(row) {
    if (!row) return "";
    return clean(row.participant_type === "publisher" ? row.organization_name || row.pseudo : row.pseudo);
  }

  function getIdentityKey(row) {
    if (!row) return "";
    return clean(row.author_id) || clean(row.author_slug) || clean(row.author_identity_key) || normalize(getPresenceName(row));
  }

  function sameIdentity(left, right) {
    const leftKey = getIdentityKey(left);
    const rightKey = getIdentityKey(right);
    if (leftKey && rightKey && leftKey === rightKey) return true;
    return !!normalize(getPresenceName(left)) && normalize(getPresenceName(left)) === normalize(getPresenceName(right));
  }

  function findAuthorForPresence(authors, presence) {
    const source = Array.isArray(authors) ? authors : [];
    const presenceId = clean(presence?.author_id);
    const presenceSlug = clean(presence?.author_slug || presence?.author_identity_key);
    const presenceName = normalize(getPresenceName(presence));

    return source.find((author) => (
      (presenceId && clean(author?.id) === presenceId) ||
      (presenceSlug && clean(author?.slug) === presenceSlug) ||
      (presenceName && normalize(author?.pseudo || author?.name || author?.pen_name) === presenceName)
    )) || null;
  }

  function getRelatedPresences(presences, reference) {
    const source = Array.isArray(presences) ? presences : [];
    return source.filter((row) => sameIdentity(row, reference));
  }

  function eventDateValue(event, field) {
    const value = clean(event?.[field]);
    if (!value) return Number.NaN;
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return date.getTime();
  }

  function splitPresenceEvents(presences, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const map = new Map();

    (Array.isArray(presences) ? presences : [])
      .filter((row) => row?.validated === true && row?.rejected !== true && row?.events?.id)
      .forEach((row) => map.set(String(row.events.id), row.events));

    const upcoming = [];
    const past = [];

    map.forEach((event) => {
      const end = eventDateValue(event, "end_date");
      const start = eventDateValue(event, "start_date");
      const comparison = Number.isFinite(end) ? end : start;
      if (Number.isFinite(comparison) && comparison < today) past.push(event);
      else upcoming.push(event);
    });

    upcoming.sort((left, right) => {
      const leftDate = eventDateValue(left, "start_date");
      const rightDate = eventDateValue(right, "start_date");
      return (Number.isFinite(leftDate) ? leftDate : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(rightDate) ? rightDate : Number.MAX_SAFE_INTEGER);
    });
    past.sort((left, right) => eventDateValue(right, "start_date") - eventDateValue(left, "start_date"));

    return { upcoming, past };
  }

  function evaluateAuthor(options = {}) {
    const author = options.author || {};
    const presences = Array.isArray(options.presences) ? options.presences : [];
    const validPresences = presences.filter((row) => row?.validated === true && row?.rejected !== true);
    const latestPresence = validPresences[0] || presences[0] || {};
    const profileType = normalizeProfileType(author.participant_type || latestPresence.participant_type);
    const identity = clean(author.pseudo || author.name || author.pen_name || getPresenceName(latestPresence));
    const photo = clean(author.avatar_url || author.photo_url || author.image_url || validPresences.find((row) => row.author_portrait_url)?.author_portrait_url);
    const bio = clean(author.bio || author.biography || author.description);
    const primaryLink = clean(author.website || author.profile_url || validPresences.find((row) => row.author_profile_url || row.website)?.author_profile_url || validPresences.find((row) => row.website)?.website);
    const secondaryLink = clean(author.shop_url || author.store_url || validPresences.find((row) => row.book_or_publisher_url)?.book_or_publisher_url);
    const hasModeration = author.validated === true || validPresences.length > 0;
    const hasReliableReference = validPresences.length > 0 || !!primaryLink;
    const duplicate = options.duplicate === true;
    const eligibleProfile = profileType !== "publisher";
    const coreMissing = [];

    if (!identity) coreMissing.push("identity");
    if (!photo) coreMissing.push("photo");
    if (!hasModeration) coreMissing.push("validation");
    if (!hasReliableReference) coreMissing.push("presence");
    if (duplicate) coreMissing.push("duplicate");
    if (!eligibleProfile) coreMissing.push("profile");

    const enrichmentMissing = [];
    if (!bio) enrichmentMissing.push("bio");
    if (!primaryLink && !secondaryLink) enrichmentMissing.push("links");
    if (!validPresences.length && !coreMissing.includes("presence")) enrichmentMissing.push("presence");

    const ready = coreMissing.length === 0;
    const status = !ready ? "incomplete" : enrichmentMissing.length ? "enrich" : "ready";
    const statusLabel = {
      incomplete: "Incomplète",
      enrich: "À enrichir",
      ready: "Prête"
    }[status];

    return {
      ready,
      status,
      statusLabel,
      publishableLater: ready,
      profileType,
      profileLabel: PROFILE_LABELS[profileType],
      identity,
      photo,
      bio,
      primaryLink,
      secondaryLink,
      missing: [...new Set([...coreMissing, ...enrichmentMissing])],
      missingLabels: [...new Set([...coreMissing, ...enrichmentMissing])].map((key) => MISSING_LABELS[key]),
      validPresenceCount: validPresences.length,
      duplicate
    };
  }

  function buildAuthorDraft(options = {}) {
    const readiness = evaluateAuthor(options);
    const author = options.author || {};
    const presences = Array.isArray(options.presences) ? options.presences : [];
    const validPresences = presences.filter((row) => row?.validated === true && row?.rejected !== true);
    const eventGroups = splitPresenceEvents(validPresences, options.now || new Date());
    const location = clean(
      author.location || author.region || author.city ||
      validPresences.find((row) => row?.events?.region || row?.events?.city)?.events?.region ||
      validPresences.find((row) => row?.events?.city)?.events?.city
    );

    return {
      ...readiness,
      slug: clean(author.slug || validPresences[0]?.author_slug || validPresences[0]?.author_identity_key),
      location,
      upcomingEvents: eventGroups.upcoming,
      pastEvents: eventGroups.past,
      historyCount: eventGroups.upcoming.length + eventGroups.past.length
    };
  }

  global.DEDICALIVRES_AUTHOR_BACKOFFICE = {
    PROFILE_LABELS,
    MISSING_LABELS,
    normalize,
    normalizeProfileType,
    getPresenceName,
    getIdentityKey,
    sameIdentity,
    findAuthorForPresence,
    getRelatedPresences,
    splitPresenceEvents,
    evaluateAuthor,
    buildAuthorDraft
  };
})(typeof window !== "undefined" ? window : globalThis);
