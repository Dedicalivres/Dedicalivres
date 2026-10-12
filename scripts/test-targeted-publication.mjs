import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  parseJobs, assertCatalog, assertManifest, assertEnrichment, assertIndex, assertSitemap, metadataOnlyAggregate,
} from './project-targeted-publication.mjs';
import {assertSourceSame} from './verify-publication-source.mjs';
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
console.log('PASS 15 scénarios de publication ciblée');
