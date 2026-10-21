// Shared browser/build contract. The only releasable identity is the Lorient test.
export const LORIENT_TEST_ID='eb6672b2-900f-4c6a-9021-ea84c5036769';
export const LORIENT_TEST_PATH='evenement/salon-du-livre-jeunesse-du-pays-de-lorient-lorient-3441.html';
export function retirementIds(policy){
 const row=policy?.entries?.[0];
 if(policy?.version!==1||policy.entries.length!==1||row.event_id!==LORIENT_TEST_ID||row.canonical!==LORIENT_TEST_PATH
   ||row.reason!=='private-test-not-an-event'||row.decision!=='SITE-LORIENT-TEST-DEPUBLISH-02'
   ||row.historical_job!=='80a4506a-357e-4df0-a5ac-5fe4ce27535f')throw Error('STOP registre de retrait ambigu');
 if(row.status==='released'){
  if(!row.release||!/^\d{4}-\d{2}-\d{2}T/.test(row.release.approved_at||'')
    ||!Number.isFinite(Date.parse(row.release.approved_at))||typeof row.release.decision!=='string'||row.release.decision.length<8
    ||typeof row.release.reason!=='string'||!row.release.reason.trim())throw Error('STOP levée de retrait non documentée');
  return new Set();
 }
 if(row.status!=='excluded'||row.release!==null)throw Error('STOP statut de retrait invalide');
 return new Set([row.event_id]);
}
let pending;
export function loadRetirementIds(request=fetch){
 if(!pending)pending=request(new URL('./event-retirements.json',import.meta.url),{cache:'no-store'})
  .then(r=>{if(!r.ok)throw Error('Registre de retrait indisponible');return r.json();}).then(retirementIds)
  .catch(e=>{pending=undefined;throw e;});
 return pending.then(ids=>new Set(ids));
}
