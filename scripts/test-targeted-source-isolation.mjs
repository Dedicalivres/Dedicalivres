import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sealIsolation,isolatedRows,readIsolation,recheckIsolationQueue} from './targeted-source-isolation.mjs';
import {assertEnrichment,assertCatalog,selectPublishedRows,parseJobs} from './project-targeted-publication.mjs';

const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'targeted-isolation-')),fixture=path.join(tmp,'repo');
const G='e380c538-2bc7-4ad4-b53e-22b601fb6381', D='014fc00b-4de0-4d93-b5ec-7f54cde63993';
const T='00000000-0000-4000-8000-000000000001',J='00000000-0000-4000-8000-000000000002';
const jobs=[
 {id:'2db3760b-6422-4510-934e-3ee775764913',event_id:G,reason:'edit'},
 {id:'1d98065b-26d5-4340-a467-d3de4b858dd7',event_id:D,reason:'validation'},
 {id:J,event_id:T,reason:'edit'},
].map(j=>({...j,target_event_id:j.event_id,status:'PENDING',attempt_count:0,batch_id:null,commit_sha:null,requested_at:'2026-10-21T12:00:00Z'}));
const selected=jobs.slice(0,2),baseRow=(id,title,city)=>({id,title,city,type:'Salon',region:'Auvergne-Rhône-Alpes',country_code:'FR',
 start_date:'2026-11-11',end_date:'2026-11-11',validated:true,rejected:false,registration_force_status:null,
 website:'https://salondulivredegrenoble.com',description:'La Midinette\n43 avenue de la Mogne\n38400 Saint-Martin-d’Hères',image_url:''});
const old=[baseRow(G,'Salon International du Livre de Grenoble-Alpes','Grenoble'),baseRow(T,'Fixture tierce','Puilboreau')];
const source=[{...old[0],city:"Saint-Martin-d'Hères"},{...old[1],city:'Rochefort-en-Terre'},
 {...baseRow(D,'Salon des auteurs Dinantais','Dinant'),country_code:'BE',region:'Wallonie',start_date:'2026-11-07',end_date:'2026-11-07',
 website:null,description:'Bibliothèque communale de Dinant\nrue Léopold 3, 5500 Dinant'}];
