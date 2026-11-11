import assert from 'node:assert/strict';
import fs from 'node:fs';
import {territoryFor,qualify} from './territorial-catalog.mjs';
import {analyzeQuality,observationStillCurrent} from './territorial-quality.mjs';

const registry=JSON.parse(fs.readFileSync('docs/territoires/referentiel.json','utf8'));
const observations=JSON.parse(fs.readFileSync('docs/territoires/signalements.json','utf8'));
const today='2026-11-11';
const base={
 id:'fixture-paca',title:'Salon du livre',city:'Toulon',country_code:'FR',
 region:"Provence-Alpes-Côte d'Azur",start_date:'2026-11-20',end_date:'2026-11-22',
 validated:true,rejected:false
};

// Apostrophe ASCII and Unicode are typographic aliases, never a country inference.
assert.equal(territoryFor(base,registry)?.label,'Provence-Alpes-Côte d’Azur');
assert.equal(territoryFor({...base,region:'Provence-Alpes-Côte d’Azur'},registry)?.id,
 territoryFor(base,registry)?.id);
assert.equal(territoryFor({...base,country_code:'CH'},registry),null);
assert.equal(territoryFor({...base,region:null},registry),null);
assert.equal(territoryFor({...base,region:'Bretagne'},registry)?.label,'Bretagne');
assert.equal(analyzeQuality([base],registry,[],today).filter(x=>x.kind==='geography').length,0);
assert.equal(analyzeQuality([{...base,region:'Région inconnue'}],registry,[],today).filter(x=>x.kind==='geography').length,1);
assert.equal(qualify([base],registry,[],today).accepted.length,1);

// A 2026-09 documentary warning mentioning Puilboreau may not target a later
// Rochefort-en-Terre record that has already been corrected independently.
const historical=observations.find(x=>x.id==='a1c0b6c6-5db0-4ca2-a37d-5f6397a55fa6');
assert(historical && historical.kind==='geography');
const old={id:historical.id,...historical.observed,validated:true,rejected:false};
assert.equal(observationStillCurrent(old,historical),true);
assert(analyzeQuality([old],registry,observations,today).some(x=>x.id===old.id&&x.kind==='geography'&&x.origin==='documentary'));
assert(analyzeQuality([{...base,region:'Région inconnue'}],registry,[],today).some(x=>x.kind==='geography'&&x.origin==='automatic'));
const changed={...old,city:'Rochefort-en-Terre'};
assert.equal(observationStillCurrent(changed,historical),false);
assert(!analyzeQuality([changed],registry,observations,today).some(x=>x.id===old.id&&x.kind==='geography'));
// The source finding remains in the historical JSON for independent audit.
assert(observations.some(x=>x.id===historical.id));
const mons=observations.find(x=>x.id==='0627ab62-44b8-4e12-baa7-c29b158ed664');
assert(mons);
const wrong={id:mons.id,...mons.observed,validated:true,rejected:false};
assert(observationStillCurrent(wrong,mons));
assert(analyzeQuality([wrong],registry,observations,today).some(x=>x.kind==='dates'));
const corrected={...wrong,start_date:'2026-09-26'};
assert(!observationStillCurrent(corrected,mons));
assert(!analyzeQuality([corrected],registry,observations,today).some(x=>x.kind==='dates'));
assert(analyzeQuality([{...base,start_date:'2026-02-30'}],registry,[],today).some(x=>x.kind==='dates'));

// The review is a disclosure control, never an event write or publication engine.
const ui=fs.readFileSync('admin-territorial-quality.js','utf8');
const html=fs.readFileSync('admin-v11.html','utf8');
const css=fs.readFileSync('admin-v11.css','utf8');
assert.match(ui,/panelExpanded=false/);
assert.match(ui,/v11-territorial-details/);
assert.match(ui,/previous\.open/);
assert.match(ui,/data-quality-kind/);
assert.match(ui,/aria-pressed/);
assert.match(ui,/Validée en base/);
assert.doesNotMatch(ui,/plafonné à 1 000 annonces/);
assert.match(html,/admin-territorial-quality\.js\?v=quality-collapsible-01/);
assert.match(html,/admin-v11\.css\?v=quality-collapsible-01/);
assert.match(css,/\.v11-quality-summary/);
assert.match(css,/summary:focus-visible/);
assert(!ui.includes('.update(') && !ui.includes('.insert(') && !ui.includes('.delete('));
console.log('PASS DD-ADMIN-QUAL-01 : territoires, archives obsolètes, repli UX et absence de mutation');
