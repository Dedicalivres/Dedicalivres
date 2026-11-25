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
