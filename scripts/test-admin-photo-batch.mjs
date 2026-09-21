import assert from 'node:assert/strict';
import '../admin-photo-batch.js';
const api = globalThis.DEDICALIVRES_PHOTO_BATCH;
assert.equal(api.day(new Date('2026-09-21T22:30:00Z')), '2026-09-22');
assert.equal(api.plusDays('2026-10-20', 15), '2026-11-04');
assert.equal(api.plusDays('2026-12-25', 15), '2027-01-09');
assert.equal(api.validRange('2026-02-30', '2026-03-02'), false);
assert.equal(api.validRange('2026-10-06', '2026-09-21'), false);
assert.equal(api.validRange('2026-09-21', '2026-10-06'), true);
const records = Array.from({length: 405}, (_, id) => ({id, title: 'Même titre', start_date: id === 404 ? '2026-10-06' : '2026-09-21', image_url: 'event-images/test.png'}));
records.push({id: 500, start_date:'2026-10-07'}, {id: 501, start_date:'2026-09-20'});
let calls = 0;
const client = { from(table) { assert.equal(table,'events'); let from, to; return {
 select(){return this;}, gte(key,v){assert.equal(key,'start_date');from=v;return this;}, lte(key,v){to=v;return this;}, order(){return this;},
 async range(offset,end){ calls++; const filtered = records.filter(e=>e.start_date>=from && e.start_date<=to); return {data:filtered.slice(offset,Math.min(end+1,offset+80)),count:filtered.length}; }
}; }};
const loaded = await api.loadEvents(client,'2026-09-21','2026-10-06');
assert.equal(loaded.length,405); assert.equal(calls,6); assert.equal(loaded.at(-1).start_date,'2026-10-06');
assert.deepEqual(await api.loadEvents(client,'2027-01-01','2027-01-02'),[]);
await assert.rejects(api.loadEvents(client,'2026-10-06','2026-09-21'));
const image = new Uint8Array([137,80,78,71]);
const files = new Map(); const zip = {file:(name,data)=>files.set(name,data)};
let count = 0;
const fetcher = async () => { count++; if(count === 2) throw new Error('CORS'); return new Response(image,{headers:{'Content-Type':'image/png'}}); };
const result = await api.collect([loaded[0],loaded[1],loaded[0],{...loaded[2],image_url:''}],fetcher,zip,()=>{});
assert.equal(result.saved,2);assert.equal(result.failures.length,2);assert.equal(files.size,2);
for(const data of files.values()) assert.deepEqual(new Uint8Array(data),image);
assert.equal(api.imageUrl('javascript:alert(1)'), '');
assert.match(api.imageUrl('event-images/test.png'),/\/media\/event-images\/test.png$/);
await assert.rejects(api.collect([loaded[0]],fetcher,zip,()=>{},()=>false),/Session expirée/);
const nonImage = await api.collect([loaded[0]],async()=>new Response('oops',{headers:{'Content-Type':'text/html'}}),zip,()=>{});
assert.equal(nonImage.saved,0);
console.log('PASS: dates Paris/DST, J/J+15, pagination under server cap, empty/invalid periods, original bytes, duplicate names, missing/CORS/non-image errors and expired session.');
