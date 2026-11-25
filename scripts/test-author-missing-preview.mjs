import fs from "node:fs";import assert from "node:assert/strict";import test from "node:test";
import {preparePreview} from "./prepare-author-missing-preview.mjs";
const old=fs.readFileSync("auteurs/index.html","utf8");
const slugs=[...old.matchAll(/href="https:\/\/dedicalivres\.fr\/auteurs\/([a-z0-9-]+)\/"/g)].map(m=>m[1]);
const added=["alexandre-schoedler","delphine-seguela","dominique-jallon","gabriella-goccia","murielle-dilhuit-ouahi","nicole-dufosse","nora-edis"];
const catalog=[...slugs,...added].map(slug=>({author:{pseudo:slug,slug,validated:true,published:true},events:[]}));
test("exact scope and existing index cards unchanged",()=>{
 const {files,manifest}=preparePreview({catalog,now:new Date("2026-11-24T12:00:00Z")});
 assert.equal(files.size,9);assert.equal(manifest.profiles.length,7);
 for(const m of old.matchAll(/<article class="event-card author-index-card">[\s\S]*?<\/article>/g))assert.ok(files.get("auteurs/index.html").includes(m[0]));
 for(const slug of added){const html=files.get("auteurs/"+slug+"/index.html");assert.ok(html.includes("https://dedicalivres.fr/auteurs/"+slug+"/"));assert.ok(html.includes("author-presences-live.js"));}
 const original=fs.readFileSync("sitemap-seo-auteurs.xml","utf8");
 for(const line of original.split("\n"))if(line.includes("<url>"))assert.ok(files.get("sitemap-seo-auteurs.xml").includes(line));
});
test("unexpected catalog change stops preview",()=>{assert.throws(()=>preparePreview({catalog:catalog.slice(1)}));assert.throws(()=>preparePreview({catalog:[...catalog,catalog[0]]}));});

function audit26(files){
 const index=files.get("auteurs/index.html"), sitemap=files.get("sitemap-seo-auteurs.xml");
 const links=[...index.matchAll(/href="https:\/\/dedicalivres\.fr\/auteurs\/([a-z0-9-]+)\/"/g)].map(m=>m[1]);
 const xml=[...sitemap.matchAll(/<loc>https:\/\/dedicalivres\.fr\/auteurs\/([a-z0-9-]+)\/<\/loc>/g)].map(m=>m[1]);
 assert.equal(links.length,26);assert.equal(new Set(links).size,26);assert.deepEqual([...links].sort(),[...xml].sort());
 for(const slug of links){
  const file="auteurs/"+slug+"/index.html",html=files.get(file)??fs.readFileSync(file,"utf8");
  assert.ok(html.includes('rel="canonical" href="https://dedicalivres.fr/auteurs/'+slug+'/"'),slug+" canonical");
  assert.ok(html.includes('data-author-slug="'+slug+'"'),slug+" identity");
  assert.match(html,/<script defer src="\/config\.js[^"]*"><\/script>\s*<script defer src="\/event-canonical\.js[^"]*"><\/script>\s*<script defer src="\/author-presences-live\.js[^"]*"><\/script>/);
  assert.ok(html.includes("leaflet.css"),slug+" map CSS");
  for(const group of ["ongoing","upcoming","past"])assert.ok(html.includes('id="author-events-'+group+'"'),slug+" "+group);
  const events=[...html.matchAll(/data-event-id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(events).size,events.length,slug+" duplicate event cards");
  assert.doesNotMatch(html,/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i);
 }
}
test("all 26 pages: canonical, identity, scripts, Leaflet CSS, unique presence cards and index/sitemap parity",()=>audit26(preparePreview({catalog,now:new Date("2026-11-25T12:00:00Z")}).files));
test("audit actual public-catalog preview and reconcile event counts",{skip:!fs.existsSync(".author-preview/manifest.json")},()=>{
 const manifest=JSON.parse(fs.readFileSync(".author-preview/manifest.json","utf8"));
 assert.equal(manifest.mode,"PREVIEW_ONLY");assert.equal(manifest.existingProfilesPreserved,19);assert.equal(manifest.files.length,9);assert.equal(manifest.profiles.length,7);
 const files=new Map(manifest.files.map(name=>[name,fs.readFileSync(".author-preview/"+name,"utf8")]));audit26(files);
 for(const p of manifest.profiles){const html=files.get("auteurs/"+p.slug+"/index.html");assert.equal([...html.matchAll(/data-event-id="([^"]+)"/g)].length,p.ongoing+p.upcoming+p.past,p.slug+" event count");}
});
