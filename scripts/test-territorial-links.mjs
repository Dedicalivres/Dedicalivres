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
