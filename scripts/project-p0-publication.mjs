import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PASCAL = 'c69b157c-bf2f-4ddf-affa-a57497d261c2';
const SECLIN = '14b81335-1dab-4f6d-9667-5e88675c6f98';
const MAP = 'docs/territoires/event-canonical-map.json';
const SNAPSHOT = 'docs/territoires/catalogue-public.json';
const INDEX = 'evenement/index.html';
const SITEMAP = 'sitemap-evenements.xml';
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const baseline = file => execFileSync('git', ['show', `HEAD:${file}`], {encoding:'utf8'});
const stop = message => { throw new Error(`STOP projection P0 : ${message}`); };
const sameSet = (a, b) => a.size === b.size && [...a].every(value => b.has(value));
export const sitemapEntries = xml => {
  const entries = [...xml.matchAll(/^  <url><loc>([^<]+)<\/loc>.*<\/url>$/gm)];
  const map = new Map(entries.map(match => [match[1], match[0]]));
  if (map.size !== entries.length) stop('URL sitemap dupliquée ou format inattendu');
  return map;
};
const cardLinks = html => [...html.matchAll(/<a\s+class="card"\s+href="([^"]+\.html)"/g)].map(match => match[1]);
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const temporalStatus = (event, day) => {
  const start = event.start_date;
  const end = event.end_date || start;
  if ((start && !dateValid(start)) || (event.end_date && !dateValid(event.end_date))
      || (start && end < start)) return 'invalid';
  if (event.registration_force_status === 'annule') return 'registration-cancelled';
  if (!start) return 'undated';
  if (end < day) return 'past';
  return start <= day ? 'ongoing' : 'future';
};
export function assertP0Catalog(previous, current, expectedCount = 623) {
  if (!Array.isArray(previous.events) || !Array.isArray(current.events)
      || previous.events.length !== expectedCount || current.events.length !== expectedCount) {
    stop('cardinalité du catalogue public inattendue');
  }
  const oldEvents = new Map(previous.events.map(event => [event.id, event]));
  const newEvents = new Map(current.events.map(event => [event.id, event]));
  if (oldEvents.size !== expectedCount || newEvents.size !== expectedCount
      || !oldEvents.has(PASCAL) || oldEvents.has(SECLIN)
      || newEvents.has(PASCAL) || !newEvents.has(SECLIN)) stop('identités P0 incohérentes');
  for (const [id, event] of newEvents) {
    if (id !== SECLIN && JSON.stringify(event) !== JSON.stringify(oldEvents.get(id))) {
      stop(`modification métier tierce : ${id}`);
    }
  }
}
export function assertP0Manifest(old, manifest, expectedCount = 623) {
  if (old[SECLIN] || !old[PASCAL] || manifest[PASCAL] || !manifest[SECLIN]
      || Object.keys(old).length !== expectedCount || Object.keys(manifest).length !== expectedCount) {
    stop('corpus P0 initial ou généré incohérent');
  }
  if (new Set(Object.values(old)).size !== expectedCount
      || new Set(Object.values(manifest)).size !== expectedCount
      || Object.values(old).includes(`evenement/${manifest[SECLIN]}.html`)) {
    stop('URL canonique dupliquée');
  }
  for (const [id, oldPath] of Object.entries(old)) {
    if (id !== PASCAL && `evenement/${manifest[id]}.html` !== oldPath) {
      stop(`URL tierce modifiée : ${id}`);
    }
  }
}
export function assertAllowedPageChanges(changes, pascalPath) {
  if (changes.some(file => file !== pascalPath && file !== INDEX)) stop('fiche tierce déjà modifiée');
}
export function assertSitemapScope(currentEntries, generatedEntries, oldUrl, newUrl, expectedCount = 624) {
  const expected = new Set([...currentEntries.keys()].filter(url => url !== oldUrl));
  expected.add(newUrl);
  if (!sameSet(expected, new Set(generatedEntries.keys()))
      || currentEntries.size !== expectedCount || generatedEntries.size !== expectedCount) {
    stop('sitemap généré hors périmètre');
  }
  return expected;
}
export function businessFingerprint(html) {
  const field = expression => html.match(expression)?.[1] || '';
  const images = [...new Set([...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(match => match[1]))].sort();
  return JSON.stringify({
    title:field(/<title>([^<]*)<\/title>/),
    description:field(/<meta name="description" content="([^"]*)"/),
    canonical:field(/<link rel="canonical" href="([^"]*)"/),
    jsonld:field(/<script type="application\/ld\+json">([^<]*)<\/script>/),
    longDescription:field(/<div class="(?:desc|detail-description)">([\s\S]*?)<\/div>/),
    source:field(/Source : ([\s\S]*?)<br>/),
    images,
  });
}

