/*
  DÉDICALIVRES — Fiche auteur publique + aperçu interne admin
  Fichier : author.js

  Mode public :
  - exige une fiche explicitement publiée ;
  - aucun fallback depuis les présences ;
  - indexation activée uniquement après validation de l’état publié.

  Mode aperçu admin :
  - exige preview=admin ;
  - exige une session authentifiée ;
  - reste noindex.
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const geo = window.DEDICALIVRES_GEO;
  const engine = window.DEDICALIVRES_AUTHOR_BACKOFFICE;
  const profile = document.getElementById("author-profile");
  const upcomingGrid = document.getElementById("author-events-upcoming");
  const pastGrid = document.getElementById("author-events-past");
  const upcomingSection = document.getElementById("author-upcoming-section");
  const pastSection = document.getElementById("author-past-section");
  const travelSection = document.getElementById("author-travel-section");
  const travelMap = document.getElementById("author-travel-map");
  const travelStats = document.getElementById("author-travel-stats");
  const robotsMeta = document.getElementById("author-robots");
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const canonicalLink = document.getElementById("author-canonical");
  const ogTitleMeta = document.getElementById("author-og-title");
  const ogDescriptionMeta = document.getElementById("author-og-description");
  const ogUrlMeta = document.getElementById("author-og-url");
  const ogImageMeta = document.getElementById("author-og-image");
  const twitterTitleMeta = document.getElementById("author-twitter-title");
  const twitterDescriptionMeta = document.getElementById("author-twitter-description");
  const twitterImageMeta = document.getElementById("author-twitter-image");
  const contextLink = document.getElementById("author-context-link");
  const backLink = document.getElementById("author-back-link");

  if (!profile || !upcomingGrid || !pastGrid) return;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase || !engine) {
    renderLocked("Aperçu interne indisponible.");
    return;
  }

  const client =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = client;
  }

  const params = new URLSearchParams(window.location.search);
  const slug = cleanText(params.get("slug"));
  const isAdminPreview = params.get("preview") === "admin";

  init();

  async function init() {
    lockIndexing();

    if (!slug) {
      renderNotFound();
      return;
    }

    if (isAdminPreview) {
      configureNavigation(true);

      const { data, error } = await client.auth.getSession();

      if (error || !data?.session) {
        renderLocked("Connexion admin requise pour cet aperçu.");
        return;
      }

      const author = await loadAuthor(slug);
      const presences = await loadAuthorPresences(slug, author);
      const fallbackAuthor =
        author || buildAuthorFromPresence(slug, presences);

      if (!fallbackAuthor) {
        renderNotFound();
        return;
      }

      const duplicate = hasProbableDuplicate(presences);
      const draft = engine.buildAuthorDraft({
        author: fallbackAuthor,
        presences,
        duplicate
      });

      renderAuthor(draft, { adminPreview: true });
      renderEvents(
        draft.upcomingEvents,
        upcomingGrid,
        upcomingSection,
        "Aucun événement à venir indiqué."
      );
      renderEvents(
        draft.pastEvents,
        pastGrid,
        pastSection,
        "Aucun événement passé indiqué."
      );

      // V11.59 — l’aperçu interne doit refléter la future page publique.
      // La carte reste noindex et réservée à la session admin.
      renderAuthorTravelMap([
        ...draft.upcomingEvents,
        ...draft.pastEvents
      ]);

      return;
    }

    configureNavigation(false);

    if (
      config.authorPublicPublishingEnabled !== true
    ) {
      renderPublicNotFound();
      return;
    }

    const author = await loadAuthor(slug);

    const isPubliclyAvailable =
      author &&
      author.published === true &&
      author.validated === true &&
      author.publication_ready === true &&
      !author.merged_into;

    if (!isPubliclyAvailable) {
      renderPublicNotFound();
      return;
    }

    const presences = await loadAuthorPresences(slug, author);
    const duplicate = hasProbableDuplicate(presences);

    const draft = engine.buildAuthorDraft({
      author,
      presences,
      duplicate
    });

    renderAuthor(draft, { adminPreview: false });
    renderEvents(
      draft.upcomingEvents,
      upcomingGrid,
      upcomingSection,
      "Aucun événement à venir indiqué."
    );
    renderEvents(
      draft.pastEvents,
      pastGrid,
      pastSection,
      "Aucun événement passé indiqué."
    );

    renderAuthorTravelMap([
      ...draft.upcomingEvents,
      ...draft.pastEvents
    ]);

    configurePublicMetadata(draft);
    injectAuthorSchema(draft);
    unlockPublicIndexing(draft);
  }

  async function loadAuthor(slugValue) {
    let response = await client
      .from("authors")
      .select("id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at, merged_into, merged_at, publication_ready, published, published_at")
      .eq("slug", slugValue)
      .maybeSingle();

    if (response.error && isMissingColumnError(response.error)) {
      response = await client
        .from("authors")
        .select("id, pseudo, slug, website, validated, created_at")
        .eq("slug", slugValue)
        .maybeSingle();
    }

    if (response.error) {
      console.warn("Aperçu auteur : table authors indisponible", response.error);
      return null;
    }

    return response.data || null;
  }

  async function loadAuthorPresences(slugValue, author) {
    const selectExtended = [
      "id", "event_id", "pseudo", "website", "author_id", "author_slug",
      "author_identity_key", "author_profile_url", "author_profile_url_type",
      "book_or_publisher_url", "book_or_publisher_url_type", "publisher_name",
      "author_portrait_url", "participant_type", "organization_name",
      "presence_verified", "validated", "rejected", "created_at",
      "events(id, title, city, country_code, region, start_date, end_date, type, price, description, image_url, website, validated, rejected, featured, verified, lat, lng)"
    ].join(", ");

    let query = client
      .from("event_authors_presence")
      .select(selectExtended)
      .order("created_at", { ascending: false })
      .limit(300);

    const filters = [`author_slug.eq.${slugValue}`, `author_identity_key.eq.${slugValue}`];
    if (author?.id) filters.push(`author_id.eq.${author.id}`);
    query = query.or(filters.join(","));
    let response = await query;

    if (response.error && isMissingColumnError(response.error)) {
      response = await client
        .from("event_authors_presence")
        .select("id, event_id, pseudo, website, validated, rejected, created_at, events(id, title, city, region, start_date, end_date, type, image_url, website, validated, rejected)")
        .order("created_at", { ascending: false })
        .limit(300);

      if (!response.error) {
        response.data = (response.data || []).filter((row) => slugify(row.pseudo) === slugValue);
      }
    }

    if (response.error) {
      console.warn("Aperçu auteur : présences indisponibles", response.error);
      return [];
    }

    return Array.isArray(response.data) ? response.data : [];
  }

  function buildAuthorFromPresence(slugValue, presences) {
    const row = presences.find((item) => item?.pseudo || item?.organization_name);
    if (!row) return null;
    return {
      id: row.author_id || null,
      pseudo: engine.getPresenceName(row),
      slug: row.author_slug || row.author_identity_key || slugValue,
      website: row.author_profile_url || row.website || null,
      bio: null,
      avatar_url: row.author_portrait_url || null,
      // V11.59 — un lieu d’événement n’est pas une localisation auteur.
      location: null,
      shop_url: row.book_or_publisher_url || null,
      profile_type: ["author", "artist_author", "hybrid"].includes(row.participant_type)
        ? row.participant_type
        : "author",
      participant_type: row.participant_type || "author",
      validated: row.validated === true,
      created_at: row.created_at
    };
  }

  function hasProbableDuplicate(presences) {
    const detector = window.DEDICALIVRES_DUPLICATES;
    return typeof detector?.groupPresences === "function" && detector.groupPresences(presences).length > 0;
  }

  function renderAuthor(draft, { adminPreview = false } = {}) {
    document.title = adminPreview
      ? `Aperçu interne — ${draft.identity || "Auteur"} — Dédicalivres`
      : `${draft.identity || "Auteur"} — Dédicalivres`;

    const avatarUrl = resolveImageUrl(draft.photo);
    const bioParts = splitAuthorBio(draft.bio);
    const bioLead = bioParts[0] || "";
    const bioRest = bioParts.slice(1).join("\n\n");
    const initials = getAuthorInitials(draft.identity);

    profile.innerHTML = `
      ${
        adminPreview
          ? `<div class="author-preview-notice" role="status">
               <strong>Aperçu interne — non publié</strong>
               <span>Cette vue reste réservée à l’administration et non indexée.</span>
             </div>`
          : ""
      }

      <div class="author-profile-inner">

        <div class="author-visual">
          ${
            avatarUrl
              ? `<img class="author-avatar" src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(draft.identity)}" />`
              : `<div class="author-avatar-placeholder">${escapeHtml(initials)}</div>`
          }

          <div class="author-visual-wash" aria-hidden="true"></div>
          <div class="author-botanical author-botanical-left" aria-hidden="true"></div>

          <div class="author-mobile-overlay">
            <span class="author-mobile-type">${escapeHtml(draft.profileLabel)}</span>
            <h1>${escapeHtml(draft.identity || "Identité à compléter")}</h1>
            ${
              draft.location
                ? `<p>📍 ${escapeHtml(draft.location)}</p>`
                : ""
            }
          </div>
        </div>

        <div class="author-profile-content">
          <div class="author-botanical author-botanical-right" aria-hidden="true"></div>

          <div class="author-editorial-heading">
            <p class="author-kicker">${escapeHtml(draft.profileLabel)}</p>

            <h1 class="author-title">
              ${escapeHtml(draft.identity || "Identité à compléter")}
            </h1>

            ${
              draft.location
                ? `<p class="author-location">📍 ${escapeHtml(draft.location)}</p>`
                : ""
            }
          </div>

          ${
            bioLead
              ? `<div class="author-lead">
                   <span class="author-quote-mark" aria-hidden="true">“</span>
                   <p>${escapeHtml(bioLead).replace(/\n/g, "<br>")}</p>
                 </div>`
              : ""
          }

          <div class="author-bio">
            ${
              bioRest
                ? escapeHtml(bioRest).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")
                : bioLead
                  ? ""
                  : "Biographie à enrichir."
            }
          </div>

          <div class="author-actions">
            ${
              draft.primaryLink
                ? `<a class="btn-primary author-action-primary" href="${escapeAttribute(draft.primaryLink)}" target="_blank" rel="noopener noreferrer">
                     <span aria-hidden="true">♙</span>
                     Vitrine / profil
                   </a>`
                : ""
            }

            ${
              draft.secondaryLink
                ? `<a class="btn-secondary" href="${escapeAttribute(draft.secondaryLink)}" target="_blank" rel="noopener noreferrer">
                     <span aria-hidden="true">▢</span>
                     Boutique / précommande
                   </a>`
                : ""
            }

            ${
              adminPreview
                ? `<a class="btn-secondary" href="admin.html">Retour à l’administration</a>`
                : `<a class="btn-secondary" href="index.html#agenda">
                     <span aria-hidden="true">▣</span>
                     Voir l’agenda
                   </a>`
            }
          </div>

          <p class="author-note">
            <span class="author-note-icon" aria-hidden="true">♢</span>
            <span>
              Historique des présences indiquées sur Dédicalivres, sous contrôle de modération.
              Cette liste n’est pas une liste exhaustive des participants officiels.
            </span>
          </p>

          ${
            adminPreview
              ? `<p class="author-preview-missing">
                   <strong>AUTEUR_PRÊT : ${draft.ready ? "oui" : "non"}</strong>
                   ${draft.missingLabels.length ? ` · Manque : ${escapeHtml(draft.missingLabels.join(" · "))}` : ""}
                 </p>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function splitAuthorBio(value) {
    const clean = cleanText(value || "");
    if (!clean) return [];

    const paragraphs = clean
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (paragraphs.length > 1) return paragraphs;

    const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    const normalized = sentences
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (normalized.length <= 2) return [clean];

    const lead = normalized.slice(0, 1).join(" ");
    const rest = normalized.slice(1).join(" ");

    return [lead, rest];
  }

  function renderAuthorTravelMap(events) {
    if (!travelSection || !travelMap || !window.L) return;

    const mappedEvents = (Array.isArray(events) ? events : [])
      .filter((event) =>
        Number.isFinite(Number(event?.lat)) &&
        Number.isFinite(Number(event?.lng))
      );

    if (!mappedEvents.length) {
      travelSection.hidden = true;
      return;
    }

    travelSection.hidden = false;
    travelMap.innerHTML = "";

    const map = L.map(travelMap, {
      scrollWheelZoom: false,
      zoomControl: true
    }).setView([46.7, 2.5], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const bounds = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let upcomingCount = 0;
    let pastCount = 0;
    const cityKeys = new Set();

    mappedEvents.forEach((event) => {
      const lat = Number(event.lat);
      const lng = Number(event.lng);
      const referenceDate = new Date(event.end_date || event.start_date || "");
      const isPast =
        Number.isFinite(referenceDate.getTime()) &&
        referenceDate < today;

      if (isPast) pastCount += 1;
      else upcomingCount += 1;

      cityKeys.add(
        [
          cleanText(event.city || ""),
          cleanText(event.country_code || "")
        ].join("|")
      );

      const marker = L.circleMarker([lat, lng], {
        radius: isPast ? 7 : 9,
        color: isPast ? "#b93646" : "#16803c",
        fillColor: isPast ? "#d84b5b" : "#20a05a",
        fillOpacity: .88,
        weight: 3
      }).addTo(map);

      const statusLabel = isPast ? "Événement terminé" : "Événement à venir";
      const dateLabel = event.start_date
        ? formatDateRange(event.start_date, event.end_date)
        : "Date non précisée";

      marker.bindPopup(`
        <div class="author-map-popup">
          <strong>${escapeHtml(event.title || "Événement littéraire")}</strong>
          <span>${escapeHtml(statusLabel)}</span>
          <span>📅 ${escapeHtml(dateLabel)}</span>
          <span>📍 ${escapeHtml(formatEventPlace(event))}</span>
          <a href="event.html?id=${encodeURIComponent(event.id)}">Voir l’événement</a>
        </div>
      `);

      bounds.push([lat, lng]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, {
        padding: [42, 42],
        maxZoom: 7
      });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 7);
    }

    if (travelStats) {
      travelStats.innerHTML = `
        <div class="author-travel-stat">
          <strong>${cityKeys.size}</strong>
          <span>ville${cityKeys.size > 1 ? "s" : ""}</span>
        </div>

        <div class="author-travel-stat">
          <strong>${mappedEvents.length}</strong>
          <span>événement${mappedEvents.length > 1 ? "s" : ""}</span>
        </div>

        <div class="author-travel-stat">
          <strong>${upcomingCount}</strong>
          <span>à venir</span>
        </div>
      `;
    }

    setTimeout(() => map.invalidateSize(), 80);
  }

  function renderEvents(events, grid, section, emptyMessage) {
    if (!events.length) {
      section.hidden = false;
      grid.innerHTML = `<article class="empty-state"><p>${escapeHtml(emptyMessage)}</p></article>`;
      return;
    }

    section.hidden = false;
    grid.innerHTML = events.map(renderEventCard).join("");
  }

  function renderEventCard(event) {
    const imageUrl = resolveImageUrl(event.image_url);
    return `
      <article class="event-card ${event.featured ? "event-card-featured" : ""}" data-event-id="${escapeAttribute(event.id)}">
        ${imageUrl ? `<img class="card-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(event.title || "Événement")}" />` : `<div class="card-image"></div>`}
        <div class="card-body">
          <div class="card-tags">
            ${event.type ? `<span class="badge">${escapeHtml(event.type)}</span>` : ""}
            ${event.verified ? `<span class="badge badge-verified">Vérifié</span>` : ""}
          </div>
          <h3 class="card-title">${escapeHtml(event.title || "Sans titre")}</h3>
          <div class="card-meta">
            ${event.start_date ? `<span>📅 ${formatDateRange(event.start_date, event.end_date)}</span>` : ""}
            <span>📍 ${escapeHtml(formatEventPlace(event)) || "Lieu non précisé"}</span>
          </div>
          <div class="card-footer">
            <a class="card-link" href="event.html?id=${encodeURIComponent(event.id)}">Voir le détail</a>
          </div>
        </div>
      </article>
    `;
  }

  function configureNavigation(adminPreview) {
    if (contextLink) {
      contextLink.href = adminPreview ? "admin.html" : "index.html";
      contextLink.innerHTML = adminPreview
        ? "<span>← Administration</span>"
        : "<span>← Dédicalivres</span>";
    }

    if (backLink) {
      backLink.href = adminPreview ? "admin.html" : "index.html";
      backLink.textContent = adminPreview
        ? "← Retour à l’administration"
        : "← Retour à Dédicalivres";
    }
  }

  function lockIndexing() {
    if (robotsMeta) {
      robotsMeta.setAttribute(
        "content",
        "noindex,nofollow,noarchive,nosnippet"
      );
    }
  }

  function configurePublicMetadata(draft) {
    const identity = cleanText(draft?.identity || "Auteur");
    const description =
      `Découvrez ${identity}, sa fiche et ses présences littéraires sur Dédicalivres.`;
    const publicUrl =
      `${window.location.origin}${window.location.pathname}?slug=${encodeURIComponent(slug)}`;
    const imageUrl =
      resolveImageUrl(draft?.photo) ||
      `${window.location.origin}/logo.png`;
    const title = `${identity} — Dédicalivres`;

    if (canonicalLink) canonicalLink.href = publicUrl;
    if (ogTitleMeta) ogTitleMeta.setAttribute("content", title);
    if (ogDescriptionMeta) ogDescriptionMeta.setAttribute("content", description);
    if (ogUrlMeta) ogUrlMeta.setAttribute("content", publicUrl);
    if (ogImageMeta) ogImageMeta.setAttribute("content", imageUrl);
    if (twitterTitleMeta) twitterTitleMeta.setAttribute("content", title);
    if (twitterDescriptionMeta) twitterDescriptionMeta.setAttribute("content", description);
    if (twitterImageMeta) twitterImageMeta.setAttribute("content", imageUrl);
  }

  function injectAuthorSchema(draft) {
    const previous = document.getElementById("author-jsonld");
    if (previous) previous.remove();

    const publicUrl =
      `${window.location.origin}${window.location.pathname}?slug=${encodeURIComponent(slug)}`;

    const schema = {
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": `${publicUrl}#person`,
      "name": cleanText(draft?.identity || ""),
      "url": publicUrl
    };

    const imageUrl = resolveImageUrl(draft?.photo);
    if (imageUrl) schema.image = imageUrl;
    if (draft?.location) schema.homeLocation = cleanText(draft.location);

    const sameAs = [
      draft?.primaryLink || "",
      draft?.secondaryLink || ""
    ].filter(isValidPublicUrl);

    if (sameAs.length) {
      schema.sameAs = [...new Set(sameAs)];
    }

    if (!schema.name) return;

    const script = document.createElement("script");
    script.id = "author-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
  }

  function isValidPublicUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function unlockPublicIndexing(draft) {
    if (robotsMeta) {
      robotsMeta.setAttribute("content", "index,follow");
    }

    if (descriptionMeta) {
      const identity = cleanText(draft?.identity || "Auteur");
      descriptionMeta.setAttribute(
        "content",
        `Découvrez ${identity}, sa fiche et ses présences littéraires sur Dédicalivres.`
      );
    }
  }

  function renderPublicNotFound() {
    lockIndexing();
    document.title = "Fiche auteur indisponible — Dédicalivres";

    profile.innerHTML = `
      <div class="empty-state">
        <h1>Fiche auteur indisponible</h1>
        <p>Cette fiche n’est pas publiée ou n’est plus disponible.</p>
        <a class="btn-secondary" href="index.html">Retour à Dédicalivres</a>
      </div>
    `;

    upcomingSection.hidden = true;
    pastSection.hidden = true;
  }

  function renderLocked(message) {
    document.title = "Fiche auteur non publiée — Dédicalivres";
    profile.innerHTML = `<div class="empty-state"><h1>Fiche auteur non publiée</h1><p>${escapeHtml(message)}</p><a class="btn-secondary" href="admin.html">Accès administration</a></div>`;
    upcomingSection.hidden = true;
    pastSection.hidden = true;
  }

  function renderNotFound() {
    document.title = "Aperçu auteur introuvable — Dédicalivres";
    profile.innerHTML = `<div class="empty-state"><p>Aucune fiche ou présence ne correspond à cet auteur.</p></div>`;
    upcomingSection.hidden = true;
    pastSection.hidden = true;
  }

  function resolveImageUrl(path) {
    if (!path) return "";
    return /^https?:\/\//i.test(path) ? path : `${config.assetsBaseUrl || ""}${path}`;
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = endDate && endDate !== startDate ? formatDate(endDate) : "";
    return end ? `${start} → ${end}` : start;
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
  }

  function formatEventPlace(event) {
    if (geo) return geo.formatPlace(event);
    return [event?.city, event?.region].filter(Boolean).join(", ");
  }

  function slugify(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getAuthorInitials(value) {
    const initials = cleanText(value).split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    return initials || "A";
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || error?.details || "").toLowerCase();
    return ["42703", "PGRST204"].includes(code) || (message.includes("column") && (message.includes("does not exist") || message.includes("schema cache")));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
