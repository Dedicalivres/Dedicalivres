import assert from "node:assert/strict";
import { authorPublicFeatures, isConfirmedParticipation, AUTHOR_REGISTERED_MESSAGE } from "./author-public-features.mjs";

const author = { id:"author-1", validated:true, published:true, merged_into:null, is_partner:false };
const event = { id:"event-1", validated:true, rejected:false };
const verified = { author_id:"author-1", validated:true, rejected:false, presence_verified:true, events:event };
const features = (overrides={}, presences=[]) => authorPublicFeatures({author:{...author,...overrides},presences});

assert.equal(features().tier,"registered");
assert.equal(features().profileVisible,true);
assert.equal(features().eventsVisible,false);
assert.equal(features().bibliographyVisible,false);
assert.equal(features().booksVisible,false);
assert.equal(features({is_partner:true}).partnerBadgeVisible,true);
assert.equal(features({is_partner:true}).bibliographyVisible,false,"Partner badge must not unlock BnF");
assert.equal(features({},[verified]).tier,"participant");
assert.equal(features({},[verified]).eventsVisible,true);
assert.equal(features({},[verified]).bibliographyVisible,true);
assert.equal(features({},[{...verified,presence_verified:false}]).tier,"registered");
assert.equal(features({},[{...verified,author_id:"someone-else"}]).tier,"registered");
assert.equal(features({},[{...verified,events:{...event,validated:false}}]).tier,"registered");
assert.equal(features({},[{...verified,rejected:true}]).tier,"registered");
assert.equal(features({},[{...verified,events:{...event,rejected:true}}]).tier,"registered");
assert.equal(features({published:false},[verified]).tier,"unpublished");
assert.equal(features({merged_into:"merged"},[verified]).profileVisible,false);
assert.equal(features({is_partner:"true"}).partnerBadgeVisible,false);
assert.equal(isConfirmedParticipation(verified),true);
assert.match(AUTHOR_REGISTERED_MESSAGE,/aucune participation/);
console.log("PASS author public tiers: registered, verified participant, partner and invalid links");
