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
const MANUAL_EXPORT_FORMATS = new Set(['json', 'csv', 'markdown']);
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
  const requestedFormats = Array.isArray(rawOptions.formats) ? rawOptions.formats : ['json', 'csv', 'markdown'];
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
