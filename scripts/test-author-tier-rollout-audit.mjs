import assert from "node:assert/strict";
import { auditAuthorTierRollout } from "./author-tier-rollout-audit.mjs";
const sample = [
  {slug:"already-verified",published:true,approved_links:3,verified_links:1},
  {slug:"legacy-approved",published:true,approved_links:12,verified_links:0},
  {slug:"registered",published:true,approved_links:0,verified_links:0}
];
const result = auditAuthorTierRollout(sample);
assert.equal(result.total,3);
assert.equal(result.published,3);
assert.deepEqual(result.verifiedParticipants,["already-verified"]);
assert.deepEqual(result.approvedButUnverified,[{slug:"legacy-approved",approved:12}]);
assert.deepEqual(result.registered,["registered"]);
assert.equal(result.safeToEnableStrictTiering,false);
assert.equal(auditAuthorTierRollout([sample[0],sample[2]]).safeToEnableStrictTiering,true);
assert.equal(auditAuthorTierRollout([{slug:"broken",approved_links:0,verified_links:1}]).safeToEnableStrictTiering,false);
console.log("PASS author rollout audit blocks legacy downgrade");
