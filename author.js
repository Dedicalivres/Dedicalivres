/*
  DÉDICALIVRES — Aperçu interne d’une fiche auteur
  Fichier : author.js
  Cette page reste noindex et exige une session admin + preview=admin.
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
    if (!isAdminPreview) {
      renderLocked("Cette fiche est préparée en back-office et n’est pas publiée.");
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (error || !data?.session) {
      renderLocked("Connexion admin requise pour cet aperçu.");
      return;
    }

    if (!slug) {
      renderNotFound();
      return;
    }

    const author = await loadAuthor(slug);
    const presences = await loadAuthorPresences(slug, author);
    const fallbackAuthor = author || buildAuthorFromPresence(slug, presences);

    if (!fallbackAuthor) {
      renderNotFound();
      return;
    }

    const duplicate = hasProbableDuplicate(presences);
    const draft = engine.buildAuthorDraft({ author: fallbackAuthor, presences, duplicate });
    renderAuthor(draft);
    renderEvents(draft.upcomingEvents, upcomingGrid, upcomingSection, "Aucun événement à venir indiqué.");
    renderEvents(draft.pastEvents, pastGrid, pastSection, "Aucun événement passé indiqué.");
  }

  async function loadAuthor(slugValue) {
    let response = await client
      .from("authors")
      .select("id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at")
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
      "events(id, title, city, country_code, region, start_date, end_date, type, price, description, image_url, website, validated, rejected, featured, verified)"
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
      location: row?.events?.region || row?.events?.city || null,
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

  function renderAuthor(draft) {
    document.title = `Aperçu interne — ${draft.identity || "Auteur"} — Dédicalivres`;
    const avatarUrl = resolveImageUrl(draft.photo);

    profile.innerHTML = `
      <div class="author-preview-notice" role="status">
        <strong>Aperçu interne — non publié</strong>
        <span>Cette fiche n’est ni indexée ni liée depuis le site public.</span>
      </div>
      <div class="author-profile-inner">
        ${
          avatarUrl
            ? `<img class="author-avatar" src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(draft.identity)}" />`
            : `<div class="author-avatar-placeholder">${escapeHtml(getAuthorInitials(draft.identity))}</div>`
        }

        <div class="author-profile-content">
          <div class="author-preview-badges">
            <span class="badge">${escapeHtml(draft.profileLabel)}</span>
            <span class="badge author-readiness-${escapeAttribute(draft.status)}">${escapeHtml(draft.statusLabel)}</span>
            ${draft.publishableLater ? `<span class="badge">Publiable plus tard</span>` : ""}
          </div>

          <h1 class="author-title">${escapeHtml(draft.identity || "Identité à compléter")}</h1>
          ${draft.location ? `<p class="author-location">📍 ${escapeHtml(draft.location)}</p>` : ""}
          <p class="author-bio">${draft.bio ? escapeHtml(draft.bio).replace(/\n/g, "<br>") : "Biographie à enrichir."}</p>

          <div class="author-actions">
            ${draft.primaryLink ? `<a class="btn-primary" href="${escapeAttribute(draft.primaryLink)}" target="_blank" rel="noopener noreferrer">Vitrine / profil</a>` : ""}
            ${draft.secondaryLink ? `<a class="btn-secondary" href="${escapeAttribute(draft.secondaryLink)}" target="_blank" rel="noopener noreferrer">Boutique / précommande</a>` : ""}
            <a class="btn-secondary" href="admin.html">Retour à l’administration</a>
          </div>

          <p class="author-note">
            Historique des présences indiquées sur Dédicalivres, sous contrôle de modération.
            Cette liste n’est pas une liste exhaustive des participants officiels.
          </p>
          <p class="author-preview-missing">
            <strong>AUTEUR_PRÊT : ${draft.ready ? "oui" : "non"}</strong>
            ${draft.missingLabels.length ? ` · Manque : ${escapeHtml(draft.missingLabels.join(" · "))}` : ""}
          </p>
        </div>
      </div>
    `;
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
