import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('app.js', 'utf8');
const context = vm.createContext({ Intl, Date, Set });
vm.runInContext(app.slice(app.indexOf('  function parisDateKey('), app.indexOf('  function renderCurrentEvents(')), context);
const select = (rows, day = '2026-10-19') => Array.from(context.selectCurrentEvents(rows, day), row => row.id);
const base = { id: 'a', title: 'Livre', validated: true, rejected: false, start_date: '2026-10-19' };
assert.equal(context.parisDateKey(new Date('2026-10-18T22:30:00Z')), '2026-10-19');
assert.equal(context.parisDateKey(new Date('2026-01-01T23:30:00Z')), '2026-01-02');
assert.equal(context.parisDateKey(new Date('2026-10-25T01:30:00Z')), '2026-10-25');
assert.deepEqual(select([{...base, id:'ongoing', start_date:'2026-10-18',end_date:'2026-10-20'}, base]), ['a','ongoing']);
assert.deepEqual(select([base, base, {...base,id:'past',start_date:'2026-10-18'}, {...base,id:'future',start_date:'2026-10-20'}, {...base,id:'rejected',rejected:true}, {...base,id:'invalid',validated:false}, {...base,id:'unknown',validated:undefined}, {...base,id:'bad',end_date:'2026-02-30'}]), ['a']);
assert.equal(select(Array.from({length:8}, (_, i) => ({...base,id:String(i)}))).length, 4);
assert.deepEqual(select([]), []);

const pages = ['index.html','agenda.html','salons-du-livre.html','dedicaces.html','temoignages.html','widget-partenaires.html','soumettre.html','author-contribute.html'];
for (const page of pages) {
  const html = fs.readFileSync(page,'utf8');
  const header = html.match(/<header class="header public-header">[\s\S]*?<\/header>/)?.[0];
  assert(header, page);
  assert.equal((header.match(/<a href=/g) || []).length, 8, page + ': logo and seven links');
  assert.equal((header.match(/class="a11y-nav-btn"/g)||[]).length, 1);
  assert.match(html, /accessibilite\.js\?v=/);
}
const home = fs.readFileSync('index.html','utf8');
assert.match(home, /<details id="saved-events"/);
assert.match(home, /<details id="upcoming-preview"[\s\S]*?STATIC-EVENT-PREVIEW:home:START[\s\S]*?STATIC-EVENT-PREVIEW:home:END[\s\S]*?<\/details>/);
assert.match(home, /<form action="agenda\.html" method="get"[\s\S]*?name="autour" value="1"/);
assert.doesNotMatch(fs.readFileSync('accessibilite.js','utf8'), /a11y-showcase/);
assert.doesNotMatch(fs.readFileSync('ludique.js','utf8'), /setupBackTop|lud-back-top/);
assert.doesNotMatch(fs.readFileSync('regional-map.js','utf8'), /scrollIntoView/);
assert.match(app, /getBoundsZoom\(\[\[34, -15\], \[72, 40\]\]\)/);
assert.doesNotMatch(app, /maxBounds\s*:/);
assert.match(fs.readFileSync('widget.js','utf8'), /paint\(near\);/);
assert.doesNotMatch(fs.readFileSync('widget.js','utf8'), /near\.length \? near : pool/);
console.log('PASS public UX: Paris dates, public selection, four-card cap, shared navigation, disclosures, static links and map/radius safeguards.');
