// Read-only evidence for deferring independent edits. Never claims a job.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fetchSource} from './publication-source-reader.mjs';
import {PUBLIC_EVENT_FIELDS} from './territorial-catalog.mjs';
import {fetchPublicAuthorCatalog} from './author-static-page.mjs';

const MAP='docs/territoires/event-canonical-map.json', CATALOG='docs/territoires/catalogue-public.json';
export const QUEUE_FIELDS='id,event_id,target_event_id,reason,status,attempt_count,batch_id,commit_sha,requested_at';
const stop=m=>{throw Error('STOP isolation ciblée : '+m);};
const stable=v=>JSON.stringify(v,(_,x)=>x&&!Array.isArray(x)&&typeof x==='object'
  ?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:stable(v)).digest('hex');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const blob=(root,base,file)=>git(root,'show',base+':'+file);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);

export function sealIsolation(source,queue,selected,root=process.cwd(),base=git(root,'rev-parse','HEAD').trim(),capturedAt=new Date().toISOString(),authors=null) {
  if(!Array.isArray(source)||!Array.isArray(queue)||!Array.isArray(selected)||!selected.length)stop('preuves absentes');
  if(source.some(e=>!uuid(e.id)||e.validated!==true||e.rejected!==false)
      ||new Set(source.map(e=>e.id)).size!==source.length)stop('source incomplète ou dupliquée');
  if(queue.some(j=>!uuid(j.id))||new Set(queue.map(j=>j.id)).size!==queue.length)stop('file ambiguë');
  const selectedIds=new Set(selected.map(j=>j.event_id)), jobs=new Set(selected.map(j=>j.id));
  if(selected.some(j=>!uuid(j.id)||!uuid(j.event_id)||!['edit','validation','unpublish','delete'].includes(j.reason))
      ||jobs.size!==selected.length||selectedIds.size!==selected.length)stop('sélection ambiguë');
  for(const j of selected) {
    const current=queue.find(q=>q.id===j.id);
    if(!current||current.event_id!==j.event_id||current.target_event_id!==j.event_id||current.reason!==j.reason
        ||!['PENDING','RUNNING'].includes(current.status)||current.commit_sha!==null
        ||current.attempt_count!==j.attempt_count||current.batch_id!==j.batch_id)stop('job sélectionné changé');
  }
  if(queue.some(j=>j.status==='RUNNING'&&!jobs.has(j.id)))stop('exécution concurrente');
  const map=JSON.parse(blob(root,base,MAP));
  const catalogue=JSON.parse(blob(root,base,CATALOG)), before=new Map(catalogue.events.map(e=>[e.id,e]));
  if(before.size!==catalogue.events.length||before.size!==Object.keys(map).length
      ||Object.keys(map).some(id=>!before.has(id))||new Set(Object.values(map)).size!==before.size)stop('catalogue/canonical incohérent');
  const deferred={};
  for(const [id,event] of before) {
    if(selectedIds.has(id))continue;
    const fresh=source.find(e=>e.id===id);
    if(!fresh)stop('événement publié absent de la source : '+id);
    const pending=queue.filter(j=>j.event_id===id||j.target_event_id===id);
    const different=PUBLIC_EVENT_FIELDS.split(',').some(k=>stable(event[k])!==stable(fresh[k]));
    if(!pending.length) {if(different)stop('divergence inexpliquée : '+id);continue;}
    if(pending.length!==1)stop('jobs tiers ambigus : '+id);
    const j=pending[0];
    if(j.reason!=='edit'||j.status!=='PENDING'||j.event_id!==id||j.target_event_id!==id
        ||!Number.isInteger(j.attempt_count)||j.attempt_count<0||j.attempt_count>=3
        ||j.batch_id!==null||j.commit_sha!==null||!Number.isFinite(Date.parse(j.requested_at)))stop('job tiers incompatible : '+id);
    const page=map[id];
    if(!/^evenement\/[a-z0-9-]+\.html$/.test(page)||page==='evenement/index.html')stop('canonical tiers invalide');
    const html=blob(root,base,page);
    if(!html.includes('data-event-id="'+id+'"')||!html.includes('<link rel="canonical" href="https://dedicalivres.fr/'+page+'">'))stop('identité de fiche tierce incohérente');
    deferred[id]={job_id:j.id,page,page_sha256:hash(html)};
  }
  if(!Number.isFinite(Date.parse(capturedAt)))stop('date de capture invalide');
  return {version:1,base,captured_at:capturedAt,source,queue,selected,deferred,author_source:authors};
}

