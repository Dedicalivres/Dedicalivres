import test from "node:test";
import assert from "node:assert/strict";
import {reviewedBooks,renderReviewedGallery} from "./author-bnf-reviewed-gallery.mjs";
const author={id:"fixture-author",validated:true,published:true,merged_into:null};
const presence={author_id:author.id,validated:true,rejected:false,presence_verified:true,events:{id:"fixture-event",validated:true,rejected:false}};
const id="ark:/12148/cb123456789";
const candidate={bnf_arks:[id],titles:["<Roman fictif>"],status:"human_review_required"};
const review={authorId:author.id,noticeId:id,authorityId:"ark:/12148/cb987654321",title:candidate.titles[0],decision:"approved",reviewerId:"fixture-reviewer",evidence:"fixture only",checkedAt:"2026-11-25T00:00:00Z",publisher:"Éditeur fictif",year:"2026"};
const input={author,presences:[presence],candidates:[candidate],reviews:[review]};
test("registered author or missing verification remains locked",()=>{
 for(const presences of [[],[{...presence,presence_verified:false}],[{...presence,author_id:"other"}]]) assert.equal(renderReviewedGallery({...input,presences}),"");
});
test("no automatic publication, rejected or contradictory decisions",()=>{
 for(const reviews of [[],[{...review,decision:"rejected"}],[review,{...review,decision:"rejected"}],[{...review,reviewerId:""}],[{...review,authorId:"other"}],[{...review,authorityId:"invalid"}]]) assert.deepEqual(reviewedBooks({...input,reviews}),[]);
});
test("untrusted or ambiguous notices are excluded",()=>{
 for(const candidates of [[{...candidate,bnf_arks:["javascript:alert(1)"]}],[{...candidate,bnf_arks:[id,"ark:/12148/cb111111111"]}],[{...candidate,titles:["Other title"]}]]) assert.deepEqual(reviewedBooks({...input,candidates}),[]);
});
test("render escapes title, omits private evidence and covers, deduplicates",()=>{
 const html=renderReviewedGallery({...input,candidates:[candidate,candidate]});
 assert.match(html,/&lt;Roman fictif&gt;/); assert.doesNotMatch(html,/<Roman fictif>|fixture-reviewer|fixture only|<img/);
 assert.equal(reviewedBooks({...input,candidates:[candidate,candidate]})[0].editions.length,1);
 assert.match(html,/https:\/\/catalogue\.bnf\.fr\/ark:\/12148\/cb123456789/);
});
test("editions group only with explicit reviewed work key",()=>{
 const id2="ark:/12148/cb123456788", c2={...candidate,bnf_arks:[id2]},r2={...review,noticeId:id2};
 assert.equal(reviewedBooks({...input,candidates:[candidate,c2],reviews:[review,r2]}).length,2);
 assert.equal(reviewedBooks({...input,candidates:[candidate,c2],reviews:[{...review,workKey:"fixture-work"},{...r2,workKey:"fixture-work"}]})[0].editions.length,2);
});

import fs from "node:fs";
import {renderAuthorStaticPage} from "./author-static-page.mjs";
test("static author renderer: optional reviewed gallery preserves SEO, events and scripts",()=>{
 const baseHtml=fs.readFileSync("author.html","utf8");
 const profile={...author,pseudo:"Auteur fictif",slug:"fixture-auteur",bio:"Biographie de test"};
 const args={baseHtml,author:profile,events:[{id:"fixture-event",title:"Rencontre fictive",start_date:"2026-12-01",validated:true,rejected:false}],generatedAt:"2026-11-26"};
 const baseline=renderAuthorStaticPage(args);
 const active=renderAuthorStaticPage({...args,bibliography:input});
 assert.match(active.html,/<section class="section author-bnf" aria-labelledby="bnf-heading">/);
 assert.match(active.html,/&lt;Roman fictif&gt;/);
 assert.match(active.html,/id="author-bnf-style"/);
 assert.match(active.html,/scroll-snap-type:x proximity/);
 assert.doesNotMatch(active.html,/fixture-reviewer|fixture only/);
 assert.equal(active.canonical,baseline.canonical);
 assert.equal(active.title,baseline.title);
 assert.deepEqual(active.person,baseline.person);
 assert.deepEqual(active.groups,baseline.groups);
 assert.deepEqual([...active.html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]),[...baseline.html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]));
 assert.match(active.html,/data-event-id="fixture-event"/);
 assert.equal((active.html.match(/<h1\b/g)||[]).length,1);
 for(const bibliography of [{...input,reviews:[]},{...input,presences:[]},{...input,reviews:[{...review,authorId:"other"}]},{...input,author:{...profile,id:"other"},presences:[{...presence,author_id:"other"}]}]){
   assert.equal(renderAuthorStaticPage({...args,bibliography}).html,baseline.html);
 }
 assert.doesNotMatch(baseline.html,/bnf-heading|author-bnf-style/);
 const special="Titre $& <script>alert(1)</script>";
 const safe=renderAuthorStaticPage({...args,bibliography:{...input,candidates:[{...candidate,titles:[special]}],reviews:[{...review,title:special}]}});
 assert.ok(safe.html.includes("Titre $&amp; &lt;script&gt;alert(1)&lt;/script&gt;"));
 assert.doesNotMatch(safe.html,/<script>alert\(1\)<\/script>/);
});
