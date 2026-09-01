(function (global) {
  "use strict";

  const PROFILE_LABELS = {
    author: "Auteur",
    artist_author: "Artiste-auteur",
    hybrid: "Hybride",
    publisher: "Maison d’édition",
    other: "Autre"
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

  const PUBLICATION_READINESS = Object.freeze({
    READY: { label: "Prêt", rank: 4 },
    NEEDS_REVIEW: { label: "À revoir", rank: 3 },
    INCOMPLETE: { label: "Incomplet", rank: 2 },
    AMBIGUOUS: { label: "Ambigu", rank: 1 }
  });

  const MIN_READY_CONFIDENCE = 70;

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

  function normalizeAuthorIdentity(value) {
    return normalize(value)
      .replace(/\b(mme|mr|m|madame|monsieur)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getAuthorIdentityCandidates(author) {
    return Array.from(new Set([
      author?.pseudo,
      author?.name,
      author?.pen_name,
      author?.slug
    ]
      .map(normalizeAuthorIdentity)
      .filter(Boolean)));
  }

  function scoreAuthorDuplicate(left, right) {
    if (!left || !right || (left.id && right.id && left.id === right.id)) {
      return { score: 0, reasons: [] };
    }

    let score = 0;
    const reasons = [];

    const leftIdentities = getAuthorIdentityCandidates(left);
    const rightIdentities = getAuthorIdentityCandidates(right);

    if (leftIdentities.some((value) => rightIdentities.includes(value))) {
      score += 70;
      reasons.push("identité");
    }

    const leftWebsite = clean(left.website).toLowerCase();
    const rightWebsite = clean(right.website).toLowerCase();

    if (leftWebsite && rightWebsite && leftWebsite === rightWebsite) {
      score += 20;
      reasons.push("site");
    }

    const leftShop = clean(left.shop_url).toLowerCase();
    const rightShop = clean(right.shop_url).toLowerCase();

    if (leftShop && rightShop && leftShop === rightShop) {
      score += 10;
      reasons.push("boutique");
    }

    const leftLocation = normalizeAuthorIdentity(left.location);
    const rightLocation = normalizeAuthorIdentity(right.location);

    if (leftLocation && rightLocation && leftLocation === rightLocation) {
      score += 5;
      reasons.push("localisation");
    }

    return {
      score: Math.min(score, 100),
      reasons
    };
  }

  function findProbableAuthorDuplicates(authors) {
    const source = Array.isArray(authors) ? authors : [];
    const matches = [];

    for (let i = 0; i < source.length; i += 1) {
      for (let j = i + 1; j < source.length; j += 1) {
        const left = source[i];
        const right = source[j];

        const result = scoreAuthorDuplicate(left, right);

        if (result.score >= 70) {
          matches.push({
            left,
            right,
            score: result.score,
            reasons: result.reasons
          });
        }
      }
    }

    return matches.sort((a, b) => b.score - a.score);
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
    const profileType = normalizeProfileType(
      author.profile_type ||
      author.participant_type ||
      latestPresence.participant_type
    );
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

  function unique(values) {
    const seen = new Set();

    return (Array.isArray(values) ? values : [])
      .filter(Boolean)
      .filter((value) => {
        const key = normalize(typeof value === "string" ? value : JSON.stringify(value));
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function clampConfidence(value) {
    if (
      value === null ||
      value === undefined ||
      clean(value) === ""
    ) {
      return null;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const normalizedValue = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
    return Math.max(0, Math.min(100, Math.round(normalizedValue)));
  }

  function getUrlHost(value) {
    try {
      return new URL(clean(value)).hostname.toLowerCase().replace(/^www\./, "");
    } catch (_) {
      return "";
    }
  }

  function normalizeKnowledgeGraphAuthorView(payload) {
    const view = payload?.author || payload || {};
    const identity = view.identity || {};
    const attributes = identity.attributes || {};
    const relations = Array.isArray(view.possible_identity_matches)
      ? view.possible_identity_matches
      : [];

    return {
      entityKey: clean(identity.entity_key),
      name: clean(identity.display_name),
      aliases: unique(identity.aliases),
      type: clean(attributes.author_type),
      photo: clean(attributes.photo),
      bio: clean(attributes.bio),
      location: clean(attributes.location),
      publicLinks: unique(attributes.public_links),
      confidence: clampConfidence(identity.confidence_score),
      confidenceLevel: clean(identity.confidence_level),
      confidenceReasons: unique(identity.confidence_reasons),
      validationStatus: clean(identity.validation_status),
      provenance: Array.isArray(identity.provenance) ? identity.provenance : [],
      pastEvents: Array.isArray(view.past_events) ? view.past_events : [],
      futureEvents: Array.isArray(view.future_events) ? view.future_events : [],
      undatedEvents: Array.isArray(view.undated_events) ? view.undated_events : [],
      proofSources: unique(view.proof_sources),
      possibleSameAs: relations,
      publication: view.publication === true,
      publicRoute: view.public_route === true,
      automaticMerge: view.automatic_merge === true
    };
  }

  function getRelatedAuthorPresences(author, presences) {
    const source = Array.isArray(presences) ? presences : [];

    return source.filter((presence) => findAuthorForPresence([author], presence) === author);
  }

  function buildPresenceEvent(presence, eventsById) {
    const eventId = clean(presence?.event_id || presence?.events?.id);
    const event = presence?.events || eventsById.get(eventId) || {};
    const startDate = clean(event.start_date || event.date_start || event.date);
    const endDate = clean(event.end_date || event.date_end);
    const rejected = presence?.rejected === true;
    const confirmed = presence?.validated === true && !rejected;
    const sourceUrl = clean(
      presence?.source_url ||
      presence?.proof_url ||
      presence?.author_profile_url ||
      presence?.website ||
      event.website
    );

    return {
      id: eventId,
      title: clean(event.title || event.titre || presence?.event_title),
      city: clean(event.city || event.ville),
      startDate: startDate.slice(0, 10),
      endDate: endDate.slice(0, 10),
      type: clean(event.type || event.type_evenement),
      presenceStatus: rejected ? "rejected" : confirmed ? "confirmed" : "pending",
      provenance: [{
        origin: clean(presence?.source) || "soumission",
        collectedAt: clean(presence?.created_at),
        source: sourceUrl,
        eventId
      }],
      proof: clean(presence?.admin_note || presence?.proof || sourceUrl),
      source: sourceUrl
    };
  }

  function normalizeKnowledgeGraphEvent(event, period) {
    return {
      id: clean(event?.event_id),
      title: clean(event?.title),
      city: clean(event?.city),
      startDate: clean(event?.date).slice(0, 10),
      endDate: clean(event?.end_date).slice(0, 10),
      type: clean(event?.type),
      presenceStatus: clean(event?.presence_status) || "pending",
      provenance: Array.isArray(event?.provenance) ? event.provenance : [],
      proof: Array.isArray(event?.evidence)
        ? event.evidence.map((item) => clean(item?.proof || item?.source_url)).filter(Boolean).join(" · ")
        : "",
      source: clean(event?.source_url),
      period
    };
  }

  function eventPeriod(event, now) {
    const raw = clean(event?.endDate || event?.startDate);
    if (!raw) return "undated";
    const time = new Date(`${raw.slice(0, 10)}T00:00:00`).getTime();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (!Number.isFinite(time)) return "undated";
    return time < today ? "past" : "future";
  }

  function buildAuthorProvenance(relatedPresences, knowledgeGraph, fields) {
    const rows = [];

    fields.forEach((datum) => {
      if (!clean(datum?.value)) return;
      rows.push({
        field: clean(datum.field),
        origin: clean(datum.origin),
        collectedAt: clean(datum.collectedAt),
        source: clean(datum.source),
        proof: clean(datum.proof)
      });
    });

    relatedPresences.forEach((presence) => {
      rows.push({
        field: "presence",
        origin: clean(presence?.source) || "soumission",
        collectedAt: clean(presence?.created_at),
        source: clean(presence?.author_profile_url || presence?.website),
        proof: clean(presence?.admin_note || presence?.event_id)
      });
    });

    knowledgeGraph.provenance.forEach((row) => {
      rows.push({
        field: "knowledge_graph",
        origin: "Auto-Matte",
        collectedAt: clean(row?.collected_at || row?.date),
        source: clean(row?.source_url),
        proof: clean(row?.proof || row?.event_id)
      });
    });

    return rows.filter((row) => row.origin || row.source || row.proof);
  }

  function getAuthorMatchKey(left, right) {
    return [clean(left?.id || left?.entity_key || left?.pseudo), clean(right?.id || right?.entity_key || right?.pseudo)]
      .sort()
      .join("::");
  }

  function buildAuthorAmbiguities(author, authors, knowledgeGraph, review) {
    const ignored = new Set(Array.isArray(review?.ignoredMatches) ? review.ignoredMatches : []);
    const ambiguities = [];

    if (review?.ambiguous === true) {
      ambiguities.push({
        type: "manual",
        label: "Identité marquée ambiguë par l’administration",
        confidence: null,
        blocking: true
      });
    }

    findProbableAuthorDuplicates(Array.isArray(authors) ? authors : [])
      .filter((match) => match.left === author || match.right === author)
      .forEach((match) => {
        const other = match.left === author ? match.right : match.left;
        const matchKey = getAuthorMatchKey(author, other);
        if (ignored.has(matchKey)) return;
        ambiguities.push({
          type: "possible_same_as",
          label: `Rapprochement possible avec ${clean(other?.pseudo || other?.name) || "une autre fiche"}`,
          confidence: match.score,
          reasons: match.reasons,
          matchKey,
          blocking: true
        });
      });

    knowledgeGraph.possibleSameAs.forEach((relation) => {
      const matchKey = clean(relation?.relation_key) || JSON.stringify(relation);
      if (ignored.has(matchKey)) return;
      ambiguities.push({
        type: "possible_same_as",
        label: "Rapprochement Auto-Matte à vérifier",
        confidence: clampConfidence(relation?.confidence_score),
        evidence: Array.isArray(relation?.evidence) ? relation.evidence : [],
        matchKey,
        blocking: true
      });
    });

    return ambiguities;
  }

  function author_publication_readiness(record = {}) {
    const missing = [];
    const reviewReasons = [];

    if (!clean(record.identity?.name)) missing.push("identity");
    if (!clean(record.identity?.photo)) missing.push("photo");
    if (!clean(record.content?.bio)) missing.push("bio");
    if (!Number(record.quality?.confirmedPresenceCount)) missing.push("confirmed_presence");
    if (!Array.isArray(record.provenance) || !record.provenance.length) missing.push("provenance");

    const blockingAmbiguities = (record.quality?.ambiguities || []).filter((item) => item?.blocking !== false);

    if (blockingAmbiguities.length) {
      return {
        status: "AMBIGUOUS",
        label: PUBLICATION_READINESS.AMBIGUOUS.label,
        ready: false,
        missing,
        reviewReasons: ["Un rapprochement d’identité doit être tranché."],
        blockingAmbiguities
      };
    }

    if (missing.length) {
      return {
        status: "INCOMPLETE",
        label: PUBLICATION_READINESS.INCOMPLETE.label,
        ready: false,
        missing,
        reviewReasons,
        blockingAmbiguities: []
      };
    }

    if (record.quality?.identityValidated !== true) {
      reviewReasons.push("Identité non validée par l’administration.");
    }
    if (Number(record.quality?.confidence || 0) < MIN_READY_CONFIDENCE) {
      reviewReasons.push(`Confiance inférieure à ${MIN_READY_CONFIDENCE} %.`);
    }
    if (!Number(record.quality?.independentSourceCount || 0)) {
      reviewReasons.push("Aucune source indépendante identifiable.");
    }

    if (reviewReasons.length) {
      return {
        status: "NEEDS_REVIEW",
        label: PUBLICATION_READINESS.NEEDS_REVIEW.label,
        ready: false,
        missing,
        reviewReasons,
        blockingAmbiguities: []
      };
    }

    return {
      status: "READY",
      label: PUBLICATION_READINESS.READY.label,
      ready: true,
      missing: [],
      reviewReasons: [],
      blockingAmbiguities: []
    };
  }

  function buildAuthorRecord(options = {}) {
    const author = options.author || {};
    const knowledgeGraph = normalizeKnowledgeGraphAuthorView(options.knowledgeGraphAuthor);
    const relatedPresences = getRelatedAuthorPresences(author, options.presences);
    const eventsById = new Map((Array.isArray(options.events) ? options.events : []).map((event) => [clean(event?.id), event]));
    const now = options.now instanceof Date ? options.now : new Date();
    const presenceEvents = relatedPresences.map((presence) => buildPresenceEvent(presence, eventsById));
    const kgEvents = [
      ...knowledgeGraph.futureEvents.map((event) => normalizeKnowledgeGraphEvent(event, "future")),
      ...knowledgeGraph.pastEvents.map((event) => normalizeKnowledgeGraphEvent(event, "past")),
      ...knowledgeGraph.undatedEvents.map((event) => normalizeKnowledgeGraphEvent(event, "undated"))
    ];
    const eventMap = new Map();

    [...presenceEvents, ...kgEvents].forEach((event) => {
      const key = clean(event.id) || [normalize(event.title), event.startDate, normalize(event.city)].join("|");
      if (!key) return;
      const existing = eventMap.get(key);
      if (!existing || (existing.presenceStatus !== "confirmed" && event.presenceStatus === "confirmed")) {
        eventMap.set(key, event);
      }
    });

    const allEvents = [...eventMap.values()].map((event) => ({
      ...event,
      period: event.period || eventPeriod(event, now)
    }));
    allEvents.sort((left, right) => clean(left.startDate).localeCompare(clean(right.startDate)));

    const confirmedPresences = relatedPresences.filter((row) => row?.validated === true && row?.rejected !== true);
    const name = clean(author.pseudo || author.name || author.pen_name || knowledgeGraph.name || getPresenceName(relatedPresences[0]));
    const aliases = unique([author.pen_name, ...(knowledgeGraph.aliases || [])]).filter((alias) => normalize(alias) !== normalize(name));
    const photo = clean(author.avatar_url || author.photo_url || knowledgeGraph.photo || confirmedPresences.find((row) => row.author_portrait_url)?.author_portrait_url);
    const bio = clean(author.bio || author.biography || knowledgeGraph.bio);
    const location = clean(author.location || author.region || knowledgeGraph.location);
    const website = clean(author.website || knowledgeGraph.publicLinks[0] || confirmedPresences.find((row) => row.author_profile_url || row.website)?.author_profile_url || confirmedPresences.find((row) => row.website)?.website);
    const secondaryLinks = unique([
      author.shop_url,
      ...knowledgeGraph.publicLinks.slice(website ? 1 : 0),
      ...confirmedPresences.flatMap((row) => [row.book_or_publisher_url, row.author_profile_url])
    ]).filter((url) => clean(url) !== website);
    const sourceHosts = unique([
      ...allEvents.map((event) => getUrlHost(event.source)),
      ...knowledgeGraph.proofSources.map(getUrlHost),
      getUrlHost(website)
    ]).filter(Boolean);
    const profileType = normalizeProfileType(author.profile_type || author.participant_type || knowledgeGraph.type);
    const identityValidated = author.validated === true || knowledgeGraph.validationStatus === "confirmed";
    const ambiguities = buildAuthorAmbiguities(author, options.authors, knowledgeGraph, options.review);
    let confidence = clampConfidence(author.confidence ?? author.confidence_score ?? knowledgeGraph.confidence);

    if (confidence === null) {
      confidence = Math.min(100,
        (name ? 20 : 0) +
        (identityValidated ? 25 : 0) +
        Math.min(25, confirmedPresences.length * 10) +
        Math.min(15, sourceHosts.length * 5) +
        (photo ? 5 : 0) +
        (bio ? 5 : 0) +
        (website || secondaryLinks.length ? 5 : 0)
      );
    }

    const authorCollectedAt = clean(author.updated_at || author.created_at);
    const presenceCollectedAt = clean(confirmedPresences[0]?.created_at || relatedPresences[0]?.created_at);
    const authorName = clean(author.pseudo || author.name || author.pen_name);
    const authorPhoto = clean(author.avatar_url || author.photo_url);
    const authorBio = clean(author.bio || author.biography);
    const authorLocation = clean(author.location || author.region);
    const authorWebsite = clean(author.website);
    const fieldProvenance = [
      {
        field: "identity.name",
        value: name,
        origin: authorName ? "admin" : knowledgeGraph.name ? "Auto-Matte" : "soumission",
        collectedAt: authorName ? authorCollectedAt : presenceCollectedAt,
        source: authorName ? "authors" : knowledgeGraph.name ? knowledgeGraph.entityKey : clean(relatedPresences[0]?.author_profile_url),
        proof: authorName ? clean(author.id) : clean(relatedPresences[0]?.id)
      },
      {
        field: "identity.aliases",
        value: aliases.join(", "),
        origin: author.pen_name ? "admin" : "Auto-Matte",
        collectedAt: author.pen_name ? authorCollectedAt : "",
        source: author.pen_name ? "authors" : knowledgeGraph.entityKey,
        proof: clean(author.id || knowledgeGraph.entityKey)
      },
      {
        field: "identity.type",
        value: profileType,
        origin: author.profile_type || author.participant_type ? "admin" : knowledgeGraph.type ? "Auto-Matte" : "soumission",
        collectedAt: author.profile_type || author.participant_type ? authorCollectedAt : presenceCollectedAt,
        source: author.profile_type || author.participant_type ? "authors" : knowledgeGraph.entityKey || "event_authors_presence",
        proof: clean(author.id || relatedPresences[0]?.id)
      },
      {
        field: "identity.photo",
        value: photo,
        origin: authorPhoto ? "admin" : knowledgeGraph.photo ? "Auto-Matte" : "soumission",
        collectedAt: authorPhoto ? authorCollectedAt : presenceCollectedAt,
        source: authorPhoto ? "authors" : knowledgeGraph.photo ? knowledgeGraph.entityKey : clean(confirmedPresences.find((row) => row.author_portrait_url)?.author_portrait_url),
        proof: clean(author.id || confirmedPresences.find((row) => row.author_portrait_url)?.id)
      },
      {
        field: "identity.location",
        value: location,
        origin: authorLocation ? "admin" : "Auto-Matte",
        collectedAt: authorLocation ? authorCollectedAt : "",
        source: authorLocation ? "authors" : knowledgeGraph.entityKey,
        proof: clean(author.id || knowledgeGraph.entityKey)
      },
      {
        field: "content.bio",
        value: bio,
        origin: authorBio ? "admin" : "Auto-Matte",
        collectedAt: authorBio ? authorCollectedAt : "",
        source: authorBio ? "authors" : knowledgeGraph.entityKey,
        proof: clean(author.id || knowledgeGraph.entityKey)
      },
      {
        field: "content.website",
        value: website,
        origin: authorWebsite ? "admin" : knowledgeGraph.publicLinks.includes(website) ? "Auto-Matte" : "soumission",
        collectedAt: authorWebsite ? authorCollectedAt : presenceCollectedAt,
        source: website,
        proof: clean(author.id || confirmedPresences.find((row) => row.author_profile_url || row.website)?.id)
      },
      {
        field: "content.links",
        value: secondaryLinks.join(", "),
        origin: author.shop_url ? "admin" : knowledgeGraph.publicLinks.some((url) => secondaryLinks.includes(url)) ? "Auto-Matte" : "soumission",
        collectedAt: author.shop_url ? authorCollectedAt : presenceCollectedAt,
        source: secondaryLinks.join(", "),
        proof: clean(author.id || confirmedPresences.find((row) => row.book_or_publisher_url)?.id)
      },
      {
        field: "content.latest_work",
        value: clean(author.latest_work || author.featured_work),
        origin: "admin",
        collectedAt: authorCollectedAt,
        source: "authors",
        proof: clean(author.id)
      }
    ];
    const provenance = buildAuthorProvenance(
      relatedPresences,
      knowledgeGraph,
      fieldProvenance
    );
    if (options.review?.updatedAt) {
      provenance.push({
        field: "review",
        origin: "admin-local",
        collectedAt: clean(options.review.updatedAt),
        source: "back-office",
        proof: options.review.ambiguous === true ? "ambiguïté signalée" : "rapprochement ignoré"
      });
    }

    const record = {
      id: clean(author.id || knowledgeGraph.entityKey || name),
      slug: clean(author.slug),
      identity: {
        name,
        aliases,
        type: profileType,
        typeLabel: PROFILE_LABELS[profileType],
        photo,
        location
      },
      content: {
        bio,
        website,
        links: secondaryLinks,
        latestWork: clean(author.latest_work || author.featured_work)
      },
      history: {
        events: allEvents,
        future: allEvents.filter((event) => event.period === "future"),
        past: allEvents.filter((event) => event.period === "past"),
        undated: allEvents.filter((event) => event.period === "undated")
      },
      quality: {
        confidence,
        confidenceLevel: confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low",
        confidenceReasons: knowledgeGraph.confidenceReasons,
        presenceCount: relatedPresences.length || allEvents.length,
        confirmedPresenceCount: confirmedPresences.length || allEvents.filter((event) => event.presenceStatus === "confirmed").length,
        independentSourceCount: sourceHosts.length,
        independentSources: sourceHosts,
        identityValidated,
        ambiguities,
        possibleSameAs: ambiguities.filter((item) => item.type === "possible_same_as")
      },
      provenance,
      source: {
        dedicalivres: Boolean(author.id || relatedPresences.length),
        autoMatte: Boolean(knowledgeGraph.entityKey),
        autoMattePublication: knowledgeGraph.publication,
        autoMattePublicRoute: knowledgeGraph.publicRoute,
        automaticMerge: false
      },
      operations: {
        relatedPresenceIds: relatedPresences.map((presence) => clean(presence?.id)).filter(Boolean),
        pendingPresenceCount: relatedPresences.filter((presence) => (
          presence?.validated !== true && presence?.rejected !== true
        )).length
      }
    };

    record.readiness = author_publication_readiness(record);
    return record;
  }

  function buildAuthorBackoffice(options = {}) {
    const authors = Array.isArray(options.authors) ? options.authors.filter((author) => !author?.merged_into) : [];
    const knowledgeByIdentity = options.knowledgeByIdentity || {};
    const reviewByIdentity = options.reviewByIdentity || {};
    const records = authors.map((author) => {
      const identity = clean(author.id || author.slug || normalize(author.pseudo));
      return buildAuthorRecord({
        author,
        authors,
        presences: options.presences,
        events: options.events,
        knowledgeGraphAuthor: knowledgeByIdentity[identity],
        review: reviewByIdentity[identity],
        now: options.now
      });
    });
    const counters = { total: records.length, READY: 0, NEEDS_REVIEW: 0, INCOMPLETE: 0, AMBIGUOUS: 0 };
    records.forEach((record) => {
      counters[record.readiness.status] += 1;
    });
    return { records, counters, publication: false, publicRoute: false, automaticMerge: false };
  }

  function filterAuthorRecords(records, filters = {}) {
    const search = normalize(filters.search);

    return (Array.isArray(records) ? records : []).filter((record) => {
      if (filters.status && filters.status !== "all" && record.readiness.status !== filters.status) return false;
      if (filters.confidence && filters.confidence !== "all" && record.quality.confidenceLevel !== filters.confidence) return false;
      if (filters.photo === "yes" && !record.identity.photo) return false;
      if (filters.photo === "no" && record.identity.photo) return false;
      if (filters.future === "yes" && !record.history.future.length) return false;
      if (filters.future === "no" && record.history.future.length) return false;
      if (filters.ambiguity === "yes" && !record.quality.ambiguities.length) return false;
      if (filters.ambiguity === "no" && record.quality.ambiguities.length) return false;
      if (search && !normalize([record.identity.name, ...record.identity.aliases].join(" ")).includes(search)) return false;
      return true;
    });
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderAuthorPublicTemplate(record = {}) {
    const identity = record.identity || {};
    const content = record.content || {};
    const future = record.history?.future || [];
    const past = record.history?.past || [];
    const links = unique([content.website, ...(content.links || [])]);
    const eventItems = (events) => events.map((event) => (
      `<li><strong>${escapeHtml(event.title || "Événement littéraire")}</strong>` +
      `<span>${escapeHtml([event.startDate, event.city].filter(Boolean).join(" · "))}</span></li>`
    )).join("");

    return `<article data-author-preview-template="v1" aria-label="Aperçu interne de la future fiche auteur">` +
      `<header>${identity.photo ? `<img src="${escapeHtml(identity.photo)}" alt="Portrait de ${escapeHtml(identity.name)}">` : ""}` +
      `<p>${escapeHtml(identity.typeLabel || "Auteur")}</p><h1>${escapeHtml(identity.name)}</h1>` +
      `${identity.location ? `<p>${escapeHtml(identity.location)}</p>` : ""}</header>` +
      `${content.bio ? `<section><h2>Présentation</h2><p>${escapeHtml(content.bio)}</p></section>` : ""}` +
      `${future.length ? `<section><h2>Événements à venir</h2><ul>${eventItems(future)}</ul></section>` : ""}` +
      `${past.length ? `<section><h2>Historique</h2><ul>${eventItems(past)}</ul></section>` : ""}` +
      `${links.length ? `<section><h2>Liens utiles</h2><ul>${links.map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`).join("")}</ul></section>` : ""}` +
      `</article>`;
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
    normalizeAuthorIdentity,
    scoreAuthorDuplicate,
    findProbableAuthorDuplicates,
    getRelatedPresences,
    splitPresenceEvents,
    evaluateAuthor,
    buildAuthorDraft,
    PUBLICATION_READINESS,
    MIN_READY_CONFIDENCE,
    normalizeKnowledgeGraphAuthorView,
    author_publication_readiness,
    buildAuthorRecord,
    buildAuthorBackoffice,
    filterAuthorRecords,
    renderAuthorPublicTemplate,
    getAuthorMatchKey
  };
})(typeof window !== "undefined" ? window : globalThis);
