// Isolated frozen-catalogue projection; never reserves or finalizes a job.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ID,JOB,PAGE,proof,digest,authorize,guardJobs,baseFiles,assertEvidence,renderPage,readEvidence,manualContext} from './brive-edit-policy.mjs';
import {jobDigest,parisDate} from './retired-test-policy.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const git=(root,...args)=>execFileSync('git',args,{cwd:root});
const stop=m=>{throw Error('STOP projection Brive : '+m);};

function fileHashes(root){
 const result=new Map();
 const walk=dir=>{for(const name of fs.readdirSync(dir)){if(name==='.git')continue;const full=path.join(dir,name),stat=fs.lstatSync(full);
  if(stat.isSymbolicLink())stop('lien symbolique inattendu');
  if(stat.isDirectory())walk(full);else if(stat.isFile())result.set(path.relative(root,full),digest(fs.readFileSync(full)));
 }};walk(root);return result;
}
export async function project({root=ROOT,output,a,evidence,phase='pending',draft=false}){
 assertEvidence(a,evidence,root,phase,{draft});
 output=path.resolve(output);if(output===root||output.startsWith(path.resolve(root)+path.sep)||fs.existsSync(output))stop('sortie neuve isolée requise');
 const {snapshot,map}=baseFiles(root,a),stage=path.join(output,'projection');fs.mkdirSync(output,{recursive:true});
 git(root,'clone','--quiet','--no-hardlinks',root,stage);git(stage,'checkout','--quiet','--detach',a.baseline_sha);
 // Exercise the current candidate code; public output is always based on the sealed Git corpus.
 fs.cpSync(path.join(ROOT,'scripts'),path.join(stage,'scripts'),{recursive:true});
 const read=p=>fs.readFileSync(path.join(stage,p));
 const beforeFiles=fileHashes(stage);
 fs.writeFileSync(path.join(stage,PAGE),renderPage(read(PAGE).toString()));
 const updated={...snapshot,events:snapshot.events.map(e=>e.id===ID?{...e,city:proof().after.city,region:proof().after.region}:e)};
 fs.writeFileSync(path.join(stage,'docs/territoires/catalogue-public.json'),JSON.stringify(updated,null,2));
 const run=(...args)=>execFileSync(args[0],args.slice(1),{cwd:stage,env:{...process.env,PUBLICATION_REFERENCE_DATE:a.reference_date,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
 run('python3','scripts/event-publisher/refresh-index.py','--root',stage,'--today',a.reference_date);
 for(const name of ['build-territorial-pages.mjs','build-static-agenda-previews.mjs'])run('node','scripts/'+name);
 const {projectBriveAggregates,assertEnrichment}=await import('./project-targeted-publication.mjs');
 assertEnrichment(git(stage,'show','HEAD:'+PAGE).toString(),read(PAGE).toString(),ID);
 const cwd=process.cwd();try{process.chdir(stage);projectBriveAggregates(a,evidence,root,phase,draft);}finally{process.chdir(cwd);}
 run('python3','-c',`import importlib.util,datetime as d,json,re;from pathlib import Path
s=importlib.util.spec_from_file_location('r','scripts/refresh-temporal-catalogues.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);root=Path('.');day=d.date.fromisoformat('${a.reference_date}');m.corpus(root);m.assert_france_archives(root,day);m.assert_previews(root,day)
import subprocess
for sitemap in ['sitemap.xml','sitemap-evenements.xml']:
 p=Path(sitemap);xml=p.read_text();m.sitemap_urls(xml)
 for name in subprocess.check_output(['git','diff','--name-only','--','*.html'],text=True).splitlines():
  if (name=='${PAGE}' or name=='evenement/index.html') != (sitemap=='sitemap-evenements.xml'):continue
  html=Path(name).read_text()
  if name!='${PAGE}' and name!='evenement/index.html':
   old=subprocess.run(['git','show','HEAD:'+name],capture_output=True,text=True)
   if old.returncode==0:
    if m.seo(old.stdout)!=m.seo(html) or m.structured(old.stdout)!=m.structured(html):raise ValueError('SEO tiers modifié : '+name)
    if (name in ['index.html','salons-du-livre.html','dedicaces.html'] or 'data-city=' in html) and m.preview_frame(old.stdout)!=m.preview_frame(html):raise ValueError('hors aperçu : '+name)
  url=re.findall(r'<link rel="canonical" href="([^"]+)"\\s*/?>',html)
  if len(url)!=1:raise ValueError('canonical ambigu')
  xml=m.refresh.updated_sitemap(xml,url[0],day)
 p.write_text(xml)
`);
 const allowed=new Set([PAGE,'docs/territoires/catalogue-public.json','docs/territoires/audit.json','evenement/index.html','sitemap.xml','sitemap-evenements.xml','index.html','salons-du-livre.html','dedicaces.html',
  ...git(stage,'ls-tree','--name-only','HEAD').toString().split('\n').filter(p=>/^evenements-litteraires-.*\.html$/.test(p))]);
 const afterFiles=fileHashes(stage),created=[...afterFiles.keys()].filter(p=>!beforeFiles.has(p));
 if([...beforeFiles.keys()].some(p=>!afterFiles.has(p))||created.some(p=>!/^evenements-litteraires-france-archives-[1-9]\d*\.html$/.test(p)))stop('suppression/nouveau fichier inattendu');
 for(const p of created)allowed.add(p);
 const changed=[...afterFiles.keys()].filter(p=>afterFiles.get(p)!==beforeFiles.get(p)).sort();
 if(changed.some(p=>!allowed.has(p)))stop('fichier hors périmètre');
 if(created.length)git(stage,'add','--intent-to-add','--',...created);
 if(changed.length>250||changed.some(p=>p.startsWith('auteurs/'))||Object.entries(map).some(([id,p])=>id!==ID&&!read(p).equals(git(stage,'show','HEAD:'+p))))stop('fiches tierces ou plafond');
 // The catalogue and mapping have exactly the authorized two-field delta, never the other pending edits.
 if(digest(JSON.parse(read('docs/territoires/catalogue-public.json')))!==digest(updated)
   ||!read('docs/territoires/event-canonical-map.json').equals(git(stage,'show','HEAD:docs/territoires/event-canonical-map.json')))stop('catalogue/canonical tiers modifiés');
 git(stage,'diff','--check','--',...changed);
 const patch=git(stage,'diff','--binary','--',...changed);
 const report={base:a.baseline_sha,day:a.reference_date,mode:'LOCAL_PREVIEW_ONLY',events:Object.keys(map).length,otherEventPagesUnchanged:true,canonical:PAGE,changes:changed,deleted:[],created,otherJobsSelected:0};
 fs.writeFileSync(path.join(output,'projection.patch'),patch);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 return {report,patch};
}
export function draftAuthorization(root,evidence,decision=randomUUID()){
 const p=proof(),read=f=>git(root,'show','HEAD:'+f);
 return {version:1,event_id:ID,job_id:JOB,reason:'edit',canonical:PAGE,decision_id:decision,batch_id:randomUUID(),approval:'DRAFT_NOT_APPROVED',
 baseline_sha:git(root,'rev-parse','HEAD').toString().trim(),reference_date:parisDate(),expires_at:new Date(Date.now()+3590000).toISOString(),
 changes:{before:p.before,after:p.after},source_sha256:digest(evidence.source),queue_sha256:digest(evidence.queue.filter(j=>j.id!==JOB)),
 event_sha256:digest(evidence.events[0]),job_sha256:jobDigest(evidence.jobs[0]),pending_job_sha256:digest(evidence.jobs[0]),
 page_sha256:digest(read(PAGE)),catalogue_sha256:digest(read('docs/territoires/catalogue-public.json')),canonical_sha256:digest(read('docs/territoires/event-canonical-map.json')),
 proof_sha256:digest(p),projection_sha256:'0'.repeat(64)};
}
export async function verifyPendingProjection(a,evidence,root=process.cwd()){
 if(git(root,'status','--porcelain').toString().trim())stop('checkout non propre avant réservation');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'brive-pending-'));
 try{
  const {patch}=await project({root,output:path.join(temp,'fresh'),a,evidence});
  if(digest(patch)!==a.projection_sha256)stop('projection différente du manifeste avant réservation');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
export async function verifyWorkspace(a,evidence,root=ROOT){
 assertEvidence(a,evidence,root,'claimed');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'brive-verify-'));
 try{
  const {patch}=await project({root,output:path.join(temp,'fresh'),a,evidence,phase:'claimed'});
  if(digest(patch)!==a.projection_sha256||!git(root,'diff',a.baseline_sha,'--binary').equals(patch)
    ||git(root,'ls-files','--others','--exclude-standard').toString().trim())stop('diff différent de la PREVIEW ou fichier inattendu');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,output,evidenceFile]=process.argv.slice(2);
 if(mode==='draft'&&output){
  const e=evidenceFile?JSON.parse(fs.readFileSync(evidenceFile)):await readEvidence();
  const a=draftAuthorization(ROOT,e);const first=await project({output,a,evidence:e,draft:true});a.projection_sha256=digest(first.patch);
  const second=await project({output:output+'-repeat',a,evidence:e,draft:true});if(!first.patch.equals(second.patch))stop('projection non reproductible');
  fs.writeFileSync(path.join(output,'authorization-draft.json'),JSON.stringify(a,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('PASS brouillon DRAFT_NOT_APPROVED, deux projections identiques ; aucune réservation');
 }else if(mode==='prepare-claimed'){
  const a=authorize(),e=await readEvidence(),selected=JSON.parse(process.env.PUBLICATION_JOBS||'[]');guardJobs(selected,a);
  if(process.env.PUBLICATION_MANUAL_MODE!=='execute'||process.env.PUBLICATION_MANUAL_CONFIRMATION!=='EXECUTE'
    ||process.env.PUBLICATION_AUTOMATION_ENABLED!=='false'||selected[0].batch_id!==a.batch_id||selected[0].attempt_count!==1)stop('contexte manuel/batch invalide');
  manualContext(a);
  const folder=process.env.EVENT_PUBLISHER_EXPORT_DIR;const result=await project({output:folder,a,evidence:e,phase:'claimed'});
  if(digest(result.patch)!==a.projection_sha256)stop('projection différente de la PREVIEW');
  assertEvidence(a,await readEvidence(),ROOT,'claimed');
  git(ROOT,'apply','--check',path.resolve(folder,'projection.patch'));git(ROOT,'apply',path.resolve(folder,'projection.patch'));
  if(result.report.created.length)git(ROOT,'add','--intent-to-add','--',...result.report.created);
  await verifyWorkspace(a,await readEvidence());
  fs.writeFileSync(path.join(folder,'public-events-source.json'),JSON.stringify(e.source));
 }else stop('usage : draft <nouvelle-sortie> [preuve JSON lecture seule] ; prepare-claimed réservé au futur parcours manuel');
}
