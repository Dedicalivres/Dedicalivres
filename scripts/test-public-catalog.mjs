import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('  async function fetchPublicCatalog('), app.indexOf('  async function loadEvents('));
const dataset = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
let mode = 'normal'; let calls = 0;
const filters = [];
const supabaseClient = { from(table) {
  assert.equal(table, 'events'); let cursor = 0;
  const query = {
    select() { return query; }, eq(k,v) { filters.push([k,v]); return query; }, order(k) { assert.equal(k, 'id'); return query; }, limit() { return query; }, gt(k,v) { assert.equal(k, 'id'); cursor = v; return query; },
    then(resolve) {
      calls++;
      if (mode === 'error' && cursor) return Promise.resolve(resolve({ data: null, error: { message: 'offline' } }));
      const data = mode === 'repeat' ? dataset.slice(0,2) : dataset.filter(e => e.id > cursor).slice(0,2);
      return Promise.resolve(resolve({ data, error: null }));
    }
  }; return query;
} };
const context = vm.createContext({ supabaseClient });
vm.runInContext(source + '; globalThis.load = fetchPublicCatalog;', context);
let result = await context.load('id');
assert.equal(result.data.length, 7, 'fetch past a server cap lower than requested page size');
assert.equal(calls, 5);
assert.ok(filters.some(([k,v]) => k === 'validated' && v === true));
assert.ok(filters.some(([k,v]) => k === 'rejected' && v === false));
mode = 'error'; result = await context.load('id');
assert.equal(result.data, null, 'never publish a partial catalog');
assert.equal(result.error.message, 'offline');
mode = 'repeat'; result = await context.load('id');
assert.equal(result.data, null, 'detect broken pagination');
console.log('PASS public catalog: complete pagination, visibility filters, partial failure, repeated page');
