// Temporary, offline-only authorization gate. Deliberately not imported by EXECUTE.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertCatalog, assertManifest} from './project-targeted-publication.mjs';
import {validDate} from './territorial-catalog.mjs';

export const SCOPE = Object.freeze({
  '83270534-e551-4562-8805-f10240a6007c': Object.freeze(['city', 'region']),
  'ec8ec360-b0c4-41ca-b400-87dd1ffde104': Object.freeze(['start_date', 'end_date', 'description']),
  'eb6672b2-900f-4c6a-9021-ea84c5036769': Object.freeze(['start_date', 'end_date', 'description']),
});
const TARGET = {
  '83270534-e551-4562-8805-f10240a6007c': {city:'Brive-la-Gaillarde',region:'Nouvelle-Aquitaine'},
  'ec8ec360-b0c4-41ca-b400-87dd1ffde104': {start_date:'2026-09-29',end_date:'2026-10-04'},
  'eb6672b2-900f-4c6a-9021-ea84c5036769': {start_date:'2026-11-20',end_date:'2026-11-25'},
};
const OFFICIAL = {
  '83270534-e551-4562-8805-f10240a6007c': ['www.foiredulivredebrive.net', 'www.brive.fr'],
  'ec8ec360-b0c4-41ca-b400-87dd1ffde104': ['www.ville-senlis.fr', 'www.visitchantillysenlis.com'],
  'eb6672b2-900f-4c6a-9021-ea84c5036769': ['salondulivrejeunesselorient.fr', 'lorient-evenements.bzh'],
};
const stop = reason => { throw Error(`STOP SEO-GEO : ${reason}`); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(stable(value))).digest('hex');
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && equal(Object.keys(value).sort(), expected.slice().sort());
const rowsById = rows => {
  if (!Array.isArray(rows) || rows.some(r => !r || !uuid(r.id)) || new Set(rows.map(r => r.id)).size !== rows.length) stop('source dupliquée ou invalide');
  return new Map(rows.map(r => [r.id, r]));
};
const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;'}[ch]));
function schemas(html) {
  try { return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])); }
  catch { stop('JSON-LD invalide'); }
}
export function verifyIdentity(html, id, canonical) {
  if (!uuid(id) || !/^evenement\/[a-z0-9][a-z0-9-]*\.html$/.test(canonical) || canonical === 'evenement/index.html') stop('canonical invalide');
  const url = `https://dedicalivres.fr/${canonical}`;
  const blocks = schemas(html), events = blocks.filter(s => s['@type'] === 'Event');
  const crumbs = blocks.filter(s => s['@type'] === 'BreadcrumbList');
  if (!equal([...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m => m[1]), [url])
      || !equal([...html.matchAll(/data-event-id="([^"]+)"/g)].map(m => m[1]), [id])
      || events.length !== 1 || events[0].url !== url || crumbs.length !== 1
      || crumbs[0].itemListElement?.at(-1)?.item !== url) stop('identité, canonical ou breadcrumb ambigu');
  return events[0];
}

// Capture supplied read-only data; this function has no network or database client.
export function captureBaseline(root, source, queue, baseSha, day, dependencySha) {
  const read = relative => {
    const file = path.join(root, relative);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) stop('fichier absent ou lien symbolique');
    return fs.readFileSync(file, 'utf8');
  };
  const canonical = JSON.parse(read('docs/territoires/event-canonical-map.json'));
  const legacy = JSON.parse(read('scripts/event-publisher/legacy-enriched-events.json')).events;
  const catalog = JSON.parse(read('docs/territoires/catalogue-public.json'));
  if (!validDate(day) || !/^[a-f0-9]{40}$/.test(baseSha || '') || !/^[a-f0-9]{40}$/.test(dependencySha || '')
      || Object.keys(legacy).length !== 282 || new Set(Object.values(canonical)).size !== Object.keys(canonical).length) stop('base canonique/legacy/date incomplète');
  const catalogRows = rowsById(catalog.events);
  if (!equal([...catalogRows.keys()].sort(), Object.keys(canonical).sort())) stop('corpus canonique incohérent');
  const pages = Object.fromEntries(Object.entries(canonical).map(([id, file]) => {
    if (!/^evenement\/[a-z0-9][a-z0-9-]*\.html$/.test(file) || file === 'evenement/index.html') stop('chemin canonique invalide');
    return [id, read(file)];
  }));
  for (const [id, filename] of Object.entries(legacy)) if (canonical[id] !== `evenement/${filename}`) stop('legacy/canonical incohérent');
  for (const id of Object.keys(SCOPE)) verifyIdentity(pages[id] || '', id, canonical[id]);
  const protectedFiles = Object.fromEntries([
    'sitemap.xml','sitemap-evenements.xml','event-canonical.js',
    ...fs.readdirSync(root).filter(f => f.endsWith('.html')),
    ...fs.readdirSync(path.join(root,'auteurs')).filter(f => f.endsWith('.html')).map(f => `auteurs/${f}`),
  ].map(file => [file,digest(read(file))]));
  rowsById(source);
  if (!Array.isArray(queue) || queue.some(j => !j || !uuid(j.id)) || new Set(queue.map(j => j.id)).size !== queue.length) stop('file illisible');
  return {baseSha, dependencySha, day, canonical, legacy, catalog, pages, protectedFiles, source, queue};
}
export function baselineDigest(state) {
  return digest({...state, source:state.source.slice().sort((a,b) => a.id.localeCompare(b.id)),
    queue:state.queue.slice().sort((a,b) => a.id.localeCompare(b.id))});
}

