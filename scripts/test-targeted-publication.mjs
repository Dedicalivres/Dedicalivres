import assert from 'node:assert/strict';
import './test-targeted-archives.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  parseJobs, assertCatalog, assertManifest, assertEnrichment, assertIndex, assertSitemap, metadataOnlyAggregate,
  selectPublishedRows, publishedEventRows,
} from './project-targeted-publication.mjs';
import {assertSourceSame, assertTerritorialSame, FIELDS, fetchSource} from './verify-publication-source.mjs';
import {PUBLIC_EVENT_FIELDS} from './territorial-catalog.mjs';
import {temporalStatus} from './project-p0-publication.mjs';

const ownId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const thirdId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const job = (id, event_id, reason) => ({id, event_id, reason});
const jobs = (...rows) => JSON.stringify(rows);
const event = (id, title = id, start_date = '2026-10-17') => ({id, title, start_date, end_date:start_date});
const old = {events:[event(otherId)]};
const full = {events:[event(otherId), event(ownId)]};
const oldMap = {[otherId]:'evenement/other.html'};
const newMap = {[otherId]:'other', [ownId]:'new'};
const htmlIndex = (...slugs) => slugs.map(slug => `<a class="card" href="${slug}.html">${slug}</a>`).join('\n');
const xml = (...slugs) => `<urlset>\n  <url><loc>https://dedicalivres.fr/evenement/index.html</loc><lastmod>2026-10-12</lastmod></url>\n${slugs.map(slug => `  <url><loc>https://dedicalivres.fr/evenement/${slug}.html</loc><lastmod>2026-10-12</lastmod></url>`).join('\n')}\n</urlset>`;
const run = (label, callback) => { callback(); console.log(`PASS ${label}`); };

run('01 création autorisée', () => {
  const {allowed} = parseJobs(jobs(job(ownId, ownId, 'validation')));
  assertCatalog(old, full, allowed);
  assertManifest(oldMap, newMap, allowed, new Set());
  assertIndex(full, newMap, htmlIndex('other', 'new'), '2026-10-12');
});
run('02 modification autorisée', () => {
  const allowed = new Set([ownId]);
  assertCatalog({events:[event(ownId, 'Avant')]}, {events:[event(ownId, 'Après')]}, allowed);
  assertManifest({[ownId]:'evenement/old.html'}, {[ownId]:'new'}, allowed, new Set());
  assertEnrichment('<script type="application/ld+json">{"description":"Texte","performer":["A"]}</script>',
    '<script type="application/ld+json">{"description":"Nouveau texte","performer":["A"]}</script>');
  assert.equal(metadataOnlyAggregate('<li data-event-id="x" data-status="future">Avant</li>',
    '<li data-event-id="x" data-status="future">Après</li>'), false);
});
run('03 dépublication autorisée', () => {
  const {allowed, removals} = parseJobs(jobs(job(ownId, ownId, 'unpublish')));
  assert(removals.has(ownId));
  assertCatalog({events:[event(ownId), event(otherId)]}, old, allowed);
  assertManifest({[ownId]:'evenement/old.html', ...oldMap}, {[otherId]:'other'}, allowed, new Set());
});
run('04 lot multiple', () => {
  const {allowed} = parseJobs(jobs(job(ownId, ownId, 'validation'), job(thirdId, thirdId, 'edit')));
  assert.equal(allowed.size, 2);
  assertCatalog(old, {events:[event(otherId), event(ownId), event(thirdId)]}, allowed);
});
run('05 lot vide refusé sans projection', () => assert.throws(() => parseJobs('[]'), /liste de jobs absente/));
run('06 fiche tierce modifiée', () => {
  assert.throws(() => assertCatalog(old, {events:[event(otherId, 'Altéré')]}, new Set([ownId])), /tierce/);
  assert.throws(() => assertManifest(oldMap, {[otherId]:'changed', [ownId]:'new'}, new Set([ownId]), new Set()), /URL tierce/);
});
run('07 fiche legacy protégée', () => assert.throws(() =>
  assertManifest(oldMap, {[otherId]:'changed'}, new Set([otherId]), new Set([otherId])), /legacy/));
