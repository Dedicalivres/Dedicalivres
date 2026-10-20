import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {captureBaseline, baselineDigest, simulateAuthorizedEdits, digest, SCOPE, verifyIdentity} from './seo-geo-edit-guard.mjs';
import {renderTerritory, territories} from './territorial-render.mjs';
import {assertSitemap, assertIndex} from './project-targeted-publication.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const json = file => JSON.parse(read(file));
const map = json('docs/territoires/event-canonical-map.json');
const catalog = json('docs/territoires/catalogue-public.json');
const now = new Date('2026-10-19T12:00:00Z');
const clone = value => structuredClone(value);
const ids = Object.keys(SCOPE);
const decode = text => text.replace(/&#x([a-f0-9]+);|&#(\d+);|&(amp|lt|gt|quot);/gi, (_,hex,dec,name) =>
  hex ? String.fromCodePoint(parseInt(hex,16)) : dec ? String.fromCodePoint(Number(dec)) : ({amp:'&',lt:'<',gt:'>',quot:'"'}[name]));
const fixtureRows = catalog.events.map(row => ({...row, description:'Fixture description', updated_at:'2026-10-18T00:00:00Z'}));
for (const id of ids) fixtureRows.find(r => r.id === id).description = decode(read(map[id]).match(/<div class="desc">([\s\S]*?)<\/div>/)[1]);
// Synthetic jobs only. They do not correspond to any production authorization.
const queue = ids.map((id,i) => ({id:`00000000-0000-4000-8000-00000000000${i+1}`,event_id:id,target_event_id:id,
  reason:'edit',status:'PENDING',attempt_count:0,batch_id:null,commit_sha:null,requested_at:'2026-10-19T11:00:00Z'}));
queue.push({...queue[0],id:'00000000-0000-4000-8000-000000000009',event_id:catalog.events[0].id,
  target_event_id:catalog.events[0].id,reason:'validation'});
