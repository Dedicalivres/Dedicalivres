/**
 * Dédicalivres — Daily Events Export Worker
 * Pack 1 : Export JSON + CSV + Markdown, trié par date, stocké dans Cloudflare R2.
 *
 * Déploiement : Cloudflare Workers + Cron Trigger + binding R2.
 * Secrets requis :
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY  ⚠️ jamais côté front
 * - EXPORT_SECRET             optionnel mais recommandé pour /export-now
 *
 * Variables recommandées :
 * - PUBLIC_SITE_URL=https://dedicalivres.fr
 * - R2_PUBLIC_BASE_URL=https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev
 * - EVENTS_TABLE=events
 * - AUTHORS_TABLE=authors
 * - PRESENCE_TABLE=event_authors_presence
 * - EXPORT_PREFIX=exports
 */

const DEFAULT_SITE_URL = 'https://dedicalivres.fr';
const DEFAULT_EXPORT_PREFIX = 'exports';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyExport(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return jsonResponse({
        name: 'Dédicalivres Daily Export Worker',
        status: 'ok',
        endpoints: {
          health: '/health',
          export_now: '/export-now?secret=***'
        }
      });
    }

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, generated_by: 'dedicalivres-daily-export' });
    }

    if (url.pathname === '/export-now') {
      const providedSecret = url.searchParams.get('secret') || request.headers.get('x-export-secret');
      if (env.EXPORT_SECRET && providedSecret !== env.EXPORT_SECRET) {
        return jsonResponse({ ok: false, error: 'Unauthorized export request' }, 401);
      }

      const result = await runDailyExport(env);
      return jsonResponse(result, result.ok ? 200 : 500);
    }

    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }
};

