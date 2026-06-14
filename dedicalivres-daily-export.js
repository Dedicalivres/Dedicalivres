/**
 * Dédicalivres — Daily Events Export Worker
 * Export JSON + CSV + Markdown + supports de publication, triés par date,
 * stockés dans Cloudflare R2.
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
 * - ALLOWED_ADMIN_ORIGINS=https://dedicalivres.fr,https://www.dedicalivres.fr
 * - EVENTS_TABLE=events
 * - PRESENCE_TABLE=event_authors_presence
 * - EXPORT_PREFIX=exports
 */

const DEFAULT_SITE_URL = 'https://dedicalivres.fr';
const DEFAULT_EXPORT_PREFIX = 'exports';
const MANUAL_EXPORT_FORMATS = new Set(['json', 'csv', 'markdown', 'html']);
const MANUAL_EXPORT_CATEGORIES = new Set([
  'all',
  'dedicaces',
  'salons_festivals',
  'salons',
  'festivals',
  'autres'
]);
const MANUAL_EXPORT_COUNTRIES = new Set(['ALL', 'FR', 'BE', 'LU', 'CH', 'MC']);

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyExport(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    if (url.pathname === '/') {
      return jsonResponse({
        name: 'Dédicalivres Daily Export Worker',
        status: 'ok',
        endpoints: {
          health: '/health',
          export_now: '/export-now?secret=***',
          admin_extract: 'POST /admin-extract'
        }
      }, 200, cors);
    }

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, generated_by: 'dedicalivres-daily-export' }, 200, cors);
    }

    if (url.pathname === '/export-now') {
      const providedSecret = url.searchParams.get('secret') || request.headers.get('x-export-secret');
      if (env.EXPORT_SECRET && providedSecret !== env.EXPORT_SECRET) {
        return jsonResponse({ ok: false, error: 'Unauthorized export request' }, 401, cors);
      }

      const result = await runDailyExport(env);
      return jsonResponse(result, result.ok ? 200 : 500, cors);
    }

    if (url.pathname === '/admin-extract') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, {
          ...cors,
          Allow: 'POST, OPTIONS'
        });
      }

      try {
        await assertAdminRequest(request, env);
        const payload = await readJsonBody(request);
        const result = await runManualExport(env, payload);
        return jsonResponse(result, result.ok ? 200 : 500, cors);
      } catch (error) {
        const status = Number(error.status) || 400;
        return jsonResponse({
          ok: false,
          error: error.message || String(error)
        }, status, cors);
      }
    }

    return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
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

    const categorized = splitEventsByCategory(sortedEvents);

    const jsonPayload = buildJsonExport(sortedEvents, generatedAt, siteUrl, 'all');
    const dedicacesJsonPayload = buildJsonExport(categorized.dedicaces, generatedAt, siteUrl, 'dedicaces');
    const salonsJsonPayload = buildJsonExport(categorized.salons, generatedAt, siteUrl, 'salons_festivals');
    const autresJsonPayload = buildJsonExport(categorized.autres, generatedAt, siteUrl, 'autres_evenements');
    const csvPayload = buildCsvExport(sortedEvents);
    const markdownPayload = buildMarkdownPublications(sortedEvents, generatedAt, siteUrl);
    const categorizedMarkdownPayload = buildCategorizedMarkdown(categorized, generatedAt, siteUrl);
    const planningPayload = buildPublicationPlanning(sortedEvents, generatedAt, siteUrl);
    const weekendPayload = buildWeekendByRegion(sortedEvents, generatedAt, siteUrl);
    const weekendEvents = getWeekendEvents(sortedEvents, generatedAt);

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
        key: `${exportPrefix}/dedicaces-latest.json`,
        body: JSON.stringify(dedicacesJsonPayload, null, 2),
        contentType: 'application/json; charset=utf-8'
      },
      {
        key: `${exportPrefix}/salons-latest.json`,
        body: JSON.stringify(salonsJsonPayload, null, 2),
        contentType: 'application/json; charset=utf-8'
      },
      {
        key: `${exportPrefix}/autres-evenements-latest.json`,
        body: JSON.stringify(autresJsonPayload, null, 2),
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
      },
      {
        key: `${exportPrefix}/dedicaces-latest.md`,
        body: buildMarkdownPublications(categorized.dedicaces, generatedAt, siteUrl),
        contentType: 'text/markdown; charset=utf-8'
      },
      {
        key: `${exportPrefix}/salons-latest.md`,
        body: buildMarkdownPublications(categorized.salons, generatedAt, siteUrl),
        contentType: 'text/markdown; charset=utf-8'
      },
      {
        key: `${exportPrefix}/autres-evenements-latest.md`,
        body: buildMarkdownPublications(categorized.autres, generatedAt, siteUrl),
        contentType: 'text/markdown; charset=utf-8'
      },
      {
        key: `${exportPrefix}/publications-par-categorie-latest.md`,
        body: categorizedMarkdownPayload,
        contentType: 'text/markdown; charset=utf-8'
      },
      {
        key: `${exportPrefix}/planning-publication-latest.md`,
        body: planningPayload,
        contentType: 'text/markdown; charset=utf-8'
      },
      {
        key: `${exportPrefix}/weekend-par-region-latest.md`,
        body: weekendPayload,
        contentType: 'text/markdown; charset=utf-8'
      },
      {
        key: `${exportPrefix}/instagram/tous-evenements-latest.html`,
        body: buildSocialHtml(sortedEvents, 'Tous les événements à venir', generatedAt, 'instagram'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/instagram/dedicaces-latest.html`,
        body: buildSocialHtml(categorized.dedicaces, 'Dédicaces à venir', generatedAt, 'instagram'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/instagram/salons-latest.html`,
        body: buildSocialHtml(categorized.salons, 'Salons et festivals à venir', generatedAt, 'instagram'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/instagram/weekend-regions-latest.html`,
        body: buildSocialHtml(weekendEvents, 'Idées sorties littéraires du week-end', generatedAt, 'instagram'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/designs/story-dedicaces-latest.html`,
        body: buildSocialHtml(categorized.dedicaces, 'Story Dédicaces', generatedAt, 'story'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/designs/story-salons-latest.html`,
        body: buildSocialHtml(categorized.salons, 'Story Salons et Festivals', generatedAt, 'story'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/designs/square-dedicaces-latest.html`,
        body: buildSocialHtml(categorized.dedicaces, 'Carré Dédicaces', generatedAt, 'square'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/designs/square-salons-latest.html`,
        body: buildSocialHtml(categorized.salons, 'Carré Salons et Festivals', generatedAt, 'square'),
        contentType: 'text/html; charset=utf-8'
      },
      {
        key: `${exportPrefix}/designs/wide-evenements-latest.html`,
        body: buildSocialHtml(sortedEvents, 'Visuel large événements', generatedAt, 'wide'),
        contentType: 'text/html; charset=utf-8'
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

async function runManualExport(env, rawOptions = {}) {
  try {
    assertEnv(env);

    const generatedAt = new Date();
    const siteUrl = trimTrailingSlash(env.PUBLIC_SITE_URL || DEFAULT_SITE_URL);
    const exportPrefix = trimSlashes(env.EXPORT_PREFIX || DEFAULT_EXPORT_PREFIX);
    const options = normalizeManualExportOptions(rawOptions, generatedAt);

    const availableEvents = await fetchEventsWithAuthors(env, siteUrl, {
      dateStart: options.dateStart,
      dateEnd: options.dateEnd,
      countryCode: options.countryCode,
      region: options.region
    });

    const selectedEvents = filterEventsByCategory(availableEvents, options.category);
    const events = sortEvents(selectedEvents);
    const extractionSlug = buildManualExtractionSlug(options, generatedAt);
    const baseKey = `${exportPrefix}/manual/${extractionSlug}`;
    const files = [];

    if (options.formats.includes('json')) {
      files.push({
        key: `${baseKey}/evenements.json`,
        label: 'JSON',
        body: JSON.stringify(buildManualJsonExport(events, generatedAt, siteUrl, options), null, 2),
        contentType: 'application/json; charset=utf-8'
      });
    }

    if (options.formats.includes('csv')) {
      files.push({
        key: `${baseKey}/evenements.csv`,
        label: 'CSV',
        body: buildCsvExport(events),
        contentType: 'text/csv; charset=utf-8'
      });
    }

    if (options.formats.includes('markdown')) {
      files.push({
        key: `${baseKey}/publications.md`,
        label: 'Publications',
        body: buildManualMarkdownExport(events, generatedAt, siteUrl, options),
        contentType: 'text/markdown; charset=utf-8'
      });
    }

    if (options.formats.includes('html')) {
      files.push({
        key: `${baseKey}/galerie-visuelle.html`,
        label: 'Galerie visuelle',
        body: buildManualVisualGalleryHtml(events, generatedAt, siteUrl, options),
        contentType: 'text/html; charset=utf-8'
      });
    }

    const manifest = {
      generated_at: generatedAt.toISOString(),
      count: events.length,
      filters: serializeManualExportOptions(options),
      files: files.map((file) => ({
        label: file.label,
        key: file.key,
        url: getPublicExportUrl(env, file.key),
        content_type: file.contentType
      }))
    };

    files.push({
      key: `${baseKey}/manifest.json`,
      label: 'Manifeste',
      body: JSON.stringify(manifest, null, 2),
      contentType: 'application/json; charset=utf-8'
    });

    for (const file of files) {
      await env.EXPORTS_BUCKET.put(file.key, file.body, {
        httpMetadata: {
          contentType: file.contentType,
          cacheControl: 'private, max-age=60'
        },
        customMetadata: {
          generated_at: generatedAt.toISOString(),
          source: 'dedicalivres-admin-extract',
          category: options.category,
          country_code: options.countryCode
        }
      });
    }

    return {
      ok: true,
      generated_at: generatedAt.toISOString(),
      event_count: events.length,
      filters: serializeManualExportOptions(options),
      files: files.map((file) => ({
        label: file.label,
        key: file.key,
        url: getPublicExportUrl(env, file.key),
        content_type: file.contentType
      }))
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

async function fetchEventsWithAuthors(env, siteUrl, requestedFilters = {}) {
  const eventsTable = env.EVENTS_TABLE || 'events';
  const presenceTable = env.PRESENCE_TABLE || 'event_authors_presence';

  const eventsUrl = new URL(`/rest/v1/${eventsTable}`, trimTrailingSlash(env.SUPABASE_URL));
  const today = new Date().toISOString().slice(0, 10);
  const dateStart = normalizeDate(requestedFilters.dateStart || today);
  const dateEnd = normalizeDate(requestedFilters.dateEnd || '');
  const countryCode = normalizeCountryCode(requestedFilters.countryCode || 'ALL');
  const requestedRegion = safeText(requestedFilters.region || '');

  // Champs volontairement publics. Ne pas exporter emails, tracking, données privées ou champs admin sensibles.
  eventsUrl.searchParams.set(
    'select',
    [
      'id',
      'title',
      'description',
      'type',
      'country_code',
      'city',
      'region',
      'start_date',
      'end_date',
      'website',
      'image_url',
      'price',
      'lat',
      'lng',
      'validated',
      'rejected',
      'featured',
      'verified',
      'created_at'
    ].join(',')
  );

  eventsUrl.searchParams.set('validated', 'eq.true');
  eventsUrl.searchParams.set('rejected', 'eq.false');
  if (dateStart) {
    eventsUrl.searchParams.set('or', `(end_date.is.null,end_date.gte.${dateStart})`);
  }
  if (dateEnd) {
    eventsUrl.searchParams.set('start_date', `lte.${dateEnd}`);
  }
  if (countryCode !== 'ALL') {
    eventsUrl.searchParams.set('country_code', `eq.${countryCode}`);
  }
  if (requestedRegion) {
    eventsUrl.searchParams.set('region', `eq.${requestedRegion}`);
  }
  eventsUrl.searchParams.set('order', 'featured.desc,start_date.asc.nullslast,title.asc');

  const rawEvents = await supabaseGet(env, eventsUrl);
  const publicEvents = rawEvents
    .filter(isEventPublic)
    .filter((event) => event.rejected !== true)
    .filter((event) => getEventDate(event))
    .filter((event) => eventOverlapsDateRange(event, dateStart, dateEnd))
    .filter((event) => countryCode === 'ALL' || normalizeCountryCode(event.country_code) === countryCode)
    .filter((event) => !requestedRegion || safeText(event.region) === requestedRegion);

  const eventIds = publicEvents.map((event) => event.id).filter(Boolean);
  const authorsByEventId = eventIds.length
    ? await fetchAuthorsByEventId(env, presenceTable, eventIds)
    : new Map();

  return publicEvents.map((event) => normalizeEvent(event, authorsByEventId.get(String(event.id)) || [], siteUrl));
}

async function fetchAuthorsByEventId(env, presenceTable, eventIds) {
  const authorsByEventId = new Map();

  const presenceUrl = new URL(`/rest/v1/${presenceTable}`, trimTrailingSlash(env.SUPABASE_URL));
  presenceUrl.searchParams.set('select', 'event_id,pseudo,validated,rejected');
  presenceUrl.searchParams.set('event_id', `in.(${eventIds.map(encodeURIComponent).join(',')})`);
  presenceUrl.searchParams.set('validated', 'eq.true');
  const presenceRows = await supabaseGet(env, presenceUrl);

  for (const row of presenceRows) {
    if (row.rejected === true) continue;
    const eventId = String(row.event_id);
    const authorName = safeText(row.pseudo || '');
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
  const countryCode = normalizeCountryCode(event.country_code || 'FR');
  const type = safeText(event.type || 'Autre');
  const description = normalizeDescription(event.description || '');
  const eventUrl = `${siteUrl}/event.html?id=${encodeURIComponent(event.id)}`;
  const hashtags = buildHashtags(event, authors);

  return {
    id: event.id,
    title,
    type,
    date: eventDate,
    end_date: normalizeDate(event.end_date || eventDate),
    time: normalizeTime(eventTime),
    city,
    region,
    country_code: countryCode,
    country: getCountryLabel(countryCode),
    price: safeText(event.price || ''),
    website: safeText(event.website || ''),
    latitude: event.lat ?? null,
    longitude: event.lng ?? null,
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
  return event.validated === true && event.rejected !== true;
}

function getEventDate(event) {
  return normalizeDate(event.start_date || event.event_date || event.date || '');
}

function getEventStatusLabel(event) {
  return event.validated === true ? 'validé' : 'en attente';
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const da = `${a.date || '9999-12-31'}T${a.time || '23:59'}`;
    const db = `${b.date || '9999-12-31'}T${b.time || '23:59'}`;
    return da.localeCompare(db) || a.city.localeCompare(b.city) || a.title.localeCompare(b.title);
  });
}

function buildJsonExport(events, generatedAt, siteUrl, filter = 'all') {
  return {
    generated_at: generatedAt.toISOString(),
    source: siteUrl,
    filter,
    count: events.length,
    events
  };
}

function buildCsvExport(events) {
  const headers = [
    'date', 'fin', 'type', 'titre', 'ville', 'territoire', 'pays', 'code_pays', 'prix', 'auteurs',
    'description', 'image_url', 'site_officiel', 'event_url', 'post_short', 'hashtags'
  ];

  const rows = events.map((event) => [
    event.date,
    event.end_date,
    event.type,
    event.title,
    event.city,
    event.region,
    event.country,
    event.country_code,
    event.price,
    event.authors.join(' | '),
    event.description,
    event.image_url,
    event.website,
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
    lines.push(`**Type :** ${event.type || 'Autre'}`);
    if (event.time) lines.push(`**Heure :** ${event.time}`);
    if (event.authors.length) lines.push(`**Auteurs présents :** ${event.authors.join(', ')}`);
    if (event.image_url) lines.push(`**Image :** ${event.image_url}`);
    if (event.website) lines.push(`**Site officiel :** ${event.website}`);
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

function splitEventsByCategory(events) {
  return {
    dedicaces: events.filter((event) => normalizeCategory(event.type) === 'dedicace'),
    salons: events.filter((event) => ['salon', 'festival'].includes(normalizeCategory(event.type))),
    autres: events.filter((event) => {
      const type = normalizeCategory(event.type);
      return type !== 'dedicace' && !['salon', 'festival'].includes(type);
    })
  };
}

function filterEventsByCategory(events, category) {
  const normalizedCategory = String(category || 'all');
  if (normalizedCategory === 'all') return [...events];

  return events.filter((event) => {
    const type = normalizeCategory(event.type);

    if (normalizedCategory === 'dedicaces') return type === 'dedicace';
    if (normalizedCategory === 'salons_festivals') return ['salon', 'festival'].includes(type);
    if (normalizedCategory === 'salons') return type === 'salon';
    if (normalizedCategory === 'festivals') return type === 'festival';
    if (normalizedCategory === 'autres') {
      return type !== 'dedicace' && !['salon', 'festival'].includes(type);
    }

    return true;
  });
}

function buildManualJsonExport(events, generatedAt, siteUrl, options) {
  return {
    generated_at: generatedAt.toISOString(),
    source: siteUrl,
    filter: 'admin_custom_extract',
    filters: serializeManualExportOptions(options),
    count: events.length,
    events
  };
}

function buildManualMarkdownExport(events, generatedAt, siteUrl, options) {
  const filterLabel = buildManualFilterLabel(options);
  const content = buildMarkdownPublications(events, generatedAt, siteUrl);

  return [
    '# Extraction personnalisée Dédicalivres',
    '',
    `Filtres : ${filterLabel}`,
    '',
    content
  ].join('\n');
}

function buildManualVisualGalleryHtml(events, generatedAt, siteUrl, options) {
  const visibleEvents = events.slice(0, 60);
  const eventData = serializeHtmlJson(visibleEvents);
  const filterLabel = buildManualFilterLabel(options);
  const hiddenCount = Math.max(0, events.length - visibleEvents.length);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Galerie visuelle — Dédicalivres</title>
  <style>
    :root {
      color-scheme: light;
      --violet:#3b176f;
      --violet-dark:#24103f;
      --orange:#ff6b35;
      --paper:#fffaf8;
      --ink:#271c35;
      --muted:#6c6278;
      --line:#eadff0;
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      color:var(--ink);
      background:
        linear-gradient(135deg, rgba(255,107,53,.10), transparent 38%),
        linear-gradient(225deg, rgba(83,38,142,.10), transparent 42%),
        #f8f4fa;
      font-family:Inter,Arial,sans-serif;
    }
    header {
      padding:28px clamp(18px,4vw,56px);
      color:#fff;
      background:linear-gradient(110deg,var(--violet-dark),var(--violet));
      border-bottom:5px solid var(--orange);
    }
    header strong {
      display:block;
      color:#ffad8f;
      font-size:.78rem;
      letter-spacing:.12em;
      text-transform:uppercase;
    }
    header h1 { margin:7px 0 5px; font-size:clamp(1.7rem,4vw,3.2rem); }
    header p { max-width:900px; margin:0; color:#e9dff5; line-height:1.5; }
    .notice {
      max-width:1200px;
      margin:22px auto 0;
      padding:0 20px;
    }
    .notice div {
      padding:15px 18px;
      border:1px solid var(--line);
      border-radius:12px;
      background:rgba(255,255,255,.88);
      box-shadow:0 10px 28px rgba(43,24,68,.07);
      line-height:1.55;
    }
    main {
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));
      gap:24px;
      max-width:1500px;
      margin:0 auto;
      padding:24px 20px 60px;
    }
    .visual-card {
      overflow:hidden;
      border:1px solid var(--line);
      border-radius:16px;
      background:#fff;
      box-shadow:0 18px 44px rgba(43,24,68,.10);
    }
    .visual-preview {
      display:grid;
      min-height:420px;
      place-items:center;
      padding:14px;
      background:#ede6f2;
    }
    .visual-preview img {
      display:block;
      width:100%;
      height:auto;
      background:#fff;
      box-shadow:0 12px 28px rgba(31,15,54,.18);
      cursor:context-menu;
    }
    .visual-loading {
      max-width:230px;
      color:var(--muted);
      font-weight:800;
      line-height:1.45;
      text-align:center;
    }
    .visual-content { padding:18px; }
    .visual-content h2 {
      margin:0 0 8px;
      font-family:Georgia,serif;
      font-size:1.35rem;
      line-height:1.15;
    }
    .visual-content p { margin:0; color:var(--muted); line-height:1.45; }
    .visual-actions {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
      margin-top:16px;
    }
    .visual-actions a,
    .visual-actions button {
      display:inline-flex;
      min-height:44px;
      align-items:center;
      justify-content:center;
      padding:10px 13px;
      border:1px solid transparent;
      border-radius:9px;
      font:inherit;
      font-weight:900;
      text-align:center;
      text-decoration:none;
      cursor:pointer;
    }
    .download {
      color:#fff;
      background:var(--orange);
    }
    .download[aria-disabled="true"] {
      opacity:.52;
      pointer-events:none;
    }
    .copy {
      color:var(--violet);
      background:#f4eef8;
      border-color:#ded0e8 !important;
    }
    .caption {
      width:100%;
      min-height:130px;
      margin-top:12px;
      padding:12px;
      resize:vertical;
      border:1px solid var(--line);
      border-radius:9px;
      color:var(--ink);
      background:var(--paper);
      font:500 .88rem/1.5 Inter,Arial,sans-serif;
    }
    .empty {
      grid-column:1/-1;
      padding:40px;
      border:1px solid var(--line);
      border-radius:16px;
      background:#fff;
      text-align:center;
    }
    @media (max-width:560px) {
      .visual-actions { grid-template-columns:1fr; }
      .visual-preview { min-height:300px; padding:9px; }
    }
  </style>
</head>
<body>
  <header>
    <strong>Dédicalivres Association</strong>
    <h1>Galerie visuelle prête à publier</h1>
    <p>${escapeHtml(filterLabel)} · ${events.length} événement(s) · généré le ${escapeHtml(formatFrenchDateTime(generatedAt))}</p>
  </header>

  <section class="notice">
    <div>
      Chaque composition ci-dessous est une image : faites un clic droit dessus pour l’enregistrer,
      ou utilisez le bouton <strong>Télécharger le PNG</strong>. Le texte associé peut être copié séparément.
      ${hiddenCount ? `<br><strong>${hiddenCount} événement(s) supplémentaire(s) non affiché(s) :</strong> réduisez la période pour créer une galerie plus ciblée.` : ''}
    </div>
  </section>

  <main id="gallery">
    ${visibleEvents.length ? '' : '<article class="empty">Aucun événement ne correspond à cette extraction.</article>'}
  </main>

  <script id="events-data" type="application/json">${eventData}</script>
  <script>
  (function () {
    "use strict";

    var events = JSON.parse(document.getElementById("events-data").textContent || "[]");
    var gallery = document.getElementById("gallery");
    var activeUrls = [];

    events.forEach(function (event, index) {
      var card = document.createElement("article");
      card.className = "visual-card";

      var preview = document.createElement("div");
      preview.className = "visual-preview";
      preview.innerHTML = '<span class="visual-loading">Préparation du visuel…</span>';

      var content = document.createElement("div");
      content.className = "visual-content";

      var title = document.createElement("h2");
      title.textContent = event.title || "Événement littéraire";

      var meta = document.createElement("p");
      meta.textContent = [formatDate(event.date), event.city, event.country].filter(Boolean).join(" · ");

      var actions = document.createElement("div");
      actions.className = "visual-actions";

      var download = document.createElement("a");
      download.className = "download";
      download.textContent = "Télécharger le PNG";
      download.setAttribute("aria-disabled", "true");
      download.download = fileName(event, index);

      var copy = document.createElement("button");
      copy.className = "copy";
      copy.type = "button";
      copy.textContent = "Copier le texte";

      var caption = document.createElement("textarea");
      caption.className = "caption";
      caption.readOnly = true;
      caption.value = event.post_short || "";
      caption.setAttribute("aria-label", "Texte de publication");

      actions.appendChild(download);
      actions.appendChild(copy);
      content.appendChild(title);
      content.appendChild(meta);
      content.appendChild(actions);
      content.appendChild(caption);
      card.appendChild(preview);
      card.appendChild(content);
      gallery.appendChild(card);

      copy.addEventListener("click", function () {
        copyText(caption.value).then(function () {
          copy.textContent = "Texte copié";
          window.setTimeout(function () { copy.textContent = "Copier le texte"; }, 1600);
        });
      });

      observeCard(card, function () {
        buildPreview(event, preview, download);
      });
    });

    window.addEventListener("beforeunload", function () {
      activeUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    });

    function observeCard(card, callback) {
      if (!("IntersectionObserver" in window)) {
        callback();
        return;
      }
      var observer = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        observer.disconnect();
        callback();
      }, { rootMargin: "500px" });
      observer.observe(card);
    }

    async function buildPreview(event, preview, download) {
      var canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;

      try {
        await drawVisual(canvas, event, true);
        var blob = await canvasBlob(canvas);
        attachImage(blob, event, preview, download);
      } catch (error) {
        var fallbackCanvas = document.createElement("canvas");
        fallbackCanvas.width = 1080;
        fallbackCanvas.height = 1350;
        await drawVisual(fallbackCanvas, event, false);
        var fallbackBlob = await canvasBlob(fallbackCanvas);
        attachImage(fallbackBlob, event, preview, download);
      }
    }

    function attachImage(blob, event, preview, download) {
      var objectUrl = URL.createObjectURL(blob);
      activeUrls.push(objectUrl);

      var image = document.createElement("img");
      image.src = objectUrl;
      image.alt = "Visuel social pour " + (event.title || "un événement Dédicalivres");
      image.width = 1080;
      image.height = 1350;
      image.title = "Clic droit pour enregistrer l’image";

      preview.replaceChildren(image);
      download.href = objectUrl;
      download.removeAttribute("aria-disabled");
    }

    async function drawVisual(canvas, event, includeImage) {
      var ctx = canvas.getContext("2d");
      var width = canvas.width;
      var height = canvas.height;
      var image = includeImage ? await loadImage(event.image_url) : null;
      var theme = getEventTheme(event.type);
      var layout = calculateAdaptiveLayout(ctx, event, image);

      ctx.clearRect(0, 0, width, height);

      var background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, "#fff9f6");
      background.addColorStop(.48, "#f7effa");
      background.addColorStop(1, "#eee3f5");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = theme.primary;
      ctx.fillRect(0, 0, 18, height);
      ctx.fillStyle = theme.secondary;
      ctx.fillRect(width - 18, 0, 18, height);

      ctx.strokeStyle = theme.guide;
      ctx.lineWidth = 2;
      for (var line = 0; line < 5; line += 1) {
        ctx.beginPath();
        ctx.moveTo(60, 115 + (line * 18));
        ctx.lineTo(1020, 115 + (line * 18));
        ctx.stroke();
      }

      ctx.fillStyle = "#ff6b35";
      ctx.font = "900 24px Arial, sans-serif";
      ctx.letterSpacing = "2px";
      ctx.fillText("DÉDICALIVRES", 72, 82);
      ctx.fillStyle = "#3b176f";
      ctx.font = "800 19px Arial, sans-serif";
      ctx.fillText("ASSOCIATION · AGENDA LITTÉRAIRE FRANCOPHONE", 72, 112);

      drawPill(ctx, typeLabel(event.type), 72, 150, theme.primary, "#ffffff");
      drawAdaptiveImageFrame(ctx, image, event, layout.image, theme);
      drawAdaptivePresentation(ctx, event, layout.presentation, theme, layout.mode);

      ctx.fillStyle = theme.primary;
      ctx.font = "900 23px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("Le livre nous rassemble", 1008, 1265);
      ctx.textAlign = "left";

      ctx.fillStyle = "#6c6278";
      ctx.font = "700 18px Arial, sans-serif";
      ctx.fillText("Informations vérifiées avant publication", 72, 1308);
    }

    function calculateAdaptiveLayout(ctx, event, image) {
      var bounds = { x:72, y:215, width:936, height:930 };
      var ratio = image && image.naturalWidth && image.naturalHeight
        ? image.naturalWidth / image.naturalHeight
        : 1.45;
      var titleLength = String(event.title || "").length;
      var hasAuthors = Array.isArray(event.authors) && event.authors.length > 0;
      var textNeed = 320 + Math.min(120, Math.max(0, titleLength - 45) * 1.35) + (hasAuthors ? 42 : 0);

      if (ratio < .84) {
        var gap = 28;
        var maxImageWidth = Math.min(500, bounds.width - gap - 390);
        var imageWidth = Math.min(maxImageWidth, bounds.height * ratio);
        imageWidth = Math.max(285, imageWidth);
        var imageHeight = Math.min(bounds.height, imageWidth / Math.max(ratio, .2));
        imageWidth = Math.min(maxImageWidth, imageHeight * ratio);
        var presentationWidth = bounds.width - imageWidth - gap;
        var sharedHeight = Math.min(bounds.height, Math.max(imageHeight, Math.min(820, textNeed + 160)));
        var top = bounds.y + ((bounds.height - sharedHeight) / 2);

        return {
          mode: "portrait",
          image: {
            x:bounds.x,
            y:top + ((sharedHeight - imageHeight) / 2),
            width:imageWidth,
            height:imageHeight
          },
          presentation: {
            x:bounds.x + imageWidth + gap,
            y:top,
            width:presentationWidth,
            height:sharedHeight
          }
        };
      }

      if (ratio <= 1.18) {
        var squareGap = 28;
        var squareImageWidth = Math.min(555, bounds.width - squareGap - 350);
        var squareImageHeight = Math.min(700, squareImageWidth / Math.max(ratio, .2));
        var squarePresentationWidth = bounds.width - squareImageWidth - squareGap;
        var squareSharedHeight = Math.min(bounds.height, Math.max(squareImageHeight, Math.min(780, textNeed + 170)));
        var squareTop = bounds.y + ((bounds.height - squareSharedHeight) / 2);

        return {
          mode: "balanced",
          image: {
            x:bounds.x,
            y:squareTop + ((squareSharedHeight - squareImageHeight) / 2),
            width:squareImageWidth,
            height:squareImageHeight
          },
          presentation: {
            x:bounds.x + squareImageWidth + squareGap,
            y:squareTop,
            width:squarePresentationWidth,
            height:squareSharedHeight
          }
        };
      }

      var stackedGap = 26;
      var presentationHeight = Math.min(470, Math.max(420, textNeed));
      var imageMaxHeight = bounds.height - stackedGap - presentationHeight;
      var naturalHeight = bounds.width / ratio;
      var imageHeight = Math.min(imageMaxHeight, Math.max(350, naturalHeight));
      var imageWidth = Math.min(bounds.width, imageHeight * ratio);
      var totalHeight = imageHeight + stackedGap + presentationHeight;
      var stackedTop = bounds.y + ((bounds.height - totalHeight) / 2);

      return {
        mode: "landscape",
        image: {
          x:bounds.x + ((bounds.width - imageWidth) / 2),
          y:stackedTop,
          width:imageWidth,
          height:imageHeight
        },
        presentation: {
          x:bounds.x,
          y:stackedTop + imageHeight + stackedGap,
          width:bounds.width,
          height:presentationHeight
        }
      };
    }

    function drawAdaptiveImageFrame(ctx, image, event, box, theme) {
      ctx.save();
      ctx.shadowColor = theme.shadow;
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = theme.pale;
      roundedRect(ctx, box.x, box.y, box.width, box.height, 34);
      ctx.fill();
      ctx.restore();

      ctx.save();
      roundedRect(ctx, box.x, box.y, box.width, box.height, 34);
      ctx.clip();
      ctx.fillStyle = theme.pale;
      ctx.fillRect(box.x, box.y, box.width, box.height);

      if (image) {
        drawImageCover(ctx, image, box.x, box.y, box.width, box.height, true);
        ctx.fillStyle = "rgba(255,255,255,.25)";
        ctx.fillRect(box.x, box.y, box.width, box.height);

        var inset = Math.max(12, Math.min(22, Math.round(Math.min(box.width, box.height) * .035)));
        drawImageContain(ctx, image, box.x + inset, box.y + inset, box.width - (inset * 2), box.height - (inset * 2));
      } else {
        drawImageFallback(ctx, event, box.x, box.y, box.width, box.height, theme);
      }
      ctx.restore();

      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 6;
      roundedRect(ctx, box.x, box.y, box.width, box.height, 34);
      ctx.stroke();
    }

    function drawAdaptivePresentation(ctx, event, box, theme, mode) {
      var compact = box.width < 430;
      var padding = compact ? 26 : 34;
      var innerX = box.x + padding;
      var innerWidth = box.width - (padding * 2);
      var bottom = box.y + box.height - padding;

      ctx.save();
      ctx.shadowColor = theme.shadow;
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = "rgba(255,255,255,.94)";
      roundedRect(ctx, box.x, box.y, box.width, box.height, 34);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = theme.secondary;
      ctx.lineWidth = 5;
      roundedRect(ctx, box.x, box.y, box.width, box.height, 34);
      ctx.stroke();

      var badgeY = box.y + padding;
      drawPill(ctx, typeLabel(event.type), innerX, badgeY, theme.primary, "#ffffff", compact ? 17 : 19);

      var titleY = badgeY + (compact ? 78 : 84);
      var ctaHeight = compact ? 66 : 72;
      var ctaY = bottom - ctaHeight;
      var metaBottom = ctaY - 24;
      var requestedTitleLines = mode === "landscape" ? 3 : 5;
      var titleMaxFont = compact ? 40 : 48;
      var titleMinFont = compact ? 27 : 31;
      var reserveForDate = compact ? 50 : 58;
      var availableTitleHeight = Math.max(
        titleMinFont * 1.12,
        metaBottom - titleY - reserveForDate
      );
      var titleMaxLines = Math.max(
        1,
        Math.min(requestedTitleLines, Math.floor(availableTitleHeight / (titleMinFont * 1.12)))
      );

      ctx.fillStyle = "#271c35";
      var titleResult = drawAdaptiveTitle(
        ctx,
        event.title || "Événement littéraire",
        innerX,
        titleY,
        innerWidth,
        titleMaxLines,
        titleMaxFont,
        titleMinFont
      );
      var currentY = titleY + titleResult.height + (compact ? 18 : 24);

      var dateFont = compact ? 24 : 29;
      ctx.fillStyle = theme.secondary;
      ctx.font = "900 " + dateFont + "px Arial, sans-serif";
      var dateLine = dateRange(event);
      if (currentY <= metaBottom) {
        drawSingleLineEllipsis(ctx, dateLine, innerX, currentY, innerWidth);
        currentY += dateFont + 23;
      }

      var place = [event.city, event.region, event.country].filter(Boolean).join(" · ");
      var metaFont = compact ? 20 : 24;
      if (place && currentY + metaFont <= metaBottom) {
        ctx.fillStyle = "#64586f";
        ctx.font = "700 " + metaFont + "px Arial, sans-serif";
        drawSingleLineEllipsis(ctx, place, innerX, currentY, innerWidth);
        currentY += metaFont + 20;
      }

      var authors = Array.isArray(event.authors) ? event.authors.filter(Boolean) : [];
      if (authors.length && currentY + metaFont <= metaBottom) {
        ctx.fillStyle = "#64586f";
        ctx.font = "700 " + Math.max(18, metaFont - 2) + "px Arial, sans-serif";
        drawSingleLineEllipsis(ctx, "Auteurs présents : " + authors.join(", "), innerX, currentY, innerWidth);
        currentY += metaFont + 18;
      }

      if (event.price && currentY + 38 <= metaBottom) {
        drawPill(ctx, event.price, innerX, currentY - 18, theme.pale, theme.secondary, compact ? 15 : 17);
      }

      ctx.fillStyle = theme.secondary;
      roundedRect(ctx, innerX, ctaY, Math.min(innerWidth, compact ? innerWidth : 390), ctaHeight, 20);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 " + (compact ? 21 : 25) + "px Arial, sans-serif";
      ctx.fillText("Fiche événement", innerX + (compact ? 24 : 32), ctaY + (compact ? 42 : 47));
    }

    function loadImage(source) {
      return new Promise(function (resolve) {
        if (!source) {
          resolve(null);
          return;
        }

        var image = new Image();
        var settled = false;
        image.crossOrigin = "anonymous";
        image.referrerPolicy = "no-referrer";
        image.onload = function () {
          if (settled) return;
          settled = true;
          resolve(image);
        };
        image.onerror = function () {
          if (settled) return;
          settled = true;
          resolve(null);
        };
        image.src = source;
        window.setTimeout(function () {
          if (settled) return;
          settled = true;
          resolve(null);
        }, 8000);
      });
    }

    function drawImageCover(ctx, image, x, y, width, height, blurred) {
      var scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      var drawWidth = image.naturalWidth * scale;
      var drawHeight = image.naturalHeight * scale;
      ctx.save();
      if (blurred) ctx.filter = "blur(28px) saturate(.82)";
      ctx.drawImage(image, x + ((width - drawWidth) / 2), y + ((height - drawHeight) / 2), drawWidth, drawHeight);
      ctx.restore();
    }

    function drawImageContain(ctx, image, x, y, width, height) {
      var scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      var drawWidth = image.naturalWidth * scale;
      var drawHeight = image.naturalHeight * scale;
      ctx.drawImage(image, x + ((width - drawWidth) / 2), y + ((height - drawHeight) / 2), drawWidth, drawHeight);
    }

    function drawImageFallback(ctx, event, x, y, width, height, theme) {
      var gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, theme.secondary);
      gradient.addColorStop(1, theme.primary);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.font = "900 " + Math.min(250, Math.round(height * .42)) + "px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("D", x + (width / 2), y + (height * .62));
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 " + Math.min(32, Math.max(18, Math.round(width * .055))) + "px Arial, sans-serif";
      drawSingleLineEllipsis(ctx, typeLabel(event.type), x + 32, y + height - 36, width - 64);
    }

    function drawPill(ctx, text, x, y, background, color, fontSize) {
      var size = fontSize || 20;
      ctx.font = "900 " + size + "px Arial, sans-serif";
      var width = Math.min(360, ctx.measureText(text).width + 46);
      var height = size + 26;
      ctx.fillStyle = background;
      roundedRect(ctx, x, y, width, height, height / 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(text, x + 23, y + size + 8);
    }

    function drawAdaptiveTitle(ctx, text, x, y, width, maxLines, maxFont, minFont) {
      var fontSize = maxFont;
      var lines = [];
      while (fontSize >= minFont) {
        ctx.font = "700 " + fontSize + "px Georgia, serif";
        lines = wrapLines(ctx, text, width);
        if (lines.length <= maxLines) break;
        fontSize -= 2;
      }
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = ellipsize(ctx, lines[maxLines - 1], width);
      }
      lines = lines.map(function (line) {
        return ctx.measureText(line).width > width ? ellipsize(ctx, line, width) : line;
      });
      var lineHeight = Math.round(fontSize * 1.12);
      lines.forEach(function (line, index) {
        ctx.fillText(line, x, y + (index * lineHeight));
      });
      return { height: Math.max(lineHeight, lines.length * lineHeight), fontSize: fontSize };
    }

    function getEventTheme(value) {
      var type = String(value || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase();

      if (type.indexOf("dedicace") >= 0) {
        return {
          primary:"#7137b6",
          secondary:"#43206f",
          pale:"#f0e7fa",
          guide:"rgba(113,55,182,.14)",
          shadow:"rgba(67,32,111,.22)"
        };
      }
      if (type.indexOf("festival") >= 0) {
        return {
          primary:"#f06a2f",
          secondary:"#a83d16",
          pale:"#fff0e8",
          guide:"rgba(240,106,47,.14)",
          shadow:"rgba(168,61,22,.22)"
        };
      }
      if (type.indexOf("salon") >= 0) {
        return {
          primary:"#2784c7",
          secondary:"#155580",
          pale:"#e7f4fc",
          guide:"rgba(39,132,199,.14)",
          shadow:"rgba(21,85,128,.22)"
        };
      }
      return {
        primary:"#24936f",
        secondary:"#155e49",
        pale:"#e6f7f1",
        guide:"rgba(36,147,111,.14)",
        shadow:"rgba(21,94,73,.22)"
      };
    }

    function wrapLines(ctx, text, width) {
      var words = String(text || "").trim().split(/\\s+/);
      var lines = [];
      var line = "";
      words.forEach(function (word) {
        var candidate = line ? line + " " + word : word;
        if (line && ctx.measureText(candidate).width > width) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    }

    function ellipsize(ctx, text, width) {
      var value = String(text || "");
      while (value.length > 1 && ctx.measureText(value + "…").width > width) {
        value = value.slice(0, -1);
      }
      return value + "…";
    }

    function drawSingleLineEllipsis(ctx, text, x, y, width) {
      ctx.fillText(ellipsize(ctx, text, width), x, y);
    }

    function roundedRect(ctx, x, y, width, height, radius) {
      var r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    function canvasBlob(canvas) {
      return new Promise(function (resolve, reject) {
        try {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error("Conversion PNG impossible."));
          }, "image/png", .94);
        } catch (error) {
          reject(error);
        }
      });
    }

    function typeLabel(value) {
      var type = String(value || "Événement").toLocaleUpperCase("fr-FR");
      if (type.indexOf("DÉDICACE") >= 0 || type.indexOf("DEDICACE") >= 0) return "DÉDICACE";
      if (type.indexOf("FESTIVAL") >= 0) return "FESTIVAL";
      if (type.indexOf("SALON") >= 0) return "SALON";
      return "ÉVÉNEMENT LITTÉRAIRE";
    }

    function dateRange(event) {
      var start = formatDate(event.date);
      var end = formatDate(event.end_date);
      return end && end !== start ? start + " — " + end : start;
    }

    function formatDate(value) {
      if (!value) return "Date à préciser";
      var parts = String(value).slice(0, 10).split("-");
      if (parts.length !== 3) return value;
      var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
      return new Intl.DateTimeFormat("fr-FR", { day:"numeric", month:"long", year:"numeric" }).format(date);
    }

    function fileName(event, index) {
      var slug = String(event.title || "evenement")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70);
      return String(index + 1).padStart(2, "0") + "-" + (slug || "evenement") + "-dedicalivres.png";
    }

    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      return Promise.resolve();
    }

    window.__DEDICALIVRES_VISUAL_ENGINE__ = {
      calculateAdaptiveLayout: calculateAdaptiveLayout,
      getEventTheme: getEventTheme
    };
  })();
  </script>
</body>
</html>`;
}

function buildCategorizedMarkdown(categories, generatedAt, siteUrl) {
  const lines = [];
  lines.push('# Publications Dédicalivres par catégorie');
  lines.push('');
  lines.push(`Généré le ${generatedAt.toISOString()}`);
  lines.push(`Source : ${siteUrl}`);
  lines.push('');

  [
    ['Dédicaces', categories.dedicaces],
    ['Salons et festivals', categories.salons],
    ['Autres événements', categories.autres]
  ].forEach(([label, events]) => {
    lines.push(`## ${label}`);
    lines.push('');
    if (!events.length) {
      lines.push('Aucun événement à venir dans cette catégorie.');
      lines.push('');
      return;
    }

    events.forEach((event) => {
      lines.push(`- **${event.title}** — ${formatFrenchDate(event.date)}${event.city ? ` — ${event.city}` : ''}`);
      lines.push(`  ${event.event_url}`);
    });
    lines.push('');
  });

  return lines.join('\n');
}

function buildPublicationPlanning(events, generatedAt, siteUrl) {
  const lines = [];
  lines.push('# Planning publication Dédicalivres');
  lines.push('');
  lines.push(`Généré le ${generatedAt.toISOString()}`);
  lines.push(`Source : ${siteUrl}`);
  lines.push('');

  if (!events.length) {
    lines.push('Aucun événement à venir.');
    return lines.join('\n');
  }

  const today = startOfUtcDay(generatedAt);
  events.slice(0, 80).forEach((event) => {
    const days = daysUntil(event.date, today);
    const priority =
      days <= 3 ? 'Priorité haute' :
      days <= 7 ? 'Cette semaine' :
      days <= 21 ? 'À préparer' :
      'Veille éditoriale';

    lines.push(`## ${event.title}`);
    lines.push('');
    lines.push(`- Date événement : ${formatFrenchDate(event.date)}`);
    lines.push(`- Publication conseillée : ${priority}${Number.isFinite(days) ? ` (J-${days})` : ''}`);
    lines.push(`- Catégorie : ${event.type || 'Autre'}`);
    if (event.city || event.region) lines.push(`- Lieu : ${[event.city, event.region].filter(Boolean).join(', ')}`);
    if (event.image_url) lines.push('- Visuel : disponible');
    else lines.push('- Visuel : à compléter');
    lines.push(`- Fiche : ${event.event_url}`);
    lines.push('');
  });

  return lines.join('\n');
}

function buildWeekendByRegion(events, generatedAt, siteUrl) {
  const weekendEvents = getWeekendEvents(events, generatedAt);
  const byRegion = groupBy(weekendEvents, (event) => event.region || 'Région non précisée');
  const lines = [];

  lines.push('# Week-end littéraire par région');
  lines.push('');
  lines.push(`Généré le ${generatedAt.toISOString()}`);
  lines.push(`Source : ${siteUrl}`);
  lines.push('');

  if (!weekendEvents.length) {
    lines.push('Aucun événement référencé pour le prochain week-end.');
    return lines.join('\n');
  }

  [...byRegion.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .forEach(([region, rows]) => {
      lines.push(`## ${region}`);
      lines.push('');
      rows.forEach((event) => {
        lines.push(`- **${event.title}** — ${formatFrenchDate(event.date)}${event.city ? ` — ${event.city}` : ''}`);
        lines.push(`  ${event.event_url}`);
      });
      lines.push('');
    });

  return lines.join('\n');
}

function getWeekendEvents(events, generatedAt) {
  const today = startOfUtcDay(generatedAt);
  const day = today.getUTCDay();
  const daysUntilSaturday = (6 - day + 7) % 7;
  const saturday = addUtcDays(today, daysUntilSaturday);
  const sunday = addUtcDays(saturday, 1);
  const saturdayText = toIsoDate(saturday);
  const sundayText = toIsoDate(sunday);

  return events.filter((event) => {
    const date = event.date || '';
    return date >= saturdayText && date <= sundayText;
  });
}

function normalizeManualExportOptions(rawOptions, generatedAt) {
  const defaultStart = toIsoDate(startOfUtcDay(generatedAt));
  const defaultEnd = toIsoDate(addUtcDays(startOfUtcDay(generatedAt), 30));
  const category = String(rawOptions.category || 'all').trim().toLowerCase();
  const countryCode = normalizeCountryCode(rawOptions.countryCode || rawOptions.country_code || 'ALL');
  const dateStart = normalizeDate(rawOptions.dateStart || rawOptions.date_start || defaultStart);
  const dateEnd = normalizeDate(rawOptions.dateEnd || rawOptions.date_end || defaultEnd);
  const region = safeText(rawOptions.region || '').slice(0, 120);
  const requestedFormats = Array.isArray(rawOptions.formats) ? rawOptions.formats : ['json', 'csv', 'markdown', 'html'];
  const formats = [...new Set(
    requestedFormats
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => MANUAL_EXPORT_FORMATS.has(value))
  )];

  if (!MANUAL_EXPORT_CATEGORIES.has(category)) {
    throw new Error('Catégorie d’extraction non reconnue.');
  }
  if (!MANUAL_EXPORT_COUNTRIES.has(countryCode)) {
    throw new Error('Pays d’extraction non reconnu.');
  }
  if (!isIsoDate(dateStart) || !isIsoDate(dateEnd)) {
    throw new Error('Les dates de début et de fin sont obligatoires.');
  }
  if (dateStart > dateEnd) {
    throw new Error('La date de fin doit être postérieure à la date de début.');
  }
  if (daysBetweenIsoDates(dateStart, dateEnd) > 1095) {
    throw new Error('La période maximale autorisée est de trois ans.');
  }
  if (!formats.length) {
    throw new Error('Choisissez au moins un format de fichier.');
  }

  return {
    category,
    countryCode,
    region,
    dateStart,
    dateEnd,
    formats
  };
}

function serializeManualExportOptions(options) {
  return {
    category: options.category,
    category_label: getCategoryLabel(options.category),
    country_code: options.countryCode,
    country_label: options.countryCode === 'ALL' ? 'Tous les pays' : getCountryLabel(options.countryCode),
    territory: options.region || 'Tous les territoires',
    date_start: options.dateStart,
    date_end: options.dateEnd,
    formats: [...options.formats]
  };
}

function buildManualFilterLabel(options) {
  return [
    getCategoryLabel(options.category),
    options.countryCode === 'ALL' ? 'Tous les pays' : getCountryLabel(options.countryCode),
    options.region || 'Tous les territoires',
    `du ${formatFrenchDate(options.dateStart)} au ${formatFrenchDate(options.dateEnd)}`
  ].join(' · ');
}

function buildManualExtractionSlug(options, generatedAt) {
  const timestamp = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    timestamp,
    options.category,
    options.countryCode.toLowerCase(),
    options.region || 'tous-territoires',
    options.dateStart,
    options.dateEnd
  ].map(slugPart).join('_');
}

function getCategoryLabel(category) {
  const labels = {
    all: 'Tous les événements',
    dedicaces: 'Dédicaces',
    salons_festivals: 'Salons et festivals',
    salons: 'Salons',
    festivals: 'Festivals',
    autres: 'Autres événements'
  };
  return labels[category] || labels.all;
}

function getCountryLabel(countryCode) {
  const labels = {
    FR: 'France',
    BE: 'Belgique',
    LU: 'Luxembourg',
    CH: 'Suisse',
    MC: 'Monaco'
  };
  return labels[countryCode] || countryCode || 'Pays non précisé';
}

function eventOverlapsDateRange(event, dateStart, dateEnd) {
  const eventStart = getEventDate(event);
  const eventEnd = normalizeDate(event.end_date || eventStart);
  if (!eventStart || !eventEnd) return false;
  if (dateStart && eventEnd < dateStart) return false;
  if (dateEnd && eventStart > dateEnd) return false;
  return true;
}

function buildSocialHtml(events, title, generatedAt, format) {
  const bodyClass = `format-${htmlClass(format)}`;
  const cards = events.length
    ? events.slice(0, 80).map((event) => renderSocialCard(event, format)).join('\n')
    : '<article class="card empty">Aucun événement à afficher.</article>';

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Dédicalivres</title>
  <style>
    :root { color-scheme: light; --ink:#24150f; --paper:#fffaf4; --brand:#7b2d26; --gold:#d7a84f; --muted:#6d5a4c; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, Arial, sans-serif; color:var(--ink); background:var(--paper); }
    header { padding:24px; background:#24150f; color:#fffaf4; }
    header h1 { margin:0 0 6px; font-size:clamp(24px, 4vw, 44px); }
    header p { margin:0; color:#eadbc6; }
    main { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:18px; padding:22px; }
    .card { min-height:420px; border:1px solid #ecdcc6; border-radius:18px; overflow:hidden; background:#fff; box-shadow:0 12px 32px rgba(36,21,15,.09); }
    .visual { min-height:210px; background:linear-gradient(135deg, #7b2d26, #d7a84f); display:flex; align-items:center; justify-content:center; color:#fff; text-align:center; padding:24px; }
    .visual img { width:100%; height:100%; min-height:210px; object-fit:cover; display:block; }
    .visual span { font-size:30px; font-weight:900; line-height:1.05; }
    .content { padding:18px; }
    .badge { display:inline-block; padding:6px 10px; border-radius:999px; background:#f3e5d1; color:#7b2d26; font-weight:800; font-size:12px; text-transform:uppercase; }
    h2 { margin:14px 0 10px; font-size:24px; line-height:1.08; }
    p { margin:8px 0; color:var(--muted); line-height:1.45; }
    .caption { white-space:pre-wrap; margin-top:14px; padding:14px; border-radius:14px; background:#fff7ec; color:#38241a; font-size:14px; }
    .format-story .card { aspect-ratio:9 / 16; }
    .format-square .card { aspect-ratio:1 / 1; min-height:auto; }
    .format-wide main { grid-template-columns:1fr; }
    .format-wide .card { display:grid; grid-template-columns:minmax(280px, 42%) 1fr; min-height:360px; }
    @media (max-width: 720px) { .format-wide .card { display:block; } }
  </style>
</head>
<body class="${bodyClass}">
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>Généré le ${escapeHtml(generatedAt.toISOString())}</p>
  </header>
  <main>
    ${cards}
  </main>
</body>
</html>`;
}

function renderSocialCard(event) {
  const visual = event.image_url
    ? `<img src="${escapeAttribute(event.image_url)}" alt="${escapeAttribute(event.title)}">`
    : `<span>${escapeHtml(event.type || 'Événement littéraire')}</span>`;

  return `<article class="card">
  <div class="visual">${visual}</div>
  <div class="content">
    <span class="badge">${escapeHtml(event.type || 'Événement')}</span>
    <h2>${escapeHtml(event.title)}</h2>
    <p><strong>${escapeHtml(formatFrenchDate(event.date))}</strong>${event.city ? ` — ${escapeHtml(event.city)}` : ''}</p>
    <p>${escapeHtml([event.city, event.region].filter(Boolean).join(', '))}</p>
    <div class="caption">${escapeHtml(event.post_short)}</div>
  </div>
</article>`;
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

function buildLongPost({ title, eventDate, eventTime, city, region, description, authors, eventUrl, hashtags }) {
  const parts = [];
  parts.push(`📚 ${title}`);
  parts.push('');
  parts.push(description || 'Un événement littéraire à découvrir sur Dédicalivres.');
  parts.push('');
  parts.push(`📅 Date : ${formatFrenchDate(eventDate)}${eventTime ? ` à ${normalizeTime(eventTime)}` : ''}`);
  if (city || region) parts.push(`📍 Lieu : ${[city, region].filter(Boolean).join(' — ')}`);
  if (authors.length) parts.push(`✍️ Auteurs présents : ${authors.join(', ')}`);
  parts.push('');
  parts.push(`Découvrez la fiche complète : ${eventUrl}`);
  parts.push('');
  parts.push(hashtags.join(' '));
  return parts.join('\n');
}

function buildHashtags(event, authors) {
  const tags = ['Dédicalivres', 'Livre', 'Dédicace'];
  if (event.type) tags.push(event.type);
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

function normalizeCategory(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCountryCode(value) {
  const normalized = String(value || 'ALL').trim().toUpperCase();
  return normalized || 'ALL';
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

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function daysBetweenIsoDates(startValue, endValue) {
  const start = new Date(`${startValue}T00:00:00Z`);
  const end = new Date(`${endValue}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
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

function formatFrenchDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris'
  }).format(date);
}

function serializeHtmlJson(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function groupBy(values, getKey) {
  const map = new Map();
  values.forEach((value) => {
    const key = getKey(value);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  });
  return map;
}

function startOfUtcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysUntil(dateValue, today) {
  if (!dateValue) return Number.NaN;
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function htmlClass(value) {
  return String(value || 'default').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'default';
}

function slugPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export';
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

function getPublicExportUrl(env, key) {
  const baseUrl = trimTrailingSlash(env.R2_PUBLIC_BASE_URL || '');
  return baseUrl ? `${baseUrl}/${String(key).replace(/^\/+/, '')}` : '';
}

async function assertAdminRequest(request, env) {
  assertEnv(env);

  const authorization = request.headers.get('authorization') || '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const accessToken = tokenMatch?.[1]?.trim() || '';

  if (!accessToken) {
    throw httpError(401, 'Session administrateur absente.');
  }

  const authResponse = await fetch(`${trimTrailingSlash(env.SUPABASE_URL)}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!authResponse.ok) {
    throw httpError(401, 'Session administrateur invalide ou expirée.');
  }

  const user = await authResponse.json();
  if (!user?.id) {
    throw httpError(401, 'Utilisateur Supabase introuvable.');
  }

  const adminUrl = new URL('/rest/v1/admin_users', trimTrailingSlash(env.SUPABASE_URL));
  adminUrl.searchParams.set('select', 'user_id');
  adminUrl.searchParams.set('user_id', `eq.${user.id}`);
  adminUrl.searchParams.set('limit', '1');

  const admins = await supabaseGet(env, adminUrl);
  if (!Array.isArray(admins) || !admins.length) {
    throw httpError(403, 'Cette session ne possède pas les droits administrateur.');
  }

  return user;
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 32768) {
    throw httpError(413, 'Paramètres d’extraction trop volumineux.');
  }

  try {
    return await request.json();
  } catch {
    throw httpError(400, 'Paramètres d’extraction invalides.');
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const configuredOrigins = String(env.ALLOWED_ADMIN_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const defaultOrigins = [
    'https://dedicalivres.fr',
    'https://www.dedicalivres.fr',
    'https://xn--ddicalivres-bbb.fr',
    'null'
  ];
  const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);
  let allowedOrigin = '';

  if (!origin) {
    allowedOrigin = '*';
  } else if (allowedOrigins.has(origin) || isLocalDevelopmentOrigin(origin)) {
    allowedOrigin = origin;
  }

  const headers = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return headers;
}

function isLocalDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}
