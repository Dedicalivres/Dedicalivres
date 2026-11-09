import assert from 'node:assert/strict';
import {assertNewFranceArchives} from './project-targeted-publication.mjs';
import {ID as RETIRED_ID} from './retired-test-policy.mjs';

// Pure-memory negative guards. No filesystem edits, jobs, network, or publication.
const OTHER = '99999999-9999-4999-8999-999999999999';
const EXTRA = '88888888-8888-4888-8888-888888888888';
const archive = new Map([['evenements-litteraires-france-archives-1.html', '<html>fixture only</html>']]);
const oldPages = new Map();
const event = (id) => ({id, validated:true, rejected:false, country_code:'FR', title:id, start_date:'2026-11-01', end_date:'2026-11-01'});
const before = new Map([[RETIRED_ID, event(RETIRED_ID)], [OTHER,event(OTHER)]]);
const after = new Map([[OTHER,event(OTHER)]]);
const ids = new Set(before.keys());
const dateOld='2026-11-08', dateNew='2026-11-09';
const attempt = (a,b,published=ids,oldDay=dateOld,day=dateNew,retiredId=null) =>
 assertNewFranceArchives(oldPages,archive,a,b,published,oldDay,day,'<urlset></urlset>','<urlset></urlset>',retiredId);
const rejectsAtGuard = (fn,reason) => assert.throws(fn,
 /STOP projection ciblée : transition archives hors corpus publié ou date/,reason);
let checks=0;
rejectsAtGuard(()=>attempt(before,after), 'Normal projection cannot remove even one published ID');checks++;
rejectsAtGuard(()=>attempt(before,after,ids,dateOld,dateNew,OTHER),'Another ID cannot stand in for Lorient');checks++;
rejectsAtGuard(()=>attempt(before,new Map(),ids,dateOld,dateNew,RETIRED_ID),'Second ID removal is never authorized');checks++;
rejectsAtGuard(()=>attempt(before,after,new Set([OTHER]),dateOld,dateNew,RETIRED_ID),'Published baseline must stay exact');checks++;
rejectsAtGuard(()=>attempt(before,after,ids,dateOld,dateOld,RETIRED_ID),'No same-day archive growth');checks++;
const withAddition=new Map([...after,[EXTRA,event(EXTRA)]]);
rejectsAtGuard(()=>attempt(before,withAddition,ids,dateOld,dateNew,RETIRED_ID),'No new unapproved ID');checks++;

// Exact historic retirement must pass the corpus gate, but fails later because this
// intentionally minimal fixture does not contain a real archive page or time transition.
let error;try {attempt(before,after,ids,dateOld,dateNew,RETIRED_ID);} catch(e) {error=e;}
assert.ok(error instanceof Error && !error.message.includes('transition archives hors corpus publié ou date'),
 'Exact Lorient retirement passes only the initial corpus gate, not all archive checks');checks++;
console.log('PASS: '+checks+' strict historical Lorient archive-scope checks (negative + positive gate)');
