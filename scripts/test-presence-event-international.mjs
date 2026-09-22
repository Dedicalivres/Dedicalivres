import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const createElement = tag => ({tag, children: [], appendChild(child) { this.children.push(child); }});
const geoContext = vm.createContext({window: {}, Intl, document: {createElement}});
vm.runInContext(read('geography.js'), geoContext);
const geo = geoContext.window.DEDICALIVRES_GEO;
for (const code of ['FR','BE','CH','LU','MC','CA','MG']) assert.equal(geo.getCountryCode({country_code:code}), code);
assert.equal(geo.getCountryName('CA'), 'Canada');
assert.ok(geo.formatPlace({city:'Montréal', country_code:'CA'}).includes('Canada'));
assert.ok(geo.getSubdivisions('FR').includes('Bretagne'));
assert.equal(geo.getSubdivisions('CA').length,0);
const shell=read('admin-shell.js');
const source=shell.slice(shell.indexOf('  function appendPresenceEvent('),shell.indexOf('  function renderPresences('));
const ctx=vm.createContext({document:{createElement},Intl});
vm.runInContext(source+';globalThis.render=appendPresenceEvent;',ctx);
const event={id:'id/?',title:'<Salon>',city:'Mons',country_code:'BE',type:'Salon',start_date:'2026-09-27',end_date:'2026-09-28'};
for (const events of [event,[event]]) {
 const parent=createElement('div');ctx.render(parent,{events});
 assert.match(parent.children[0].textContent, /<Salon> · Mons · Belgique · 27\/09\/2026 – 28\/09\/2026 · Salon/);
 assert.equal(parent.children[1].href,'event.html?id=id%2F%3F');
 assert.equal(parent.children[1].rel,'noopener noreferrer');
}
const missing=createElement('div');ctx.render(missing,{event_id:'missing'});
assert.match(missing.children[0].textContent,/introuvable ou inaccessible/);assert.equal(missing.children.length,1);
const single=createElement('div');ctx.render(single,{events:{...event,end_date:event.start_date}});
assert.equal(single.children[0].textContent.split('27/09/2026').length,2);
assert.match(read('admin-context.js'), /events\(id,title,city,country_code,start_date,end_date,type\)/);
assert.match(shell,/appendPresenceEvent\(body, item\)/);
assert.match(shell,/appendPresenceEvent\(communityDetailContent, item\)/);
// Execute the actual SEO loader/query against a server capped at two rows.
const seo=read('seo-pages.js');
const functions=seo.slice(seo.indexOf('  async function fetchSeoCatalog('),seo.indexOf('  async function loadPresenceCounts('));
const rows=['FR','FR','BE','CH','LU','MC','CA'].map((country_code,i)=>({id:i+1,country_code,region:country_code==='FR'?'Bretagne':'',validated:true,rejected:false}));
let failure=false; const seenFilters=[];
const client={from(table){assert.equal(table,'events');let cursor=0;const filters=[];const q={
 select(){return q},eq(k,v){filters.push([k,v]);seenFilters.push([k,v]);return q},
 order(k){assert.equal(k,'id');return q},limit(){return q},gt(k,v){cursor=v;return q},ilike(){return q},
 then(resolve){return Promise.resolve(resolve(failure&&cursor?{error:{message:'offline'}}:{data:rows.filter(r=>r.id>cursor&&filters.every(([k,v])=>r[k]===v)).slice(0,2),error:null}))}
};return q;}};
const sc=vm.createContext({supabaseClient:client,geo,region:'',countryCode:'',city:'',hasInteractiveRegionalMap:false});
vm.runInContext(functions+';globalThis.load=fetchSeoCatalog;',sc);
let result=await sc.load('id,country_code');assert.equal(result.data.length,7);
assert.ok(!seenFilters.some(([k])=>k==='country_code'));
sc.countryCode='BE';result=await sc.load('id');assert.equal(result.data.length,1);assert.equal(result.data[0].country_code,'BE');
sc.countryCode='';sc.region='Bretagne';result=await sc.load('id');assert.equal(result.data.length,2);
sc.region='';failure=true;result=await sc.load('id');assert.equal(result.error.message,'offline');assert.ok(!result.data);
console.log('PASS: présence liée/manquante, dates, lien sûr, 7 pays, pagination, filtres pays/région, erreur réseau.');
