import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classify,qualify,territoryFor,validDate,duplicateGroups,fetchPublicEvents,normalize} from './territorial-catalog.mjs';
import {territories} from './territorial-directory.mjs';

const canonicalMap = JSON.parse(
  fs.readFileSync('docs/territoires/event-canonical-map.json', 'utf8')
);
const registry=JSON.parse(fs.readFileSync('docs/territoires/referentiel.json'));
const base={id:'a',title:'Livre',city:'Rennes',country_code:'FR',region:'Bretagne',validated:true,rejected:false,start_date:'2026-09-20',end_date:'2026-09-22'};
assert.equal(classify(base,'2026-09-22'),'ongoing');
assert.equal(classify(base,'2026-09-23'),'past');
assert.equal(classify(base,'2026-09-19'),'future');
assert.equal(classify({...base,end_date:null},'2026-09-21'),'past');
assert.equal(classify({...base,start_date:null},'2026-09-22'),'undated');
assert.equal(classify({...base,end_date:'2026-09-19'},'2026-09-22'),'invalid');
assert.equal(classify({...base,registration_force_status:'annule'},'2026-09-22'),'registration-cancelled');
assert.equal(validDate('2026-02-30'),false);
assert.equal(classify({...base,start_date:'2026-02-30'},'2026-09-22'),'invalid');
assert.equal(territoryFor({...base,country_code:null},registry),null);
assert.equal(territoryFor({...base,country_code:'ZZ'},registry),null);
assert.equal(territoryFor({...base,region:'Indre-et-Loire'},registry),null);
assert.throws(()=>qualify([base,base],registry,{},'2026-09-22'),/Collision/);
assert.equal(duplicateGroups([base,{...base,id:'b',title:'LIVRE'}]).length,1);
assert.equal(qualify([base,{...base,id:'b'}],registry,{},'2026-09-22').accepted.length,2);
assert.equal(qualify([{...base,rejected:true}],registry,{},'2026-09-22').accepted.length,0);
assert.equal(normalize('Événement'),normalize('Evenement'));
const snapshot=JSON.parse(fs.readFileSync('docs/territoires/catalogue-public.json'));
const sitemap=fs.readFileSync('sitemap.xml','utf8');
const sitemapEntries=[...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>\s*)?(?:<priority>([^<]+)<\/priority>\s*)?<\/url>/g)].map(match=>({loc:match[1],lastmod:match[2],priority:match[3]}));
const sitemapLocs=sitemapEntries.map(entry=>entry.loc);
const expectedTerritorialLastmod=snapshot.capturedAt.slice(0,10);
assert.equal(territories.length,21,'21 territoires attendus');
for(const p of territories){
 const matches=sitemapEntries.filter(entry=>entry.loc===p.canonical);
 assert.equal(matches.length,1,`${p.canonical}: présence unique dans sitemap.xml`);
 assert.equal(matches[0].lastmod,expectedTerritorialLastmod,`${p.canonical}: lastmod du snapshot`);
}
assert.equal(new Set(sitemapLocs).size,sitemapLocs.length,'Aucun doublon <loc> dans sitemap.xml');
const audit=JSON.parse(fs.readFileSync('docs/territoires/audit.json'));
const source=new Map(snapshot.events.map(e=>[e.id,e]));
const countryLocation=p=>({FR:'en France',BE:'en Belgique',CH:'en Suisse',LU:'au Luxembourg',MC:'à Monaco'}[p.code]||`en ${p.country}`);
const titles=new Set(),descriptions=new Set(),canonicals=new Set(),intros=new Set();
for(const p of audit.territorialPages){
 const html=fs.readFileSync(p.file,'utf8');
 const ids=[...html.matchAll(/<li data-event-id="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual([...ids].sort(),[...p.ids].sort(),`${p.label}: événements`);
 assert.equal(new Set(ids).size,p.total,`${p.label}: événements uniques`);
 const title=html.match(/<title>([^<]+)<\/title>/)[1];
 const expectedTitle=p.kind==='country'?`Événements littéraires ${countryLocation(p)} — Dédicalivres`:`Événements littéraires en ${p.label}, ${p.country} — Dédicalivres`;
 assert.equal(title,expectedTitle);
 titles.add(title);
 const description=html.match(/<meta name="description" content="([^"]+)"/)[1];
 for(const term of ['Dédicalivres','salons du livre','festivals','dédicaces','rencontres littéraires','à venir',p.country])assert(description.includes(term),`${p.label}: ${term}`);
 if(p.kind==='region')assert(description.includes(p.label),`${p.label}: région absente de la description`);
 descriptions.add(description);
 const canonical=html.match(/rel="canonical" href="([^"]*)"/)[1];
 assert.equal(canonical,p.canonical);
 assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
 canonicals.add(canonical);
 assert.equal((html.match(/<h1>/g)||[]).length,1);
 assert(html.includes(`<h1>Les rendez-vous du livre en ${p.label}</h1>`));
 const structured=JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
 assert.equal(structured['@type'],'CollectionPage');
 assert.equal(structured.url,p.canonical);
 assert.equal(structured.isPartOf?.name,'Dédicalivres');
 assert.equal(structured.about?.name,p.label);
 if(p.kind==='region')assert.equal(structured.about?.containedInPlace?.name,p.country);
 assert.equal(structured.breadcrumb?.itemListElement?.at(-1)?.item,p.canonical);
 if(p.kind==='region')assert(html.includes(`href="${p.countryUrl}"`));
 assert(html.includes('href="index.html#agenda"'));
 const intro=html.match(/<section class="territory-hero">[\s\S]*?<h1>[^<]+<\/h1><p>([^<]+)<\/p>/)[1];
 intros.add(intro);
 if(p.total===0){assert.equal(ids.length,0);assert(html.includes('Aucun événement dans cette catégorie'));}
 for(const m of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)){
  if(/^(https?:|mailto:)/.test(m[1]))continue;
  assert(fs.existsSync(m[1].split(/[?#]/)[0]),`${p.label}: ${m[1]}`);
 }
}
for(const [name,set] of Object.entries({titles,descriptions,canonicals,intros}))assert.equal(set.size,audit.territorialPages.length,`${name} uniques`);
const pilotIntros=[];
for(const p of audit.pilots){
 const html=fs.readFileSync(p.file,'utf8');
 const ids=[...html.matchAll(/<li data-event-id="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,p.total);
 assert.equal(new Set(ids).size,p.total);
 assert.deepEqual([...ids].sort(),[...p.ids].sort());
 assert.equal(p.total,p.upcoming+p.past+p.undated+p.cancelled);
 assert.equal(html.match(/rel="canonical" href="([^"]*)"/)[1],p.canonical);
 assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
 assert.equal(html.match(/<title>([^<]+)<\/title>/)[1],`Événements littéraires en ${p.label}, ${p.country} — Dédicalivres`);
 const description=html.match(/<meta name="description" content="([^"]+)"/)[1];
 for(const term of ['Dédicalivres','salons du livre','festivals','dédicaces','rencontres littéraires','à venir',p.label,p.country])assert(description.includes(term),`${p.label}: ${term}`);
 assert.equal((html.match(/<h1>/g)||[]).length,1);
 assert(html.includes(`<h1>Les rendez-vous du livre en ${p.label}</h1>`));
 const structured=JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
 assert.equal(structured['@type'],'CollectionPage');
 assert.equal(structured.url,p.canonical);
 assert.equal(structured.isPartOf?.name,'Dédicalivres');
 assert.equal(structured.about?.name,p.label);
 assert.equal(structured.about?.containedInPlace?.name,p.country);
 assert(html.includes(`href="${p.countryUrl}"`));
 assert(html.includes('href="index.html#agenda"'));
 pilotIntros.push(html.match(/<section class="territory-hero">[\s\S]*?<h1>[^<]+<\/h1><p>([^<]+)<\/p>/)[1]);
 assert(!html.includes('src="seo-pages.js'));
 assert.equal((html.match(/src="tracking-v4\.js/g)||[]).length,1);
 assert.equal((html.match(/@supabase\/supabase-js/g)||[]).length,1);
 assert(!html.includes('Chargement'));
 const upcoming=html.split('id="a-venir"')[1].split('</section>')[0];
 const upcomingIds=[...upcoming.matchAll(/data-event-id="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(upcomingIds.length,p.upcoming);
 const dates=upcomingIds.map(id=>source.get(id).start_date);
 assert.deepEqual(dates,[...dates].sort());
 for(const id of ids){
 const e=source.get(id);
 assert.equal(e.country_code,p.code);
 assert.equal(e.region,p.label);
 assert(canonicalMap[id],`Canonical statique absent pour ${id}`);
 assert(
  html.includes(`href="${canonicalMap[id]}"`),
  `Lien canonical statique absent pour ${id}: ${canonicalMap[id]}`
 );
}
 for(const m of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)){
  if(/^(https?:|mailto:)/.test(m[1]))continue;
  assert(fs.existsSync(m[1].split(/[?#]/)[0]),m[1]);
 }
}
assert.equal(new Set(pilotIntros).size,audit.pilots.length);
console.log(`PASS SEO/GEO territorial : ${audit.territorialPages.length} pages, métadonnées, JSON-LD, maillage, événements et pages vides contrôlés`);
console.log('PASS territorial: dates inclusives, invalides, sans date, annulations, pays inconnus, collisions, doublons, visibilité, listes, compteurs, ordre, liens et canonicals');

// Quality flags are advisory. Published records must never disappear.
const {analyzeQuality}=await import('./territorial-quality.mjs');
const {renderTerritory,pilots}=await import('./territorial-render.mjs');
const observations=JSON.parse(fs.readFileSync('docs/territoires/signalements.json'));
const mons=snapshot.events.find(e=>e.id==='0627ab62-44b8-4e12-baa7-c29b158ed664');
assert.equal(mons.start_date,'2026-09-26');assert.equal(mons.end_date,'2026-09-27');
assert(!analyzeQuality(snapshot.events,registry,observations,'2026-09-23').some(e=>e.id===mons.id));
assert(analyzeQuality([{...mons,start_date:'2026-09-27'}],registry,observations,'2026-09-23').some(e=>e.id===mons.id));
for(const p of audit.pilots){
 const published=snapshot.events.filter(e=>e.validated===true&&e.rejected===false&&e.country_code===p.code&&e.region===p.label);
 assert.deepEqual([...p.ids].sort(),published.map(e=>e.id).sort());
}
const invalid={...base,start_date:'invalid',end_date:null};
const rendered=renderTerritory({p:pilots[0],events:[invalid],registry,capturedAt:snapshot.capturedAt});
assert.equal(rendered.stats.total,1);assert.equal(rendered.stats.undated,1);assert(rendered.main.includes('Dates à confirmer'));
assert.equal(qualify([{...base,country_code:null}],registry,observations,'2026-09-23').accepted[0].territoryId,null);
let calls=0;
const config={supabaseUrl:'https://public.invalid',supabaseAnonKey:'public-test'};
const rows=await fetchPublicEvents(config,async url=>{calls++;if(calls===2)assert(new URL(url).searchParams.get('id')==='gt.a');return {ok:true,json:async()=>calls===1?[base]:[]};});
assert.equal(rows.length,1);assert.equal(calls,2);
await assert.rejects(fetchPublicEvents(config,async()=>({ok:false,status:503})),/503/);
await assert.rejects(fetchPublicEvents(config,async()=>({ok:true,json:async()=>[base,base]})),/incohérent/);
console.log('PASS publication prioritaire : 106 annonces conservées, Mons corrigé sans alerte, dates invalides conservées, lecture publique complète et erreurs contrôlées');
