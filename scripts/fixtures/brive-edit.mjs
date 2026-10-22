// Test-only historical public corpus. Never restore it into the caller's checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PAGE} from '../brive-edit-policy.mjs';

export const BEFORE_BRIVE='d285f8b805a902a4c8ca511d0603ac92ca869384';
export const PUBLISHED_BRIVE='827fb1422a99360b189b12104b66eeebd46738b4';
const hashes={
 [BEFORE_BRIVE]:['89d213ccb28486995a27892b34d47e4ec285ba25c6c5227d9c3873d70101a0ce',
  'ff6d0052d1691b8151786f0a1354f68dee930d73536c69bed6771a268a5bf4a9'],
 [PUBLISHED_BRIVE]:['1a9ebdfa83fa725f91293e9b4362c2d7ed3009bea1753719544037034a0ce160',
  'a559e739ebdbec0ad5e3a0c9530a93e486c3340188c3834ad0dda9ab77f14a8d'],
};
const canonicalHash='28f09de01ce7261d743232a68b82e956ec9ed8e77e4a201accf1222ca2526ab0';
const publicFile=p=>p.endsWith('.html')||/^sitemap[^/]*\.xml$/.test(p)
 ||['docs/territoires/catalogue-public.json','docs/territoires/event-canonical-map.json',
    'docs/territoires/audit.json','event-canonical.js'].includes(p);

export function historicalBriveFixture(currentRoot,destination,reference=BEFORE_BRIVE) {
 assert(hashes[reference],'unknown historical Brive reference');
 assert(!fs.existsSync(destination),'fresh isolated fixture required');
 assert(!path.resolve(destination).startsWith(path.resolve(currentRoot)+path.sep),'fixture must be outside the source checkout');
 const git=(...args)=>execFileSync('git',args,{cwd:destination,stdio:['ignore','pipe','pipe']});
 execFileSync('git',['clone','--quiet','--no-hardlinks',currentRoot,destination]);
 // Keep all candidate scripts, including uncommitted test changes. Only the
 // public corpus is restored; no guard, proof or production fingerprint changes.
 fs.cpSync(path.join(currentRoot,'scripts'),path.join(destination,'scripts'),{recursive:true});
 const historical=new Set(git('ls-tree','-r','--name-only',reference).toString().trim().split('\n').filter(publicFile));
 const changed=git('diff','--name-only',reference,'HEAD').toString().trim().split('\n').filter(publicFile);
 for(const file of changed) {
  const full=path.join(destination,file);
  if(historical.has(file)) {
   fs.mkdirSync(path.dirname(full),{recursive:true});
   fs.writeFileSync(full,git('show',reference+':'+file));
  } else fs.unlinkSync(full);
 }
 for(const [file,expected] of [
  [PAGE,hashes[reference][0]],['docs/territoires/catalogue-public.json',hashes[reference][1]],
  ['docs/territoires/event-canonical-map.json',canonicalHash],
 ])assert.equal(createHash('sha256').update(fs.readFileSync(path.join(destination,file))).digest('hex'),expected);
 const pages=[...new Set([...git('ls-files').toString().trim().split('\n').filter(publicFile),...historical])]
  .filter(p=>fs.existsSync(path.join(destination,p)));
 assert.deepEqual(pages.sort(),[...historical].sort(),'historical public corpus differs');
 git('add','--all','--','scripts',...changed);
 git('-c','user.name=Offline fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null',
  'commit','--quiet','--allow-empty','-m','test: isolated historical Brive public corpus '+reference);
 assert.equal(git('status','--porcelain').toString(),'');
 return destination;
}
