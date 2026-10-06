import fs from 'node:fs';
import assert from 'node:assert/strict';
import {territories} from './territorial-render.mjs';
const images=JSON.parse(fs.readFileSync('docs/territoires/images-r2.json'));
for(const p of territories){
 const html=fs.readFileSync(p.file,'utf8');
 assert(html.includes(`href="${p.canonical}"`));assert(html.includes('href="index.html#agenda"'));
 assert.equal((html.match(/<h1>/g)||[]).length,1);
 if(p.kind==='region'){assert(fs.readFileSync(p.countryUrl,'utf8').includes(`href="${p.file}"`));assert(html.includes(`href="${p.countryUrl}"`));}
 if(p.editorial)assert(html.includes(p.editorial));
 if(p.image)assert(images.some(i=>i.url===p.image&&i.verified));
 else assert(!html.includes('class="territory-banner"'));
 for(const match of html.matchAll(/href="(evenements-litteraires-[^"]+\.html)"/g))assert(fs.existsSync(match[1]),match[1]);
}
assert.equal(territories.filter(p=>p.kind==='country').length,5);
assert.equal(territories.filter(p=>p.kind==='region').length,16);
console.log('PASS 21 pages : maillage, H1, canonical, contenu éditorial et inventaire R2');

const canonicalMap = JSON.parse(
  fs.readFileSync('docs/territoires/event-canonical-map.json', 'utf8')
);

const canonicalMissing = JSON.parse(
  fs.readFileSync('docs/territoires/event-canonical-missing.json', 'utf8')
);

const allTerritorialHtml = territories
  .map(p => fs.readFileSync(p.file, 'utf8'))
  .join('\n');

const staticLinks = new Set(
  [...allTerritorialHtml.matchAll(/href="(evenement\/[^"]+\.html)"/g)]
    .map(m => m[1])
);

const dynamicIds = new Set(
  [...allTerritorialHtml.matchAll(/event\.html\?id=([0-9a-fA-F-]{36})/g)]
    .map(m => m[1])
);

assert.equal(
  staticLinks.size,
  Object.keys(canonicalMap).length,
  'Chaque mapping canonical doit être utilisé dans les pages territoriales'
);

assert.deepEqual(
  [...dynamicIds].sort(),
  canonicalMissing.map(e => e.id).sort(),
  'Les fallbacks dynamiques doivent correspondre exactement aux événements sans fiche statique'
);

for (const href of staticLinks) {
  assert(
    fs.existsSync(href.replace(/^\//, '')),
    `Fiche statique absente : ${href}`
  );
}

console.log(
  `PASS canonical événements : ${staticLinks.size} statiques, ${dynamicIds.size} fallbacks`
);
