// Test-only published state. Never restore these bytes into the working repository.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export function historicalLorientFixture(currentRoot) {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'historical-lorient-'));
 const root=path.join(temp,'repo');
 const git=(...args)=>execFileSync('git',args,{cwd:root});
 try{
  execFileSync('git',['clone','--quiet','--no-hardlinks',currentRoot,root]);
  const registry=JSON.parse(fs.readFileSync(path.join(root,'scripts/event-publisher/lorient-test-retirement-preview.json')));
  // Keep today's code and guards; restore only the verified, historical public fixture.
  const publicFile=p=>p.endsWith('.html')||/^sitemap[^/]*\.xml$/.test(p)
    ||['docs/territoires/catalogue-public.json','docs/territoires/event-canonical-map.json',
       'docs/territoires/audit.json','event-canonical.js'].includes(p);
  const listed=ref=>git('ls-tree','-r','--name-only',ref).toString().trim().split('\n').filter(publicFile);
  const before=listed('HEAD'),historical=listed(registry.base),wanted=new Set(historical);
  for(const p of before)if(!wanted.has(p))fs.unlinkSync(path.join(root,p));
  for(const p of historical){
   fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});
   fs.writeFileSync(path.join(root,p),git('show',registry.base+':'+p));
  }
  for(const [file,expected] of [[registry.excluded.canonical,registry.excluded.page_sha256],
    ['docs/territoires/catalogue-public.json',registry.catalogue_sha256],
    ['scripts/event-publisher/legacy-enriched-events.json',registry.legacy_sha256]]){
   assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),expected);
  }
  git('add','--',...new Set([...before,...historical]));
  git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','test: isolated historical Lorient public fixture');
  assert.equal(git('status','--porcelain').toString(),'');
  return {root,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
 }catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
}
