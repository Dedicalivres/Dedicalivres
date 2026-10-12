import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {businessFingerprint, normalizeMetadata, sitemapEntries, temporalStatus} from './project-p0-publication.mjs';

const MAP = 'docs/territoires/event-canonical-map.json';
const SNAPSHOT = 'docs/territoires/catalogue-public.json';
const INDEX = 'evenement/index.html';
const SITEMAP = 'sitemap-evenements.xml';
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const baseline = file => execFileSync('git', ['show', `HEAD:${file}`], {encoding:'utf8'});
const stop = message => { throw new Error(`STOP projection ciblée : ${message}`); };
const sameSet = (a, b) => a.size === b.size && [...a].every(value => b.has(value));
const validPath = value => /^evenement\/[^/]+\.html$/.test(value) && value !== INDEX;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const cardLinks = html => [...html.matchAll(/<a\s+class="card"\s+href="([^"]+\.html)"/g)].map(match => match[1]);
const pageItems = html => [...html.matchAll(/<li data-event-id="([^"]+)" data-status="([^"]+)">([\s\S]*?)<\/li>/g)]
  .map(match => [match[1], match[2], match[0]]);
const previewIds = html => [...html.matchAll(/<article[^>]*data-event-id="([^"]+)"[^>]*data-static-event-preview="true"/g)]
  .map(match => match[1]);
export const metadataOnlyAggregate = (old, fresh) =>
  JSON.stringify(pageItems(old)) === JSON.stringify(pageItems(fresh))
  && JSON.stringify(previewIds(old)) === JSON.stringify(previewIds(fresh))
  && normalizeMetadata(old) === normalizeMetadata(fresh);

export function parseJobs(raw) {
  let rows;
  try { rows = JSON.parse(raw); } catch { stop('PUBLICATION_JOBS invalide'); }
  if (!Array.isArray(rows) || rows.length === 0) stop('liste de jobs absente');
  const jobIds = new Set();
  const allowed = new Set();
  const removals = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/.test(row.id)
        || jobIds.has(row.id) || !['validation', 'edit', 'unpublish', 'delete', 'manual'].includes(row.reason)
        || (row.reason === 'manual' ? row.event_id !== null : !/^[0-9a-f-]{36}$/.test(row.event_id || ''))) {
      stop('job ou identité non autorisé');
    }
    jobIds.add(row.id);
    if (row.event_id) allowed.add(row.event_id);
    if (row.reason === 'unpublish' || row.reason === 'delete') removals.add(row.event_id);
  }
  return {allowed, removals};
}

export function assertCatalog(previous, current, allowed) {
  if (!Array.isArray(previous.events) || !Array.isArray(current.events)) stop('snapshot public invalide');
  const before = new Map(previous.events.map(event => [event.id, event]));
  const after = new Map(current.events.map(event => [event.id, event]));
  if (before.size !== previous.events.length || after.size !== current.events.length) stop('UUID public dupliqué');
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (!allowed.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) {
      stop(`modification métier tierce : ${id}`);
    }
  }
  return {before, after};
}

export function assertManifest(old, manifest, allowed, legacy) {
  const oldPaths = Object.values(old);
  const newPaths = Object.values(manifest).map(slug => `evenement/${slug}.html`);
  if (oldPaths.some(value => !validPath(value)) || newPaths.some(value => !validPath(value))
      || new Set(oldPaths).size !== oldPaths.length || new Set(newPaths).size !== newPaths.length) {
    stop('URL canonique invalide ou dupliquée');
  }
  for (const id of new Set([...Object.keys(old), ...Object.keys(manifest)])) {
    const next = manifest[id] ? `evenement/${manifest[id]}.html` : undefined;
    if (!allowed.has(id) && old[id] !== next) stop(`URL tierce modifiée : ${id}`);
    if (legacy.has(id) && old[id] !== next) stop(`fiche legacy modifiée : ${id}`);
  }
}

