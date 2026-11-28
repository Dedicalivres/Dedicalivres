import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const script = fs.readFileSync(new URL('authors-presence.js', root), 'utf8');
const normalizer = fs.readFileSync(new URL('url-normalizer.js', root), 'utf8');
const html = fs.readFileSync(new URL('event.html', root), 'utf8');
assert.match(html, /authors-presence\.js\?v=public-presence-fix-20261128/);
for (const name of ['author_profile_url', 'book_or_publisher_url', 'organization_website']) {
  assert.ok(script.includes('name="' + name + '" type="text" inputmode="url"'));
}
class FakeFile {
  constructor(type, size) { this.type = type; this.size = size; }
}
const values = {};
const writes = [];
const feedback = {};
const button = {disabled: false};
let submit, options, responseError = null, resets = 0;
const form = {
  querySelector(sel) { return sel === 'button[type="submit"]' ? button : null; },
  querySelectorAll() { return []; },
  addEventListener(type, cb) { if (type === 'submit') submit = cb; },
  reset() { resets++; }
};
const document = {
  getElementById(id) {
    return ({
      'event-detail': {dataset: {}}, 'author-presence-anchor-style': {},
      'authors-presence-section': {}, 'author-presence-form': form,
      'author-presence-feedback': feedback
    })[id] || null;
  },
  addEventListener() {}
};
const client = { from(table) {
  if (table === 'events') return {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return {data: {id:'event-fixture', validated: true, rejected: false}, error: null}; }
  };
  assert.equal(table, 'event_authors_presence');
  return {async insert(rows) { writes.push(JSON.parse(JSON.stringify(rows[0]))); return {error: responseError}; }};
}};
const shared = { from() { throw new Error('Public script must not touch the ADMIN client'); } };
const window = {
  DEDICALIVRES_CONFIG: {supabaseUrl:'https://example.test', supabaseAnonKey:'public-key'},
  DEDICALIVRES_SUPABASE_CLIENT: shared,
  getDedicalivresSupabaseClient() { throw new Error('Shared client reused'); },
  supabase: { createClient(url, key, opts) { options = JSON.parse(JSON.stringify(opts)); return client; }},
  location: {search:'?id=event-fixture', hash:''}, document
};
const context = vm.createContext({window, document, URL, URLSearchParams, File: FakeFile,
  FormData: class {get(key) {return values[key] ?? null;}},
  console: {error(){},warn(){}}, setTimeout});
vm.runInContext(normalizer, context);
vm.runInContext(script, context);
await new Promise(resolve => setImmediate(resolve));
assert.equal(typeof submit, 'function');
assert.deepEqual(options.auth, {storageKey:'dedicalivres-public-presence-anonymous-v1',
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});
assert.equal(window.DEDICALIVRES_SUPABASE_CLIENT, shared);
const send = async (data) => {
  for (const k of Object.keys(values)) delete values[k];
  Object.assign(values, {participant_type:'author',pseudo:'Auteur test',legal_accept:'on'}, data);
  await submit({preventDefault(){}});
  assert.equal(button.disabled,false);
};
await send({});
assert.equal(writes.length,1);
assert.equal(writes[0].validated,false);
assert.equal(writes[0].rejected,false);
assert.equal(writes[0].presence_verified,false);
assert.equal(writes[0].event_id,'event-fixture');
assert.equal(feedback.className,'success');
await send({author_profile_url:'example.org/auteur',book_or_publisher_url:'www.example.org/livre'});
assert.equal(writes[1].author_profile_url,'https://example.org/auteur');
assert.equal(writes[1].book_or_publisher_url,'https://www.example.org/livre');
await send({author_profile_url:'javascript:alert(1)'});
assert.equal(writes.length,2);
assert.equal(feedback.className,'error');
assert.match(feedback.textContent,/lien auteur/);
await send({legal_accept:null});
assert.equal(writes.length,2);
assert.match(feedback.textContent,/autorisation/);
await send({author_portrait:new FakeFile('image/jpeg', 5*1024*1024)});
assert.equal(writes.length,3);
assert.equal(writes[2].author_portrait_url,null);
assert.match(feedback.textContent,/sans le portrait/);
await send({author_portrait:new FakeFile('image/jpeg', 1024)});
assert.equal(writes.length,4);
assert.match(feedback.textContent,/sans le portrait/);
await send({participant_type:'publisher',organization_name:'Éditions test',organization_website:'example.org',
  contact_name:'Contact test',contact_email:'contact@example.org'});
assert.equal(writes.length,5);
assert.equal(writes[4].participant_type,'publisher');
assert.equal(writes[4].author_slug,null);
assert.equal(writes[4].contact_email,'contact@example.org');
assert.equal(writes[4].validated,false);
responseError = {code:'42501',message:'Permission denied'};
await send({});
assert.equal(writes.length,6);
assert.equal(feedback.className,'error');
assert.equal(resets,5);
console.log('PASS public presence: isolated session, pending moderation, link normalization, consent, optional portrait, publisher, server rejection.');
