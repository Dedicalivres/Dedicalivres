// Temporary exact-job gate. No reservation or write API lives in this module.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,jobDigest,parisDate,referenceDate,ID as LORIENT} from './retired-test-policy.mjs';
import {fetchSource} from './publication-source-reader.mjs';
export {digest};
export const ID='83270534-e551-4562-8805-f10240a6007c',JOB='cd306af4-9b21-4f80-9e0e-557734585d8d';
export const PAGE='evenement/44-eme-foire-du-livre-de-brive-brives-83270534-e551-4562-8805-f10240a6007c.html';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PROOF='scripts/event-publisher/brive-edit-proof.json';
export const proof=()=>JSON.parse(fs.readFileSync(path.join(ROOT,PROOF)));
const stop=m=>{throw Error('STOP Brive : '+m);};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const git=(root,...args)=>execFileSync('git',args,{cwd:root});
export function authorize(raw=process.env.PUBLICATION_BRIVE_EDIT_AUTHORIZATION,{draft=false}={}){
 let a;try{a=typeof raw==='string'?JSON.parse(raw):raw;}catch{stop('autorisation illisible');}
 const p=proof();
 if(!a||a.version!==1||a.event_id!==ID||a.job_id!==JOB||a.reason!=='edit'||a.canonical!==PAGE
   ||!uuid(a.decision_id)||!uuid(a.batch_id)||!(/^[0-9a-f]{40}$/.test(a.baseline_sha||''))
   ||a.approval!==(draft?'DRAFT_NOT_APPROVED':'APPROVED_SINGLE_BRIVE_EDIT')
   ||digest(a.changes)!==digest({before:p.before,after:p.after})
   ||!Number.isFinite(Date.parse(a.expires_at))||Date.parse(a.expires_at)<=Date.now()
   ||Date.parse(a.expires_at)>Date.now()+3600000)stop('autorisation complète neuve, ciblée et non expirée requise');
 for(const key of ['source_sha256','queue_sha256','event_sha256','job_sha256','pending_job_sha256','page_sha256','catalogue_sha256','canonical_sha256','proof_sha256','projection_sha256'])
  if(!/^[0-9a-f]{64}$/.test(a[key]||''))stop('empreinte absente : '+key);
 if(a.proof_sha256!==digest(p))stop('preuve officielle non approuvée');
 referenceDate(a.reference_date,parisDate());return a;
}
export function guardJobs(rows,a){
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]||rows[0].id!==JOB||rows[0].event_id!==ID
   ||(rows[0].target_event_id&&rows[0].target_event_id!==ID)||rows[0].reason!=='edit')stop('seul le job edit exact est autorisable');
 if(!a||a.job_id!==JOB)stop('autorisation absente');
}
export function baseFiles(root,a){
 const head=git(root,'rev-parse','HEAD').toString().trim();
 if(head!==a.baseline_sha&&git(root,'rev-parse','HEAD^').toString().trim()!==a.baseline_sha)stop('base Git changée');
 const read=p=>git(root,'show',a.baseline_sha+':'+p);
 const snapshot=JSON.parse(read('docs/territoires/catalogue-public.json')),map=JSON.parse(read('docs/territoires/event-canonical-map.json'));
 if(digest(read(PAGE))!==a.page_sha256||digest(read('docs/territoires/catalogue-public.json'))!==a.catalogue_sha256
   ||digest(read('docs/territoires/event-canonical-map.json'))!==a.canonical_sha256||map[ID]!==PAGE||map[LORIENT]
   ||snapshot.events.some(e=>e.id===LORIENT))stop('référence publiée/canonical changée');
 if(new Set(snapshot.events.map(e=>e.id)).size!==snapshot.events.length
   ||digest(snapshot.events.map(e=>e.id).sort())!==digest(Object.keys(map).sort()))stop('catalogue incohérent');
 return {read,snapshot,map};
}
export function assertEvidence(a,e,root=process.cwd(),phase='pending',{draft=false}={}){
 authorize(a,{draft});guardJobs(e.jobs,a);
 if(phase==='pending'&&git(root,'rev-parse','HEAD').toString().trim()!==a.baseline_sha)stop('base Git changée avant réservation');
 const {snapshot}=baseFiles(root,a),j=e.jobs[0];
 const state=phase==='pending'?j.status==='PENDING'&&j.attempt_count===0&&j.batch_id===null&&digest(j)===a.pending_job_sha256
  :phase==='claimed'&&j.status==='RUNNING'&&j.attempt_count===1&&j.batch_id===a.batch_id;
 if(!state||j.commit_sha!==null||jobDigest(j)!==a.job_sha256||e.events?.length!==1
   ||e.events[0].id!==ID||e.events[0].validated!==true||e.events[0].rejected!==false||digest(e.events[0])!==a.event_sha256)stop('job ou donnée Brive changé/rejoué');
 const ownQueue=Array.isArray(e.queue)?e.queue.find(j=>j.id===JOB):null;
 if(!ownQueue||digest(ownQueue)!==digest(Object.fromEntries(Object.keys(ownQueue).map(k=>[k,j[k]]))))stop('lectures du job incohérentes');
 if(!Array.isArray(e.queue)||new Set(e.queue.map(j=>j.id)).size!==e.queue.length
   ||e.queue.some(j=>j.status==='RUNNING'&&j.id!==JOB)||e.queue.filter(j=>j.id===JOB).length!==1
   ||digest(e.queue.filter(j=>j.id!==JOB))!==a.queue_sha256)stop('file concurrente');
 if(!Array.isArray(e.source)||e.source.some(r=>!uuid(r.id))||new Set(e.source.map(e=>e.id)).size!==e.source.length
   ||e.source.some(e=>e.id===LORIENT)||digest(e.source)!==a.source_sha256)stop('source concurrente ou retrait Lorient annulé');
 const byId=new Map(e.source.map(e=>[e.id,e])),drift={};
 for(const old of snapshot.events){
  const row=byId.get(old.id);if(!row)stop('source publiée incomplète');
  const changes={};for(const [k,v] of Object.entries(old))if(digest(v)!==digest(row[k]))changes[k]={published:v,source:row[k]};
  if(Object.keys(changes).length)drift[old.id]=changes;
 }
 const known=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/event-publisher/lorient-test-retirement-preview.json'))).known_source_drift;
 const expected={...known};delete expected[LORIENT];
 if(digest(drift)!==digest(expected))stop('écart source tiers inexpliqué');
 const published=new Set(snapshot.events.map(e=>e.id));
 for(const row of e.source.filter(e=>!published.has(e.id))){
  const jobs=e.queue.filter(j=>j.event_id===row.id||j.target_event_id===row.id),job=jobs[0];
  if(row.validated!==true||row.rejected!==false||jobs.length!==1||job.reason!=='validation'||job.event_id!==row.id||job.target_event_id!==row.id
   ||job.status!=='PENDING'||job.attempt_count!==0||job.batch_id!==null||job.commit_sha!==null)stop('validation non publiée sans job indépendant');
 }
 const row=byId.get(ID),p=proof();
 if(digest(row)!==digest(Object.fromEntries(Object.keys(row).map(k=>[k,e.events[0][k]]))))stop('lectures publique/privée Brive incohérentes');
 if(row.city!==p.after.city||row.region!==p.after.region||Object.entries(p.unchanged_dates).some(([k,v])=>row[k]!==v))stop('corrections/dates Brive hors mandat');
 return {allowed:new Set([ID]),day:a.reference_date};
}
export function renderPage(html){
 const p=proof(),url='https://dedicalivres.fr/'+PAGE;
 const blocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
 const events=blocks.filter(b=>JSON.parse(b[1])['@type']==='Event');
 const crumbs=blocks.filter(b=>JSON.parse(b[1])['@type']==='BreadcrumbList');
 const event=events.length===1&&JSON.parse(events[0][1]);
 if([...html.matchAll(/data-event-id="([^"]+)"/g)].map(m=>m[1]).join()!==ID||!event||event.url!==url||event.location?.name!==p.before.city||event.location?.address?.addressLocality!==p.before.city
   ||event.location?.address?.addressRegion!==p.before.region||event.organizer?.name!==p.before['organizer.name']
   ||event.startDate!==p.unchanged_dates.start_date||event.endDate!==p.unchanged_dates.end_date
   ||crumbs.length!==1||JSON.parse(crumbs[0][1]).itemListElement.at(-1).item!==url
   ||[...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m=>m[1]).join()!==url)stop('fiche initiale ambiguë ou déjà corrigée');
 event.location.name=p.after.city;event.location.address.addressLocality=p.after.city;event.location.address.addressRegion=p.after.region;
 event.organizer.name=p.after['organizer.name'];
 let result=html.replace(events[0][0],'<script type="application/ld+json">'+JSON.stringify(event,null,2).replace(/</g,'\\u003c')+'</script>');
 for(const [before,after] of [
  [` — ${p.before.city}, ${p.before.region} | Dédicalivres</title>`,` — ${p.after.city}, ${p.after.region} | Dédicalivres</title>`],
  [`<div><b>Lieu</b> ${p.before.city}, ${p.before.region}</div>`,`<div><b>Lieu</b> ${p.after.city}, ${p.after.region}</div>`],
 ]){if(result.split(before).length!==2)stop('zone HTML ambiguë');result=result.replace(before,after);}
 return result;
}
export async function readEvidence(request=fetch){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(url!=='https://pwyetrqyiaxpzjrafpvb.supabase.co'||!key)stop('lectures privées configurées requises');
 const get=async query=>{const r=await request(url+'/rest/v1/'+query,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});if(!r.ok)stop('lecture HTTP '+r.status);return r.json();};
 const [jobs,events,queue]=await Promise.all([get('event_publication_jobs?id=eq.'+JOB+'&select=*'),get('events?id=eq.'+ID+'&select=*'),
  get('event_publication_jobs?or=(status.in.(PENDING,RUNNING),id.eq.0cc69430-9f31-4dab-b701-2061683e6b4c,id.eq.80a4506a-357e-4df0-a5ac-5fe4ce27535f)&select=id,event_id,target_event_id,reason,status,attempt_count,batch_id,commit_sha,last_error,requested_at&order=id.asc')]);
 const config=fs.readFileSync(path.join(ROOT,'config.js'),'utf8');
 const source=await fetchSource(url,config.match(/supabaseAnonKey:\s*["']([^"']+)/)[1],request);
 return {jobs,events,queue,source};
}

export function manualContext(a,{preview=false}={}){
 const rows=JSON.parse(process.env.PUBLICATION_JOBS||'[]');
 if(process.env.PUBLICATION_AUTOMATION_ENABLED!=='false'||process.env.PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION
   ||['PUBLICATION_PREACTIVATION_TEST','PUBLICATION_P0_RECOVERY','PUBLICATION_DOUAI_MANUAL'].some(k=>process.env[k]==='true')
   ||process.env.PUBLICATION_MANUAL_MODE!==(preview?'preview':'execute'))stop('parcours manuel exclusif requis');
 if(!preview){guardJobs(rows,a);if(process.env.PUBLICATION_MANUAL_CONFIRMATION!=='EXECUTE'||rows[0].batch_id!==a.batch_id||rows[0].attempt_count!==1)stop('batch/confirmation invalide');}
}
