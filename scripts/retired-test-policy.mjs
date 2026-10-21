import fs from 'node:fs';
import {fetchSource} from './publication-source-reader.mjs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {retirementIds,LORIENT_TEST_ID as ID,LORIENT_TEST_PATH as PAGE} from '../event-retirements.js';
export {ID,PAGE};
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const digest=value=>{if(value===undefined)throw Error('STOP champ de preuve absent');return createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(stable(value))).digest('hex');};
export function stable(x){return x&&typeof x==='object'?(Array.isArray(x)?x.map(stable):Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]))):x;}
export const excludedIds=()=>retirementIds(JSON.parse(fs.readFileSync(path.join(ROOT,'event-retirements.json'),'utf8')));
const stop=m=>{throw Error('STOP retrait test : '+m);};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
export const parisDate=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(now);
export function referenceDate(value,expected){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))
   ||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)stop('date de référence absente ou invalide');
 if(expected!==undefined&&value!==expected)stop('date de référence incohérente');
 return value;
}
// One verified pre-push failure only; this is not a general retry permission.
export const LORIENT_RETRY = Object.freeze({
 job_id:'0cc69430-9f31-4dab-b701-2061683e6b4c',
 failed_run_id:39630801864,
 failed_batch_id:'20d544e5-3249-4289-b30d-258f38ab5041',
 previous_decision_id:'eb41538d-c93d-4492-a2aa-0b38e2106b6c',
 previous_manifest_sha256:'9fc6888a4f7fa5769dab59e59c42f80947bca6ab278f472880a0be2ee64b84ee',
 last_error:'batch=20d544e5-3249-4289-b30d-258f38ab5041: GitHub Actions publication failed',
});
export function assertRetryAuthorization(a){
 const r=a.retry;
 if(a.decision_id===LORIENT_RETRY.previous_decision_id||digest(a)===LORIENT_RETRY.previous_manifest_sha256)
  stop('ancienne autorisation du run échoué interdite');
 if(!r)return;
 if(a.job_id!==LORIENT_RETRY.job_id||r.failed_run_id!==LORIENT_RETRY.failed_run_id
   ||r.failed_batch_id!==LORIENT_RETRY.failed_batch_id||!uuid(r.new_batch_id)
   ||r.new_batch_id===LORIENT_RETRY.failed_batch_id||a.decision_id===LORIENT_RETRY.previous_decision_id
   ||digest(a)===LORIENT_RETRY.previous_manifest_sha256||!/^[0-9a-f]{64}$/.test(r.pending_job_sha256||''))
  stop('reprise unique liée au run avant push et à une nouvelle décision requise');
}
export function authorization(raw=process.env.PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION){
 let a;try{a=JSON.parse(raw||'null');}catch{stop('autorisation illisible');}
 if(!a||a.version!==1||a.event_id!==ID||a.canonical!==PAGE||a.reason!=='unpublish'||!uuid(a.job_id)
   ||!(/^[0-9a-f]{40}$/.test(a.baseline_sha||''))||a.job_id==='80a4506a-357e-4df0-a5ac-5fe4ce27535f'||!uuid(a.decision_id)||a.approval!=='APPROVED_SINGLE_UNPUBLISH'
   ||!Number.isFinite(Date.parse(a.expires_at))||Date.now()>=Date.parse(a.expires_at)||Date.parse(a.expires_at)>Date.now()+86400000)stop('autorisation complète approuvée et non expirée requise');
 for(const field of ['page_sha256','catalogue_sha256','source_sha256','queue_sha256','private_event_sha256','job_sha256'])
  if(!/^[0-9a-f]{64}$/.test(a[field]||''))stop('empreinte absente : '+field);
 referenceDate(a.reference_date,parisDate());
 if(process.env.PUBLICATION_REFERENCE_DATE!==undefined)referenceDate(process.env.PUBLICATION_REFERENCE_DATE,a.reference_date);
 assertRetryAuthorization(a);
 return a;
}
export function guardRetiredJobs(rows,raw=process.env.PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION){
 const ids=excludedIds();const targets=rows.filter(j=>ids.has(j.target_event_id||j.event_id));
 if(!targets.length){if(raw)stop('autorisation fournie pour un autre lot');return null;}
 const a=authorization(raw),j=targets[0];
 if(rows.length!==1||targets.length!==1||j.id!==a.job_id||j.event_id!==ID||(j.target_event_id&&j.target_event_id!==ID)
   ||j.reason!=='unpublish')stop('seul le job unpublish exact est autorisable');
 return a;
}
export function assertInitialProof(a,root=process.cwd()){
 const pinned=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/event-publisher/lorient-test-retirement-preview.json'),'utf8'));
 if(a.page_sha256!==pinned.excluded.page_sha256||a.catalogue_sha256!==pinned.catalogue_sha256)stop('référence non approuvée');
 const current=JSON.parse(execFileSync('git',['show','HEAD:docs/territoires/event-canonical-map.json'],{cwd:root}));
 const ref=current[ID]?'HEAD':'HEAD^';
 if(execFileSync('git',['rev-parse',ref],{cwd:root,encoding:'utf8'}).trim()!==a.baseline_sha)stop('base Git changée depuis approbation');
 const read=p=>execFileSync('git',['show',ref+':'+p],{cwd:root});
 if(digest(read(PAGE))!==a.page_sha256||digest(read('docs/territoires/catalogue-public.json'))!==a.catalogue_sha256)
  stop('référence publiée changée');
 const map=JSON.parse(read('docs/territoires/event-canonical-map.json'));
 if(map[ID]!==PAGE)stop('canonical initial absent ou ambigu');
}
export const jobDigest=j=>digest(Object.fromEntries(['id','event_id','target_event_id','reason','requested_at','requested_by','dispatch_token','dispatch_requested_at'].map(k=>[k,j[k]??null])));
export function assertWithdrawalEvidence(a,{jobs,queue,events,source},root=process.cwd(),phase='pending'){
 guardRetiredJobs(jobs,JSON.stringify(a));assertInitialProof(a,root);
 const j=jobs[0],event=events.find(e=>e.id===ID);
 assertRetryAuthorization(a);
 const attempt=a.retry?1:0;
 const retryOK=!a.retry||(j.id===LORIENT_RETRY.job_id&&j.last_error===LORIENT_RETRY.last_error
   &&(phase==='pending'?digest(j)===a.retry.pending_job_sha256:j.batch_id===a.retry.new_batch_id));
 const stateOK=retryOK&&(phase==='pending'?j.status==='PENDING'&&j.attempt_count===attempt&&j.batch_id===null
    :phase==='claimed'&&j.status==='RUNNING'&&j.attempt_count===attempt+1&&uuid(j.batch_id));
 if(!stateOK||j.commit_sha!==null||jobDigest(j)!==a.job_sha256||!event||event.validated!==false||event.rejected!==true||digest(event)!==a.private_event_sha256)
  stop('job initial ou donnée privée modifiés');
 if(!Array.isArray(queue)||queue.some(j=>j.status==='RUNNING'&&j.id!==a.job_id)||digest(queue.filter(j=>j.id!==a.job_id))!==a.queue_sha256
   ||queue.filter(j=>j.id===a.job_id).length!==1||!queue.some(j=>j.id==='80a4506a-357e-4df0-a5ac-5fe4ce27535f'&&j.status==='BLOCKED'&&j.attempt_count===0))stop('file concurrente');
 assertFrozenSource(a,source);
 assertKnownFrozenSource(root,source,queue);
}
export function assertKnownFrozenSource(root,source,queue){
 const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/event-publisher/lorient-test-retirement-preview.json'),'utf8'));
 const snapshot=JSON.parse(execFileSync('git',['show','HEAD:docs/territoires/catalogue-public.json'],{cwd:root}));
 let baseline=snapshot;
 if(!snapshot.events.some(e=>e.id===ID))baseline=JSON.parse(execFileSync('git',['show','HEAD^:docs/territoires/catalogue-public.json'],{cwd:root}));
 const byId=new Map(source.map(e=>[e.id,e])),drift={};
 for(const e of baseline.events){if(e.id===ID)continue;const row=byId.get(e.id);if(!row)stop('fiche tierce absente de la source');
  const fields={};for(const [k,v] of Object.entries(e))if(digest(v)!==digest(row[k]))fields[k]={published:v,source:row[k]};
  if(Object.keys(fields).length)drift[e.id]=fields;
 }
 const expected={...registry.known_source_drift};delete expected[ID];
 if(digest(drift)!==digest(expected))stop('écart tiers non autorisé');
 const published=new Set(baseline.events.map(e=>e.id));
 const unpublished=source.filter(e=>!published.has(e.id));
 // Historical exclusions must remain present; additions are evidence, never publication permission.
 if(!Array.isArray(queue)||new Set(source.map(e=>e.id)).size!==source.length
   ||registry.unpublished_source_ids.some(id=>!unpublished.some(e=>e.id===id)))stop('validations hors catalogue incomplètes');
 for(const event of unpublished){
  const matches=queue.filter(j=>j.event_id===event.id||j.target_event_id===event.id),j=matches[0];
  if(!uuid(event.id)||event.id===ID||event.validated!==true||event.rejected!==false||matches.length!==1
    ||!uuid(j.id)||j.event_id!==event.id||j.target_event_id!==event.id||j.reason!=='validation'
    ||j.status!=='PENDING'||j.attempt_count!==0||j.batch_id!==null||j.commit_sha!==null)
   stop('validation hors catalogue sans job indépendant PENDING/0 : '+event.id);
 }
}
export function assertFrozenSource(a,source){
 if(!Array.isArray(source)||new Set(source.map(e=>e.id)).size!==source.length||source.some(e=>e.id===ID)||digest(source)!==a.source_sha256)
  stop('source concurrente ou test encore public');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const rows=JSON.parse(fs.readFileSync(0,'utf8'));const a=process.argv.includes('--state')?null:guardRetiredJobs(rows);if(a)assertInitialProof(a);
 console.log(JSON.stringify({excluded:[...excludedIds()],authorized:a?[ID]:[]}));
}