run('08 perte enrichissement', () => assert.throws(() =>
  assertEnrichment('<script type="application/ld+json">{"performer":["A"],"image":"poster.jpg"}</script><img src="poster.jpg">',
    '<script type="application/ld+json">{}</script>'), /perte/));
run('09 canonical dupliqué', () => assert.throws(() =>
  assertManifest(oldMap, {[otherId]:'other', [ownId]:'other'}, new Set([ownId]), new Set()), /dupliquée/));
run('10 sitemap incohérent', () => {
  assertSitemap(xml('other'), xml('other', 'new'), oldMap, newMap, new Set([ownId]));
  assert.throws(() => assertSitemap(xml('other'), xml('new'), oldMap, newMap, new Set([ownId])), /sitemap/);
});
run('11 modification concurrente', () => assert.throws(() =>
  assertSourceSame([{id:ownId, description:'Avant'}], [{id:ownId, description:'Après'}]), /pendant/));
run('12 réexécution identique', () => {
  assertSourceSame([{id:ownId, title:'A'}], [{title:'A', id:ownId}]);
  assertCatalog(full, structuredClone(full), new Set([ownId]));
  assertManifest({[ownId]:'evenement/new.html', ...oldMap}, newMap, new Set([ownId]), new Set());
});
run('13 transition Europe/Paris', () => {
  assert.equal(temporalStatus(event(ownId, 'Jour', '2026-10-11'), '2026-10-12'), 'past');
  assertIndex({events:[event(otherId, 'A', '2026-10-11'), event(ownId)]}, newMap, htmlIndex('new'), '2026-10-12');
});

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dedicalivres-targeted-test-'));
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...args) => execFileSync('git', args, {cwd:temporary, stdio:'ignore'});
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.mkdirSync(path.join(temporary, 'scripts/event-publisher'), {recursive:true});
  fs.writeFileSync(path.join(temporary, 'scripts/event-publisher/legacy-enriched-events.json'),
    JSON.stringify({events:Object.fromEntries(Array.from({length:282}, (_, i) => [`legacy-${i}`, `legacy-${i}.html`]))}));
  fs.mkdirSync(path.join(temporary, 'docs/territoires'), {recursive:true});
  fs.writeFileSync(path.join(temporary, 'docs/territoires/initial'), 'x');
  git('add', '-A'); git('commit', '-qm', 'fixture');
  const check = env => spawnSync(process.execPath, [path.join(root, 'scripts/check-publication-diff.mjs')],
    {cwd:temporary, env:{...process.env, ...env}, encoding:'utf8'});
  run('14 seuil 250 artefacts', () => {
    for (let i = 0; i < 251; i++) fs.writeFileSync(path.join(temporary, `docs/territoires/generated-${i}`), 'x');
    assert.match(check().stderr, /seuil = 250/);
    for (let i = 0; i < 251; i++) fs.unlinkSync(path.join(temporary, `docs/territoires/generated-${i}`));
  });
  run('15 suppression non autorisée', () => {
    fs.unlinkSync(path.join(temporary, 'docs/territoires/initial'));
    assert.match(check().stderr, /suppression automatique non autorisée/);
  });
} finally {
  fs.rmSync(temporary, {recursive:true, force:true});
}
const finistellaireFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'finistellaire-diff-'));
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const write = (name, value) => {
    const target = path.join(finistellaireFixture, name);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, value);
  };
  const git = (...args) => execFileSync('git', args, {cwd:finistellaireFixture, stdio:'ignore'});
  const id = '316861b7-0dd1-4ea7-b458-9fd8da849881';
  const page = 'evenement/festival-finistellaire-2026-quimper-3479.html';
  const jobId = 'a47786e2-16b0-4c0f-abae-a5ba698830ec';
  const other = '00000000-0000-4000-8000-000000000001';
  const legacy = Object.fromEntries(Array.from({length:281}, (_, i) =>
    [`legacy-${i}`, `legacy-${i}.html`]));
  legacy[id] = path.basename(page);
  const pageHtml = (text, corrected = false) => `<link rel="canonical" href="https://dedicalivres.fr/${page}">`
    + `<script type="application/ld+json">${JSON.stringify({
      '@type':'Event', description:corrected ? 'Finistellaire #5' : text,
      startDate:'2026-11-14', endDate:'2026-11-15',
      location:{name:corrected ? 'Espace Dan Ar Braz' : 'Pôle Culturel Max Jacob',
        address:{streetAddress:corrected ? '17 ter rue Stang Bihan' : '4 boulevard Dupleix', postalCode:'29000'}},
      organizer:{url:'https://www.la29emedimension.fr/le-finistellaire/le-finistellaire-5-2026/'},
    })}</script><article data-event-id="${id}">${text}</article>`
    + (corrected ? '<div><b>Lieu</b> Espace Dan Ar Braz, Bretagne</div><div><b>Adresse</b> 17 ter rue Stang Bihan, 29000</div>' : '');
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  write('scripts/event-publisher/legacy-enriched-events.json', JSON.stringify({events:legacy}));
  write('docs/territoires/event-canonical-map.json', JSON.stringify({[id]:page}));
  write('docs/territoires/catalogue-public.json', JSON.stringify({events:[event(id)]}));
  write('docs/territoires/audit.json', JSON.stringify({today:'2026-10-17'}));
  write('evenement/index.html', htmlIndex(path.basename(page, '.html')));
  write('sitemap-evenements.xml', xml(path.basename(page, '.html')));
  write(page, pageHtml('Avant'));
  write(`evenement/${legacy['legacy-0']}`, 'Fiche tierce');
  git('add', '-A'); git('commit', '-qm', 'fixture');
  write(page, pageHtml('Après', true));
  const check = (row) => spawnSync(process.execPath,
    [path.join(root, 'scripts/check-publication-diff.mjs')], {
      cwd:finistellaireFixture, encoding:'utf8', env:{...process.env,
        PUBLICATION_TARGETED:'true', PUBLICATION_MANUAL_MODE:'execute',
        PUBLICATION_AUTOMATION_ENABLED:'false', PUBLICATION_DEPUBLISH_PATHS:'[]',
        PUBLICATION_JOBS:jobs(row)},
    });
  const approved = job(jobId, id, 'edit');
  const approvedResult = check(approved);
  assert.equal(approvedResult.status, 0, approvedResult.stderr);
  assert.match(approvedResult.stdout, /fiches legacy modifiées : 1\/282/);
  assert.match(check(job(jobId, id, 'validation')).stderr, /exception legacy Finistellaire invalide/);
  assert.match(check(job(jobId, other, 'edit')).stderr, /fiches tierces modifiées/);
  const correctedPage = fs.readFileSync(path.join(finistellaireFixture, page), 'utf8');
  write(page, correctedPage.replace('17 ter rue Stang Bihan', '18 rue Stang Bihan'));
  assert.match(check(approved).stderr, /correction documentée du lieu/);
  write(page, correctedPage.replace('<b>Lieu</b> Espace Dan Ar Braz', '<b>Lieu</b> Quimper'));
  assert.match(check(approved).stderr, /correction documentée du lieu/);
  write(page, correctedPage);
  write(`evenement/${legacy['legacy-0']}`, 'Fiche tierce changée');
  assert.match(check(approved).stderr, /fiche legacy protégée|fiches tierces modifiées/);
  console.log('PASS exception Finistellaire : diff unique, 281 autres protégées');
} finally {
  fs.rmSync(finistellaireFixture, {recursive:true, force:true});
}
console.log('PASS 15 scénarios de publication ciblée');

