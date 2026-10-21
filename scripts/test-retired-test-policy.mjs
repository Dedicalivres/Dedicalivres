import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {retirementIds,loadRetirementIds} from '../event-retirements.js';
import {authorization,excludedIds,guardRetiredJobs,digest,jobDigest,assertWithdrawalEvidence,assertFrozenSnapshot,ID,PAGE,parisDate,LORIENT_RETRY} from './retired-test-policy.mjs';
import {prepareLorientRetirement} from './prepare-lorient-retirement.mjs';
const root=process.cwd(),policy=JSON.parse(fs.readFileSync('event-retirements.json'));
const pinned=JSON.parse(fs.readFileSync('scripts/event-publisher/lorient-test-retirement-preview.json'));
const snapshot=JSON.parse(fs.readFileSync('docs/territoires/catalogue-public.json'));
const job={id:'11111111-1111-4111-8111-111111111111',event_id:ID,target_event_id:ID,reason:'unpublish',status:'PENDING',attempt_count:0,batch_id:null,commit_sha:null,requested_at:'2026-10-20T20:00:00Z',requested_by:null,dispatch_token:'fixture-only',dispatch_requested_at:null};
const old={id:'80a4506a-357e-4df0-a5ac-5fe4ce27535f',event_id:ID,target_event_id:ID,reason:'edit',status:'BLOCKED',attempt_count:0,batch_id:null,commit_sha:null};
const others=Array.from({length:pinned.review.pending_observed-pinned.unpublished_source_ids.length},(_,i)=>({id:`other-${i}`,status:'PENDING',attempt_count:0,batch_id:null,commit_sha:null}));
const privateEvent={id:ID,validated:false,rejected:true,description:'Fixture privée conservée'};
const source=structuredClone(snapshot.events.filter(e=>e.id!==ID));
for(const e of source)for(const [k,v] of Object.entries(pinned.known_source_drift[e.id]||{}))e[k]=v.source;
const NEW_ID='99999999-9999-4999-8999-999999999999';
const pendingValidation=(event_id,i)=>({id:`77777777-7777-4777-8777-${String(i).padStart(12,'0')}`,event_id,target_event_id:event_id,reason:'validation',status:'PENDING',attempt_count:0,batch_id:null,commit_sha:null});
const independentIds=[...pinned.unpublished_source_ids,NEW_ID];
for(const id of independentIds)source.push({id,validated:true,rejected:false});source.sort((a,b)=>a.id.localeCompare(b.id));
const queue=[...others,...independentIds.map(pendingValidation),old,job];
const auth={version:1,baseline_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),event_id:ID,canonical:PAGE,reason:'unpublish',job_id:job.id,decision_id:'22222222-2222-4222-8222-222222222222',approval:'APPROVED_SINGLE_UNPUBLISH',expires_at:new Date(Date.now()+3600000).toISOString(),page_sha256:pinned.excluded.page_sha256,catalogue_sha256:pinned.catalogue_sha256,source_sha256:digest(source),queue_sha256:digest(queue.filter(j=>j.id!==job.id)),private_event_sha256:digest(privateEvent),job_sha256:jobDigest(job)};
const evidence={jobs:[job],events:[privateEvent],queue,source};
auth.reference_date=parisDate();
let count=0;
const test=(name,fn)=>{fn();count++;console.log('PASS retrait durable : '+name);};
const reject=(name,mutate)=>test(name,()=>{const a=structuredClone(auth),e=structuredClone(evidence);mutate(a,e);assert.throws(()=>assertWithdrawalEvidence(a,e),/STOP/);});
test('registre strict limité à Lorient',()=>assert.deepEqual([...excludedIds()],[ID]));
test('autre UUID interdit au registre',()=>assert.throws(()=>retirementIds({...policy,entries:[{...policy.entries[0],event_id:'other'}]}),/STOP/));
test('registre multiple interdit',()=>assert.throws(()=>retirementIds({...policy,entries:[...policy.entries,...policy.entries]}),/STOP/));
test('levée sans décision interdite',()=>assert.throws(()=>retirementIds({...policy,entries:[{...policy.entries[0],status:'released'}]}),/STOP/));
test('levée explicite traçable, sans écriture ni republication',()=>assert.equal(retirementIds({...policy,entries:[{...policy.entries[0],status:'released',release:{decision:'HUMAN-REVIEW-RESTORE',approved_at:'2026-10-20T20:00:00Z',reason:'Fixture de réversibilité'}}]}).size,0));
for(const reason of ['validation','edit','manual','delete'])test('job '+reason+' Lorient interdit',()=>assert.throws(()=>guardRetiredJobs([{...job,reason}],JSON.stringify(auth)),/STOP/));
test('autorisation absente refusée',()=>assert.throws(()=>guardRetiredJobs([job],''),/STOP/));
test('lot tiers avec autorisation refusé',()=>assert.throws(()=>guardRetiredJobs([{...job,event_id:'other',target_event_id:'other'}],JSON.stringify(auth)),/STOP/));
test('lot multiple refusé',()=>assert.throws(()=>guardRetiredJobs([job,{...job,id:'33333333-3333-4333-8333-333333333333'}],JSON.stringify(auth)),/STOP/));
test('ancien job BLOCKED non autorisable',()=>assert.throws(()=>authorization(JSON.stringify({...auth,job_id:old.id})),/STOP/));
test('manifeste expiré refusé',()=>assert.throws(()=>authorization(JSON.stringify({...auth,expires_at:'2000-01-01T00:00:00Z'})),/STOP/));
test('manifeste trop durable refusé',()=>assert.throws(()=>authorization(JSON.stringify({...auth,expires_at:new Date(Date.now()+172800000).toISOString()})),/STOP/));
test('manifeste sans date refusé',()=>assert.throws(()=>authorization(JSON.stringify({...auth,reference_date:undefined})),/date de référence/));
test('manifeste périmé au changement de jour refusé',()=>assert.throws(()=>authorization(JSON.stringify({...auth,reference_date:'2000-01-01'})),/date de référence incohérente/));
test('preuves complètes du job initial acceptées',()=>assertWithdrawalEvidence(auth,evidence));
test('nouvelle validation indépendante acceptée avant scellement',()=>{
 assert.ok(!pinned.unpublished_source_ids.includes(NEW_ID));assertWithdrawalEvidence(auth,evidence);
});
const rejectIndependent=(name,mutate)=>reject(name,(a,e)=>{
 mutate(e,e.source.find(row=>row.id===NEW_ID),e.queue.find(j=>j.event_id===NEW_ID));
 a.source_sha256=digest(e.source);a.queue_sha256=digest(e.queue.filter(j=>j.id!==job.id));
});
rejectIndependent('validation indépendante sans statut public refusée',(e,row)=>row.validated=false);
rejectIndependent('validation indépendante rejetée refusée',(e,row)=>row.rejected=true);
rejectIndependent('validation indépendante sans job refusée',e=>e.queue=e.queue.filter(j=>j.event_id!==NEW_ID));
rejectIndependent('job indépendant edit refusé',(e,row,j)=>j.reason='edit');
rejectIndependent('job indépendant ambigu refusé',(e,row,j)=>e.queue.push({...j,id:'88888888-8888-4888-8888-888888888888'}));
rejectIndependent('job indépendant ciblant Lorient refusé',(e,row,j)=>j.target_event_id=ID);
rejectIndependent('job indépendant avec event_id incohérent refusé',(e,row,j)=>j.event_id=ID);
rejectIndependent('validation indépendante déjà tentée refusée',(e,row,j)=>j.attempt_count=1);
rejectIndependent('validation indépendante BLOCKED refusée',(e,row,j)=>j.status='BLOCKED');
rejectIndependent('validation indépendante avec batch refusée',(e,row,j)=>j.batch_id='44444444-4444-4444-8444-444444444444');
rejectIndependent('validation indépendante avec commit refusée',(e,row,j)=>j.commit_sha='a'.repeat(40));
rejectIndependent('validation historique disparue refusée',e=>e.source=e.source.filter(row=>row.id!==pinned.unpublished_source_ids[0]));
reject('source encore publique refusée',(a,e)=>e.source.push({...privateEvent,validated:true,rejected:false}));
reject('nouvelle source concurrente refusée',(a,e)=>e.source.push({id:'concurrent'}));
reject('écart tiers même ré-empreinté refusé',(a,e)=>{e.source.find(e=>e.id==='83270534-e551-4562-8805-f10240a6007c').city='Autre';a.source_sha256=digest(e.source);});
reject('nouvelle validation sans preuve de job même ré-empreintée refusée',(a,e)=>{e.source.push({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',validated:true,rejected:false});a.source_sha256=digest(e.source);});
reject('validation indépendante ajoutée après approbation refusée',(a,e)=>{const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';e.source.push({id,validated:true,rejected:false});e.queue.push(pendingValidation(id,99));});
reject('nouvelle dérive Imaginambulles même ré-empreintée refusée',(a,e)=>{e.source.find(e=>e.id==='a1c0b6c6-5db0-4ca2-a37d-5f6397a55fa6').city='Autre';a.source_sha256=digest(e.source);});
reject('privatisation non faite refusée',(a,e)=>e.events[0].validated=true);
reject('source privée modifiée refusée',(a,e)=>e.events[0].description='Autre');
reject('autre PENDING changé refusé',(a,e)=>e.queue[0].attempt_count=1);
reject('autre RUNNING refusé',(a,e)=>e.queue[0].status='RUNNING');
reject('historique réactivé refusé',(a,e)=>e.queue.find(j=>j.id===old.id).status='PENDING');
reject('deuxième tentative refusée',(a,e)=>e.jobs[0].attempt_count=1);
reject('rejeu après succès refusé',(a,e)=>e.jobs[0].status='SUCCESS');
reject('modification de raison refusée',(a,e)=>e.jobs[0].reason='delete');
reject('horodatage du job Lorient modifié refusé',(a,e)=>e.jobs[0].requested_at='2026-10-21T00:00:00Z');
reject('autre référence publiée refusée',a=>a.catalogue_sha256='a'.repeat(64));
const retryJob={...job,id:LORIENT_RETRY.job_id,attempt_count:1,last_error:LORIENT_RETRY.last_error};
const retryQueue=queue.map(j=>j.id===job.id?retryJob:j);
const retryAuth={...auth,job_id:retryJob.id,job_sha256:jobDigest(retryJob),
 queue_sha256:digest(retryQueue.filter(j=>j.id!==retryJob.id)),retry:{failed_run_id:LORIENT_RETRY.failed_run_id,
 failed_batch_id:LORIENT_RETRY.failed_batch_id,new_batch_id:'55555555-5555-4555-8555-555555555555',pending_job_sha256:digest(retryJob)}};
const retryEvidence={...evidence,jobs:[retryJob],queue:retryQueue};
test('reprise exacte PENDING/1 après run avant push vérifié',()=>assertWithdrawalEvidence(retryAuth,retryEvidence));
const rejectRetry=(name,mutate,phase='pending')=>test(name,()=>{
 const a=structuredClone(retryAuth),e=structuredClone(retryEvidence);mutate(a,e);
 assert.throws(()=>assertWithdrawalEvidence(a,e,root,phase),/STOP/);
});
rejectRetry('ancienne autorisation sans reprise refusée',a=>delete a.retry);
rejectRetry('ancienne décision même avec nouvelles empreintes refusée',a=>a.decision_id=LORIENT_RETRY.previous_decision_id);
rejectRetry('autre run de reprise refusé',a=>a.retry.failed_run_id++);
rejectRetry('mauvais batch échoué refusé',a=>a.retry.failed_batch_id='66666666-6666-4666-8666-666666666666');
rejectRetry('réutilisation ancien batch refusée',a=>a.retry.new_batch_id=LORIENT_RETRY.failed_batch_id);
rejectRetry('troisième tentative interdite',(a,e)=>{e.jobs[0].attempt_count=2;a.retry.pending_job_sha256=digest(e.jobs[0]);});
rejectRetry('reprise autre job même Lorient interdite',(a,e)=>{e.jobs[0].id=job.id;a.job_id=job.id;});
rejectRetry('reprise autre événement interdite',(a,e)=>e.jobs[0].target_event_id=NEW_ID);
rejectRetry('erreur antérieure non reconnue refusée',(a,e)=>{e.jobs[0].last_error='autre';a.retry.pending_job_sha256=digest(e.jobs[0]);});
rejectRetry('source changée après nouvelle autorisation refusée',(a,e)=>e.source[0].city='Altérée');
rejectRetry('job tiers changé après nouvelle autorisation refusé',(a,e)=>e.queue[0].attempt_count=1);
const retryClaimed={...retryJob,status:'RUNNING',attempt_count:2,batch_id:retryAuth.retry.new_batch_id};
const retryLive={...retryEvidence,jobs:[retryClaimed],queue:retryQueue.map(j=>j.id===retryJob.id?retryClaimed:j)};
test('RUNNING/2 uniquement dans nouveau batch scellé',()=>assertWithdrawalEvidence(retryAuth,retryLive,root,'claimed'));
test('RUNNING/2 mauvais batch refusé',()=>assert.throws(()=>assertWithdrawalEvidence(retryAuth,
 {...retryLive,jobs:[{...retryClaimed,batch_id:LORIENT_RETRY.failed_batch_id}]},root,'claimed'),/STOP/));
const saved={...process.env},temp=fs.mkdtempSync(path.join(os.tmpdir(),'lorient-durable-'));
try{
 process.env.PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION=JSON.stringify(auth);
 const claimed={...job,status:'RUNNING',attempt_count:1,batch_id:'44444444-4444-4444-8444-444444444444'};
 const live={...evidence,jobs:[claimed],queue:queue.map(j=>j.id===job.id?claimed:j)};
 test('batch réservé unique accepté sur fixture',()=>assertWithdrawalEvidence(auth,live,root,'claimed'));
 const fixture=path.join(temp,'repo');execFileSync('git',['clone','--quiet','--no-hardlinks',root,fixture]);
 for(const p of ['scripts/event-publisher/lorient-test-retirement-preview.json'])fs.copyFileSync(path.join(root,p),path.join(fixture,p));
 execFileSync('git',['add','scripts/event-publisher/lorient-test-retirement-preview.json'],{cwd:fixture});
 execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','isolated test fixture'],{cwd:fixture});
 const fixtureAuth={...auth,baseline_sha:execFileSync('git',['rev-parse','HEAD'],{cwd:fixture,encoding:'utf8'}).trim()};
 process.env.PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION=JSON.stringify(fixtureAuth);
 process.env.SUPABASE_URL='https://pwyetrqyiaxpzjrafpvb.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-not-a-secret';
 process.env.PUBLICATION_MANUAL_MODE='execute';process.env.PUBLICATION_MANUAL_CONFIRMATION='EXECUTE';process.env.PUBLICATION_AUTOMATION_ENABLED='false';
 process.env.PUBLICATION_JOBS=JSON.stringify([{id:job.id,event_id:ID,reason:'unpublish',attempt_count:1,batch_id:claimed.batch_id}]);
 process.env.PUBLICATION_DEPUBLISH_EVENT_IDS=JSON.stringify([ID]);process.env.PUBLICATION_DEPUBLISH_PATHS=JSON.stringify([PAGE]);
 let calls=0;
 const request=async(url,options)=>{
  calls++;assert.ok(!options.method||options.method==='GET','aucun POST/PATCH');
  const u=new URL(url);let rows;
  if(u.pathname.endsWith('/events')&&u.searchParams.get('select')==='*')rows=live.events;
  else if(u.pathname.endsWith('/events')){const cursor=(u.searchParams.get('id')||'').replace('gt.','');rows=source.filter(e=>!cursor||e.id>cursor).slice(0,500);}
  else rows=u.searchParams.get('select')==='*'?live.jobs:live.queue;
  return new Response(JSON.stringify(rows),{status:200});
 };
 const report=await prepareLorientRetirement({root:fixture,output:path.join(temp,'output'),request});
 assert.ok(!fs.readFileSync(path.join(temp,'output/report.json'),'utf8').includes(privateEvent.description));
 assert.equal(report.after,632);assert.equal(report.changes.filter(c=>c.status==='D').length,1);assert.ok(calls>0);count++;
 const projected=JSON.parse(fs.readFileSync(path.join(fixture,'docs/territoires/event-canonical-map.json')));
 for(const id of independentIds)assert.ok(!(id in projected),'validation hors catalogue publiée');count++;
 assert.deepEqual(report.unpublishedSourceIds,[...independentIds].sort());count++;
 assertFrozenSnapshot(fixtureAuth,JSON.parse(fs.readFileSync(path.join(fixture,'docs/territoires/catalogue-public.json'))),fixture);count++;
 const check=spawnSync(process.execPath,[path.join(root,'scripts/check-publication-diff.mjs')],{cwd:fixture,env:process.env,encoding:'utf8'});
 assert.equal(check.status,0,check.stdout+check.stderr);count++;
 // Exercise the real CLI entrypoint with GET-only mocked reads, including its top-level await.
 const dataFile=path.join(temp,'cli-evidence.json'),capture=path.join(temp,'captured-source.json');
 const preload=path.join(temp,'read-only-fetch.cjs');
 fs.writeFileSync(capture,JSON.stringify(source));
 fs.writeFileSync(preload,`const fs=require('node:fs');
const e=JSON.parse(fs.readFileSync(process.env.CLI_EVIDENCE));
global.fetch=async(raw,options={})=>{
 const u=new URL(raw);
 if(options.method&&options.method!=='GET'){
  if(process.env.MOCK_CLAIM!=='1'||options.method!=='POST'||!u.pathname.endsWith('/rpc/claim_event_publication_batch'))throw Error('STOP test: non-GET forbidden');
  const body=JSON.parse(options.body);
  if(body.p_batch_id!==process.env.MOCK_BATCH||body.p_expected.length!==1||JSON.stringify(body.p_expected[0])!==JSON.stringify(e.jobs[0]))throw Error('STOP test: unexpected reservation');
  return new Response(JSON.stringify([{...e.jobs[0],status:'RUNNING',attempt_count:2,batch_id:body.p_batch_id}]),{status:200});
 }
if(u.origin!=='https://pwyetrqyiaxpzjrafpvb.supabase.co')throw Error('STOP test: unexpected origin');
 let rows;
 if(u.pathname.endsWith('/events')){
  if(u.searchParams.get('select')==='*')rows=e.events;
  else{const cursor=(u.searchParams.get('id')||'').replace('gt.','');rows=e.source.filter(r=>!cursor||r.id>cursor).slice(0,500);}
 }else if(u.pathname.endsWith('/event_publication_jobs'))rows=u.searchParams.get('status')==='eq.RUNNING'?[]:u.searchParams.get('select')==='*'?e.jobs:e.queue;
 else throw Error('STOP test: unexpected endpoint');
 return new Response(JSON.stringify(rows),{status:200});
};`);
 const cli=(a,e,selected,script=path.join(root,'scripts/verify-publication-source.mjs'))=>{
  fs.writeFileSync(dataFile,JSON.stringify(e));
  return spawnSync(process.execPath,['--require',preload,script,capture],{cwd:fixture,timeout:15000,encoding:'utf8',env:{...process.env,
   CLI_EVIDENCE:dataFile,DEDICALIVRES_SUPABASE_URL:'https://pwyetrqyiaxpzjrafpvb.supabase.co',DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY:'fixture-public',
   PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION:JSON.stringify(a),PUBLICATION_JOBS:JSON.stringify([selected])}});
 };
 test('CLI réelle termine après lecture privée et publique mockées',()=>{
  const r=cli(fixtureAuth,live,claimed);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/PASS source publique inchangée/);
 });
 const fixtureRetryAuth={...retryAuth,baseline_sha:fixtureAuth.baseline_sha};
 test('CLI réelle recontrôle RUNNING/2 sans deadlock',()=>{
  const r=cli(fixtureRetryAuth,retryLive,retryClaimed);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stdout+r.stderr);
 });
 for(const [name,mutate] of [
  ['source modifiée',e=>e.source[0].city='Changed'],
  ['job tiers modifié',e=>e.queue[0].attempt_count=1],
  ['troisième tentative',e=>e.jobs[0].attempt_count=3],
  ['mauvais batch',e=>e.jobs[0].batch_id=LORIENT_RETRY.failed_batch_id],
  ['autre événement',e=>e.jobs[0].event_id=NEW_ID],
 ])test('CLI STOP : '+name,()=>{
  const e=structuredClone(retryLive);mutate(e);const r=cli(fixtureRetryAuth,e,retryClaimed);
  assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.notEqual(r.status,13);assert.match(r.stderr,/STOP/);
 });
 test('CLI ancienne autorisation refusée sur deuxième tentative',()=>{
  const r=cli({...fixtureRetryAuth,retry:undefined},retryLive,retryClaimed);
  assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/STOP/);
 });
 // Real selection and atomic-claim worker; the only POST is intercepted in this child fixture.
 const worker=(command,fingerprint='')=>{
  fs.writeFileSync(dataFile,JSON.stringify(retryEvidence));
  return spawnSync(process.execPath,['--require',preload,path.join(root,'scripts/publication-jobs.mjs'),command],{
   cwd:root,timeout:15000,encoding:'utf8',env:{...process.env,CLI_EVIDENCE:dataFile,MOCK_CLAIM:'1',MOCK_BATCH:retryAuth.retry.new_batch_id,
    PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION:JSON.stringify(retryAuth),PUBLICATION_MANUAL_JOB_IDS:retryJob.id,
    PUBLICATION_MANUAL_MODE:command==='preview-selected'?'preview':'execute',PUBLICATION_MANUAL_FINGERPRINT:fingerprint}});
 };
 const previewResult=worker('preview-selected');
 assert.equal(previewResult.status,0,previewResult.stdout+previewResult.stderr);
 const fingerprint=previewResult.stdout.match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1];count++;
 test('réservation simulée exige nouvelle empreinte PREVIEW',()=>{
  const r=worker('claim','0'.repeat(64));assert.notEqual(r.status,0);assert.match(r.stderr,/données modifiées depuis PREVIEW/);
 });
 test('réservation atomique simulée du seul job en RUNNING/2 et batch neuf scellé',()=>{
  const r=worker('claim',fingerprint);assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/attempt_count[\\]*":2/);assert.ok(r.stdout.includes(retryAuth.retry.new_batch_id));
 });
 const frozen=JSON.parse(fs.readFileSync(path.join(fixture,'docs/territoires/catalogue-public.json')));frozen.events[0].city='Altérée';
 assert.throws(()=>assertFrozenSnapshot(fixtureAuth,frozen,fixture),/STOP/);count++;
 await assert.rejects(()=>prepareLorientRetirement({root:fixture,output:path.join(temp,'replay'),request}),/STOP/);count++;
 // Python uses the same validator; neither language may accept an old edit.
 const py=spawnSync('python3',['-c',"import sys;sys.path.insert(0,'scripts/event-publisher');from retired_test_policy import guard_jobs;guard_jobs([{'id':'80a4506a-357e-4df0-a5ac-5fe4ce27535f','event_id':'"+ID+"','reason':'edit'}])"],{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8'});
 assert.notEqual(py.status,0);count++;
}finally{process.env=saved;fs.rmSync(temp,{recursive:true,force:true});}
const jobsCode=fs.readFileSync('scripts/publication-jobs.mjs','utf8');
const canarySource=jobsCode.slice(jobsCode.indexOf('async function canaryCandidate()'),jobsCode.indexOf('async function canaryGuards()'));
const canary=vm.createContext({rpc:async name=>{assert.equal(name,'publication_canary_candidate');return [{...job,reason:'validation'}];},legacyEvents:{},excludedIds});
vm.runInContext(canarySource+';globalThis.check=canaryCandidate;',canary);assert.equal(await canary.check(),null);count++;
const ids=await loadRetirementIds(async()=>new Response(JSON.stringify(policy),{status:200}));assert.ok(ids.has(ID));count++;
console.log(`PASS retrait durable : ${count} scénarios, transport intégralement simulé`);