export function readIsolation(root=process.cwd()) {
  const file=process.env.PUBLICATION_SOURCE_ISOLATION;
  if(!file)return null;
  const proof=JSON.parse(fs.readFileSync(file,'utf8'));
  if(proof.version!==1||!/^([0-9a-f]{40})$/.test(proof.base))stop('preuve invalide');
  const current=JSON.parse(process.env.PUBLICATION_JOBS||'null');
  if(stable(current)!==stable(proof.selected))stop('sélection changée');
  // Recompute the entire proof from sealed Git data, never trust deferred IDs.
  const temporaryHead=git(root,'rev-parse','HEAD').trim();
  if(temporaryHead!==proof.base&&git(root,'rev-parse','HEAD^').trim()!==proof.base)stop('base Git changée');
  if(stable(sealIsolation(proof.source,proof.queue,current,root,proof.base,proof.captured_at,proof.author_source))!==stable(proof))stop('preuve altérée');
  return proof;
}

export function isolatedRows(rows,root=process.cwd()) {
  const p=readIsolation(root);if(!p)return rows;
  const original=new Map(p.source.map(e=>[e.id,e]));
  for(const row of rows) {
    const captured=original.get(row.id);
    if(!captured||Object.keys(row).some(k=>stable(row[k])!==stable(captured[k])))stop('source modifiée : '+row.id);
  }
  const published=new Map(JSON.parse(blob(root,p.base,CATALOG)).events.map(e=>[e.id,e]));
  return rows.map(e=>p.deferred[e.id]?{...e,...published.get(e.id)}:e);
}

export async function readQueue(request=fetch) {
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)stop('lecture privée non configurée');
  const rows=[];let cursor=null;
  for(let n=0;n<200;n++) {
    const query=new URLSearchParams({select:QUEUE_FIELDS,status:'in.(PENDING,RUNNING)',order:'id.asc',limit:'500'});
    if(cursor)query.set('id','gt.'+cursor);
    const r=await request(url+'/rest/v1/event_publication_jobs?'+query,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
    if(!r.ok)stop('file privée inaccessible');
    const page=await r.json();if(!Array.isArray(page))stop('file privée invalide');
    rows.push(...page);if(page.length<500)return rows;cursor=page.at(-1).id;
  }
  stop('file privée incomplète');
}
export async function recheckIsolationQueue(request=fetch) {
  const p=readIsolation();if(!p)return;
  if(stable(await readQueue(request))!==stable(p.queue))stop('file modifiée pendant le traitement');
  if(p.author_source && stable(await fetchPublicAuthorCatalog({
    supabaseUrl:process.env.DEDICALIVRES_SUPABASE_URL,
    supabaseAnonKey:process.env.DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY,fetchImpl:request,
  }))!==stable(p.author_source))stop('source auteur modifiée pendant le traitement');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='prepare') {
    const source=await fetchSource(process.env.DEDICALIVRES_SUPABASE_URL,process.env.DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY);
    const authors=await fetchPublicAuthorCatalog({supabaseUrl:process.env.DEDICALIVRES_SUPABASE_URL,
      supabaseAnonKey:process.env.DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY});
    const proof=sealIsolation(source,await readQueue(),JSON.parse(process.env.PUBLICATION_JOBS||'null'),process.cwd(),undefined,undefined,authors);
    fs.writeFileSync(process.argv[3],JSON.stringify(proof),{flag:'wx',mode:0o600});
    console.log('PASS isolation ciblée : '+Object.keys(proof.deferred).length+' édition(s) différée(s)');
  } else if(process.argv[2]==='rows') {
    console.log(JSON.stringify(isolatedRows(JSON.parse(fs.readFileSync(0,'utf8')),path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))));
  } else stop('commande inconnue');
}