run('sélection générale : édition, validation, exclusion, retrait et stabilité', () => {
  const canonical = {[ownId]:'evenement/own.html', [otherId]:'evenement/other.html'};
  const pending = [thirdId, 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
    'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'];
  const unexpected = 'ffffffff-ffff-4fff-ffff-ffffffffffff';
  const rows = [ownId, otherId, ...pending, unexpected].map(id => ({id}));
  const select = (...selected) => selectPublishedRows(rows, canonical, parseJobs(jobs(...selected)));
  const edit = select(job(ownId, ownId, 'edit'));
  assert.deepEqual(edit.map(row => row.id), [ownId, otherId]);
  assert.deepEqual(selectPublishedRows(rows, canonical, parseJobs(jobs(job(ownId, ownId, 'edit')))), edit);
  assert.deepEqual(select(job(ownId, thirdId, 'validation')).map(row => row.id), [ownId, otherId, thirdId]);
  assert.deepEqual(select(job(ownId, ownId, 'unpublish')).map(row => row.id), [otherId]);
  assert.deepEqual(select(job(ownId, null, 'manual')).map(row => row.id), [ownId, otherId]);
  assert.throws(() => selectPublishedRows(rows.filter(row => row.id !== otherId), canonical,
    parseJobs(jobs(job(ownId, ownId, 'edit')))), /incomplète/);
  assert.throws(() => selectPublishedRows([...rows, rows[0]], canonical,
    parseJobs(jobs(job(ownId, ownId, 'edit')))), /dupliquée/);
  assert.throws(() => selectPublishedRows(rows, {[ownId]:'evenement/index.html'},
    parseJobs(jobs(job(ownId, ownId, 'edit')))), /canonical/);
  assert.throws(() => select(job(ownId, thirdId, 'edit')), /nouvelle publication/);
  assert.throws(() => select(job(ownId, thirdId, 'unpublish')), /dépublication sans canonical/);
  assert.throws(() => select(job(ownId, ownId, 'edit'), job(otherId, ownId, 'edit')), /dupliqué/);
});

