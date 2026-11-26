import test from "node:test";
import assert from "node:assert/strict";
import {prepareBnfReviewDraft as prepare} from "./author-bnf-admin-review-draft.mjs";
const noticeId="ark:/12148/cb123456789", title="Ouvrage fictif";
const candidate={bnf_arks:[noticeId],titles:[title],status:"human_review_required"};
const input={authorId:"fixture", candidates:[candidate], selections:[{noticeId,title}],
 action:"approve", authorityId:"ark:/12148/cb987654321", evidence:"Preuve fictive",
 authorityConfirmed:true, roleConfirmed:true};
test("approval intent is only a draft, never a published decision",()=>{
 const r=prepare(input);
 assert.equal(r.ok,true); assert.equal(r.status,"draft_only"); assert.equal(r.publicationAllowed,false);
 assert.equal(r.decision,undefined); assert.equal(r.reviewerId,undefined);
});
test("missing identity, role or evidence fail closed",()=>{
 for(const change of [{authorityConfirmed:false},{roleConfirmed:false},{authorityId:"invalid"},{evidence:""},{authorId:""},{action:"publish"}])
  assert.equal(prepare({...input,...change}).ok,false);
});
test("selection must be exact, unique and candidate-only",()=>{
 for(const change of [{selections:[]},{selections:[...input.selections,...input.selections]},
 {selections:[{noticeId,title:"wrong"}]},{candidates:[candidate,candidate]},
 {candidates:[{...candidate,bnf_arks:[noticeId,"ark:/12148/cb111111111"]}]},
 {candidates:[{...candidate,status:"approved"}]}])
  assert.equal(prepare({...input,...change}).ok,false);
});
test("rejection and requests for evidence do not require identity confirmation",()=>{
 for(const action of ["reject","request_information"]){
  const r=prepare({...input,action,authorityId:null,authorityConfirmed:false,roleConfirmed:false});
  assert.equal(r.ok,true); assert.equal(r.authorityId,null); assert.equal(r.publicationAllowed,false);
 }
});
test("batch validation is all-or-nothing",()=>{
 const second={noticeId:"ark:/12148/cb123456788",title:"Autre ouvrage"};
 const batch={...input,selections:[...input.selections,second],candidates:[candidate,{...candidate,bnf_arks:[second.noticeId],titles:[second.title]}]};
 assert.equal(prepare(batch).items.length,2);
 assert.equal(prepare({...batch,candidates:[candidate]}).ok,false);
});