export async function readWithdrawalEvidence(a,request=fetch){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(url!=='https://pwyetrqyiaxpzjrafpvb.supabase.co'||!key)stop('lecture privée configurée requise');
 const get=async query=>{const r=await request(url+'/rest/v1/'+query,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});if(!r.ok)stop('lecture de preuve HTTP '+r.status);return r.json();};
 const queueQuery='event_publication_jobs?or=(status.in.(PENDING,RUNNING),id.eq.80a4506a-357e-4df0-a5ac-5fe4ce27535f)&select=id,event_id,target_event_id,reason,status,attempt_count,batch_id,commit_sha,last_error,requested_at&order=id.asc';
 const [jobs,events,queue]=await Promise.all([get('event_publication_jobs?id=eq.'+a.job_id+'&select=*'),get('events?id=eq.'+ID+'&select=*'),get(queueQuery)]);
 const config=fs.readFileSync(path.join(ROOT,'config.js'),'utf8');
 const source=await fetchSource(url,config.match(/supabaseAnonKey:\s*["']([^"']+)/)[1],request);
 return {jobs,events,queue,source};
}
export function assertFrozenSnapshot(a,snapshot,root=process.cwd()){
 assertInitialProof(a,root);
 for(const ref of ['HEAD','HEAD^']){
  let bytes;try{bytes=execFileSync('git',['show',ref+':docs/territoires/catalogue-public.json'],{cwd:root,stdio:['ignore','pipe','ignore']});}catch{continue;}
  if(digest(bytes)!==a.catalogue_sha256)continue;
  const before=JSON.parse(bytes),expected={...before,events:before.events.filter(e=>e.id!==ID)};
  if(digest(snapshot)!==digest(expected))stop('catalogue figé modifié hors retrait');return;
 }
 stop('catalogue initial non retrouvé');
}