run('relecture source après dépublication : canonical précédent vérifié', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-source-after-'));
  const cwd = process.cwd();
  const previousJobs = process.env.PUBLICATION_JOBS;
  try {
    const write = (name, value) => {
      const target = path.join(fixture, name);
      fs.mkdirSync(path.dirname(target), {recursive:true});
      fs.writeFileSync(target, value);
    };
    const git = (...args) => execFileSync('git', args, {cwd:fixture, stdio:'ignore'});
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'test');
    write('scripts/event-publisher/legacy-enriched-events.json', JSON.stringify({events:
      Object.fromEntries(Array.from({length:282}, (_, i) => [`legacy-${i}`, `legacy-${i}.html`]))}));
    const mapPath = 'docs/territoires/event-canonical-map.json';
    write(mapPath, JSON.stringify({[ownId]:'evenement/own.html'}));
    git('add', '-A'); git('commit', '-qm', 'baseline');
    write(mapPath, '{}');
    process.chdir(fixture);
    process.env.PUBLICATION_JOBS = jobs(job(otherId, ownId, 'unpublish'));
    assert.deepEqual(publishedEventRows([{id:otherId}]), []);
    git('add', '-A'); git('commit', '-qm', 'publication');
    assert.deepEqual(publishedEventRows([{id:otherId}]), []);
    process.env.PUBLICATION_JOBS = jobs(job(otherId, thirdId, 'unpublish'));
    assert.throws(() => publishedEventRows([{id:otherId}]), /dépublication sans canonical/);
  } finally {
    process.chdir(cwd);
    if (previousJobs === undefined) delete process.env.PUBLICATION_JOBS;
    else process.env.PUBLICATION_JOBS = previousJobs;
    fs.rmSync(fixture, {recursive:true, force:true});
  }
});

