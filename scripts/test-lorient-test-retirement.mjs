import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {referenceDate,parisDate,digest,guardRetiredJobs} from './retired-test-policy.mjs';
import {TARGET,CANONICAL,validateRegistry,validateEvidence,preview,removeSitemapEntry} from './preview-lorient-test-retirement.mjs';
import {context,assertCatalog,assertManifest} from './project-targeted-publication.mjs';
import {qualify,classify} from './territorial-catalog.mjs';
import {historicalLorientFixture} from './fixtures/lorient-retirement.mjs';
const currentRoot=process.cwd();
const historical=historicalLorientFixture(currentRoot);
try{
process.chdir(historical.root);
const registry=JSON.parse(fs.readFileSync('scripts/event-publisher/lorient-test-retirement-preview.json'));
const snapshot=JSON.parse(fs.readFileSync('docs/territoires/catalogue-public.json'));
const source=structuredClone(snapshot.events);
for(const event of source)for(const [key,change] of Object.entries(registry.known_source_drift[event.id]||{}))event[key]=change.source;
source.push(...registry.unpublished_source_ids.map(id=>({id})));
const audit={event:{id:TARGET,validated:true,rejected:false},jobs:[{id:'80a4506a-357e-4df0-a5ac-5fe4ce27535f',event_id:TARGET,target_event_id:TARGET,reason:'edit',status:'BLOCKED',attempt_count:0,batch_id:null,commit_sha:null}]};
let count=0;
const test=(label,fn)=>{fn();count++;console.log('PASS Lorient : '+label);};
const reject=(label,mutate)=>test(label,()=>{const r=structuredClone(registry),s=structuredClone(source),a=structuredClone(audit);mutate(r,s,a);assert.throws(()=>validateEvidence(r,snapshot,s,a),/STOP/);});
test('état courant : Lorient retiré, canonicals et fiches tiers conservés',()=>{
 const current=JSON.parse(fs.readFileSync(path.join(currentRoot,'docs/territoires/catalogue-public.json')));
 const map=JSON.parse(fs.readFileSync(path.join(currentRoot,'docs/territoires/event-canonical-map.json')));
 assert.ok(!current.events.some(e=>e.id===TARGET));assert.ok(!(TARGET in map));
 assert.ok(!fs.existsSync(path.join(currentRoot,CANONICAL)));
 assert.equal(Object.keys(map).length,current.events.length);
 assert.deepEqual(new Set(current.events.map(e=>e.id)),new Set(Object.keys(map)));
 for(const file of Object.values(map))assert.ok(fs.existsSync(path.join(currentRoot,file)));
 for(const reason of ['validation','edit','manual','delete'])
  assert.throws(()=>guardRetiredJobs([{id:'11111111-1111-4111-8111-111111111111',event_id:TARGET,reason}],''),/STOP/);
});
test('seule la ligne XML cible est retirée, espaces tiers identiques',()=>{
 const xml='<urlset>\n  <url><loc>before</loc></url>\n  <url><loc>target</loc></url>\n  <url><loc>after</loc></url>\n</urlset>\n';
 const updated=removeSitemapEntry(xml,'target');assert.equal(updated,xml.replace('  <url><loc>target</loc></url>\n',''));
 assert.throws(()=>removeSitemapEntry(updated,'target'),/absente ou ambiguë/);
 assert.throws(()=>removeSitemapEntry(xml.replace('</urlset>','  <url><loc>target</loc></url>\n</urlset>'),'target'),/ambiguë/);
});
test('Imaginambulles connu reste publié à sa valeur Git, sans correction',()=>{
 const id='a1c0b6c6-5db0-4ca2-a37d-5f6397a55fa6';
 assert.deepEqual(registry.known_source_drift[id],{city:{published:'Puilboreau',source:'Rochefort-en-Terre'}});
 const after={...snapshot,events:snapshot.events.filter(e=>e.id!==TARGET)};
 assert.deepEqual(after.events.find(e=>e.id===id),snapshot.events.find(e=>e.id===id));
 assertCatalog(snapshot,after,new Set([TARGET]));
 const changed=structuredClone(source);changed.find(e=>e.id===id).city='Ville imprévue';
 assert.throws(()=>validateEvidence(registry,snapshot,changed,audit),/écart Supabase inexpliqué/);
});
test('écarts connus explicites, quatre validations exclues',()=>assert.deepEqual(validateEvidence(registry,snapshot,source,audit),registry.known_source_drift));
reject('UUID tiers refusé',r=>r.excluded.id='83270534-e551-4562-8805-f10240a6007c');
reject('canonical différent refusé',r=>r.excluded.canonical='evenement/other.html');
reject('mode EXECUTE refusé',r=>r.mode='execute');
reject('empreinte absente refusée',r=>delete r.catalogue_sha256);
reject('autre base refusée',r=>r.base='0'.repeat(40));
reject('source dupliquée refusée',(r,s)=>s.push(s[0]));
reject('source incomplète refusée',(r,s)=>s.splice(0,1));
reject('validation supplémentaire refusée',(r,s)=>s.push({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}));
reject('modification tierce inconnue refusée',(r,s)=>s.find(e=>!registry.known_source_drift[e.id]).title+=' changed');
reject('correction connue différente refusée',(r,s)=>s.find(e=>e.id==='83270534-e551-4562-8805-f10240a6007c').city='Autre');
reject('nouveau champ refusé',(r,s)=>s[0].unexpected=true);
reject('RUNNING refusé',(r,s,a)=>a.jobs.push({status:'RUNNING'}));
reject('réactivation du job historique refusée',(r,s,a)=>a.jobs[0].status='PENDING');
reject('tentative supplémentaire refusée',(r,s,a)=>a.jobs[0].attempt_count=1);
reject('job réservé refusé',(r,s,a)=>a.jobs[0].batch_id='batch');
reject('raison changée refusée',(r,s,a)=>a.jobs[0].reason='unpublish');
reject('état métier changé refusé',(r,s,a)=>a.event.validated=false);
test('les autres données métier restent identiques',()=>{
 const after={...snapshot,events:snapshot.events.filter(e=>e.id!==TARGET)};
 assertCatalog(snapshot,after,new Set([TARGET]));
 const mutated=structuredClone(after);mutated.events[0].city='Altérée';assert.throws(()=>assertCatalog(snapshot,mutated,new Set([TARGET])),/tierce/);
});
test('les contrôles standard legacy restent bloquants',()=>{
 const original={...process.env};try{
  process.env.PUBLICATION_TARGETED='true';process.env.PUBLICATION_REFERENCE_DATE='2026-10-20';process.env.PUBLICATION_JOBS=JSON.stringify([{id:'11111111-1111-4111-8111-111111111111',event_id:TARGET,reason:'unpublish'}]);
  assert.throws(()=>context(),/protection 282 legacy|autorisation complète/);
  assert.throws(()=>assertManifest({[TARGET]:CANONICAL},{},new Set([TARGET]),new Set([TARGET])),/legacy|autorisation complète/);
 }finally{process.env=original;}
});
test('la source privée simulée exclut Lorient des vues publiques',()=>{
 const privateRow={...source.find(e=>e.id===TARGET),validated:false,rejected:true};
 const result=qualify([privateRow],[],[],'2026-10-20');assert.equal(result.accepted.length,0);assert.equal(result.rejected[0].id,TARGET);
});
await assert.rejects(()=>preview({root:process.cwd(),sourceFile:'missing',auditFile:'missing',output:process.cwd()}),/sortie non isolée/);count++;
test('dates explicites, manquantes, invalides et incohérentes',()=>{
 for(const day of ['2026-10-20','2026-10-21'])assert.equal(referenceDate(day),day);
 for(const day of [undefined,'','2026-02-30','2026-10-21T00:00:00Z'])assert.throws(()=>referenceDate(day),/STOP.*date de référence/);
 assert.throws(()=>referenceDate('2026-10-21','2026-10-20'),/incohérente/);
});
test('jour Paris distinct du jour UTC, été et hiver',()=>{
 assert.equal(parisDate(new Date('2026-10-20T22:01:00Z')),'2026-10-21');
 assert.equal(parisDate(new Date('2026-10-25T23:01:00Z')),'2026-10-26');
});
test('fin incluse puis archives, début atteint et plusieurs jours',()=>{
 const event={start_date:'2026-10-20',end_date:'2026-10-20'};
 assert.equal(classify(event,'2026-10-20'),'ongoing');assert.equal(classify(event,'2026-10-21'),'past');
 assert.equal(classify({...event,start_date:'2026-10-21',end_date:'2026-10-22'},'2026-10-20'),'future');
 assert.equal(classify({...event,end_date:'2026-10-22'},'2026-10-21'),'ongoing');
});
// Independent fresh clones prove date propagation and stable bytes, never production data.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lorient-reference-date-'));
try{
 const fixture=path.join(temp,'repo'),sourceFile=path.join(temp,'source.json'),auditFile=path.join(temp,'audit.json');
 execFileSync('git',['clone','--quiet','--no-hardlinks',process.cwd(),fixture]);
 fs.writeFileSync(sourceFile,JSON.stringify(source));fs.writeFileSync(auditFile,JSON.stringify(audit));
 fs.writeFileSync(path.join(fixture,'scripts/event-publisher/lorient-test-retirement-preview.json'),JSON.stringify({...registry,source_sha256:digest(fs.readFileSync(sourceFile)),audit_sha256:digest(fs.readFileSync(auditFile))}));
 execFileSync('git',['add','scripts/event-publisher/lorient-test-retirement-preview.json'],{cwd:fixture});
 execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','isolated date evidence fixture'],{cwd:fixture});
 for(const day of [undefined,'2026-02-30','2026-10-19'])await assert.rejects(()=>preview({root:fixture,sourceFile,auditFile,output:path.join(temp,'invalid'),day}),/STOP.*date/);count++;
 const saved=process.env.PUBLICATION_REFERENCE_DATE;
 try{
  process.env.PUBLICATION_REFERENCE_DATE='2026-10-20';
  await assert.rejects(()=>preview({root:fixture,sourceFile,auditFile,output:path.join(temp,'mismatch'),day:'2026-10-21'}),/incohérente/);count++;
 }finally{if(saved===undefined)delete process.env.PUBLICATION_REFERENCE_DATE;else process.env.PUBLICATION_REFERENCE_DATE=saved;}
 for(const day of ['2026-10-20','2026-10-21']){
  const output=path.join(temp,day);const result=await preview({root:fixture,sourceFile,auditFile,output,day});
  assert.equal(result.referenceDate,day);assert.equal(result.after,632);
  const stage=path.join(output,'projection');assert.equal(JSON.parse(fs.readFileSync(path.join(stage,'docs/territoires/audit.json'))).today,day);
  const xml=fs.readFileSync(path.join(stage,'sitemap.xml'),'utf8');
  const entry=xml.match(/<url>\s*<loc>https:\/\/dedicalivres.fr\/evenements-litteraires-bretagne<\/loc>[\s\S]*?<\/url>/)[0];
  assert.ok(entry.includes(`<lastmod>${day}</lastmod>`));
  assert.ok(fs.readFileSync(path.join(stage,'evenements-litteraires-bretagne.html'),'utf8').includes(`data-as-of="${day}"`));
  const eventSitemap=fs.readFileSync(path.join(stage,'sitemap-evenements.xml'),'utf8');
  assert.ok(eventSitemap.match(/<url>\s*<loc>https:\/\/dedicalivres.fr\/evenement\/index.html<\/loc>[\s\S]*?<\/url>/)[0].includes(`<lastmod>${day}</lastmod>`));count++;
  for(const file of ['index.html','dedicaces.html','salons-du-livre.html']){
   const html=fs.readFileSync(path.join(stage,file));const before=execFileSync('git',['show','HEAD:'+file],{cwd:stage});
   const canonical=html.toString().match(/<link rel="canonical" href="([^"]+)"/)[1];
   const entry=[...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map(m=>m[0]).find(e=>e.includes(`<loc>${canonical}</loc>`));
   if(!before.equals(html))assert.ok(entry.includes(`<lastmod>${day}</lastmod>`));
  }
 }
 const repeat=path.join(temp,'repeat');await preview({root:fixture,sourceFile,auditFile,output:repeat,day:'2026-10-21'});
 assert.deepEqual(fs.readFileSync(path.join(repeat,'projection.patch')),fs.readFileSync(path.join(temp,'2026-10-21/projection.patch')));count++;
 // An unchanged territorial page and its sitemap entry must remain exact.
 const stage=path.join(temp,'2026-10-21/projection');const oldXml=execFileSync('git',['show','HEAD:sitemap.xml'],{cwd:stage,encoding:'utf8'}),newXml=fs.readFileSync(path.join(stage,'sitemap.xml'),'utf8');
 const entries=x=>[...x.matchAll(/<url>[\s\S]*?<\/url>/g)].map(m=>m[0]);
 let unchanged=0;
 for(const entry of entries(oldXml)){
  const url=entry.match(/<loc>([^<]+)<\/loc>/)[1],slug=url.replace('https://dedicalivres.fr/',''),file=slug.endsWith('.html')?slug:slug+'.html';
  if(!/^evenements-litteraires-.*\.html$/.test(file))continue;
  const before=execFileSync('git',['show','HEAD:'+file],{cwd:stage});
  if(before.equals(fs.readFileSync(path.join(stage,file)))){assert.ok(entries(newXml).includes(entry));unchanged++;}
 }
 assert.ok(unchanged>0);count++;
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log(`PASS Lorient : ${count} scénarios hors réseau`);

}finally{process.chdir(currentRoot);historical.cleanup();}
