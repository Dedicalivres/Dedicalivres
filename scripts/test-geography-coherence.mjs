import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {qualify,territoryFor} from './territorial-catalog.mjs';

const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync('geography.js','utf8'),sandbox);
const geo=sandbox.window.DEDICALIVRES_GEO;
assert.ok(geo);

for(const code of ['FR','BE','CH','LU','MC','DE'])assert.equal(geo.normalizeCountryCode(code),code);
assert.equal(geo.getCountryName('BE'),'Belgique');
assert.equal(geo.getCountryName('CH'),'Suisse');
assert.equal(geo.getCountryName('LU'),'Luxembourg');
assert.equal(geo.getCountryName('MC'),'Monaco');

const registry=JSON.parse(fs.readFileSync('docs/territoires/referentiel.json','utf8'));
const fixtures=[
 ['Toulon','FR','Provence-Alpes-Côte d’Azur'],
 ['Rennes','FR','Bretagne'],
 ['Toulouse','FR','Occitanie'],
 ['Lyon','FR','Auvergne-Rhône-Alpes'],
 ['Mons','BE','Wallonie'],
 ['Morges','CH','Vaud'],
 ['Contern','LU','Luxembourg'],
 ['Monaco','MC','Monaco']
].map(([city,country_code,region],index)=>({id:String(index),title:'Test',city,country_code,region,start_date:'2026-10-01',validated:true,rejected:false}));
for(const event of fixtures)assert.ok(territoryFor(event,registry),`${event.city} doit conserver ${event.country_code}/${event.region}`);
const outside={id:'outside',title:'Test',city:'Berlin',country_code:'DE',region:'Berlin',start_date:'2026-10-01',validated:true,rejected:false};
assert.equal(qualify([...fixtures,outside],registry,[],'2026-09-30').accepted.at(-1).country_code,'DE');

const app=fs.readFileSync('app.js','utf8');
assert.match(app,/region: commune\.region\?\.nom \|\| ""/);
assert.match(app,/const region = String\(context\)[\s\S]*?\.at\(-1\) \|\| ""/);
assert.ok((app.match(/countryCode: "FR"/g)||[]).length>=2);
for(const page of ['index.html','soumettre.html'])assert.ok(fs.readFileSync(page,'utf8').includes('app.js?v=geography-coherence-1'));

const migration=fs.readFileSync('supabase/migrations/20260930191228_correct_event_geography.sql','utf8');
for(const expected of ['Centre-Val de Loire','Bourgogne-Franche-Comté','Grand Est','Bruxelles-Capitale','Valais','Fribourg','Luxembourg'])assert.ok(migration.includes(expected));
for(const id of ['18a26cb3-ee56-47b5-9519-ef530ce3faf6','5ec59d7a-5ee8-4fe6-a4a3-bb99330877a9','6c2b8a95-1d9a-477e-af6c-5d445a379f80','a1bb4d6e-81a0-4619-a037-5a7962d81146','c1e5f65f-1902-4d8f-967d-373218c4b7fa','1fb9347c-7fb1-4734-8cea-a37c178a1dbe','a9e84fea-5b7d-4f0f-8f80-ef1b98db8f27','f55bec3f-3ae5-4488-83a4-cfe50e3448a5','c55d3cad-5be3-48d5-a6ae-39e038ca6fef','e45c488f-0aff-42f7-9de5-e0a2c62b4b8d','e98a8bf5-4a70-452d-bfa4-0d905e7ca530','4821acd4-caad-4e61-9d2e-730887e6a60e'])assert.ok(migration.includes(id));
assert.doesNotMatch(migration,/\b(delete|drop|truncate|alter)\b/i);
assert.doesNotMatch(migration,/image_url|storage\.objects|auto-matte/i);

console.log('GEOGRAPHY_COHERENCE_OK');
