const SITE_URL = "https://dedicalivres.fr";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const escapeHtml = (value) => clean(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const validPublicUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(String(value || "")).protocol);
  } catch {
    return false;
  }
};

export function canonicalUrl(slug) {
  return `${SITE_URL}/auteurs/${encodeURIComponent(clean(slug))}/`;
}

export function seoDescription(author, eventCount = 0) {
  const name = clean(author?.pseudo || "Auteur");
  const bio = clean(author?.bio);
  if (bio) {
    const prefix = `${name} — `;
    const limit = Math.max(40, 160 - prefix.length);
    return `${prefix}${bio.length > limit ? `${bio.slice(0, limit - 1).trim()}…` : bio}`;
  }
  const location = clean(author?.location);
  return `Fiche de ${name} sur Dédicalivres${location ? ` — localisation : ${location}` : ""}${eventCount ? `, avec ${eventCount} événement${eventCount > 1 ? "s" : ""} littéraire${eventCount > 1 ? "s" : ""} associé${eventCount > 1 ? "s" : ""}` : ""}.`;
}

export function classifyEvents(events, today) {
  const day = clean(today).slice(0, 10);
  const groups = { ongoing: [], upcoming: [], past: [] };
  const unique = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.id && event.validated === true && event.rejected !== true) unique.set(String(event.id), event);
  }
  for (const event of unique.values()) {
    const start = clean(event.start_date).slice(0, 10);
    const end = clean(event.end_date || event.start_date).slice(0, 10);
    if (end && end < day) groups.past.push(event);
    else if (start && start <= day) groups.ongoing.push(event);
    else groups.upcoming.push(event);
  }
  groups.ongoing.sort((a, b) => clean(a.start_date).localeCompare(clean(b.start_date)));
  groups.upcoming.sort((a, b) => clean(a.start_date || "9999").localeCompare(clean(b.start_date || "9999")));
  groups.past.sort((a, b) => clean(b.start_date).localeCompare(clean(a.start_date)));
  return groups;
}

function formatDate(value) {
  if (!value) return "Date à confirmer";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Date à confirmer";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateRange(event) {
  const start = formatDate(event.start_date);
  const end = clean(event.end_date);
  return end && end !== clean(event.start_date) ? `${start} – ${formatDate(end)}` : start;
}

function countryName(code) {
  return { FR: "France", BE: "Belgique", CH: "Suisse", LU: "Luxembourg", MC: "Monaco" }[clean(code).toUpperCase()] || clean(code);
}

