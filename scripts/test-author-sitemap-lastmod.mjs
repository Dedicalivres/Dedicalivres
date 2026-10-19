import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildAuthorPages} from './build-author-pages.mjs';
import {renderAuthorStaticPage, renderAuthorIndexPage, canonicalUrl} from './author-static-page.mjs';

const template=fs.readFileSync('author.html','utf8');
const author=(slug,pseudo,published_at) => ({slug,pseudo,published_at,validated:true,published:true,merged_into:null,bio:'Biographie conservée',avatar_url:'https://images.example/portrait.jpg'});
const katell=author('katell-poquet','Katell Poquet','2026-09-02T12:00:00Z');
const dylan=author('dylan-heskin','Dylan Heskin','2026-10-09T12:00:00Z');
const event={id:'01e6fa91-6956-4775-bf49-4ad2f0e88761',title:"les dragons de l'imaginaire",start_date:'2026-10-17',end_date:'2026-10-18',city:'Saint-Laurent-des-Vignes',region:'Nouvelle-Aquitaine',country_code:'FR',validated:true,rejected:false};
const catalog=[{author:dylan,events:[]},{author:katell,events:[event]}];
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://dedicalivres.fr/auteurs/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${canonicalUrl(katell.slug)}</loc><lastmod>2026-09-02</lastmod><changefreq>weekly</changefreq><priority>0.71</priority></url>
  <url><loc>${canonicalUrl(dylan.slug)}</loc><lastmod>2026-10-09</lastmod><changefreq>monthly</changefreq><priority>0.72</priority></url>
