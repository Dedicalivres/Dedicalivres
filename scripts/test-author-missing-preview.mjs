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
