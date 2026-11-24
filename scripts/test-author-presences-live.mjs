import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import fs from "node:fs";
import {renderAuthorStaticPage} from "./author-static-page.mjs";
const require=createRequire(import.meta.url);
const {classify,load,dayParis}=require("../author-presences-live.js");
const make=(n,start,end,overrides={})=>({validated:true,rejected:false,archived_at:null,events:{id:"00000000-0000-0000-0000-"+String(n).padStart(12,"0"),start_date:start,end_date:end,validated:true,rejected:false},...overrides});
test("classifies and deduplicates, excludes rejected/archived/unvalidated",()=>{
 const future=make(1,"2027-01-01","2027-01-02"),past=make(2,"2026-11-01","2026-11-01"),ongoing=make(3,"2026-11-24","2026-11-25");
 const result=classify([future,future,past,ongoing,make(4,"2027-02-01",null,{validated:false}),make(5,"2027-02-01",null,{archived_at:"2026-11-01"}),make(6,"2027-02-01",null,{rejected:true}),{...future,events:{...future.events,id:make(7).events.id,validated:false}}],"2026-11-24");
 assert.deepEqual(result,{ongoing:[ongoing.events],upcoming:[future.events],past:[past.events]});
});
test("Paris midnight",()=>assert.equal(dayParis(new Date("2026-11-24T23:30:00Z")),"2026-11-25"));
const cfg={supabaseUrl:"https://example.test",supabaseAnonKey:"public-test"};
test("anonymous public filters and pagination",async()=>{
 const calls=[];const rows=Array.from({length:100},(_,i)=>make(i+1,"2027-01-01",null));
 const data=[[{id:make(1).events.id}],rows,[make(101,"2027-01-01",null)]];
 const actual=await load("katell-poquet",cfg,async(url,options)=>{calls.push([new URL(url),options]);return {ok:true,json:async()=>data.shift()};});
 assert.equal(actual.length,101);assert.equal(calls[0][0].searchParams.has("publication_ready"),false);assert.equal(calls[0][0].searchParams.has("editorial_status"),false);assert.equal(calls[0][0].searchParams.get("published"),"eq.true");assert.equal(calls[1][0].searchParams.has("archived_at"),false);assert.ok(!calls[1][0].searchParams.get("select").includes("archived_at"));assert.equal(calls[2][0].searchParams.get("offset"),"100");assert.equal(calls[1][1].credentials,"omit");assert.equal(calls[1][1].cache,"no-store");
});
test("missing author and failed fetch are distinguished",async()=>{
 assert.equal(await load("katell-poquet",cfg,async()=>({ok:true,json:async()=>[]})),null);
 await assert.rejects(load("katell-poquet",cfg,async()=>({ok:false,status:503})));
});
function assertScripts(html,slug){
 assert.ok(html.includes('rel="canonical" href="https://dedicalivres.fr/auteurs/'+slug+'/"'));
 assert.match(html,/<script defer src="\/config\.js[^"]*"><\/script>\s*<script defer src="\/event-canonical\.js[^"]*"><\/script>\s*<script defer src="\/author-presences-live\.js[^"]*"><\/script>/);
}
test("all indexed author pages have ordered deferred scripts and canonical preserved",()=>{
 const index=fs.readFileSync("auteurs/index.html","utf8");
 const slugs=[...index.matchAll(/href="https:\/\/dedicalivres\.fr\/auteurs\/([a-z0-9-]+)\/"/g)].map(m=>m[1]);
 assert.ok(slugs.length>0);
 for(const slug of slugs)assertScripts(fs.readFileSync("auteurs/"+slug+"/index.html","utf8"),slug);
});
test("future generated author pages retain live scripts",()=>{
 const baseHtml=fs.readFileSync("author.html","utf8");
 const {html}=renderAuthorStaticPage({baseHtml,author:{pseudo:"Test",slug:"test"},events:[],generatedAt:"2026-11-24"});
 assertScripts(html,"test");
});