</urlset>
`;
const snapshot=root=>Object.fromEntries(['sitemap-seo-auteurs.xml','auteurs/index.html','auteurs/katell-poquet/index.html','auteurs/dylan-heskin/index.html'].map(p=>[p,fs.readFileSync(path.join(root,p),'utf8')]));
const call=(root,extra={})=>buildAuthorPages({root,catalog:structuredClone(catalog),targeted:true,now:new Date('2026-10-19T12:00:00Z'),referenceDate:undefined,...extra});
let tests=0;
function test(label,fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'author-lastmod-'));
  try{
    fs.writeFileSync(path.join(root,'author.html'),template);
    fs.mkdirSync(path.join(root,'auteurs'),{recursive:true});
    fs.writeFileSync(path.join(root,'auteurs/index.html'),renderAuthorIndexPage({baseHtml:template,authors:catalog.map(r=>r.author)}).html);
    for(const {author,events} of catalog){
      const dir=path.join(root,'auteurs',author.slug);fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir,'index.html'),renderAuthorStaticPage({baseHtml:template,author,events,generatedAt:'2026-10-18'}).html);
    }
    fs.writeFileSync(path.join(root,'sitemap-seo-auteurs.xml'),sitemap);
    fn(root);tests++;console.log(`PASS lastmod auteur : ${label}`);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('Katell modifiée, Dylan inchangé, XML conservé hors date',root=>{
  const before=snapshot(root),result=call(root),after=snapshot(root);
  assert.deepEqual(result.changed,[canonicalUrl(katell.slug)]);
  assert.equal(after['sitemap-seo-auteurs.xml'],sitemap.replace('<lastmod>2026-09-02</lastmod>','<lastmod>2026-10-19</lastmod>'));
  assert.equal(after['auteurs/dylan-heskin/index.html'],before['auteurs/dylan-heskin/index.html']);
  assert.equal(after['auteurs/index.html'],before['auteurs/index.html']);
  assert.notEqual(after['auteurs/katell-poquet/index.html'],before['auteurs/katell-poquet/index.html']);
  const links=h=>[...h.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(links(after['auteurs/katell-poquet/index.html']),links(before['auteurs/katell-poquet/index.html']));
});
test('aucun changement significatif, aucun lastmod nouveau',root=>{
  const before=snapshot(root);assert.deepEqual(call(root,{now:new Date('2026-10-18T12:00:00Z')}).changed,[]);
  assert.deepEqual(snapshot(root),before);
});
test('variation cosmétique conservée sans changement de date',root=>{
  const p=path.join(root,'auteurs/katell-poquet/index.html');fs.appendFileSync(p,'\n\n');
  const before=snapshot(root);call(root,{now:new Date('2026-10-18T12:00:00Z')});assert.deepEqual(snapshot(root),before);
});
test('deux exécutions et jour suivant sans nouvelle modification',root=>{
  call(root);const first=snapshot(root);call(root);assert.deepEqual(snapshot(root),first);
  call(root,{now:new Date('2026-10-20T12:00:00Z')});assert.deepEqual(snapshot(root),first);
});
test('UTC vers Europe/Paris, même jour pour classement et lastmod',root=>{
  const result=call(root,{now:new Date('2026-10-18T22:30:00Z')});assert.equal(result.day,'2026-10-19');
  assert.match(snapshot(root)['sitemap-seo-auteurs.xml'],/<lastmod>2026-10-19<\/lastmod>/);
});
test('date de référence de projection explicite',root=>{
  assert.equal(call(root,{referenceDate:'2026-10-19',now:new Date('2026-10-20T12:00:00Z')}).day,'2026-10-19');
});
test('changement hiver et frontière du jour Paris',root=>{
  assert.equal(call(root,{now:new Date('2026-10-25T00:30:00Z')}).day,'2026-10-25');
  assert.equal(call(root,{now:new Date('2026-10-25T01:30:00Z')}).day,'2026-10-25');
  assert.equal(call(root,{now:new Date('2026-10-25T23:30:00Z')}).day,'2026-10-26');
});
const badSitemaps=[
  ['XML invalide',sitemap.replace('</urlset>','')],
  ['mauvaise racine',sitemap.replaceAll('urlset','other')],
  ['URL absente',sitemap.replace(/  <url><loc>https:\/\/dedicalivres.fr\/auteurs\/dylan-heskin\/[\s\S]*?<\/url>\n/,'')],
  ['URL dupliquée',sitemap.replace('</urlset>',`<url><loc>${canonicalUrl(katell.slug)}</loc><lastmod>2026-09-02</lastmod></url></urlset>`) ],
  ['URL inconnue ajoutée',sitemap.replace('</urlset>','<url><loc>https://dedicalivres.fr/auteurs/unknown/</loc><lastmod>2026-01-01</lastmod></url></urlset>')],
  ['lastmod absent',sitemap.replace('<lastmod>2026-09-02</lastmod>','')],
  ['lastmod dupliqué',sitemap.replace('<lastmod>2026-09-02</lastmod>','<lastmod>2026-09-02</lastmod><lastmod>2026-09-03</lastmod>')],
  ['lastmod inchangé invalide',sitemap.replace('<lastmod>2026-10-09</lastmod>','<lastmod>invalid</lastmod>')],
  ['retour temporel interdit',sitemap.replace('<lastmod>2026-09-02</lastmod>','<lastmod>2027-01-01</lastmod>')],
  ['DTD refusée',sitemap.replace('<urlset','<!DOCTYPE urlset><urlset')],
];
for(const [label,xml] of badSitemaps)test(label+' : STOP avant écriture',root=>{
  fs.writeFileSync(path.join(root,'sitemap-seo-auteurs.xml'),xml);const before=snapshot(root);
  assert.throws(()=>call(root));assert.deepEqual(snapshot(root),before);
});
test('auteur non publié et slug dupliqué refusés',root=>{
  for(const mutate of [rows=>rows[0].author.published=false,rows=>rows[0].author.validated=false,
    rows=>rows[0].author.merged_into='another',rows=>rows.push(structuredClone(rows[0])),rows=>rows[0].author.slug='../outside']){
    const rows=structuredClone(catalog);mutate(rows);const before=snapshot(root);
    assert.throws(()=>call(root,{catalog:rows}));assert.deepEqual(snapshot(root),before);
  }
});
test('registre auteur changé : STOP sans nouveau fichier ni URL',root=>{
  const before=snapshot(root);assert.throws(()=>call(root,{catalog:[...catalog,{author:author('new','New','2026-10-19'),events:[]}]}));
  assert.deepEqual(snapshot(root),before);assert.equal(fs.existsSync(path.join(root,'auteurs/new')),false);
});
test('date invalide : STOP avant écriture',root=>{
  const before=snapshot(root);assert.throws(()=>call(root,{referenceDate:'2026-02-30'}));assert.deepEqual(snapshot(root),before);
});
test('canonical auteur ambigu : STOP avant écriture',root=>{
  fs.appendFileSync(path.join(root,'auteurs/katell-poquet/index.html'),`<link rel="canonical" href="${canonicalUrl(katell.slug)}">`);
  const before=snapshot(root);assert.throws(()=>call(root));assert.deepEqual(snapshot(root),before);
});
test('création auteur ordinaire hors mode ciblé préservée',root=>{
  const rows=[...catalog,{author:author('nouvel-auteur','Nouvel Auteur','2026-10-19'),events:[]}];
  call(root,{catalog:rows,targeted:false});
  assert.equal(fs.existsSync(path.join(root,'auteurs/nouvel-auteur/index.html')),true);
  const xml=fs.readFileSync(path.join(root,'sitemap-seo-auteurs.xml'),'utf8');
  assert.equal([...xml.matchAll(/<loc>/g)].length,rows.length+1);
});
console.log(`PASS lastmod auteurs : ${tests} scénarios hors ligne`);
