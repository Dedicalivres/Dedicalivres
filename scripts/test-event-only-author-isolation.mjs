import assert from "node:assert/strict";
import {noSelectedAuthorPresence} from "./build-author-pages.mjs";

const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const job = [{id:B, event_id:A}];
const author = {author:{id:B},events:[]};

assert.equal(noSelectedAuthorPresence([author],job),true);
assert.equal(noSelectedAuthorPresence(
  [{...author,events:[{id:A}]}],job),false);
assert.equal(noSelectedAuthorPresence(
  [{...author,events:[{id:B}]}],job),true);
assert.equal(noSelectedAuthorPresence([],[]),false);
assert.equal(noSelectedAuthorPresence(
  [{...author,events:null}],job),false);

console.log("PASS isolation : aucun auteur lié, conservation autorisée");
console.log("PASS isolation : auteur lié ou preuve invalide, conservation refusée");