const slotPatterns = {
  dates: /(<div><b>Dates<\/b> )([^<]*)(<\/div>)/g,
  location: /(<div><b>Lieu<\/b> )([^<]*)(<\/div>)/g,
  description: /(<div class="desc">)([\s\S]*?)(<\/div>)/g,
  title: /(<title>)([^<]*)(<\/title>)/g,
  meta_description: /(<meta name="description" content=")([^"]*)(">)/g,
  og_description: /(<meta property="og:description" content=")([^"]*)(">)/g,
};
function renderSlots(html, slots, event) {
  let result = html;
  if (!slots || Array.isArray(slots) || Object.keys(slots).some(k => !Object.hasOwn(slotPatterns,k))) stop('zone HTML non autorisée');
  for (const [key, text] of Object.entries(slots)) {
    if (typeof text !== 'string' || !text.trim()) stop('zone HTML vide');
    const expression = slotPatterns[key];
    if ([...result.matchAll(expression)].length !== 1) stop('zone HTML ambiguë');
    result = result.replace(expression, (_, start, old, end) => start + escape(text) + end);
  }
  const blocks = [...result.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const block = blocks.find(m => JSON.parse(m[1])['@type'] === 'Event');
  const encoded = JSON.stringify(event).replace(/</g, '\\u003c');
  return result.replace(block[0], `<script type="application/ld+json">${encoded}</script>`);
}
function changedLeaves(a, b, prefix = '') {
  if (equal(a,b)) return [];
  if (a && b && !Array.isArray(a) && !Array.isArray(b) && typeof a === 'object' && typeof b === 'object')
    return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k => changedLeaves(a[k],b[k],prefix ? `${prefix}.${k}` : k));
  return [prefix];
}
function assertEnrichment(entry, html, nextRow) {
  const before = verifyIdentity(html, entry.event_id, entry.canonical), after = entry.event;
  const allowed = new Set(['organizer.name', 'organizer.url']);
  if (entry.event_id === '83270534-e551-4562-8805-f10240a6007c') {
    for (const k of ['location.name','location.address.addressLocality','location.address.addressRegion']) allowed.add(k);
  } else {
    for (const k of ['startDate','endDate','description','location.name','location.address.streetAddress']) allowed.add(k);
    if (entry.event_id === 'ec8ec360-b0c4-41ca-b400-87dd1ffde104') allowed.add('organizer.description');
  }
  if (!after || changedLeaves(before, after).some(k => !allowed.has(k))) stop('enrichissement tiers modifié ou perdu');
  const expectedOrganizers = {
    '83270534-e551-4562-8805-f10240a6007c':'Ville de Brive',
    'ec8ec360-b0c4-41ca-b400-87dd1ffde104':'Bibliothèque municipale de Senlis',
    'eb6672b2-900f-4c6a-9021-ea84c5036769':"Ligue de l'enseignement du Morbihan",
  };
  if (after.organizer?.name !== expectedOrganizers[entry.event_id] || after.organizer?.url !== undefined
      || after.startDate !== nextRow.start_date || after.endDate !== nextRow.end_date
      || after.location?.address?.addressLocality !== nextRow.city
      || after.location?.address?.addressRegion !== nextRow.region) stop('HTML/source/JSON-LD incohérents');
  if (entry.event_id === '83270534-e551-4562-8805-f10240a6007c' && after.location?.name !== nextRow.city) stop('manifestation Brive multisite incohérente');
  const dateText = value => new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${value}T12:00:00Z`));
  const dates = dateText(nextRow.start_date) + (nextRow.end_date !== nextRow.start_date ? ` → ${dateText(nextRow.end_date)}` : '');
  const location = `${nextRow.city}, ${nextRow.region}`;
  if (('start_date' in entry.patch || 'end_date' in entry.patch) && entry.slots?.dates !== dates) stop('dates visibles incohérentes');
  if (('city' in entry.patch || 'region' in entry.patch) && entry.slots?.location !== location) stop('lieu visible incohérent');
  if (entry.slots?.dates !== undefined && entry.slots.dates !== dates
      || entry.slots?.location !== undefined && entry.slots.location !== location
      || entry.slots?.description !== undefined && entry.slots.description !== nextRow.description) stop('contenu visible incohérent');
  for (const key of ['meta_description','og_description']) if (entry.slots?.[key] !== undefined
      && entry.slots[key] !== nextRow.description.slice(0,300)) stop('description SEO incohérente');
  if (entry.slots?.title !== undefined && entry.slots.title !== `${nextRow.title} — ${location} | Dédicalivres`) stop('title incohérent');
  if ('description' in entry.patch && (entry.slots.description !== nextRow.description
      || after.description !== nextRow.description.slice(0,500))) stop('description incohérente');
  if ('description' in entry.patch && ['meta_description','og_description'].some(k => entry.slots[k] !== nextRow.description.slice(0,300))) stop('description SEO non actualisée');
  if (entry.event_id === 'ec8ec360-b0c4-41ca-b400-87dd1ffde104'
      && (after.location?.address?.streetAddress !== undefined || after.location?.name !== 'Senlis — programme multisite'
        || !entry.slots.description?.includes('3 et 4 octobre'))) stop('programme multisite Senlis incohérent');
  if (entry.event_id === 'eb6672b2-900f-4c6a-9021-ea84c5036769'
      && (after.location?.name !== 'Palais des Congrès de Lorient'
        || after.location?.address?.streetAddress !== 'Quai Gustave Mansion'
        || after.location?.address?.postalCode !== '56100')) stop('lieu Lorient incohérent');
  return renderSlots(html, entry.slots, after);
}

// The independently supplied digest represents review of the entire manifest,
// not an approved:true flag supplied inside the untrusted manifest itself.
export function simulateAuthorizedEdits(manifest, approvedDigest, baseline, current, now = new Date()) {
  if (!keys(manifest,['version','mode','expires_at','baseline_sha256','entries'])
      || manifest.version !== 1 || manifest.mode !== 'simulation-only'
      || !/^[a-f0-9]{64}$/.test(approvedDigest || '') || digest(manifest) !== approvedDigest) stop('autorisation absente, incomplète ou non approuvée');
  const expiry = Date.parse(manifest.expires_at);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(manifest.expires_at || '')
      || !Number.isFinite(expiry) || new Date(expiry).toISOString().replace('.000Z','Z') !== manifest.expires_at
      || expiry <= now.getTime() || expiry > now.getTime()+86400000) stop('autorisation expirée ou durée excessive');
  if (manifest.baseline_sha256 !== baselineDigest(baseline) || baselineDigest(baseline) !== baselineDigest(current)) stop('concurrence : aperçu invalidé');
  const source = rowsById(current.source), catalog = rowsById(current.catalog.events);
  if (Object.keys(current.canonical).some(id => !source.has(id) || source.get(id).validated !== true || source.get(id).rejected !== false)) stop('source publique incomplète : aucun comblement autorisé');
  for (const row of catalog.values()) if (Object.keys(row).some(k => !equal(row[k],source.get(row.id)[k]))) stop('catalogue/source modifiés : nouvel aperçu requis');
  if (current.queue.some(j => j.status === 'RUNNING')) stop('publication concurrente');
  if (!Array.isArray(manifest.entries) || !manifest.entries.length || manifest.entries.length > 3) stop('trois cibles au maximum');
  const selected = new Set(), jobs = new Set(), pages = {...current.pages};
  const nextSource = current.source.map(r => structuredClone(r));
  for (const entry of manifest.entries) {
    if (!keys(entry,['event_id','job_id','reason','canonical','before_html_sha256','before_source_sha256','patch','event','slots','proofs'])
        || !Object.hasOwn(SCOPE,entry.event_id) || selected.has(entry.event_id) || !uuid(entry.job_id) || jobs.has(entry.job_id)
        || entry.reason !== 'edit' || entry.canonical !== current.canonical[entry.event_id]) stop('cible/job/canonical non autorisé');
    const job = current.queue.find(j => j.id === entry.job_id);
    if (!job || job.reason !== 'edit' || job.status !== 'PENDING' || job.event_id !== entry.event_id
        || job.target_event_id !== entry.event_id || job.batch_id !== null || job.commit_sha !== null
        || !Number.isInteger(job.attempt_count) || job.attempt_count < 0 || job.attempt_count >= 3
        || !Number.isFinite(Date.parse(job.requested_at))) stop('job exact PENDING edit requis');
    const oldRow = source.get(entry.event_id), html = pages[entry.event_id];
    if (digest(html) !== entry.before_html_sha256 || digest(oldRow) !== entry.before_source_sha256) stop('empreinte initiale incorrecte');
    if (!entry.patch || Array.isArray(entry.patch) || !Object.keys(entry.patch).length
        || Object.keys(entry.patch).some(k => !SCOPE[entry.event_id].includes(k))) stop('champ métier hors autorisation');
    if (!Array.isArray(entry.proofs) || !entry.proofs.length || entry.proofs.some(p => {
      try { const url = new URL(p.url); return !keys(p,['url','sha256']) || url.protocol !== 'https:' || url.username || url.password
        || url.port || !OFFICIAL[entry.event_id].includes(url.hostname) || !/^[a-f0-9]{64}$/.test(p.sha256); }
      catch { return true; }
    })) stop('preuve officielle manquante');
    const nextRow = {...oldRow,...entry.patch};
    if (Object.entries(TARGET[entry.event_id]).some(([k,v]) => nextRow[k] !== v)) stop('correction métier non prévue');
    if (!validDate(nextRow.start_date) || !validDate(nextRow.end_date) || nextRow.end_date < nextRow.start_date) stop('dates incohérentes');
    if ('description' in entry.patch) {
      if (typeof oldRow.description !== 'string' || typeof nextRow.description !== 'string') stop('description source absente');
      const retained = entry.event_id === 'ec8ec360-b0c4-41ca-b400-87dd1ffde104'
        ? oldRow.description.replace('du 30 septembre au 4 octobre.', 'du 29 septembre au 4 octobre 2026.')
          .replace('Du 30 septembre au 2 octobre, des ateliers seront proposés', 'Des ateliers seront proposés')
        : oldRow.description;
      if (!retained || !nextRow.description.endsWith(retained)) stop('description non concernée perdue');
    }
    pages[entry.event_id] = assertEnrichment(entry,html,nextRow);
    verifyIdentity(pages[entry.event_id],entry.event_id,entry.canonical);
    Object.assign(nextSource.find(r => r.id === entry.event_id),entry.patch);
    selected.add(entry.event_id); jobs.add(entry.job_id);
  }
  const events = current.catalog.events.map(row => {
    const entry = manifest.entries.find(e => e.event_id === row.id);
    // Preserve the catalogue schema: description is absent from its compact rows.
    return entry ? {...row,...Object.fromEntries(Object.entries(entry.patch).filter(([k]) => k in row))} : structuredClone(row);
  });
  assertCatalog(current.catalog,{...current.catalog,events},selected);
  assertManifest(current.canonical,Object.fromEntries(Object.entries(current.canonical).map(([id,p]) => [id,path.basename(p,'.html')])),selected,new Set(Object.keys(current.legacy)));
  if (Object.keys(pages).length !== catalog.size || Object.keys(current.pages).some(id => !selected.has(id) && pages[id] !== current.pages[id])) stop('fiche tierce modifiée');
  return {mode:'simulation-only', canonical:structuredClone(current.canonical), pages, source:nextSource,
    catalog:{...current.catalog,events}, selected:[...selected], jobs:[...jobs],
    changedPages:Object.keys(pages).filter(id => pages[id] !== current.pages[id]).map(id => current.canonical[id])};
}

// Read-only diagnostic CLI. No execution mode, no reservation, no output file.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, sourceFile, queueFile, dependencySha] = process.argv.slice(2);
    if (mode !== 'inspect' || !sourceFile || !queueFile || !dependencySha) stop('usage : inspect <source.json> <queue.json> <PR239_SHA> ; aucun EXECUTE');
    const source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
    const queueCapture=JSON.parse(fs.readFileSync(queueFile,'utf8'));
    const queue=Array.isArray(queueCapture) ? queueCapture : queueCapture.queue;
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
    const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
    const state=captureBaseline(root,source,queue,sha,day,dependencySha);
    const sourceIds=new Set(source.map(e => e.id));
    const missing=Object.keys(state.canonical).filter(id => !sourceIds.has(id));
    const sourceById=new Map(source.map(e => [e.id,e]));
    const drift=state.catalog.events.filter(row => !sourceById.has(row.id)
      || Object.keys(row).some(k => !equal(row[k],sourceById.get(row.id)[k]))).map(e => e.id);
    console.log(JSON.stringify({mode:'READ_ONLY_INSPECTION',executionAuthorized:false,
      base:sha,dependencySha,day,baseline_sha256:baselineDigest(state),
      pending:queue.filter(j => j.status==='PENDING').length,running:queue.filter(j => j.status==='RUNNING').length,
      publicSource:source.length,published:Object.keys(state.canonical).length,missingCanonicalIds:missing,catalogSourceDrift:drift,
      unpublishedSourceIds:source.filter(e => !(e.id in state.canonical)).map(e => e.id),
      targets:Object.keys(SCOPE).map(id => ({id,canonical:`https://dedicalivres.fr/${state.canonical[id]}`,
        canonical_sha256:digest(`https://dedicalivres.fr/${state.canonical[id]}`),html_sha256:digest(state.pages[id]),
        source_sha256:digest(source.find(e => e.id===id)),selectedJobs:queue.filter(j => j.target_event_id===id).map(j => j.id)})),
      verdict:drift.length || queue.some(j => j.status==='RUNNING') ? 'STOP' : 'NO_EXECUTION_AUTHORIZATION'},null,2));
    if (drift.length || queue.some(j => j.status==='RUNNING')) process.exitCode=2;
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