const baseline = captureBaseline(root,fixtureRows,queue,'a'.repeat(40),'2026-10-19','b'.repeat(40));
const dateText = value => new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${value}T12:00:00Z`));
const entries = ids.map((id,i) => {
  const row = fixtureRows.find(r => r.id === id), event = clone(verifyIdentity(baseline.pages[id],id,map[id]));
  const patch = i === 0 ? {city:'Brive-la-Gaillarde',region:'Nouvelle-Aquitaine'}
    : i === 1 ? {start_date:'2026-09-29',end_date:'2026-10-04',description:'Programme multisite du 29 septembre au 4 octobre 2026. Salon public les 3 et 4 octobre à l’Espace Saint-Pierre.\n\n'
      + row.description.replace('du 30 septembre au 4 octobre.','du 29 septembre au 4 octobre 2026.')
        .replace('Du 30 septembre au 2 octobre, des ateliers seront proposés','Des ateliers seront proposés')}
    : {start_date:'2026-11-20',end_date:'2026-11-25',description:'Du 20 au 25 novembre 2026, au Palais des congrès, quai Gustave Mansion, 56100 Lorient.\n\n'+row.description};
  const next = {...row,...patch}, slots = {};
  event.startDate = next.start_date; event.endDate = next.end_date;
  event.organizer = {'@type':'Organization',name:['Ville de Brive','Bibliothèque municipale de Senlis',"Ligue de l'enseignement du Morbihan"][i]};
  if (i === 0) {
    slots.location = `${next.city}, ${next.region}`;
    slots.title = `${next.title} — ${slots.location} | Dédicalivres`;
    event.location.name = next.city;
    event.location.address.addressLocality = next.city;
    event.location.address.addressRegion = next.region;
  } else {
    slots.dates = `${dateText(next.start_date)} → ${dateText(next.end_date)}`;
    slots.description = next.description;
    slots.meta_description = slots.og_description = next.description.slice(0,300);
    event.description = next.description.slice(0,500);
    if (i === 1) {
      event.location.name = 'Senlis — programme multisite'; delete event.location.address.streetAddress;
      event.organizer.description = 'Avec ses partenaires';
    } else event.location.address.streetAddress = 'Quai Gustave Mansion';
  }
  return {event_id:id,job_id:queue[i].id,reason:'edit',canonical:map[id],before_html_sha256:digest(baseline.pages[id]),
    before_source_sha256:digest(row),patch,event,slots,proofs:[{url:[
      'https://www.foiredulivredebrive.net/','https://www.ville-senlis.fr/salon-du-livre-de-senlis/',
      'https://lorient-evenements.bzh/agenda/salon-livre-jeunesse-lorient-26/'][i],sha256:digest('OFFLINE FIXTURE, NOT A CAPTURED OFFICIAL PROOF')}]};
});
const fixture = () => ({baseline:clone(baseline),manifest:{version:1,mode:'simulation-only',expires_at:'2026-10-19T13:00:00Z',baseline_sha256:baselineDigest(baseline),entries:clone(entries)}});
let count = 0;
const test = (label,fn) => { fn(); count++; console.log(`PASS SEO-GEO ${label}`); };
const run = (m,s=baseline,c=s) => simulateAuthorizedEdits(m,digest(m),s,c,now);
const refuse = (label,change,pattern=/STOP SEO-GEO/) => test(label,() => {
  const {manifest,baseline:state} = fixture(); change(manifest,state); assert.throws(() => run(manifest,state),pattern);
});
const {manifest} = fixture();
const result = run(manifest);
test('corpus publié conservé et canoniques identiques',() => {
  assert.equal(Object.keys(result.pages).length,Object.keys(map).length);
  assert.deepEqual(result.canonical,map); assert.equal(result.selected.length,3);
  for (const id of Object.keys(map)) {
    verifyIdentity(result.pages[id],id,map[id]);
    if (!ids.includes(id)) assert.equal(result.pages[id],baseline.pages[id]);
  }
  for (const row of result.source) if (!ids.includes(row.id)) assert.deepEqual(row,fixtureRows.find(r => r.id === row.id));
});
test('autres legacy intacts, liens, portraits, auteurs et SEO préservés',() => {
  for (const id of Object.keys(baseline.legacy)) if (!ids.includes(id)) assert.equal(result.pages[id],baseline.pages[id]);
  const links = h => [...h.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const id of ids) {
    assert.deepEqual(links(result.pages[id]),links(baseline.pages[id]));
    const old = verifyIdentity(baseline.pages[id],id,map[id]), fresh = verifyIdentity(result.pages[id],id,map[id]);
    for (const field of ['image','performer','offers','name','url']) assert.deepEqual(fresh[field],old[field]);
    assert.equal(result.source.find(r => r.id === id).lat,fixtureRows.find(r => r.id === id).lat);
  }
});
test('rendu déterministe sans mutation des entrées',() => {
  assert.deepEqual(run(manifest),result);
  assert.deepEqual(fixture().manifest,manifest);
  assert.deepEqual(fixture().baseline,baseline);
});
test('un sous-lot valide reste limité à son job explicite',() => {
  const m = clone(manifest); m.entries = m.entries.slice(0,1);
  const one = run(m); assert.equal(one.changedPages.length,1); assert.equal(one.jobs.length,1);
  assert.equal(one.pages[ids[1]],baseline.pages[ids[1]]);
});
test('nouvelle validation publique non sélectionnée exclue',() => {
  const state=clone(baseline),m=clone(manifest);
  const extra={...state.source[0],id:'00000000-0000-4000-8000-000000000088'};
  state.source.push(extra);m.baseline_sha256=baselineDigest(state);
  const simulated=run(m,state);
  assert.equal(simulated.catalog.events.length,catalog.events.length);
  assert.equal(simulated.pages[extra.id],undefined);assert.equal(simulated.canonical[extra.id],undefined);
});
refuse('autorisation incomplète',m => delete m.entries[0].before_source_sha256);
refuse('autorisation expirée',m => m.expires_at='2026-10-18T13:00:00Z');
refuse('durée excessive',m => m.expires_at='2026-10-26T13:00:00Z');
refuse('mode EXECUTE interdit',m => m.mode='execute');
test('empreinte approuvée indépendante et absence refusées',() => {
  assert.throws(() => simulateAuthorizedEdits(manifest,'',baseline,baseline,now));
  const m=clone(manifest); m.entries[0].patch.city='Autre ville';
  assert.throws(() => simulateAuthorizedEdits(m,digest(manifest),baseline,baseline,now));
});
refuse('UUID tiers interdit',m => m.entries[0].event_id=catalog.events[0].id);
refuse('quatrième cible interdite',m => m.entries.push(clone(m.entries[0])));
refuse('doublon de cible interdit',m => m.entries[1]=clone(m.entries[0]));
refuse('job non sélectionné interdit',m => m.entries[0].job_id=queue[3].id);
refuse('raison validation interdite',m => m.entries[0].reason='validation');
refuse('canonical modifié interdit',m => m.entries[0].canonical='evenement/nouveau.html');
refuse('empreinte HTML initiale exigée',m => m.entries[0].before_html_sha256='0'.repeat(64));
refuse('champ métier tiers interdit',m => m.entries[0].patch.image_url='https://example.com/x.jpg');
refuse('coordonnées inventées interdites',m => m.entries[0].patch.lat=0);
refuse('dates non autorisées interdites',m => m.entries[1].patch.start_date='2027-01-01');
refuse('preuve officielle requise',m => m.entries[0].proofs=[]);
refuse('domaine ressemblant refusé',m => m.entries[0].proofs[0].url='https://www.foiredulivredebrive.net.attacker.example/');
refuse('suppression auteurs interdite',m => m.entries[0].event.performer=[]);
refuse('suppression image interdite',m => delete m.entries[0].event.image);
refuse('organisateur déduit de la ville interdit',m => m.entries[0].event.organizer.name='Brive-la-Gaillarde');
refuse('programme Senlis sans lieu unique',m => m.entries[1].event.location.address.streetAddress='Place Saint-Pierre');
refuse('perte de description non concernée',m => m.entries[2].patch.description='Texte raccourci');
refuse('zone HTML arbitraire interdite',m => m.entries[0].slots.script='alert(1)');
refuse('dates visibles incohérentes refusées',m => m.entries[1].slots.dates='30 septembre 2026');
test('changement concurrent de file, source, page, base ou date invalide tout aperçu',() => {
  for (const mutate of [s => s.queue.push({...queue[3],id:'00000000-0000-4000-8000-000000000008'}),
    s => s.source[0].title+=' changed',s => s.pages[ids[0]]+='\n',s => s.baseSha='c'.repeat(40),s => s.day='2026-10-20',
    s => s.dependencySha='c'.repeat(40),s => s.protectedFiles['sitemap.xml']='changed']) {
    const current=clone(baseline);mutate(current);assert.throws(() => run(manifest,baseline,current),/concurrence/);
  }
});
test('source incomplète, événement non public, RUNNING et réservation déjà faite refusés',() => {
  for (const mutate of [s => s.source.shift(),s => s.source[0].validated=false,
    s => s.queue[0].status='RUNNING',s => s.queue[0].batch_id='taken',s => s.queue[0].attempt_count=3]) {
    const state=clone(baseline);mutate(state);const m=clone(manifest);m.baseline_sha256=baselineDigest(state);
    assert.throws(() => run(m,state));
  }
});
test('source et canonical dupliqués refusés',() => {
  assert.throws(() => captureBaseline(root,[...fixtureRows,fixtureRows[0]],queue,'a'.repeat(40),'2026-10-19','b'.repeat(40)));
  assert.throws(() => verifyIdentity(baseline.pages[ids[0]]+`<link rel="canonical" href="https://dedicalivres.fr/${map[ids[0]]}">`,ids[0],map[ids[0]]));
});
test('les protections de production restent fermées',() => {
  const env={...process.env,PUBLICATION_TARGETED:'true',PUBLICATION_REFERENCE_DATE:'2026-10-19',
    PUBLICATION_JOBS:JSON.stringify(queue.slice(1,2))};
  assert.throws(() => execFileSync('node',['--input-type=module','-e',
    "import {context} from './scripts/project-targeted-publication.mjs'; context();"],{cwd:root,env,stdio:'pipe'}));
});

// Render existing territorial functions twice in memory. No generation or files written.
const registry=json('docs/territoires/referentiel.json'), verified=json('docs/territoires/verifications-organisateurs.json');
const render = events => Object.fromEntries(territories.flatMap(p => {
  const r=renderTerritory({p,events,registry,verified,capturedAt:catalog.capturedAt,referenceDate:baseline.day});
  return [[p.file,r.main],...r.archivePages.map(a => [a.file,a.main])];
}));
const oldTerritories=render(catalog.events), freshTerritories=render(result.catalog.events);
const territoryChanges=Object.keys(freshTerritories).filter(file => oldTerritories[file] !== freshTerritories[file]);
test('archives cohérentes, couverture et idempotence territoriale',() => {
  assert.deepEqual(render(result.catalog.events),freshTerritories);
  assert.deepEqual(Object.keys(oldTerritories).sort(),Object.keys(freshTerritories).sort());
  const national=Object.entries(freshTerritories).filter(([file]) => /^evenements-litteraires-france(?:-archives-\d+)?\.html$/.test(file));
  const allIds=national.flatMap(([,html]) => [...html.matchAll(/<li data-event-id="([^"]+)"/g)].map(m => m[1]));
  const france=result.catalog.events.filter(e => e.country_code==='FR').map(e => e.id);
  assert.equal(new Set(allIds).size,allIds.length);assert.deepEqual(allIds.sort(),france.sort());
  const oldArchives=Object.keys(oldTerritories).filter(f => /france-archives-/.test(f));
  assert.deepEqual(Object.keys(freshTerritories).filter(f => /france-archives-/.test(f)),oldArchives);
});
test('sitemap événement et index conservent les URL canoniques',() => {
  const manifest=Object.fromEntries(Object.entries(map).map(([id,p]) => [id,path.basename(p,'.html')]));
  const xml=read('sitemap-evenements.xml');
  assertSitemap(xml,xml,map,manifest,new Set(ids));
  const links=result.catalog.events.filter(e => (e.end_date||e.start_date)>=baseline.day).map(e =>
    `<a class="card" href="${path.basename(map[e.id])}">Fixture</a>`).join('\n');
  assertIndex(result.catalog,manifest,links,baseline.day);
});
const indexChanged = result.catalog.events.some((e,i) => e.end_date >= baseline.day && JSON.stringify(e)!==JSON.stringify(catalog.events[i]));
const pages = [...result.changedPages,...territoryChanges,...(indexChanged?['evenement/index.html']:[])];
let completeSimulation;
test('projection complète des fixtures avec les générateurs existants',() => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'seo-geo-guard-test-'));
  try {
    const stage=path.join(temp,'repo');
    execFileSync('git',['clone','--quiet','--no-hardlinks',root,stage],{stdio:'pipe'});
    const env={...process.env,PUBLICATION_REFERENCE_DATE:baseline.day,PYTHONDONTWRITEBYTECODE:'1'};
    const command=(...args) => execFileSync(args[0],args.slice(1),{cwd:stage,env,stdio:'pipe',maxBuffer:8*1024*1024});
    const generate=() => {
      command('python3','scripts/event-publisher/refresh-index.py','--today',baseline.day);
      command('node','scripts/build-static-agenda-previews.mjs');
      command('node','scripts/build-territorial-pages.mjs');
    };
    const tracked=command('git','ls-files','-z').toString().split('\0').filter(Boolean);
    const capture=() => Object.fromEntries(tracked.map(p => [p,digest(fs.readFileSync(path.join(stage,p)).toString('base64'))]));
    generate(); const before=capture();
    for (const id of ids) fs.writeFileSync(path.join(stage,map[id]),result.pages[id]);
    fs.writeFileSync(path.join(stage,'docs/territoires/catalogue-public.json'),JSON.stringify(result.catalog,null,2)+'\n');
    generate();
    // Use the existing XML helper, only for actually modified event pages.
    command('python3','-c',[
      'import importlib.util,datetime,json;from pathlib import Path',
      "s=importlib.util.spec_from_file_location('t','scripts/refresh-temporal-catalogues.py');t=importlib.util.module_from_spec(s);s.loader.exec_module(t)",
      `day=datetime.date.fromisoformat('${baseline.day}')`,
      `paths=json.loads(${JSON.stringify(JSON.stringify(result.changedPages))})`,
      "p=Path('sitemap-evenements.xml');xml=p.read_text()",
      "for relative in paths: xml=t.refresh.updated_sitemap(xml,'https://dedicalivres.fr/'+relative,day)",
      'p.write_text(xml)',
      't.assert_france_archives(Path.cwd(),day);t.assert_previews(Path.cwd(),day);t.corpus(Path.cwd())',
    ].join('\n'));
    const after=capture(); generate(); assert.deepEqual(capture(),after);
    const changed=tracked.filter(p => before[p]!==after[p]);
    const changedHtml=changed.filter(p => p.endsWith('.html'));
    const known=new Set([...result.changedPages,...Object.keys(freshTerritories),'index.html','salons-du-livre.html','dedicaces.html',
      'evenement/index.html','docs/territoires/catalogue-public.json','docs/territoires/audit.json','sitemap.xml','sitemap-evenements.xml']);
    assert.ok(changed.every(p => known.has(p)));
    assert.deepEqual(command('git','ls-files','--others','--exclude-standard').toString().trim(),'');
    assert.deepEqual(command('git','ls-files','--deleted').toString().trim(),'');
    for (const file of tracked.filter(p => p.startsWith('auteurs/'))) assert.equal(before[file],after[file]);
    for (const file of ['sitemap.xml','sitemap-evenements.xml']) {
      // Compare to the untouched reference: no new URL, duplicate URL, or changed order.
      const urls=h => [...h.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
      const old=read(file),fresh=fs.readFileSync(path.join(stage,file),'utf8');
      assert.deepEqual(urls(fresh),urls(old)); assert.equal(new Set(urls(fresh)).size,urls(fresh).length);
    }
    command('git','diff','--check');
    completeSimulation={changedHtmlCalculated:changedHtml.length,changedHtml,allChangedFiles:changed,
      created:[],deleted:[],idempotent:true,productionWrites:0};
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
console.log(JSON.stringify({mode:'OFFLINE FIXTURES ONLY',tests:count,publishedEvents:catalog.events.length,
  unchangedLegacy:Object.keys(baseline.legacy).filter(id => !ids.includes(id)).length,
  territorialAndEventPreview:{changedHtmlCalculated:pages.length,changedHtml:pages},completeSimulation,
  created:[],deleted:[],writes:0}));