async function runDailyExport(env) {
  try {
    assertEnv(env);

    const siteUrl = trimTrailingSlash(env.PUBLIC_SITE_URL || DEFAULT_SITE_URL);
    const exportPrefix = trimSlashes(env.EXPORT_PREFIX || DEFAULT_EXPORT_PREFIX);
    const generatedAt = new Date();
    const dateSlug = generatedAt.toISOString().slice(0, 10);

    const events = await fetchEventsWithAuthors(env, siteUrl);
    const sortedEvents = sortEvents(events);

    const jsonPayload = buildJsonExport(sortedEvents, generatedAt, siteUrl);
    const csvPayload = buildCsvExport(sortedEvents);
    const markdownPayload = buildMarkdownPublications(sortedEvents, generatedAt, siteUrl);

    const files = [
      {
        key: `${exportPrefix}/events-latest.json`,
        body: JSON.stringify(jsonPayload, null, 2),
        contentType: 'application/json; charset=utf-8'
      },
      {
        key: `${exportPrefix}/events-${dateSlug}.json`,
        body: JSON.stringify(jsonPayload, null, 2),
        contentType: 'application/json; charset=utf-8'
      },
      {
        key: `${exportPrefix}/events-latest.csv`,
        body: csvPayload,
        contentType: 'text/csv; charset=utf-8'
      },
      {
        key: `${exportPrefix}/events-${dateSlug}.csv`,
        body: csvPayload,
        contentType: 'text/csv; charset=utf-8'
      },
      {
        key: `${exportPrefix}/publications-latest.md`,
        body: markdownPayload,
        contentType: 'text/markdown; charset=utf-8'
      },
      {
        key: `${exportPrefix}/publications-${dateSlug}.md`,
        body: markdownPayload,
        contentType: 'text/markdown; charset=utf-8'
      }
    ];

    for (const file of files) {
      await env.EXPORTS_BUCKET.put(file.key, file.body, {
        httpMetadata: {
          contentType: file.contentType,
          cacheControl: 'public, max-age=300'
        },
        customMetadata: {
          generated_at: generatedAt.toISOString(),
          source: 'dedicalivres-daily-export'
        }
      });
    }

    return {
      ok: true,
      generated_at: generatedAt.toISOString(),
      event_count: sortedEvents.length,
      files: files.map((file) => file.key)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
}

function assertEnv(env) {
  const missing = [];
  if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!env.EXPORTS_BUCKET) missing.push('EXPORTS_BUCKET R2 binding');
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
}

async function fetchEventsWithAuthors(env, siteUrl) {
  const eventsTable = env.EVENTS_TABLE || 'events';
  const authorsTable = env.AUTHORS_TABLE || 'authors';
  const presenceTable = env.PRESENCE_TABLE || 'event_authors_presence';

  const eventsUrl = new URL(`/rest/v1/${eventsTable}`, trimTrailingSlash(env.SUPABASE_URL));

  // Champs volontairement publics. Ne pas exporter emails, tracking, données privées ou champs admin sensibles.
  eventsUrl.searchParams.set(
    'select',
    [
      'id',
      'title',
      'description',
      'event_date',
      'date',
      'event_time',
      'time',
      'city',
      'region',
      'address',
      'postal_code',
      'latitude',
      'longitude',
      'image_url',
      'status',
      'validated',
      'is_validated',
      'created_at',
      'updated_at'
    ].join(',')
  );

  // On tente un filtre sécurisé, mais le script reste tolérant aux variantes de schéma.
  eventsUrl.searchParams.set('order', 'event_date.asc.nullslast,date.asc.nullslast,event_time.asc.nullslast,time.asc.nullslast,title.asc');

  const rawEvents = await supabaseGet(env, eventsUrl);
  const publicEvents = rawEvents
    .filter(isEventPublic)
    .filter((event) => getEventDate(event));

  const eventIds = publicEvents.map((event) => event.id).filter(Boolean);
  const authorsByEventId = eventIds.length
    ? await fetchAuthorsByEventId(env, presenceTable, authorsTable, eventIds)
    : new Map();

  return publicEvents.map((event) => normalizeEvent(event, authorsByEventId.get(String(event.id)) || [], siteUrl));
}

async function fetchAuthorsByEventId(env, presenceTable, authorsTable, eventIds) {
  const authorsByEventId = new Map();

  // Première tentative : relation Supabase si elle existe.
  const relationUrl = new URL(`/rest/v1/${presenceTable}`, trimTrailingSlash(env.SUPABASE_URL));
  relationUrl.searchParams.set('select', `event_id,author_id,${authorsTable}(id,name,display_name,validated,is_validated,status)`);
  relationUrl.searchParams.set('event_id', `in.(${eventIds.map(encodeURIComponent).join(',')})`);

  try {
    const rows = await supabaseGet(env, relationUrl);
    for (const row of rows) {
      const eventId = String(row.event_id);
      const author = row[authorsTable];
      const authorName = getAuthorName(author);
      if (!authorName) continue;
      if (!isAuthorPublic(author)) continue;
      if (!authorsByEventId.has(eventId)) authorsByEventId.set(eventId, []);
      authorsByEventId.get(eventId).push(authorName);
    }
    return dedupeAuthorsMap(authorsByEventId);
  } catch (_) {
    // Fallback : jointure manuelle si la relation REST n'est pas exposée.
  }

  const presenceUrl = new URL(`/rest/v1/${presenceTable}`, trimTrailingSlash(env.SUPABASE_URL));
  presenceUrl.searchParams.set('select', 'event_id,author_id');
  presenceUrl.searchParams.set('event_id', `in.(${eventIds.map(encodeURIComponent).join(',')})`);
  const presenceRows = await supabaseGet(env, presenceUrl);

  const authorIds = [...new Set(presenceRows.map((row) => row.author_id).filter(Boolean))];
  if (!authorIds.length) return authorsByEventId;

  const authorsUrl = new URL(`/rest/v1/${authorsTable}`, trimTrailingSlash(env.SUPABASE_URL));
  authorsUrl.searchParams.set('select', 'id,name,display_name,validated,is_validated,status');
  authorsUrl.searchParams.set('id', `in.(${authorIds.map(encodeURIComponent).join(',')})`);
  const authorsRows = await supabaseGet(env, authorsUrl);
  const authorById = new Map(authorsRows.filter(isAuthorPublic).map((author) => [String(author.id), getAuthorName(author)]));

  for (const row of presenceRows) {
    const eventId = String(row.event_id);
    const authorName = authorById.get(String(row.author_id));
    if (!authorName) continue;
    if (!authorsByEventId.has(eventId)) authorsByEventId.set(eventId, []);
    authorsByEventId.get(eventId).push(authorName);
  }

  return dedupeAuthorsMap(authorsByEventId);
}

async function supabaseGet(env, url) {
  const response = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed ${response.status}: ${text}`);
  }

  return response.json();
}

function normalizeEvent(event, authors, siteUrl) {
  const eventDate = getEventDate(event);
  const eventTime = event.event_time || event.time || '';
  const title = safeText(event.title || 'Événement littéraire');
  const city = safeText(event.city || '');
  const region = safeText(event.region || '');
  const description = normalizeDescription(event.description || '');
  const eventUrl = `${siteUrl}/event.html?id=${encodeURIComponent(event.id)}`;
  const hashtags = buildHashtags(event, authors);

  return {
    id: event.id,
    title,
    date: eventDate,
    time: normalizeTime(eventTime),
    city,
    region,
    address: safeText(event.address || ''),
    postal_code: safeText(event.postal_code || ''),
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    description,
    authors,
    image_url: event.image_url || '',
    event_url: eventUrl,
    status: getEventStatusLabel(event),
    post_short: buildShortPost({ title, eventDate, eventTime, city, authors, eventUrl, hashtags }),
    post_long: buildLongPost({ title, eventDate, eventTime, city, region, address: event.address, description, authors, eventUrl, hashtags }),
    hashtags
  };
}

function isEventPublic(event) {
  if (event.validated === true || event.is_validated === true) return true;
  const status = String(event.status || '').toLowerCase();
  return ['validated', 'validé', 'valide', 'published', 'publié', 'online'].includes(status);
}

function isAuthorPublic(author) {
  if (!author) return false;
  if (author.validated === true || author.is_validated === true) return true;
  const status = String(author.status || '').toLowerCase();
  return !status || ['validated', 'validé', 'valide', 'published', 'publié', 'online'].includes(status);
}

function getAuthorName(author) {
  if (!author) return '';
  return safeText(author.display_name || author.name || '');
}

function getEventDate(event) {
  return normalizeDate(event.event_date || event.date || '');
}

function getEventStatusLabel(event) {
  if (event.validated === true || event.is_validated === true) return 'validé';
  return safeText(event.status || 'validé');
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const da = `${a.date || '9999-12-31'}T${a.time || '23:59'}`;
    const db = `${b.date || '9999-12-31'}T${b.time || '23:59'}`;
    return da.localeCompare(db) || a.city.localeCompare(b.city) || a.title.localeCompare(b.title);
  });
}

function buildJsonExport(events, generatedAt, siteUrl) {
  return {
    generated_at: generatedAt.toISOString(),
    source: siteUrl,
    count: events.length,
    events
  };
}

function buildCsvExport(events) {
  const headers = [
    'date', 'heure', 'titre', 'ville', 'region', 'adresse', 'code_postal', 'auteurs',
    'description', 'image_url', 'event_url', 'post_short', 'hashtags'
  ];

  const rows = events.map((event) => [
    event.date,
    event.time,
    event.title,
    event.city,
    event.region,
    event.address,
    event.postal_code,
    event.authors.join(' | '),
    event.description,
    event.image_url,
    event.event_url,
    event.post_short,
    event.hashtags.join(' ')
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function buildMarkdownPublications(events, generatedAt, siteUrl) {
  const lines = [];
  lines.push(`# Publications Dédicalivres`);
  lines.push('');
  lines.push(`Généré le ${generatedAt.toISOString()}`);
  lines.push(`Source : ${siteUrl}`);
  lines.push(`Nombre d'événements : ${events.length}`);
  lines.push('');

  for (const event of events) {
    lines.push('---');
    lines.push('');
    lines.push(`## ${event.title} — ${formatFrenchDate(event.date)}`);
    lines.push('');
    lines.push(`**Ville :** ${event.city || 'Non précisée'}`);
    if (event.time) lines.push(`**Heure :** ${event.time}`);
    if (event.authors.length) lines.push(`**Auteurs présents :** ${event.authors.join(', ')}`);
    if (event.image_url) lines.push(`**Image :** ${event.image_url}`);
    lines.push(`**Fiche événement :** ${event.event_url}`);
    lines.push('');
    lines.push('### Version courte');
    lines.push('');
    lines.push(event.post_short);
    lines.push('');
    lines.push('### Version longue');
    lines.push('');
    lines.push(event.post_long);
    lines.push('');
  }

  return lines.join('\n');
}

function buildShortPost({ title, eventDate, eventTime, city, authors, eventUrl, hashtags }) {
  const parts = [];
  parts.push(`📚 ${title}`);
  parts.push('');
  parts.push(`Rendez-vous ${city ? `à ${city}` : 'pour une rencontre littéraire'} le ${formatFrenchDate(eventDate)}${eventTime ? ` à ${normalizeTime(eventTime)}` : ''}.`);
  if (authors.length) parts.push(`✍️ Avec : ${authors.join(', ')}`);
  parts.push('');
  parts.push(`Voir la fiche complète : ${eventUrl}`);
  parts.push('');
  parts.push(hashtags.join(' '));
  return parts.join('\n');
}

function buildLongPost({ title, eventDate, eventTime, city, region, address, description, authors, eventUrl, hashtags }) {
  const parts = [];
  parts.push(`📚 ${title}`);
  parts.push('');
  parts.push(description || 'Un événement littéraire à découvrir sur Dédicalivres.');
  parts.push('');
  parts.push(`📅 Date : ${formatFrenchDate(eventDate)}${eventTime ? ` à ${normalizeTime(eventTime)}` : ''}`);
  if (city || region) parts.push(`📍 Lieu : ${[city, region].filter(Boolean).join(' — ')}`);
  if (address) parts.push(`Adresse : ${safeText(address)}`);
  if (authors.length) parts.push(`✍️ Auteurs présents : ${authors.join(', ')}`);
  parts.push('');
  parts.push(`Découvrez la fiche complète : ${eventUrl}`);
  parts.push('');
  parts.push(hashtags.join(' '));
  return parts.join('\n');
}

function buildHashtags(event, authors) {
  const tags = ['Dédicalivres', 'Livre', 'Dédicace'];
  if (event.city) tags.push(event.city);
  if (event.region) tags.push(event.region);
  if (authors.length) tags.push('Auteur');
  return [...new Set(tags.map(toHashtag).filter(Boolean))];
}

function toHashtag(value) {
  const cleaned = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();
  return cleaned ? `#${cleaned}` : '';
}

function normalizeDescription(value) {
  return safeText(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function safeText(value) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function formatFrenchDate(value) {
  if (!value) return 'date à préciser';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function dedupeAuthorsMap(map) {
  for (const [key, value] of map.entries()) {
    map.set(key, [...new Set(value.filter(Boolean))].sort((a, b) => a.localeCompare(b)));
  }
  return map;
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}
