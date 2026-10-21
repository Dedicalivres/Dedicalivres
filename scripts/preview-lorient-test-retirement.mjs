import {assertWithdrawalEvidence,referenceDate} from './retired-test-policy.mjs';
// Filesystem-only preview. No Supabase client, job reservation or publication API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const TARGET = 'eb6672b2-900f-4c6a-9021-ea84c5036769';
export const CANONICAL = 'evenement/salon-du-livre-jeunesse-du-pays-de-lorient-lorient-3441.html';
const BASE = 'fd35cca1a640eeec037f7b835a76d1720a69dba9';
const MAP = 'docs/territoires/event-canonical-map.json';
const CATALOG = 'docs/territoires/catalogue-public.json';
const LEGACY = 'scripts/event-publisher/legacy-enriched-events.json';
const POLICY = 'scripts/event-publisher/lorient-test-retirement-preview.json';
const BLOCKED = '80a4506a-357e-4df0-a5ac-5fe4ce27535f';
const fail = message => {throw Error('STOP aperçu Lorient : '+message);};
const git = (root,...args) => execFileSync('git',args,{cwd:root});
const read = (root,p) => fs.readFileSync(path.join(root,p));
const json = (root,p) => JSON.parse(read(root,p));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const equal = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const baseline = (root,p) => git(root,'show','HEAD:'+p);

export function validateRegistry(registry) {
  if (registry?.version!==1 || registry.mode!=='local-preview-only' || registry.base!==BASE
      || registry.excluded?.id!==TARGET || registry.excluded?.canonical!==CANONICAL
      || registry.excluded?.reason!=='private-test-not-an-event') fail('identité ou usage du registre invalide');
  for(const value of [registry.excluded.page_sha256,registry.catalogue_sha256,registry.legacy_sha256,registry.source_sha256,registry.audit_sha256])
    if(!/^[0-9a-f]{64}$/.test(value||''))fail('empreinte absente');
}

export function validateEvidence(registry, snapshot, source, audit) {
  validateRegistry(registry);
  if (!Array.isArray(snapshot.events)||!Array.isArray(source)||!Array.isArray(audit.jobs))fail('preuve incomplète');
  const before=new Map(snapshot.events.map(e=>[e.id,e])),current=new Map(source.map(e=>[e.id,e]));
  if(before.size!==snapshot.events.length||current.size!==source.length||!before.has(TARGET))fail('source dupliquée ou cible absente');
  const drift={};
  for(const [id,event] of before){
    const fresh=current.get(id);if(!fresh)fail('événement publié absent de Supabase');
    const fields={};
    if(!equal(Object.keys(event).sort(),Object.keys(fresh).sort()))fail('champs source modifiés');
    for(const [key,value] of Object.entries(event))if(!equal(value,fresh[key]))fields[key]={published:value,source:fresh[key]};
    if(Object.keys(fields).length)drift[id]=fields;
  }
  if(!equal(drift,registry.known_source_drift))fail('écart Supabase inexpliqué');
  if(!equal(source.filter(e=>!before.has(e.id)).map(e=>e.id).sort(),registry.unpublished_source_ids))fail('validations non publiées modifiées');
  const target=audit.jobs.find(j=>j.id===BLOCKED);
  if(audit.jobs.some(j=>j.status==='RUNNING')||!target||target.event_id!==TARGET||target.target_event_id!==TARGET
      ||target.reason!=='edit'||target.status!=='BLOCKED'||target.attempt_count!==0||target.batch_id!==null||target.commit_sha!==null)
    fail('file concurrente ou job Lorient non conforme');
  if(audit.event?.id!==TARGET||audit.event.validated!==true||audit.event.rejected!==false)fail('statut Lorient changé');
  return drift;
}

function baselineProof(root,registry){
  validateRegistry(registry);
  try{git(root,'merge-base','--is-ancestor',BASE,'HEAD');}catch{fail('base Git non compatible');}
  for(const [p,expected] of [[CATALOG,registry.catalogue_sha256],[LEGACY,registry.legacy_sha256],[CANONICAL,registry.excluded.page_sha256]])
    if(sha(baseline(root,p))!==expected)fail('empreinte publiée modifiée : '+p);
  const legacy=JSON.parse(baseline(root,LEGACY)),map=JSON.parse(baseline(root,MAP));
  if(legacy.count!==282||Object.keys(legacy.events).length!==282||map[TARGET]!==CANONICAL
      ||legacy.events[TARGET]!==path.basename(CANONICAL))fail('partition legacy/canonical invalide');
  const active=Object.fromEntries(Object.entries(legacy.events).filter(([id])=>id!==TARGET));
  return {map,active};
}