const field = (html, expression) => html.match(expression)?.[1] || '';
const schema = html => {
  try { return JSON.parse(field(html, /<script type="application\/ld\+json">([^<]*)<\/script>/)); }
  catch { return {}; }
};
export function assertEnrichment(oldHtml, freshHtml) {
  const old = schema(oldHtml), fresh = schema(freshHtml);
  const rich = value => value !== undefined && value !== null && value !== ''
    && !(Array.isArray(value) && value.length === 0);
  const oldAddress = old.location?.address || {};
  const newAddress = fresh.location?.address || {};
  for (const [label, before, after] of [
    ['description', old.description, fresh.description],
    ['auteurs', old.performer, fresh.performer],
    ['organisateur', old.organizer, fresh.organizer],
    ['adresse', oldAddress.streetAddress, newAddress.streetAddress],
    ['code postal', oldAddress.postalCode, newAddress.postalCode],
    ['image JSON-LD', old.image, fresh.image],
    ['source', field(oldHtml, /Source : ([\s\S]*?)<br>/), field(freshHtml, /Source : ([\s\S]*?)<br>/)],
    ['image SEO', field(oldHtml, /<meta property="og:image" content="([^"]*)"/), field(freshHtml, /<meta property="og:image" content="([^"]*)"/)],
  ]) if (rich(before) && !rich(after)) stop(`perte d'enrichissement : ${label}`);
  const images = html => new Set([...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(match => match[1]));
  if (images(oldHtml).size && !images(freshHtml).size) stop('perte de portrait ou image');
}

export function assertIndex(snapshot, manifest, html, day) {
  if (!validDate(day)) stop('date Europe/Paris invalide');
  const links = cardLinks(html);
  const expected = new Set(snapshot.events.filter(event => {
    const start = event.start_date, end = event.end_date || start;
    return validDate(start) && validDate(end) && end >= start && end >= day;
  }).map(event => path.basename(`evenement/${manifest[event.id]}.html`)));
  if (links.length !== new Set(links).size || !sameSet(new Set(links), expected)) {
    stop('index hors catalogue ou transitions temporelles');
  }
}

export function assertSitemap(oldXml, freshXml, oldMap, manifest, allowed) {
  const before = sitemapEntries(oldXml), after = sitemapEntries(freshXml);
  const indexUrl = `https://dedicalivres.fr/${INDEX}`;
  const expected = new Set([indexUrl, ...Object.values(manifest).map(slug => `https://dedicalivres.fr/evenement/${slug}.html`)]);
  if (!sameSet(new Set(after.keys()), expected)) stop('sitemap généré incohérent');
  const oldUrls = new Set(Object.values(oldMap).map(value => `https://dedicalivres.fr/${value}`));
  for (const url of oldUrls) {
    if (!after.has(url) && ![...allowed].some(id => oldMap[id] && url === `https://dedicalivres.fr/${oldMap[id]}`)) {
      stop(`suppression non autorisée du sitemap : ${url}`);
    }
  }
  if (!before.has(indexUrl)) stop('index historique absent du sitemap');
  return {before, after, expected};
}

function context() {
  if (process.env.PUBLICATION_TARGETED !== 'true') stop('mode ciblé absent');
  const jobs = parseJobs(process.env.PUBLICATION_JOBS || '');
  const legacy = new Set(Object.keys(json('scripts/event-publisher/legacy-enriched-events.json').events));
  if (legacy.size !== 282 || [...jobs.allowed].some(id => legacy.has(id))) stop('protection 282 legacy');
  const day = process.env.PUBLICATION_REFERENCE_DATE;
  if (!validDate(day)) stop('date Europe/Paris invalide');
  return {...jobs, legacy, day};
}

function projectPages(exportRoot) {
  const {allowed, removals, legacy, day} = context();
  const old = JSON.parse(baseline(MAP));
  const manifest = json(path.join(exportRoot, 'event-pages-manifest.json')).events;
  const source = json(path.join(exportRoot, 'public-events-source.json'));
  if (!Array.isArray(source) || new Set(source.map(event => event.id)).size !== source.length
      || !sameSet(new Set(Object.keys(manifest)), new Set(source.map(event => event.id)))) stop('source publique générée incohérente');
  assertManifest(old, manifest, allowed, legacy);
  for (const id of removals) if (manifest[id]) stop(`dépublication toujours publique : ${id}`);
  const authorizedPaths = new Set([...allowed].flatMap(id => [old[id], manifest[id] && `evenement/${manifest[id]}.html`].filter(Boolean)));
  const changed = execFileSync('git', ['diff', '--name-only', '--', 'evenement'], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
  if (changed.some(file => file !== INDEX && !authorizedPaths.has(file))) stop('fiche tierce déjà modifiée');
  for (const [id, oldPath] of Object.entries(old)) {
    if (allowed.has(id)) continue;
    const fresh = path.join(exportRoot, oldPath);
    if (!fs.existsSync(oldPath) || !fs.existsSync(fresh)
        || businessFingerprint(read(oldPath)) !== businessFingerprint(read(fresh))) {
      stop(`donnée métier tierce différente : ${id}`);
    }
  }
  for (const id of allowed) {
    const oldPath = old[id], freshPath = manifest[id] && `evenement/${manifest[id]}.html`;
    if (oldPath && freshPath) assertEnrichment(read(oldPath), read(path.join(exportRoot, freshPath)));
    if (freshPath && !fs.existsSync(path.join(exportRoot, freshPath))) stop(`fiche générée absente : ${id}`);
  }
  const generatedIndex = read(path.join(exportRoot, INDEX));
  assertIndex({events:source}, manifest, generatedIndex, day);
  const oldXml = read(SITEMAP), freshXml = read(path.join(exportRoot, SITEMAP));
  const {before, after, expected} = assertSitemap(oldXml, freshXml, old, manifest, allowed);
  const removalsArg = JSON.parse(process.env.PUBLICATION_DEPUBLISH_PATHS || '[]');
  const idsArg = JSON.parse(process.env.PUBLICATION_DEPUBLISH_EVENT_IDS || '[]');
  if (!Array.isArray(removalsArg) || !Array.isArray(idsArg) || removalsArg.length !== idsArg.length
      || idsArg.some((id, index) => !allowed.has(id) || old[id] !== removalsArg[index])) {
    stop('autorisation des suppressions incohérente');
  }
  const removedPaths = [...allowed].filter(id => old[id] && old[id] !== (manifest[id] && `evenement/${manifest[id]}.html`))
    .map(id => old[id]);
  if (removedPaths.some(value => !removalsArg.includes(value))) stop('suppression non autorisée');

  for (const oldPath of removedPaths) fs.unlinkSync(oldPath);
  for (const id of allowed) {
    if (!manifest[id]) continue;
    const target = `evenement/${manifest[id]}.html`;
    const fresh = path.join(exportRoot, target);
    if (!fs.existsSync(target) || read(target) !== read(fresh)) fs.copyFileSync(fresh, target);
  }
  if (read(INDEX) !== generatedIndex) fs.writeFileSync(INDEX, generatedIndex);
  let projected = oldXml;
  for (const id of allowed) {
    const previousUrl = old[id] && `https://dedicalivres.fr/${old[id]}`;
    const nextUrl = manifest[id] && `https://dedicalivres.fr/evenement/${manifest[id]}.html`;
    if (previousUrl && previousUrl !== nextUrl) projected = projected.replace(`${before.get(previousUrl)}\n`, '');
    if (nextUrl && before.has(nextUrl)) projected = projected.replace(before.get(nextUrl), after.get(nextUrl));
    else if (nextUrl) projected = projected.replace('</urlset>', `${after.get(nextUrl)}\n</urlset>`);
  }
  const indexUrl = `https://dedicalivres.fr/${INDEX}`;
  if (read(INDEX) !== baseline(INDEX)) projected = projected.replace(before.get(indexUrl), after.get(indexUrl));
  if (!sameSet(new Set(sitemapEntries(projected).keys()), expected)) stop('sitemap projeté incohérent');
  if (projected !== oldXml) fs.writeFileSync(SITEMAP, projected);
  console.log(`PASS projection ciblée : ${allowed.size} événement(s), fiches tierces conservées`);
}

function projectAggregates() {
  const {allowed, day} = context();
  const previous = JSON.parse(baseline(SNAPSHOT)), current = json(SNAPSHOT);
  const {before, after} = assertCatalog(previous, current, allowed);
  const oldDate = JSON.parse(baseline('docs/territoires/audit.json')).today;
  if (!validDate(oldDate)) stop('date historique invalide');
  const oldCards = new Map(), newCards = new Map();
  const collect = (target, items) => {
    for (const [id, , markup] of items) {
      const normalized = markup.replace(/data-status="[^"]+"/, 'data-status="STATUS"')
        .replace(' · En cours</p>', '</p>');
      if (!target.has(id)) target.set(id, new Set());
      target.get(id).add(normalized);
    }
  };
  const restored = new Set(), changed = new Set();
  for (const file of fs.readdirSync('.').filter(value => /^evenements-litteraires-.*\.html$/.test(value))) {
    let old;
    try { old = baseline(file); } catch { old = null; }
    const fresh = read(file), oldItems = old ? pageItems(old) : [], newItems = pageItems(fresh);
    if (old === null && newItems.some(([id]) => !allowed.has(id))) stop(`nouvel agrégat tiers : ${file}`);
    collect(oldCards, oldItems); collect(newCards, newItems);
    for (const [id, status] of oldItems) if (!before.has(id) || temporalStatus(before.get(id), oldDate) !== status) stop(`statut historique incohérent : ${file}/${id}`);
    for (const [id, status] of newItems) if (!after.has(id) || temporalStatus(after.get(id), day) !== status) stop(`statut projeté incohérent : ${file}/${id}`);
    const oldById = new Map(oldItems.map(([id, status, markup]) => [id, {status, markup}]));
    for (const [id, status, markup] of newItems) {
      const prior = oldById.get(id);
      if (!allowed.has(id) && prior?.status === status && prior.markup !== markup) stop(`contenu tiers modifié : ${file}/${id}`);
    }
    if (old === fresh) { restored.add(file); continue; }
    if (old && JSON.stringify(oldItems) === JSON.stringify(newItems)
        && JSON.stringify(previewIds(old)) === JSON.stringify(previewIds(fresh))) {
      if (!metadataOnlyAggregate(old, fresh)) stop(`agrégat modifié sans événement : ${file}`);
      fs.writeFileSync(file, old); restored.add(file);
    } else changed.add(file);
  }
  if (oldCards.size !== before.size || newCards.size !== after.size) stop('couverture territoriale incomplète');
  for (const id of before.keys()) if (!allowed.has(id)
      && (!newCards.has(id) || !sameSet(oldCards.get(id), newCards.get(id)))) stop(`présentation tierce modifiée : ${id}`);
  const oldSitemap = baseline('sitemap.xml');
  let sitemap = read('sitemap.xml');
  const entryFor = (xml, url) => [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map(match => match[0])
    .find(entry => entry.includes(`<loc>${url}</loc>`));
  for (const file of changed) {
    const url = field(read(file), /<link rel="canonical" href="([^"]+)"/);
    const entry = entryFor(sitemap, url);
    if (!url || !entry) stop(`sitemap territorial absent : ${file}`);
    sitemap = sitemap.replace(entry, entry.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${day}</lastmod>`));
  }
  for (const file of restored) {
    const url = field(baseline(file), /<link rel="canonical" href="([^"]+)"/);
    const oldEntry = entryFor(oldSitemap, url), freshEntry = entryFor(sitemap, url);
    if (!url || !oldEntry || !freshEntry) stop(`sitemap territorial absent : ${file}`);
    sitemap = sitemap.replace(freshEntry, oldEntry);
  }
  if (sitemap !== read('sitemap.xml')) fs.writeFileSync('sitemap.xml', sitemap);
  console.log(`PASS agrégats ciblés : ${changed.size} modifiés, ${restored.size} préservés`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [phase, exportRoot] = process.argv.slice(2);
  if (phase === 'pages' && exportRoot) projectPages(exportRoot);
  else if (phase === 'aggregates') projectAggregates();
  else stop('usage : pages <export> | aggregates');
}
