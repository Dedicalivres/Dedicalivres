// Offline fixtures only: fetch is replaced, writes/commits are confined to disposable clones.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ID,JOB,PAGE,proof,digest,authorize,assertEvidence,renderPage,readEvidence,manualContext} from './brive-edit-policy.mjs';
import {draftAuthorization,project,verifyWorkspace} from './project-brive-edit.mjs';
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'brive-test-'));
const git=(dir,...args)=>execFileSync('git',args,{cwd:dir,stdio:['ignore','pipe','pipe']});
const clone=v=>structuredClone(v),next='11111111-1111-4111-8111-111111111111';
let checks=0,imports=0;
const ok=(fn)=>{fn();checks++;};
const rejects=fn=>{assert.throws(fn,/STOP|date|référence/i);checks++;};
const fail=async fn=>{await assert.rejects(fn,/STOP|date|référence/i);checks++;};
try{
 const fixture=path.join(tmp,'repo');git(root,'clone','--quiet','--no-hardlinks',root,fixture);
 fs.cpSync(path.join(root,'scripts'),path.join(fixture,'scripts'),{recursive:true});
 git(fixture,'add','scripts');git(fixture,'-c','user.name=Offline fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','--allow-empty','-m','Offline candidate fixture');
 const catalogue=JSON.parse(fs.readFileSync(path.join(fixture,'docs/territoires/catalogue-public.json')));
 const known=JSON.parse(fs.readFileSync('scripts/event-publisher/lorient-test-retirement-preview.json')).known_source_drift;
 const source=catalogue.events.map(row=>({...row,...Object.fromEntries(Object.entries(known[row.id]||{}).map(([k,v])=>[k,v.source]))}));
 source.push({id:next,title:'Unpublished validation',validated:true,rejected:false});source.sort((a,b)=>a.id.localeCompare(b.id));
 const job={id:JOB,event_id:ID,target_event_id:ID,reason:'edit',status:'PENDING',attempt_count:0,batch_id:null,commit_sha:null,last_error:null,requested_at:'2026-10-20T00:00:00Z'};
 const e={source,jobs:[job],events:[{...source.find(r=>r.id===ID),description:'Preserve private data',image_url:'https://example.invalid/affiche.jpg'}],queue:[clone(job),{...job,id:next,event_id:next,target_event_id:next,reason:'validation'}].sort((a,b)=>a.id.localeCompare(b.id))};
 const draft=draftAuthorization(fixture,e),a={...draft,approval:'APPROVED_SINGLE_BRIVE_EDIT'};
 ok(()=>assertEvidence(a,e,fixture));ok(()=>assertEvidence(draft,e,fixture,'pending',{draft:true}));rejects(()=>authorize(draft));
 for(const [k,v] of Object.entries({event_id:next,job_id:next,canonical:'evenement/new.html',baseline_sha:'invalid',decision_id:'',expires_at:'2000-01-01',reference_date:'2000-01-01',proof_sha256:'0'.repeat(64),changes:{}}))rejects(()=>assertEvidence({...a,[k]:v},e,fixture));
 for(const mutate of [x=>x.jobs[0].attempt_count=1,x=>x.jobs[0].status='SUCCESS',x=>x.jobs[0].batch_id=next,x=>x.jobs[0].event_id=next,
  x=>x.events[0].description+=' modified',x=>x.source[0].title+=' modified',x=>x.source.pop(),x=>x.source.push(x.source[0]),
  x=>x.queue[0].last_error='other job changed',x=>x.queue[0].status='RUNNING',x=>x.queue={},x=>x.source.push({id:'eb6672b2-900f-4c6a-9021-ea84c5036769'})]){
  const changed=clone(e);mutate(changed);rejects(()=>assertEvidence(a,changed,fixture));
 }
 // A fresh independent validation may be excluded, but only a newly sealed source/queue can authorize it.
 const more=clone(e),newId='22222222-2222-4222-8222-222222222222';more.source.push({id:newId,validated:true,rejected:false});more.source.sort((a,b)=>a.id.localeCompare(b.id));
 more.queue.push({...job,id:newId,event_id:newId,target_event_id:newId,reason:'validation'});more.queue.sort((a,b)=>a.id.localeCompare(b.id));
 rejects(()=>assertEvidence(a,more,fixture));const fresh={...draftAuthorization(fixture,more),approval:a.approval};ok(()=>assertEvidence(fresh,more,fixture));
 const html=fs.readFileSync(path.join(fixture,PAGE),'utf8'),rendered=renderPage(html),blocks=h=>[...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
 const before=blocks(html).find(x=>x['@type']==='Event'),after=blocks(rendered).find(x=>x['@type']==='Event');
 ok(()=>{assert.equal(after.organizer.name,'Ville de Brive');assert.equal(after.location.address.addressLocality,'Brive-la-Gaillarde');assert.equal(after.url,before.url);
  for(const k of ['description','image','startDate','endDate','name'])assert.deepEqual(after[k],before[k]);assert.equal(after.organizer.url,before.organizer.url);
  const allowed=clone(before);allowed.organizer.name=proof().after['organizer.name'];allowed.location.name=proof().after.city;allowed.location.address.addressLocality=proof().after.city;allowed.location.address.addressRegion=proof().after.region;assert.deepEqual(after,allowed);});
 rejects(()=>renderPage(rendered));rejects(()=>renderPage(html.replace('Centre-Val de Loire','unexpected')));
 const first=await project({root:fixture,output:path.join(tmp,'one'),a,evidence:e}),second=await project({root:fixture,output:path.join(tmp,'two'),a,evidence:e});
 ok(()=>{assert.deepEqual(first.patch,second.patch);assert.deepEqual(first.report.deleted,[]);assert.deepEqual(first.report.created,[]);assert.equal(first.report.events,catalogue.events.length);assert.equal(first.report.otherEventPagesUnchanged,true);assert.equal(first.report.canonical,PAGE);assert.equal(first.report.changes.filter(p=>p.startsWith('evenement/')&&p!=='evenement/index.html').join(),PAGE);assert.ok(first.report.changes.every(p=>!p.startsWith('auteurs/')));});
 a.projection_sha256=digest(first.patch);
 // Real manual PREVIEW/claim modules, mocked atomic RPC only; never real network.
 let calls=[],logs=[];const oldFetch=global.fetch,oldArgv=process.argv,oldCwd=process.cwd(),oldEnv={...process.env},oldLog=console.log;
 let current=e;
 const mock=async(raw,options={})=>{
  const url=new URL(raw),method=options.method||'GET';calls.push({method,url:url.pathname+url.search});let result;
  if(method==='POST'){
   assert.ok(url.pathname.endsWith('/rpc/claim_event_publication_batch'));const body=JSON.parse(options.body);assert.deepEqual(body.p_expected,[job]);assert.equal(body.p_batch_id,a.batch_id);
   result=[{...job,status:'RUNNING',attempt_count:1,batch_id:body.p_batch_id}];
  }else{
   assert.equal(method,'GET');
   if(url.pathname.endsWith('/events'))result=url.searchParams.has('validated')?current.source.filter(r=>!url.searchParams.has('id')||r.id>url.searchParams.get('id').slice(3)).slice(0,500):current.events;
   else if(url.searchParams.has('or'))result=current.queue;
   else if(url.searchParams.get('status')==='eq.RUNNING')result=current.queue.filter(j=>j.status==='RUNNING');
   else if(url.pathname.endsWith('/event_publication_jobs'))result=current.jobs;
   else throw Error('Unexpected URL '+url.pathname);
  }
  return {ok:true,status:200,json:async()=>clone(result),text:async()=>JSON.stringify(result)};
 };
 try{
  process.chdir(fixture);global.fetch=mock;console.log=(...v)=>logs.push(v.join(' '));
  Object.assign(process.env,{SUPABASE_URL:'https://pwyetrqyiaxpzjrafpvb.supabase.co',SUPABASE_SECRET_KEY:'offline-test',PUBLICATION_AUTOMATION_ENABLED:'false',PUBLICATION_MANUAL_MODE:'preview',PUBLICATION_MANUAL_JOB_IDS:JOB,PUBLICATION_BRIVE_EDIT_AUTHORIZATION:JSON.stringify(a),PUBLICATION_PREACTIVATION_TEST:'false',PUBLICATION_P0_RECOVERY:'false',PUBLICATION_DOUAI_MANUAL:'false'});
  delete process.env.PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION;delete process.env.GITHUB_OUTPUT;
  const invoke=async command=>{process.argv=[process.execPath,path.join(root,'scripts/publication-jobs.mjs'),command];await import(pathToFileURL(path.join(root,'scripts/publication-jobs.mjs')).href+'?brive='+ ++imports);};
  const sealed=process.env.PUBLICATION_BRIVE_EDIT_AUTHORIZATION;delete process.env.PUBLICATION_BRIVE_EDIT_AUTHORIZATION;await fail(()=>invoke('preview-selected'));assert.ok(calls.every(c=>c.method==='GET'));process.env.PUBLICATION_BRIVE_EDIT_AUTHORIZATION=sealed;
  await invoke('preview-selected');checks++;assert.ok(calls.every(c=>c.method==='GET'));
  const fingerprint=logs.join('\n').match(/Empreinte PREVIEW : ([0-9a-f]{64})/)[1];
  Object.assign(process.env,{PUBLICATION_MANUAL_MODE:'execute',PUBLICATION_MANUAL_CONFIRMATION:'EXECUTE',PUBLICATION_MANUAL_FINGERPRINT:'0'.repeat(64)});
  calls=[];await fail(()=>invoke('claim'));assert.ok(calls.every(c=>c.method==='GET'));
  process.env.PUBLICATION_MANUAL_FINGERPRINT=fingerprint;calls=[];await invoke('claim');checks++;assert.equal(calls.filter(c=>c.method==='POST').length,1);
  current=clone(e);current.events[0].description+=' concurrent';calls=[];await fail(()=>invoke('claim'));assert.ok(calls.every(c=>c.method==='GET'));current=e;
  const claimed=clone(e);Object.assign(claimed.jobs[0],{status:'RUNNING',attempt_count:1,batch_id:a.batch_id});Object.assign(claimed.queue.find(j=>j.id===JOB),claimed.jobs[0]);
  ok(()=>assertEvidence(a,claimed,fixture,'claimed'));for(const patch of [{batch_id:next},{attempt_count:2},{status:'SUCCESS'}]){const wrong=clone(claimed);Object.assign(wrong.jobs[0],patch);rejects(()=>assertEvidence(a,wrong,fixture,'claimed'));}
  process.env.PUBLICATION_JOBS=JSON.stringify([{id:JOB,event_id:ID,reason:'edit',attempt_count:1,batch_id:a.batch_id}]);ok(()=>manualContext(a));
  // Execute both real CLI guards with GET-only mocked private/public reads, including the post-commit source check.
  const evidenceFile=path.join(tmp,'claimed.json');fs.writeFileSync(evidenceFile,JSON.stringify(claimed));
  const preload=path.join(tmp,'mock.mjs');fs.writeFileSync(preload,`import fs from 'node:fs';const e=JSON.parse(fs.readFileSync(${JSON.stringify(evidenceFile)}));globalThis.fetch=async(raw,o={})=>{if(o.method&&o.method!=='GET')throw Error('network write forbidden');const u=new URL(raw);let r;if(u.pathname.endsWith('/events'))r=u.searchParams.has('validated')?e.source.filter(x=>!u.searchParams.has('id')||x.id>u.searchParams.get('id').slice(3)).slice(0,500):e.events;else if(u.searchParams.has('or'))r=e.queue;else r=e.jobs;return{ok:true,json:async()=>r,text:async()=>JSON.stringify(r)}};`);
  const captured=path.join(tmp,'source.json');fs.writeFileSync(captured,JSON.stringify(e.source));
  Object.assign(process.env,{DEDICALIVRES_SUPABASE_URL:process.env.SUPABASE_URL,DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY:'offline',PUBLICATION_TARGETED:'true'});
  const cli=name=>{const result=spawnSync(process.execPath,['--import',preload,path.join(fixture,'scripts',name),captured],{cwd:fixture,env:process.env,encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS/);checks++;};
  process.env.EVENT_PUBLISHER_EXPORT_DIR=path.join(tmp,'prepared');
  const prepared=spawnSync(process.execPath,['--import',preload,path.join(fixture,'scripts/project-brive-edit.mjs'),'prepare-claimed'],{cwd:fixture,env:process.env,encoding:'utf8',timeout:90000});
  assert.equal(prepared.status,0,prepared.stderr);assert.deepEqual(fs.readFileSync(path.join(tmp,'prepared/public-events-source.json'),'utf8'),JSON.stringify(e.source));checks++;
  fs.appendFileSync(path.join(fixture,'index.html'),'unexpected');await fail(()=>verifyWorkspace(a,claimed,fixture));git(fixture,'apply','--reverse',path.join(tmp,'one/projection.patch'));git(fixture,'restore','index.html');git(fixture,'apply',path.join(tmp,'one/projection.patch'));
  cli('check-publication-diff.mjs');cli('verify-publication-source.mjs');
  git(fixture,'add','--all');git(fixture,'-c','user.name=Offline fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','-m','Offline projected publication');cli('verify-publication-source.mjs');rejects(()=>assertEvidence(a,e,fixture));
  fs.writeFileSync(evidenceFile,JSON.stringify({...claimed,source:claimed.source.slice(1)}));const denied=spawnSync(process.execPath,['--import',preload,path.join(fixture,'scripts/verify-publication-source.mjs'),captured],{cwd:fixture,env:process.env,encoding:'utf8',timeout:60000});assert.notEqual(denied.status,0);checks++;
 }finally{global.fetch=oldFetch;process.argv=oldArgv;console.log=oldLog;process.chdir(oldCwd);for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
 const workflow=fs.readFileSync('.github/workflows/publish-events.yml','utf8');ok(()=>{
  const scope=fs.readFileSync('scripts/check-publication-diff.mjs','utf8');assert.doesNotMatch(scope.slice(scope.indexOf('if(process.env.PUBLICATION_BRIVE_EDIT_AUTHORIZATION)'),scope.indexOf('const legacy =')),/process.exit/);
assert.match(workflow,/brive_edit_authorization:/);assert.match(workflow,/manual-preview:[\s\S]*?contents: read/);assert.match(workflow,/group: dedicalivres-event-publication/);});
 console.log(`PASS Brive : ${checks} contrôles, projections identiques, refus fermés, CAS mockée et CLI de source avant/après commit sans réseau réel`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