function renderEvent(event) {
  const place = [event.city, event.region, countryName(event.country_code)].map(clean).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
  return `<article class="event-card" data-event-id="${escapeHtml(event.id)}">
    ${event.image_url ? `<img class="card-image" src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.title || "Événement")}" />` : `<div class="card-image"></div>`}
    <div class="card-body">
      ${event.type ? `<div class="card-tags"><span class="badge">${escapeHtml(event.type)}</span></div>` : ""}
      <h3 class="card-title">${escapeHtml(event.title || "Sans titre")}</h3>
      <div class="card-meta"><span>📅 ${escapeHtml(formatDateRange(event))}</span><span>📍 ${escapeHtml(place || "Lieu non précisé")}</span></div>
      <div class="card-footer"><a class="card-link" href="/event.html?id=${encodeURIComponent(event.id)}">Voir le détail</a></div>
    </div>
  </article>`;
}

function renderEventSection(id, heading, label, events) {
  return `<section id="author-${id}-section" class="section">
    <h2>${heading}</h2>
    <p class="author-history-label">${label}</p>
    <div id="author-events-${id}" class="events-grid">${events.length ? events.map(renderEvent).join("\n") : `<article class="empty-state"><p>Aucun événement ${id === "ongoing" ? "en cours" : id === "upcoming" ? "à venir" : "passé"} indiqué.</p></article>`}</div>
  </section>`;
}

export function renderAuthorStaticPage({ baseHtml, author, events, generatedAt }) {
  const name = clean(author.pseudo || "Auteur");
  const slug = clean(author.slug);
  const canonical = canonicalUrl(slug);
  const groups = classifyEvents(events, generatedAt);
  const eventCount = groups.ongoing.length + groups.upcoming.length + groups.past.length;
  const description = seoDescription(author, eventCount);
  const title = `${name} — dédicaces, salons et rencontres | Dédicalivres`;
  const image = validPublicUrl(author.avatar_url) ? author.avatar_url : `${SITE_URL}/logo.png`;
  const sameAs = [...new Set([author.website, author.shop_url].filter(validPublicUrl))];
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${canonical}#person`,
    name,
    url: canonical,
    description
  };
  if (image) person.image = image;
  if (clean(author.location)) person.homeLocation = clean(author.location);
  if (sameAs.length) person.sameAs = sameAs;
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Auteurs", item: `${SITE_URL}/auteurs-independants` },
      { "@type": "ListItem", position: 3, name, item: canonical }
    ]
  };
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
  const profileLabel = {
    author: "Auteur",
    artist_author: "Artiste-auteur",
    hybrid: "Profil hybride"
  }[clean(author.profile_type)] || "Auteur";
  const main = `<main class="container section" data-generated-author-page="true" data-author-slug="${escapeHtml(slug)}">
    <nav class="detail-back-link" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span aria-hidden="true"> › </span><a href="/auteurs-independants">Auteurs</a><span aria-hidden="true"> › </span><span>${escapeHtml(name)}</span></nav>
    <article class="author-profile"><div class="author-profile-inner">
      <div class="author-visual">${author.avatar_url ? `<img class="author-avatar" src="${escapeHtml(author.avatar_url)}" alt="${escapeHtml(name)}" />` : `<div class="author-avatar-placeholder">${escapeHtml(initials)}</div>`}<div class="author-visual-wash" aria-hidden="true"></div></div>
      <div class="author-profile-content"><div class="author-editorial-heading"><p class="author-kicker">${escapeHtml(profileLabel)}</p><h1 class="author-title">${escapeHtml(name)}</h1>${author.location ? `<p class="author-location">📍 ${escapeHtml(author.location)}</p>` : ""}</div>
      <div class="author-bio">${author.bio ? `<p>${escapeHtml(author.bio)}</p>` : `<p>Biographie à enrichir.</p>`}</div>
      <div class="author-actions">${sameAs.map((url, index) => `<a class="${index ? "btn-secondary" : "btn-primary author-action-primary"}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${index ? "Boutique / précommande" : "Vitrine / profil"}</a>`).join("")}<a class="btn-secondary" href="/#agenda">Voir l’agenda</a></div>
      <p class="author-note"><span>Historique des présences indiquées sur Dédicalivres, sous contrôle de modération.</span></p></div>
    </div></article>
    ${renderEventSection("ongoing", "Événements en cours", "Présences en cours indiquées sur Dédicalivres", groups.ongoing)}
    ${renderEventSection("upcoming", "Événements à venir", "Présences à venir indiquées sur Dédicalivres", groups.upcoming)}
    ${renderEventSection("past", "Événements passés", "Historique des présences indiquées sur Dédicalivres", groups.past)}
  </main>`;

  let html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<meta id="author-robots"[^>]*>/, `<meta name="robots" content="index,follow" />`)
    .replace(/<link id="author-canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta id="author-og-title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta id="author-og-description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta id="author-og-url"[^>]*>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta id="author-og-image"[^>]*>/, `<meta property="og:image" content="${escapeHtml(image)}" />`)
    .replace(/<meta id="author-twitter-title"[^>]*>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta id="author-twitter-description"[^>]*>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta id="author-twitter-image"[^>]*>/, `<meta name="twitter:image" content="${escapeHtml(image)}" />`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(person)}</script>\n<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>\n</head>`)
    .replace(/<main[\s\S]*?<\/main>/, main)
    .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, "")
    .replace(/\s+(href|src|srcset)="(?!https?:|mailto:|#|\/)([^"]+)"/g, ' $1="/$2"')
    .replace(/<body([^>]*)>/, `<body$1 data-generated-author-page="true">`)
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  return { html, canonical, groups, description, title, person, breadcrumb };
}

export async function fetchPublicAuthorCatalog({ supabaseUrl, supabaseAnonKey, fetchImpl = fetch }) {
  const headers = { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` };
  const authorQuery = new URLSearchParams({
    select: "id,pseudo,slug,website,bio,avatar_url,location,shop_url,profile_type,validated,published,published_at,merged_into",
    validated: "eq.true",
    published: "eq.true",
    merged_into: "is.null",
    order: "slug.asc"
  });
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/authors?${authorQuery}`, { headers });
  if (!response.ok) throw new Error(`Lecture publique authors impossible (${response.status}).`);
  const authors = await response.json();
  const catalog = [];
  for (const author of authors) {
    if (!clean(author.slug)) throw new Error(`Auteur publié sans slug (${author.id}).`);
    const presenceQuery = new URLSearchParams({
      select: "event_id,events(id,title,city,country_code,region,start_date,end_date,type,image_url,validated,rejected)",
      author_id: `eq.${author.id}`,
      validated: "eq.true",
      rejected: "neq.true",
      order: "created_at.desc"
    });
    const presenceResponse = await fetchImpl(`${supabaseUrl}/rest/v1/event_authors_presence?${presenceQuery}`, { headers });
    if (!presenceResponse.ok) throw new Error(`Lecture publique des événements auteur impossible (${presenceResponse.status}).`);
    const rows = await presenceResponse.json();
    catalog.push({ author, events: rows.map((row) => row.events).filter(Boolean) });
  }
  return catalog;
}