function projectPages(exportRoot) {
  if (process.env.PUBLICATION_P0_TARGETED !== 'true') stop('mode ciblé absent');
  const old = JSON.parse(baseline(MAP));
  const manifest = json(path.join(exportRoot, 'event-pages-manifest.json')).events;
  const allowedIds = JSON.parse(process.env.PUBLICATION_DEPUBLISH_EVENT_IDS || '[]');
  const allowedPaths = JSON.parse(process.env.PUBLICATION_DEPUBLISH_PATHS || '[]');
  if (JSON.stringify(allowedIds) !== JSON.stringify([PASCAL])
      || JSON.stringify(allowedPaths) !== JSON.stringify([old[PASCAL]])) {
    stop('autorisation de retrait différente de Pascal');
  }
  assertP0Manifest(old, manifest);
  const seclin = `evenement/${manifest[SECLIN]}.html`;
  if (!/^evenement\/[^/]+\.html$/.test(seclin) || !fs.existsSync(path.join(exportRoot, seclin))) {
    stop('fiche Seclin générée absente');
  }
  if (!fs.existsSync(old[PASCAL])) {
    const currentMap = json(MAP);
    if (currentMap[PASCAL] || currentMap[SECLIN] !== seclin || !fs.existsSync(seclin)) {
      stop('fiche Pascal historique manquante avant projection');
    }
  } else if (fs.existsSync(seclin)) {
    stop('fiche Seclin déjà présente avant retrait de Pascal');
  }
  for (const [id, oldPath] of Object.entries(old)) {
    if (id === PASCAL) continue;
    if (!fs.existsSync(oldPath) || !fs.existsSync(path.join(exportRoot, oldPath))
        || businessFingerprint(read(oldPath)) !== businessFingerprint(read(path.join(exportRoot, oldPath)))) {
      stop(`donnée enrichie ou métier tierce différente : ${id}`);
    }
  }
  const currentChanges = execFileSync('git', ['diff', '--name-only', '--', 'evenement'], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
  assertAllowedPageChanges(currentChanges, old[PASCAL]);
  const generatedIndex = read(path.join(exportRoot, INDEX));
  const beforeLinks = cardLinks(baseline(INDEX));
  const afterLinks = cardLinks(generatedIndex);
  const oldSlug = path.basename(old[PASCAL]);
  const newSlug = path.basename(seclin);
  const otherBefore = beforeLinks.filter(link => link !== oldSlug && link !== newSlug);
  const otherAfter = afterLinks.filter(link => link !== oldSlug && link !== newSlug);
  const day = process.env.PUBLICATION_REFERENCE_DATE;
  if (!dateValid(day)) stop('date de référence invalide');
  const oldEvents = JSON.parse(baseline(SNAPSHOT)).events;
  const expected = new Set(oldEvents.filter(event => event.id !== PASCAL
    && dateValid(event.start_date) && dateValid(event.end_date || event.start_date)
    && (event.end_date || event.start_date) >= event.start_date
    && (event.end_date || event.start_date) >= day)
    .map(event => path.basename(old[event.id] || '')));
  const known = new Map(oldEvents.map(event => [path.basename(old[event.id] || ''), event]));
  if (!beforeLinks.includes(oldSlug) || beforeLinks.includes(newSlug)
      || afterLinks.includes(oldSlug) || !afterLinks.includes(newSlug)
      || new Set(beforeLinks).size !== beforeLinks.length
      || new Set(afterLinks).size !== afterLinks.length
      || !sameSet(expected, new Set(otherAfter))
      || otherBefore.some(link => !known.has(link))
      || [...expected].some(link => !otherBefore.includes(link))
      || otherBefore.some(link => !otherAfter.includes(link)
        && (known.get(link)?.end_date || known.get(link)?.start_date) >= day)) {
    stop('index événementiel hors transitions temporelles attendues');
  }
  const currentSitemap = read(SITEMAP);
  const generatedSitemap = read(path.join(exportRoot, SITEMAP));
  const currentEntries = sitemapEntries(currentSitemap);
  const generatedEntries = sitemapEntries(generatedSitemap);
  const oldUrl = `https://dedicalivres.fr/${old[PASCAL]}`;
  const newUrl = `https://dedicalivres.fr/${seclin}`;
  const indexUrl = `https://dedicalivres.fr/${INDEX}`;
  const expectedUrls = assertSitemapScope(currentEntries, generatedEntries, oldUrl, newUrl);
  if (!generatedEntries.has(indexUrl)) stop('index absent du sitemap généré');

  if (fs.existsSync(old[PASCAL])) fs.unlinkSync(old[PASCAL]);
  fs.copyFileSync(path.join(exportRoot, seclin), seclin);
  fs.writeFileSync(INDEX, generatedIndex);
  let projected = currentSitemap;
  if (currentEntries.has(oldUrl)) projected = projected.replace(`${currentEntries.get(oldUrl)}\n`, '');
  if (currentEntries.has(indexUrl)) projected = projected.replace(currentEntries.get(indexUrl), generatedEntries.get(indexUrl));
  if (!currentEntries.has(newUrl)) projected = projected.replace('</urlset>', `${generatedEntries.get(newUrl)}\n</urlset>`);
  fs.writeFileSync(SITEMAP, projected);
  if (!sameSet(new Set(sitemapEntries(projected).keys()), expectedUrls)) stop('sitemap projeté incomplet');
  console.log('PASS projection P0 : Seclin ajouté, Pascal retiré, 621 autres fiches conservées');
}

function pageItems(html) {
  return [...html.matchAll(/<li data-event-id="([^"]+)" data-status="([^"]+)">([\s\S]*?)<\/li>/g)]
    .map(match => [match[1], match[2], match[0]]);
}
function previewIds(html) {
  return [...html.matchAll(/<article[^>]*data-event-id="([^"]+)"[^>]*data-static-event-preview="true"/g)]
    .map(match => match[1]);
}
export function normalizeMetadata(html) {
  return html
    .replace(/"dateModified":"\d{4}-\d{2}-\d{2}"/g, '"dateModified":"DATE"')
    .replace(/data-as-of="\d{4}-\d{2}-\d{2}"/g, 'data-as-of="DATE"')
    .replace(/<time datetime="\d{4}-\d{2}-\d{2}T[^"]+">[^<]+<\/time>/g, '<time datetime="CAPTURE">CAPTURE</time>')
    .replace(/Classement arrêté au [^.]+\./g, 'Classement arrêté au DATE.')
    .replace(/capture publique à \d{2}:\d{2} UTC/g, 'capture publique à TIME UTC');
}
function projectAggregates() {
  if (process.env.PUBLICATION_P0_TARGETED !== 'true') stop('mode ciblé absent');
  const date = process.env.PUBLICATION_REFERENCE_DATE;
  if (!dateValid(date)) stop('date Europe/Paris invalide');
  const previous = JSON.parse(baseline(SNAPSHOT));
  const current = json(SNAPSHOT);
  assertP0Catalog(previous, current);
  const oldEvents = new Map(previous.events.map(event => [event.id, event]));
  const newEvents = new Map(current.events.map(event => [event.id, event]));
  const oldDate = JSON.parse(baseline('docs/territoires/audit.json')).today;
  if (!dateValid(oldDate)) stop('date de référence du snapshot Git invalide');
  const files = fs.readdirSync('.').filter(file => /^evenements-litteraires-.*\.html$/.test(file));
  const restored = new Set();
  const changed = new Set();
  const oldCards = new Map();
  const newCards = new Map();
  const collectCards = (target, items) => {
    for (const [id, , markup] of items) {
      const normalized = markup.replace(/data-status="[^"]+"/, 'data-status="STATUS"')
        .replace(' · En cours</p>', '</p>');
      if (!target.has(id)) target.set(id, new Set());
      target.get(id).add(normalized);
    }
  };
  for (const file of files) {
    let old;
    try { old = baseline(file); } catch { stop(`nouvel agrégat non validé : ${file}`); }
    const fresh = read(file);
    const oldItems = pageItems(old), newItems = pageItems(fresh);
    collectCards(oldCards, oldItems);
    collectCards(newCards, newItems);
    const oldPreview = previewIds(old), newPreview = previewIds(fresh);
    for (const [id, status] of oldItems) {
      if (!oldEvents.has(id) || temporalStatus(oldEvents.get(id), oldDate) !== status) {
        stop(`statut historique incohérent : ${file} / ${id}`);
      }
    }
    for (const [id, status] of newItems) {
      if (!newEvents.has(id) || temporalStatus(newEvents.get(id), date) !== status) {
        stop(`statut projeté incohérent : ${file} / ${id}`);
      }
    }
    const beforeCards = new Map(oldItems.map(([id, status, markup]) => [id, {status, markup}]));
    for (const [id, status, markup] of newItems) {
      const previousCard = beforeCards.get(id);
      if (previousCard?.status === status && previousCard.markup !== markup) {
        stop(`contenu tiers modifié dans l'agrégat : ${file} / ${id}`);
      }
    }
    if (old === fresh) { restored.add(file); continue; }
    if (JSON.stringify(oldItems.map(item => item.slice(0,2))) === JSON.stringify(newItems.map(item => item.slice(0,2)))
        && JSON.stringify(oldPreview) === JSON.stringify(newPreview)) {
      if (normalizeMetadata(old) !== normalizeMetadata(fresh)) stop(`agrégat modifié sans événement : ${file}`);
      fs.writeFileSync(file, old);
      restored.add(file);
    } else {
      changed.add(file);
    }
  }
  if (oldCards.size !== previous.events.length || newCards.size !== current.events.length
      || oldCards.has(SECLIN) || newCards.has(PASCAL) || !newCards.has(SECLIN)) {
    stop('couverture des événements dans les agrégats incohérente');
  }
  for (const id of oldEvents.keys()) {
    if (id !== PASCAL && (!newCards.has(id) || !sameSet(oldCards.get(id), newCards.get(id)))) {
      stop(`présentation ou fiche tierce altérée dans les agrégats : ${id}`);
    }
  }
  const oldSitemap = baseline('sitemap.xml');
  let sitemap = read('sitemap.xml');
  for (const file of changed) {
    const url = read(file).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    if (!url) stop(`canonique agrégat absent : ${file}`);
    const entry = [...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map(match => match[0]).find(value => value.includes(`<loc>${url}</loc>`));
    if (!entry) stop(`sitemap agrégat absent : ${file}`);
    const updated = entry.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${date}</lastmod>`);
    if (updated === entry && !entry.includes(`<lastmod>${date}</lastmod>`)) stop(`lastmod absent : ${file}`);
    sitemap = sitemap.replace(entry, updated);
  }
  for (const file of restored) {
    const url = baseline(file).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    if (!url) stop(`canonique territoriale absente : ${file}`);
    const oldEntry = [...oldSitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map(match => match[0]).find(entry => entry.includes(`<loc>${url}</loc>`));
    const freshEntry = [...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map(match => match[0]).find(entry => entry.includes(`<loc>${url}</loc>`));
    if (!oldEntry || !freshEntry) stop(`sitemap territorial absent : ${file}`);
    sitemap = sitemap.replace(freshEntry, oldEntry);
  }
  fs.writeFileSync('sitemap.xml', sitemap);
  console.log(`PASS agrégats P0 : ${changed.size} pages justifiées par événements/statuts, ${restored.size} pages sans changement conservées`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [phase, exportRoot] = process.argv.slice(2);
  if (phase === 'pages' && exportRoot) projectPages(exportRoot);
  else if (phase === 'aggregates') projectAggregates();
  else stop('usage : pages <export> | aggregates');
}
