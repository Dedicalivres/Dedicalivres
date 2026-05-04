/*
  DÉDICALIVRES — Fiche auteur publique
  Fichier : author.js
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const profile = document.getElementById("author-profile");
  const eventsGrid = document.getElementById("author-events-grid");

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.error("Configuration Supabase manquante pour author.js");
    return;
  }

  if (!profile || !eventsGrid) return;

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const params = new URLSearchParams(window.location.search);
  const slug = cleanText(params.get("slug"));

  init();

  async function init() {
    if (!slug) {
      renderNotFound();
      return;
    }

    const author = await loadAuthor(slug);

    if (!author) {
      renderNotFound();
      return;
    }

    renderAuthor(author);
    await loadAuthorEvents(author);
  }

  async function loadAuthor(slugValue) {
    const { data, error } = await client
      .from("authors")
      .select("*")
      .eq("slug", slugValue)
      .eq("validated", true)
      .maybeSingle();

    if (error) {
      console.error("Erreur chargement auteur :", error);
      return null;
    }

    return data;
  }

  async function loadAuthorEvents(author) {
    eventsGrid.innerHTML = `
      <article class="empty-state">
        <div class="loader"></div>
        <p>Chargement des événements de l’auteur…</p>
      </article>
    `;

    /*
      On charge les présences déclarées.
      La jointure events fonctionne si event_authors_presence.event_id référence events.id.
    */
    const { data, error } = await client
      .from("event_authors_presence")
      .select(`
        id,
        event_id,
        pseudo,
        website,
        author_id,
        author_slug,
        validated,
        created_at,
        events (
          id,
          title,
          city,
          region,
          start_date,
          end_date,
          type,
          price,
          description,
          image_url,
          website,
          validated,
          rejected,
          featured,
          verified
        )
      `)
      .eq("validated", true)
      .or(`author_slug.eq.${author.slug},author_id.eq.${author.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur chargement présences auteur :", error);
      eventsGrid.innerHTML = `
        <article class="empty-state">
          <p>Impossible de charger les événements de cet auteur.</p>
        </article>
      `;
      return;
    }

    const events = deduplicateEvents(
      (data || [])
        .map((row) => row.events)
        .filter((event) => event && event.validated === true && event.rejected !== true)
    );

    renderEvents(events);
  }

  function renderAuthor(author) {
    document.title = `${author.pseudo} — Auteur sur Dédicalivres`;

    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        `${author.pseudo} : événements, salons, festivals et dédicaces où l’auteur s’est déclaré présent sur Dédicalivres.`
      );

    profile.innerHTML = `
      <div class="author-profile-inner">
        ${
          author.avatar_url
            ? `<img class="author-avatar" src="${escapeAttribute(author.avatar_url)}" alt="${escapeAttribute(author.pseudo)}" />`
            : `<div class="author-avatar-placeholder">✍️</div>`
        }

        <div class="author-profile-content">
          <span class="badge badge-author-present">Auteur présent</span>

          <h1 class="author-title">${escapeHtml(author.pseudo)}</h1>

          ${
            author.bio
              ? `<p class="author-bio">${escapeHtml(author.bio).replace(/\n/g, "<br>")}</p>`
              : `<p class="author-bio">Cet auteur a déclaré sa présence à un ou plusieurs événements référencés sur Dédicalivres.</p>`
          }

          <div class="author-actions">
            ${
              author.website
                ? `<a class="btn-primary" href="${escapeAttribute(author.website)}" target="_blank" rel="noopener noreferrer">Site de l’auteur</a>`
                : ""
            }

            <a class="btn-secondary" href="index.html#agenda">Voir l’agenda</a>
          </div>

          <p class="author-note">
            Les présences affichées ici sont déclarées de manière participative via Dédicalivres.
            Pour une information officielle à jour, notamment en cas d’annulation ou de modification,
            consultez toujours le site de l’événement.
          </p>
        </div>
      </div>
    `;
  }

  function renderEvents(events) {
    if (!events.length) {
      eventsGrid.innerHTML = `
        <article class="empty-state">
          <p>Aucune présence déclarée pour le moment.</p>
        </article>
      `;
      return;
    }

    eventsGrid.innerHTML = events
      .map((event) => {
        const imageUrl = resolveImageUrl(event.image_url);

        return `
          <article class="event-card ${event.featured ? "event-card-featured" : ""}" data-event-id="${escapeAttribute(event.id)}">
            ${event.featured ? `<div class="featured-ribbon">Mis en avant</div>` : ""}

            ${
              imageUrl
                ? `<img class="card-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(event.title || "Événement")}" />`
                : `<div class="card-image"></div>`
            }

            <div class="card-body">
              <div class="card-tags">
                ${event.type ? `<span class="badge">${escapeHtml(event.type)}</span>` : ""}
                ${event.price ? `<span class="badge badge-price">${escapeHtml(event.price)}</span>` : ""}
                ${event.verified ? `<span class="badge badge-verified">Vérifié</span>` : ""}
              </div>

              <h3 class="card-title">${escapeHtml(event.title || "Sans titre")}</h3>

              <div class="card-meta">
                ${
                  event.start_date
                    ? `<span>📅 ${formatDateRange(event.start_date, event.end_date)}</span>`
                    : ""
                }
                <span>📍 ${escapeHtml([event.city, event.region].filter(Boolean).join(", ")) || "Lieu non précisé"}</span>
              </div>

              ${
                event.description
                  ? `<p class="card-description">${escapeHtml(event.description)}</p>`
                  : ""
              }

              <div class="card-footer">
                <a class="card-link" href="event.html?id=${encodeURIComponent(event.id)}">Voir le détail</a>

                ${
                  event.website
                    ? `<a class="card-link" href="${escapeAttribute(event.website)}" target="_blank" rel="noopener noreferrer">Site officiel</a>`
                    : ""
                }
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderNotFound() {
    document.title = "Auteur introuvable — Dédicalivres";

    profile.innerHTML = `
      <div class="empty-state">
        <p>Auteur introuvable ou non validé.</p>
      </div>
    `;

    eventsGrid.innerHTML = "";
  }

  function deduplicateEvents(events) {
    const map = new Map();

    events.forEach((event) => {
      if (!event || !event.id) return;
      map.set(String(event.id), event);
    });

    return Array.from(map.values()).sort((a, b) => {
      const dateA = a.start_date ? new Date(a.start_date).getTime() : 9999999999999;
      const dateB = b.start_date ? new Date(b.start_date).getTime() : 9999999999999;
      return dateA - dateB;
    });
  }

  function resolveImageUrl(path) {
    if (!path) return "";

    return /^https?:\/\//i.test(path)
      ? path
      : `${config.assetsBaseUrl || ""}${path}`;
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = endDate && endDate !== startDate ? formatDate(endDate) : "";

    return end ? `${start} → ${end}` : start;
  }

  function formatDate(value) {
    if (!value) return "";

    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(value));
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
