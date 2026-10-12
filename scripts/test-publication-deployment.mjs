import assert from 'node:assert/strict';
import {verifyDeployment} from './verify-publication-deployment.mjs';

const sha = '0123456789abcdef0123456789abcdef01234567';
const published = 'evenement/seclin.html';
const removed = 'evenement/pascal.html';
const seclin = {id:'11111111-1111-4111-8111-111111111111',
  event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason:'validation'};
const pascal = {id:'22222222-2222-4222-8222-222222222222',
  event_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', reason:'unpublish'};
const oldMap = {[pascal.event_id]:removed};
const currentMap = {[seclin.event_id]:published};
const assets = new Map([
  ['sitemap-evenements.xml', Buffer.from(`https://dedicalivres.fr/${published}`)],
  ['event-canonical.js', Buffer.from('canonical')],
  ['docs/territoires/event-canonical-map.json', Buffer.from('{}')],
  ['evenement/index.html', Buffer.from('index')],
  ['index.html', Buffer.from('home')],
  [published, Buffer.from('Seclin')],
]);
const response = (status, body = '') => ({ok:status === 200, status,
  json:async () => body,
  arrayBuffer:async () => Buffer.isBuffer(body) ? body : Buffer.from(body)});
function fixture({pages = 'success', publicStatus = {}, content = assets} = {}) {
  const fetcher = async url => {
    if (url.startsWith('https://api.github.com/')) return response(200, {
      workflow_runs: pages === 'success' ? [{id:123, head_sha:sha,
        workflow_id:264484297, name:'pages build and deployment',
        status:'completed', conclusion:'success'}] : [],
    });
    const relative = new URL(url).pathname.slice(1);
    const status = publicStatus[relative] ?? (relative === removed ? 404 : 200);
    return response(status, content.get(relative) || Buffer.alloc(0));
  };
  return {sha, jobs:[seclin, pascal], oldMap, currentMap,
    depublishPaths:[removed], repository:'Dedicalivres/Dedicalivres',
    token:'test-only', fetcher, readFile:file => assets.get(file)};
}

assert.deepEqual(await verifyDeployment(fixture()), {
  sha, pages_run_id:123, verified:true, job_count:2,
});
console.log('PASS Pages, sitemap, carte, Seclin, Pascal, lot multiple');

await assert.rejects(verifyDeployment(fixture({pages:'pending'})), /déploiement Pages/);
console.log('PASS déploiement retardé/non confirmé : aucun SUCCESS');
assert.equal((await verifyDeployment(fixture({pages:'success'}))).verified, true);
console.log('PASS confirmation Pages tardive avant finalisation');
await assert.rejects(verifyDeployment(fixture({publicStatus:{[published]:404}})), /fiche publique/);
console.log('PASS fiche nouvelle inaccessible');
await assert.rejects(verifyDeployment(fixture({publicStatus:{[removed]:200}})), /encore accessible/);
console.log('PASS dépublication non confirmée');
const wrong = new Map(assets);
wrong.set('sitemap-evenements.xml', Buffer.from('other'));
await assert.rejects(verifyDeployment(fixture({content:wrong})), /sitemap-evenements.xml/);
console.log('PASS sitemap public divergent');
const third = fixture();
third.jobs.push({id:'33333333-3333-4333-8333-333333333333',
  event_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc', reason:'validation'});
await assert.rejects(verifyDeployment(third), /fiche ou sitemap absent/);
console.log('PASS événement tiers sans preuve refusé');
const noOp = fixture();
noOp.jobs = [seclin];
noOp.oldMap = {[seclin.event_id]:published};
noOp.depublishPaths = [];
assert.equal((await verifyDeployment(noOp)).verified, true);
console.log('PASS lot sans diff si état public déjà vérifié');