// Used only by the explicit offline entry point; never by the normal CLI.
export function verifyFrozenLorientRetirement(root,registry,day){
  referenceDate(day);
  if(json(root,'docs/territoires/audit.json').today!==day)fail('date de classement incohérente');
  const {map,active}=baselineProof(root,registry);
  const previous=JSON.parse(baseline(root,CATALOG)),expected={...previous,events:previous.events.filter(e=>e.id!==TARGET)};
  if(!equal(json(root,CATALOG),expected)||fs.existsSync(path.join(root,CANONICAL)))fail('retrait non exclusif');
  const wanted=Object.fromEntries(Object.entries(map).filter(([id])=>id!==TARGET));
  if(!equal(json(root,MAP),wanted))fail('canonical tiers modifié');
  if(!read(root,LEGACY).equals(baseline(root,LEGACY)))fail('manifeste historique modifié');
  for(const p of Object.values(wanted))if(!read(root,p).equals(baseline(root,p)))fail('fiche tierce modifiée : '+p);
  return {allowed:new Set([TARGET]),day,active};
}

export const removeSitemapEntry=(xml,url)=>{
  let count=0;
  const result=xml.replace(/^[ \t]*<url>[\s\S]*?<\/url>[ \t]*(?:\r?\n|$)/gm,entry=>entry.includes(`<loc>${url}</loc>`)?(count++,''):entry);
  if(count!==1)fail('entrée sitemap cible absente ou ambiguë');return result;
};

