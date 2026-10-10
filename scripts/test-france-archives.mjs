import assert from 'node:assert/strict';
import fs from 'node:fs';
import {territories,renderTerritory} from './territorial-render.mjs';

const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const snapshot=read('docs/territoires/catalogue-public.json');
const registry=read('docs/territoires/referentiel.json');
const verified=read('docs/territoires/verifications-organisateurs.json');
const canonicalMap=read('docs/territoires/event-canonical-map.json');
const france=territories.find(p=>p.id==='FR');
const {main,stats,rows,archivePages}=renderTerritory({p:france,events:snapshot.events,registry,verified,capturedAt:snapshot.capturedAt});
const ids=html=>[...html.matchAll(/<li data-event-id="([^"]+)"/g)].map(m=>m[1]);
const past=rows.filter(e=>e.status==='past').map(e=>e.id);
const nonPast=rows.filter(e=>e.status!=='past').map(e=>e.id);
const national=fs.readFileSync(france.file,'utf8');
assert.deepEqual(ids(national),nonPast);
assert.equal(stats.past,past.length);
assert.equal(archivePages.length,Math.ceil(past.length/50));
assert.equal(ids(main).length,nonPast.length);
assert(!main.includes('data-status="past"'));

const sitemap=fs.readFileSync('sitemap.xml','utf8');
const all=[];
for(const [index,page] of archivePages.entries()){
 const html=fs.readFileSync(page.file,'utf8');
 const pageIds=ids(html);
 assert(pageIds.length>0&&pageIds.length<=50);
 assert.deepEqual(pageIds,page.ids);
 all.push(...pageIds);
 const canonical=`https://dedicalivres.fr/${page.file}`;
 assert.equal(html.match(/rel="canonical" href="([^"]+)"/)[1],canonical);
 assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
 assert.equal((sitemap.match(new RegExp(`<loc>${canonical}</loc>`,'g'))||[]).length,1);
 assert(html.includes('name="viewport"'));
 assert(!html.includes('src="territorial-pages.js"'));
 assert(html.includes('href="evenements-litteraires-france.html"'));
 if(index>0)assert(html.includes(`href="${archivePages[index-1].file}"`));
 if(index<archivePages.length-1)assert(html.includes(`href="${archivePages[index+1].file}"`));
 for(const id of pageIds){
  assert(canonicalMap[id],`Fiche sans canonical : ${id}`);
  assert(html.includes(`href="${canonicalMap[id]}"`),`Lien fiche absent : ${id}`);
 }
}
assert.equal(all.length,past.length);
assert.equal(new Set(all).size,past.length);
assert.deepEqual([...all].sort(),[...past].sort());
assert.equal((sitemap.match(/<loc>https:\/\/dedicalivres\.fr\/evenements-litteraires-france-archives-\d+\.html<\/loc>/g)||[]).length,archivePages.length);

const future=rows.find(e=>e.status==='future');
assert(future);
const added={...future,id:'ffffffff-ffff-4fff-8fff-ffffffffffff',title:'Nouvel événement futur'};
const live=renderTerritory({p:france,events:[...snapshot.events,added],registry,verified,capturedAt:snapshot.capturedAt,live:true,archivePageCount:archivePages.length});
assert(live.main.includes(`data-event-id="${added.id}"`));
assert(!live.main.includes('data-status="past"'));
assert(live.main.includes(`href="${archivePages[0].file}"`));
assert.equal(live.stats.upcoming,stats.upcoming+1);

// Exercise the actual browser entry point without installing a browser package.
const pastEvent=rows.find(e=>e.status==='past');
const futureEvent=rows.find(e=>e.status==='future');
const mockEvents=[pastEvent,futureEvent].sort((a,b)=>a.id.localeCompare(b.id));
let rendered='',supabaseReads=0;
const content={dataset:{territoryId:'FR'},set outerHTML(value){rendered=value;}};
const status={textContent:''};
const button={hidden:true,disabled:false,onclick:null};
globalThis.document={
 getElementById:id=>({'territory-content':content,'territory-refresh-status':status,'territory-refresh':button})[id],
 querySelector:selector=>selector==='#archives'?{dataset:{archivePages:String(archivePages.length)}}:{setAttribute(){}}
};
globalThis.window={DEDICALIVRES_CONFIG:{supabaseUrl:'https://example.invalid',supabaseAnonKey:'test'}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 if(String(url).includes('/rest/v1/events')){
  supabaseReads++;
  const cursor=new URL(url).searchParams.get('id')?.slice(3);
  return {ok:true,json:async()=>cursor?[]:mockEvents};
 }
 return {ok:true,json:async()=>String(url).includes('referentiel')?registry:verified};
};
try{
 await import('../territorial-pages.js?test=france-archives');
 for(let attempt=0;attempt<20&&!rendered;attempt++)await new Promise(resolve=>setImmediate(resolve));
 assert(rendered,'La mise à jour dynamique ne s’est pas terminée');
 assert(rendered.includes(`data-event-id="${futureEvent.id}"`));
 assert(!rendered.includes(`data-event-id="${pastEvent.id}"`));
 assert(rendered.includes(`href="${archivePages[0].file}"`));
 assert.equal(supabaseReads,2,'Pagination réseau existante inchangée');
}finally{
 globalThis.fetch=originalFetch;
 delete globalThis.document;
 delete globalThis.window;
}
console.log(`PASS France : ${stats.past} archives uniques sur ${archivePages.length} pages, ${nonPast.length} cartes nationales, SEO et rendu dynamique`);