const venue=JSON.parse(fs.readFileSync('scripts/event-publisher/verified-event-locations.json')).events[G];
const map={[G]:venue.canonical,[T]:'evenement/fixture-tierce.html'},schema=e=>({
 '@context':'https://schema.org','@type':'Event',name:e.title,url:'https://dedicalivres.fr/'+map[e.id],
 startDate:e.start_date,endDate:e.end_date,description:e.description,
 location:{'@type':'Place',name:e.city,address:{'@type':'PostalAddress',addressLocality:e.city,addressRegion:e.region,addressCountry:e.country_code}},
 organizer:e.id===G?venue.unverified_organizer:{'@type':'Organization',name:'Association vérifiée',url:'https://official.example/'}
});
const page=e=>'<link rel="canonical" href="https://dedicalivres.fr/'+map[e.id]+'"><main data-event-id="'+e.id+'"></main><script type="application/ld+json">'+JSON.stringify(schema(e))+'</script>';
const git=(...args)=>execFileSync('git',args,{cwd:fixture,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const saved={...process.env};
let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};
try {
 fs.mkdirSync(path.join(fixture,'docs/territoires'),{recursive:true});fs.mkdirSync(path.join(fixture,'evenement'));
 fs.cpSync(path.join(root,'scripts'),path.join(fixture,'scripts'),{recursive:true});
 fs.copyFileSync('event-retirements.json',path.join(fixture,'event-retirements.json'));
 fs.writeFileSync(path.join(fixture,'docs/territoires/event-canonical-map.json'),JSON.stringify(map));
 const fields='id,title,type,country_code,region,city,start_date,end_date,validated,rejected,registration_force_status,website'.split(',');
 const catalogue={events:old.map(e=>Object.fromEntries(fields.map(k=>[k,e[k]])))};
 fs.writeFileSync(path.join(fixture,'docs/territoires/catalogue-public.json'),JSON.stringify(catalogue));
 for(const e of old)fs.writeFileSync(path.join(fixture,map[e.id]),page(e));
 git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
 const proof=sealIsolation(source,jobs,selected,fixture),file=path.join(tmp,'proof.json');
 fs.writeFileSync(file,JSON.stringify(proof));
 process.env.PUBLICATION_SOURCE_ISOLATION=file;process.env.PUBLICATION_JOBS=JSON.stringify(selected);
 const effective=isolatedRows(source,fixture);
 assert.equal(effective.find(e=>e.id===T).city,'Puilboreau');
 assert.equal(source.find(e=>e.id===T).city,'Rochefort-en-Terre');pass('job tiers PENDING/edit différé sans altération de source');
 assert.equal(proof.deferred[T].page,map[T]);assert.equal(jobs[2].status,'PENDING');pass('canonical tiers et statut préservés');
 assertCatalog(catalogue,{events:effective.map(e=>Object.fromEntries(fields.map(k=>[k,e[k]])))},new Set([G,D]));
 assert.throws(()=>sealIsolation(source,jobs.slice(0,2),selected,fixture),/inexpliquée/);pass('divergence sans job STOP');
 for(const delta of [{reason:'validation'},{status:'RUNNING'},{batch_id:J},{commit_sha:'a'.repeat(40)},{target_event_id:G}]) {
  assert.throws(()=>sealIsolation(source,[...selected,{...jobs[2],...delta}],selected,fixture));}
 pass('job tiers incohérent ou concurrent STOP');
 assert.throws(()=>sealIsolation([...source,source[0]],jobs,selected,fixture),/dupliquée/);
 assert.throws(()=>sealIsolation(source.filter(e=>e.id!==T),jobs,selected,fixture),/absent/);pass('source dupliquée/incomplète STOP');
 assert.throws(()=>isolatedRows(source.map(e=>e.id===G?{...e,city:'Autre'}:e),fixture),/source modifiée/);
 pass('changement de source concurrent STOP');
 fs.writeFileSync(file,JSON.stringify({...proof,deferred:{}}));assert.throws(()=>readIsolation(fixture),/altérée/);
 fs.writeFileSync(file,JSON.stringify(proof));pass('preuve de report altérée STOP');
 // Execute the actual Python entrypoint with mock reads; no network or production directory.
 fs.writeFileSync(path.join(tmp,'source.json'),JSON.stringify(source));
 const driver=`import importlib.util,json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path('scripts/event-publisher').resolve()))
s=importlib.util.spec_from_file_location('g','scripts/event-publisher/generate-events.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
rows=json.loads(Path(sys.argv[1]).read_text());out=sys.argv[2]
with patch.object(g,'charger_evenements_publics',return_value=rows),patch.object(sys,'argv',['generate-events.py','--sortie',out,'--existing-event-pages',str(Path('evenement').resolve()),'--db','/nonexistent-db']):
 g.main()
`;
 const run=out=>execFileSync('python3',['-c',driver,path.join(tmp,'source.json'),out],{cwd:fixture,encoding:'utf8',
  env:{...process.env,DEDICALIVRES_ALLOW_EXTERNAL_EXPORT:'1',PUBLICATION_TARGETED:'true',PUBLICATION_REFERENCE_DATE:'2026-10-22',PYTHONDONTWRITEBYTECODE:'1'}});
 const a=path.join(tmp,'a'),b=path.join(tmp,'b');run(a);run(b);
 const manifest=JSON.parse(fs.readFileSync(path.join(a,'event-pages-manifest.json'))).events;
 assert.equal('evenement/'+manifest[G]+'.html',map[G]);pass('canonical Grenoble préservé par UUID malgré la ville corrigée');
 const html=fs.readFileSync(path.join(a,map[G]),'utf8'),fresh=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(fresh.location.name,'La Midinette');assert.equal(fresh.location.address.streetAddress,'43 avenue de la Mogne');
 assert.equal(fresh.location.address.postalCode,'38400');assert.equal(fresh.location.address.addressLocality,"Saint-Martin-d'Hères");
 assert.equal(fresh.organizer,undefined);assertEnrichment(page(old[0]),html,G);pass('lieu Grenoble et omission du seul organisateur non prouvé');
 const enriched={...schema(old[0]),organizer:{'@type':'Organization',name:'Organisateur attesté'}};
 const modifiedOld=page(old[0]).replace(JSON.stringify(schema(old[0])),JSON.stringify(enriched));
 assert.throws(()=>assertEnrichment(modifiedOld,html,G),/organisateur/);pass('organisateur enrichi différent non supprimable');
 assert.throws(()=>assertEnrichment(page(old[0]),html,T));pass('autorisation non transférable à un tiers');
 const dinant=fs.readFileSync(path.join(a,'evenement',manifest[D]+'.html'),'utf8');
 assert(dinant.includes('Bibliothèque communale de Dinant'));assert(dinant.includes('Rue Léopold 3'));
 const dinantSchema=JSON.parse(dinant.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(dinantSchema.location.address.addressCountry,'BE');assert.equal(dinantSchema.location.address.addressRegion,'Wallonie');
 assert.equal(dinantSchema.startDate,'2026-11-07');assert.equal(dinantSchema.organizer,undefined);pass('Dinant complet sans organisateur inventé');
 assert.equal(fs.readFileSync(path.join(a,map[T]),'utf8'),page(old[1]));pass('fiche tierce identique octet pour octet');
 const files=dir=>fs.readdirSync(dir,{recursive:true}).filter(p=>fs.statSync(path.join(dir,p)).isFile()).sort();
 assert.deepEqual(files(a),files(b));for(const p of files(a))assert.deepEqual(fs.readFileSync(path.join(a,p)),fs.readFileSync(path.join(b,p)));
 pass('deux générations strictement identiques à source et date identiques');
 // Keep the isolation evidence enabled for a real recheck against a mocked private reader.
 const cwd=process.cwd();process.chdir(fixture);
 process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SECRET_KEY='test-only';
 try {
  await recheckIsolationQueue(async()=>({ok:true,json:async()=>jobs}));
  await assert.rejects(recheckIsolationQueue(async()=>({ok:true,json:async()=>jobs.slice(0,2)})),/file modifiée/);
 } finally {process.chdir(cwd);}
 pass('file recontrôlée avant push : tout changement STOP');
 const authorSource=[{author:{id:T,slug:'fixture-author',validated:true,published:true},events:[]}];
 const authorProof=sealIsolation(source,jobs,selected,fixture,undefined,undefined,authorSource);
 fs.writeFileSync(file,JSON.stringify(authorProof));
 process.env.DEDICALIVRES_SUPABASE_URL='https://fixture.invalid';
 process.env.DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY='test-public';
 process.chdir(fixture);
 const mockAuthors=(change=false)=>async url=>({ok:true,json:async()=>{
   const table=new URL(url).pathname.split('/').at(-1);
   if(table==='event_publication_jobs')return jobs;
   if(table==='authors')return [{...authorSource[0].author,...(change?{published:false}:{})}];
   if(table==='event_authors_presence')return [];
   throw Error('requête inattendue');
 }});
 try {
   await recheckIsolationQueue(mockAuthors());
   await assert.rejects(recheckIsolationQueue(mockAuthors(true)),/source auteur modifiée/);
 } finally {process.chdir(root);}
 pass('changement de source auteur après capture STOP');
 fs.writeFileSync(file,JSON.stringify(proof));
 const text=fs.readFileSync('scripts/publish-events-cloud.sh','utf8');
 assert(text.indexOf('targeted-source-isolation.mjs prepare')<text.indexOf('"$ROOT/scripts/publish-events-local.sh"'));
 assert(fs.readFileSync('scripts/verify-publication-source.mjs','utf8').includes('await recheckIsolationQueue()'));
 pass('préparation et recontrôle branchés au parcours existant');
 console.log('PASS isolation ciblée : '+checks+' scénarios ; aucune écriture distante');
} finally {
 for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];
 Object.assign(process.env,saved);fs.rmSync(tmp,{recursive:true,force:true});
}