export async function preview({root,sourceFile,auditFile,output,withdrawal=null,phase='pending',evidence=null,day=process.env.PUBLICATION_REFERENCE_DATE}){
  root=fs.realpathSync(root);output=path.resolve(output);
  // Exports may not overlap the source checkout, including through symlinks.
  const parent=fs.realpathSync(path.dirname(output));output=path.join(parent,path.basename(output));
  if(output===root||output.startsWith(root+path.sep)||root.startsWith(output+path.sep)||fs.existsSync(output))fail('sortie non isolée ou déjà existante');
  referenceDate(day,withdrawal?.reference_date);
  if(process.env.PUBLICATION_REFERENCE_DATE!==undefined)referenceDate(day,process.env.PUBLICATION_REFERENCE_DATE);
  if(day<JSON.parse(baseline(root,'docs/territoires/audit.json')).today)fail('date antérieure à la référence publiée');
  const registry=json(root,POLICY);baselineProof(root,registry);
  const source=evidence?Buffer.from(JSON.stringify(evidence.source)):fs.readFileSync(sourceFile),
    audit=evidence?Buffer.from(JSON.stringify(evidence)):fs.readFileSync(auditFile);
  if(withdrawal) assertWithdrawalEvidence(withdrawal,{...JSON.parse(audit),source:JSON.parse(source)},root,phase);
  else {
    if(sha(source)!==registry.source_sha256||sha(audit)!==registry.audit_sha256)fail('preuve source/file expirée');
    validateEvidence(registry,json(root,CATALOG),JSON.parse(source),JSON.parse(audit));
  }
  const map=json(root,MAP),snapshot=json(root,CATALOG);
  if(!read(root,CATALOG).equals(baseline(root,CATALOG))||!read(root,MAP).equals(baseline(root,MAP))
      ||!read(root,LEGACY).equals(baseline(root,LEGACY)))fail('référence locale modifiée');
  for(const p of Object.values(map))if(!read(root,p).equals(baseline(root,p)))fail('fiche locale modifiée');
  // Snapshot local files to prove this program never writes to its source.
  const tracked=git(root,'ls-files','-z').toString().split('\0').filter(Boolean);
  const originals=new Map(tracked.map(p=>[p,sha(read(root,p))]));
  fs.mkdirSync(output);
  const stage=path.join(output,'projection');
  git(root,'clone','--quiet','--no-hardlinks',root,stage);
  const run=(program,args)=>execFileSync(program,args,{cwd:stage,env:{...process.env,PUBLICATION_REFERENCE_DATE:day,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
  try{
    fs.unlinkSync(path.join(stage,CANONICAL));
    const projected={...snapshot,events:snapshot.events.filter(e=>e.id!==TARGET)};
    fs.writeFileSync(path.join(stage,CATALOG),JSON.stringify(projected,null,2));
    const index='evenement/index.html',sitemap='sitemap-evenements.xml';
    const filename=path.basename(CANONICAL).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const card=new RegExp(`<a class="card" href="${filename}">[\\s\\S]*?<\\/a>`,'g');
    fs.writeFileSync(path.join(stage,index),read(stage,index).toString().replace(card,''));
    fs.writeFileSync(path.join(stage,sitemap),removeSitemapEntry(read(stage,sitemap).toString(),'https://dedicalivres.fr/'+CANONICAL));
    run('python3',['scripts/event-publisher/refresh-index.py','--root',stage,'--today',day]);
    // The target card was removed before rebuild; compare with Git, not that intermediate index.
    if(!read(stage,index).equals(baseline(stage,index)))run('python3',['-c',`import importlib.util,datetime as d;from pathlib import Path;s=importlib.util.spec_from_file_location('r','scripts/event-publisher/refresh-index.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);p=Path('sitemap-evenements.xml');p.write_text(m.updated_sitemap(p.read_text(),'https://dedicalivres.fr/evenement/index.html',d.date.fromisoformat('${day}')))`]);
    for(const script of ['build-event-canonical-map.mjs','build-event-canonical-client.mjs','build-territorial-pages.mjs','build-static-agenda-previews.mjs'])run('node',['scripts/'+script]);
    const {projectLorientPreviewAggregates}=await import('./project-targeted-publication.mjs');
    const cwd=process.cwd();try{process.chdir(stage);projectLorientPreviewAggregates(registry,day);}finally{process.chdir(cwd);}
    const scope=verifyFrozenLorientRetirement(stage,registry,day);
    // Reuse the strict XML updater for every HTML aggregate that actually changed,
    // including home/dedicaces previews affected by a day boundary.
    const changedHtml=git(stage,'diff','--name-only','--diff-filter=M','--','*.html').toString().trim().split('\n').filter(p=>p&&p!==index);
    run('python3',['-c',`import importlib.util,datetime as d,json,sys,re;from pathlib import Path;s=importlib.util.spec_from_file_location('r','scripts/event-publisher/refresh-index.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);p=Path('sitemap.xml');xml=p.read_text()
for name in json.loads(sys.argv[1]):
 urls=re.findall(r'<link rel="canonical" href="([^"]+)"\\s*/?>',Path(name).read_text())
 if len(urls)!=1: raise ValueError('canonical absent ou ambigu : '+name)
 xml=m.updated_sitemap(xml,urls[0],d.date.fromisoformat(sys.argv[2]))
p.write_text(xml)`,JSON.stringify(changedHtml),day]);
    // Existing independent corpus, archive and preview checks, without capture.
    run('python3',['-c',`import importlib.util,datetime as d;from pathlib import Path;s=importlib.util.spec_from_file_location('t','scripts/refresh-temporal-catalogues.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);r=Path('.');m.corpus(r);day=d.date.fromisoformat('${scope.day}');m.assert_france_archives(r,day);m.assert_previews(r,day)`]);
    for(const script of ['test-territorial-pages.mjs','test-author-seo-pages.mjs','test-event-canonical-client.mjs','test-static-agenda-previews.mjs'])run('node',['scripts/'+script]);
    const changes=git(stage,'diff','--name-status').toString().trim().split('\n').filter(Boolean).map(l=>{const [status,file]=l.split('\t');return {status,file};});
    const allowed=new Set([CATALOG,MAP,'event-canonical.js','docs/territoires/audit.json',index,sitemap,'sitemap.xml','index.html','salons-du-livre.html','dedicaces.html',CANONICAL]);
    for(const p of git(stage,'ls-tree','--name-only','HEAD').toString().split('\n'))if(/^evenements-litteraires-.*\.html$/.test(p))allowed.add(p);
    if(changes.length>250||changes.some(c=>!allowed.has(c.file)||!['M','D'].includes(c.status)||(c.status==='D'&&c.file!==CANONICAL)))fail('diff hors périmètre');
    // No live HTML, canonical client or sitemap may retain an identifier/link.
    for(const p of tracked.filter(p=>/\.(html|xml)$/.test(p)||p==='event-canonical.js')){
      const full=path.join(stage,p);if(fs.existsSync(full)){
        const text=fs.readFileSync(full,'utf8');if(text.includes(TARGET)||text.includes(path.basename(CANONICAL)))fail('référence publique résiduelle : '+p);
      }
    }
    if(!read(stage,'sitemap-seo-auteurs.xml').equals(baseline(stage,'sitemap-seo-auteurs.xml')))fail('sitemap auteur inattendu');
    const report={status:'PASS LOCAL PREVIEW ONLY',base:BASE,referenceDate:day,before:snapshot.events.length,after:projected.events.length,legacyActive:Object.keys(scope.active).length,legacyRetired:{id:TARGET,canonical:CANONICAL},legacyHistoricalManifestUnchanged:true,otherEventPagesByteIdentical:true,knownSourceDrift:registry.known_source_drift,unpublishedSourceIds:withdrawal?JSON.parse(source).filter(e=>!map[e.id]).map(e=>e.id).sort():registry.unpublished_source_ids,changes};
    fs.writeFileSync(path.join(output,'projection.patch'),git(stage,'diff','--binary'));
    fs.writeFileSync(path.join(output,'files.txt'),changes.map(c=>c.status+'\t'+c.file).join('\n')+'\n');
    fs.writeFileSync(path.join(output,'legacy-partition.json'),JSON.stringify({active:scope.active,retired:[registry.excluded]},null,2)+'\n');
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
    return report;
  }catch(error){fs.writeFileSync(path.join(output,'STOP.txt'),String(error.stack||error)+'\n');throw error;}
  finally{for(const [p,hash] of originals)if(sha(read(root,p))!==hash)fail('checkout source altéré');}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [sourceFile,auditFile,output]=process.argv.slice(2);
  if(!sourceFile||!auditFile||!output)fail('usage : node scripts/preview-lorient-test-retirement.mjs <source.json> <audit.json> <nouvelle-sortie>');
  preview({root:process.cwd(),sourceFile,auditFile,output}).then(report=>{
    console.log(JSON.stringify({status:report.status,before:report.before,after:report.after,legacyActive:report.legacyActive,files:report.changes.length}));
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
