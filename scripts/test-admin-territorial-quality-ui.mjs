// Offline UI smoke test: fake DOM, real quality module and JSON fixtures, no network or mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=['docs/territoires/referentiel.json','docs/territoires/signalements.json'];
const events=[
 {id:'event-paca',title:'Rencontre littéraire',country_code:'FR',region:"Provence-Alpes-Côte d'Azur",
  city:'Toulon',start_date:'2026-12-02',end_date:'2026-12-02',validated:true,rejected:false},
 {id:'event-bad-region',title:'Salon expérimental',country_code:'FR',region:'Région inconnue',
  city:'Nantes',start_date:'2026-12-02',end_date:'2026-12-02',validated:true,rejected:false},
 {id:'event-valid',title:'Autre rencontre',country_code:'FR',region:'Bretagne',
  city:'Rennes',start_date:'2026-12-04',end_date:'2026-12-04',validated:true,rejected:false}
];
const state={authenticated:true,status:'ready',events};
let subscriber=null;
const context={
 subscribe(fn){subscriber=fn;},
 getState(){return state;}
};
const listeners={};
let markup='',detailsOpen=false;
const host={hidden:true,replaceChildren(){markup='';},querySelector(selector){
 if(selector==='#v11-territorial-details')return {
  get open(){return detailsOpen;},
  addEventListener(name,fn){listeners.toggle=fn;}
 };
 if(selector==='select')return {
  addEventListener(name,fn){listeners.change=fn;},
  focus(){listeners.focusedSelect=true;}
 };
 if(selector.startsWith('[data-quality-kind='))return {focus(){listeners.focusedTag=true;}};
 return null;
},querySelectorAll(selector){
 assert.equal(selector,'[data-quality-kind]');
 return [...markup.matchAll(/data-quality-kind='([^']+)'/g)].map(m=>({
  dataset:{qualityKind:m[1]},
  addEventListener(name,fn){(listeners.tags??={})[m[1]]=fn;}
 }));
}};
Object.defineProperty(host,'innerHTML',{
 get(){return markup;},
 set(value){markup=value;detailsOpen=/id='v11-territorial-details'[^>]*\sopen/.test(value);}
});
globalThis.window={DEDICALIVRES_ADMIN_CONTEXT:context};
globalThis.document={getElementById(id){return id==='v11-territorial-quality'?host:null;}};
const seen=[];
globalThis.fetch=async path=>{
 seen.push(path);
 assert(files.includes(path),'Only local documents can be requested');
 return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path,'utf8'))};
};
await import('../admin-territorial-quality.js');
await new Promise(resolve=>setImmediate(resolve));

assert.equal(host.hidden,false);
assert(subscriber);
assert.deepEqual(seen,files);
assert.match(markup,/<details id='v11-territorial-details'/);
assert.equal(detailsOpen,false,'Must start collapsed');
assert.match(markup,/Contrôles qualité/);
assert.match(markup,/Géographie \(1\)/);
assert.doesNotMatch(markup,/event-paca<\/h4>/,'The typographic alias is not a new geography error');
assert.match(markup,/event-bad-region/);
assert(!/plafonné à 1 000/.test(markup));
assert.equal(typeof listeners.toggle,'function');

detailsOpen=true;listeners.toggle({currentTarget:{open:true}});
subscriber(state);
assert.equal(detailsOpen,true,'Open disclosure must stay open after state rerender');
assert(matchKind('geography'),'Geography category must exist');
listeners.tags.geography();
assert.equal(detailsOpen,true);
assert.match(markup,/data-quality-kind='geography' aria-pressed='true'/);
assert.doesNotMatch(markup,/data-quality-kind='dates' aria-pressed='true'/);
assert.equal(listeners.focusedTag,true,'Keyboard focus must be restored to selected category');

// A new DOM render after changing scope keeps the panel open and selected category.
listeners.change({target:{value:'all'}});
assert.equal(detailsOpen,true);
assert.match(markup,/option value='all' selected/);
assert.equal(listeners.focusedSelect,true);

// No user action here may write to the DB or call a publication endpoint.
assert.deepEqual(seen,files);
console.log('PASS offline Admin V11 quality panel: collapsed by default, categories, focus, rerenders, alias and no external writes');

function matchKind(kind){return Object.hasOwn(listeners.tags||{},kind);}