run('16 source complète générateur et territoires', () => {
  const generator = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'event-publisher/generate-events.py'), 'utf8');
  const generatorFields = generator.match(/PUBLIC_EVENT_COLUMNS = '([^']+)'/)?.[1].split(',') || [];
  const verifiedFields = new Set(FIELDS.split(','));
  for (const name of [...generatorFields, ...PUBLIC_EVENT_FIELDS.split(',')]) assert(verifiedFields.has(name), `champ non vérifié : ${name}`);
  assert(generatorFields.includes('registration_force_status'), 'capture initiale sans statut forcé');
});
const captured = [{id:ownId, title:'Titre', start_date:'2026-10-17', registration_force_status:null}];
run('17 source inchangée', () => assertSourceSame(captured, structuredClone(captured)));
run('18 titre ou date modifiés STOP', () => {
  assert.throws(() => assertSourceSame(captured, [{...captured[0], title:'Autre'}]), /pendant/);
  assert.throws(() => assertSourceSame(captured, [{...captured[0], start_date:'2026-10-18'}]), /pendant/);
});
run('19 registration_force_status modifié STOP', () => assert.throws(() =>
  assertSourceSame(captured, [{...captured[0], registration_force_status:'annule'}]), /pendant/));
run('20 événement ajouté ou retiré STOP', () => {
  assert.throws(() => assertSourceSame(captured, [...captured, {...captured[0], id:otherId}]), /pendant/);
  assert.throws(() => assertSourceSame(captured, []), /pendant/);
});
let selected = '';
await fetchSource('https://example.invalid', 'public-test-key', async url => {
  selected = new URL(url).searchParams.get('select');
  return {ok:true, json:async () => captured};
});
run('21 sélection REST contrôlée', () => assert(selected.split(',').includes('registration_force_status')));

const place = ({name, city, street, postal}) => `<script type="application/ld+json">${JSON.stringify({
  location:{name, address:{addressLocality:city, streetAddress:street, postalCode:postal}},
})}</script>`;
run('22 lieu précis vers ville générique STOP', () => assert.throws(() =>
  assertEnrichment(place({name:'Mairie',city:'Lalouvesc',street:'21 rue des Cévennes',postal:'07520'}),
    place({name:'Lalouvesc',city:'Lalouvesc',street:'21 rue des Cévennes',postal:'07520'})), /lieu/));
run('23 lieu précis conservé PASS', () => assertEnrichment(
  place({name:'Mairie',city:'Lalouvesc',street:'21 rue des Cévennes',postal:'07520'}),
  place({name:'Mairie',city:'Lalouvesc',street:'21 rue des Cévennes',postal:'07520'})));
run('24 changement de ville métier légitime PASS', () => assertEnrichment(
  place({name:'Douai',city:'Douai'}), place({name:'Lille',city:'Lille'})));
run('25 lieu précis changé sans preuve STOP', () => assert.throws(() =>
  assertEnrichment(place({name:'Mairie',city:'Lalouvesc'}),
    place({name:'Médiathèque',city:'Lalouvesc'})), /lieu/));
run('26 adresse enrichie changée sans preuve STOP', () => assert.throws(() =>
  assertEnrichment(place({name:'Mairie',city:'Lalouvesc',street:'21 rue des Cévennes'}),
    place({name:'Mairie',city:'Lalouvesc',street:'2 rue du Marché'})), /adresse/));
run('27 capture territoriale cohérente PASS', () => assertTerritorialSame(
  {events:[{id:ownId, title:'Titre', start_date:'2026-10-17', registration_force_status:null}]}, captured));
run('28 statut transitoire vu par territoires STOP', () => {
  assertSourceSame(captured, structuredClone(captured));
  assert.throws(() => assertTerritorialSame(
    {events:[{id:ownId, title:'Titre', start_date:'2026-10-17', registration_force_status:'annule'}]}, captured), /pendant/);
});
