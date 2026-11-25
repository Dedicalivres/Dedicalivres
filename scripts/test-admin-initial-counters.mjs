import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../admin-context.js', import.meta.url), 'utf8');
function extract(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Required source functions');
  return source.slice(a, b);
}
const community = extract('  function summarizeCommunity(', '  function ensureCommunitySummary(');
const traffic = extract('  async function loadTrafficMetrics(', '  async function loadTrafficDetails(');
const summarize = vm.runInNewContext(community + '\nsummarizeCommunity');
let tests = 0;
function check(name, fn) { fn(); console.log('PASS', name); tests++; }
const base = { avatar_url:'a', profile_type:'author', bio:'bio', published:false };
check('zero exact', () => assert.equal(summarize([],[],[]).presenceTotal,0));
check('archives and merges', () => {
  const r = summarize([{archived_at:'yes'},{validated:false}],[{merged_into:'x'},{id:'a'}],[{archived_at:'yes'},{validated:false}]);
  assert.deepEqual([r.presenceTotal,r.authorsTotal,r.testimonialsTotal],[1,1,1]);
});
check('nullable flags retain distinct semantics', () => {
  const r = summarize([{validated:null,rejected:null},{validated:false,rejected:null},{validated:true,rejected:false},{validated:true,rejected:true}],[],[{validated:null},{validated:true}]);
  assert.deepEqual([r.presencePending,r.actionPresencePending,r.presenceValidated,r.presenceRejected,r.pendingTestimonials],[1,2,1,1,1]);
});
check('editorial matching by id, slug, accented name', () => {
  const a = [{...base,id:'1',pseudo:'One'},{...base,id:'2',slug:'two',pseudo:'Two'},{...base,id:'3',pseudo:'Élodie'}];
  const p = [{validated:true,event_id:'e',author_id:'1'},{validated:true,event_id:'e',author_identity_key:'two'},{validated:true,events:{id:'e'},pseudo:' elodie '}];
  assert.equal(summarize(p,a,[]).editorialAuthors,0);
});
check('only 80 percent, not published or rejected history', () => {
  const a = [{...base,id:'1',pseudo:'One'},{...base,id:'2',pseudo:'Two',published:true},{...base,id:'3',pseudo:'Three',bio:' '}];
  const p = [{validated:true,rejected:true,event_id:'e',author_id:'1'},{validated:true,event_id:'e',author_id:'3',archived_at:'yes'}];
  const r = summarize(p,a,[]); assert.deepEqual([r.editorialAuthors,r.almostAuthors],[2,1]);
});
function setup(counts) {
  let calls=0, resolve=[];
  const ctx = {
    authEpoch:1, moduleSequences:{trafficSummary:0}, trafficSummaryTask:null, trafficSummaryReadyEpoch:null,
    state:{metrics:{visitsTotal:null}},
    notify(){}, snapshot(){return ctx.state}, handleReadFailure(){},
    canCommit(t){return typeof t==='number'?t===ctx.authEpoch:t.epoch===ctx.authEpoch&&t.sequence===ctx.moduleSequences.trafficSummary},
    checked(q){return q.result},
    getClient(){return {from(table){
      assert.equal(table,'site_visits');
      return {select(cols,opt){
        assert.equal(cols,'id'); assert.equal(opt.head,true); assert.equal(opt.count,'exact');
        const i=calls++; return {result:new Promise(r=>resolve.push(()=>r({count:counts[i%4]}))),gte(){return this}};
      }};
    }}}
  };
  vm.createContext(ctx); vm.runInContext(traffic+'\nthis.ensure = ensureTrafficSummary;',ctx);
  return {ctx,call:()=>calls,flush:()=>{for(const r of resolve.splice(0))r();}};
}
async function asyncCheck(name,fn){await fn();console.log('PASS',name);tests++;}
await asyncCheck('dedup and cache: four HEAD requests only',async()=>{
  const m=setup([100,0,12,30]); const p=m.ctx.ensure();assert.equal(p,m.ctx.ensure());
  await Promise.resolve();assert.equal(m.call(),4);m.flush();await p;
  assert.equal(m.ctx.state.metrics.visitsToday,0);await m.ctx.ensure();assert.equal(m.call(),4);
});
await asyncCheck('unknown count is not zero',async()=>{
  const m=setup([100,null,12,30]);const p=m.ctx.ensure();await Promise.resolve();m.flush();
  await assert.rejects(p,/incomplets/);assert.equal(m.ctx.state.metrics.visitsTotal,null);
});
await asyncCheck('late response does not commit after session change',async()=>{
  const m=setup([100,1,12,30]);const p=m.ctx.ensure();await Promise.resolve();m.ctx.authEpoch++;
  m.flush();await p;assert.equal(m.ctx.state.metrics.visitsTotal,null);
});
await asyncCheck('forced refresh counts exactly once',async()=>{
  const m=setup([100,1,12,30]);let p=m.ctx.ensure();await Promise.resolve();m.flush();await p;
  p=m.ctx.ensure(true);await Promise.resolve();m.flush();await p;assert.equal(m.call(),8);
});
console.log('TOTAL',tests);
