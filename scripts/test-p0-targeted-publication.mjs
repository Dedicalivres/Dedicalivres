import assert from 'node:assert/strict';
import {
  assertP0Catalog,
  assertP0Manifest,
  assertAllowedPageChanges,
  assertSitemapScope,
  sitemapEntries,
  temporalStatus,
  normalizeMetadata,
  businessFingerprint,
} from './project-p0-publication.mjs';

const pascal = 'c69b157c-bf2f-4ddf-affa-a57497d261c2';
const seclin = '14b81335-1dab-4f6d-9667-5e88675c6f98';
const other = 'third-event';
const prior = {events:[
  {id:pascal, title:'Pascal', start_date:'2026-11-21'},
  {id:other, title:'Autre', start_date:'2026-10-11', end_date:'2026-10-11'},
]};
const after = {events:[
  {id:seclin, title:'Seclin', start_date:'2026-10-24'},
  structuredClone(prior.events[1]),
]};
assert.doesNotThrow(() => assertP0Catalog(prior, after, 2));
assert.throws(() => assertP0Catalog(prior, {events:[after.events[0], {...after.events[1],title:'Altéré'}]}, 2), /modification métier tierce/);
assert.throws(() => assertP0Catalog(prior, {events:[after.events[0]]}, 2), /cardinalité/);
assert.equal(temporalStatus(prior.events[1], '2026-10-10'), 'future');
assert.equal(temporalStatus(prior.events[1], '2026-10-11'), 'ongoing');
assert.equal(temporalStatus(prior.events[1], '2026-10-12'), 'past');

const oldMap = {[pascal]:'evenement/pascal.html',[other]:'evenement/autre.html'};
const manifest = {[seclin]:'seclin',[other]:'autre'};
assert.doesNotThrow(() => assertP0Manifest(oldMap, manifest, 2));
assert.throws(() => assertP0Manifest(oldMap, {...manifest,[other]:'troisieme'}, 2), /URL tierce/);
assert.throws(() => assertP0Manifest(oldMap, {...manifest,[seclin]:'autre'}, 2), /dupliquée/);
assert.doesNotThrow(() => assertAllowedPageChanges(['evenement/pascal.html','evenement/index.html'], 'evenement/pascal.html'));
assert.throws(() => assertAllowedPageChanges(['evenement/autre.html'], 'evenement/pascal.html'), /fiche tierce/);
assert.throws(() => assertAllowedPageChanges(['evenement/legacy.html'], 'evenement/pascal.html'), /fiche tierce/);

const oldXml = '<urlset>\n  <url><loc>https://dedicalivres.fr/evenement/index.html</loc><lastmod>2026-10-10</lastmod></url>\n  <url><loc>https://dedicalivres.fr/evenement/pascal.html</loc><lastmod>2026-10-10</lastmod></url>\n  <url><loc>https://dedicalivres.fr/evenement/autre.html</loc><lastmod>2026-10-10</lastmod></url>\n</urlset>';
const newXml = oldXml.replace('pascal.html','seclin.html');
const oldEntries=sitemapEntries(oldXml),newEntries=sitemapEntries(newXml);
assert.doesNotThrow(() => assertSitemapScope(oldEntries,newEntries,'https://dedicalivres.fr/evenement/pascal.html','https://dedicalivres.fr/evenement/seclin.html',3));
assert.throws(() => assertSitemapScope(oldEntries,sitemapEntries(newXml.replace(/^  <url><loc>https:\/\/dedicalivres.fr\/evenement\/autre.html.*\n/m,'')),'https://dedicalivres.fr/evenement/pascal.html','https://dedicalivres.fr/evenement/seclin.html',3), /sitemap/);
assert.throws(() => sitemapEntries(newXml.replace('</urlset>','  <url><loc>https://dedicalivres.fr/evenement/seclin.html</loc><lastmod>2026-10-11</lastmod></url>\n</urlset>')), /dupliquée/);

const captureA='<main data-as-of="2026-10-10"><time datetime="2026-10-10T18:00:00Z">10 octobre</time>Classement arrêté au 10 octobre 2026.</main>';
const captureB='<main data-as-of="2026-10-11"><time datetime="2026-10-11T18:00:00Z">11 octobre</time>Classement arrêté au 11 octobre 2026.</main>';
assert.equal(normalizeMetadata(captureA),normalizeMetadata(captureB));
assert.notEqual(normalizeMetadata(captureA),normalizeMetadata(captureB.replace('</main>','<p>Autre événement</p></main>')));
assert.equal(businessFingerprint('<title>A</title><div class="desc">Texte</div><img src="poster.jpg">'),businessFingerprint('<title>A</title><div class="detail-description">Texte</div><img src="poster.jpg"><img src="poster.jpg">'));
assert.notEqual(businessFingerprint('<title>A</title><div class="desc">Texte</div>'),businessFingerprint('<title>A</title><div class="desc">Texte perdu</div>'));
console.log('PASS projection P0 : deux IDs, transitions, refus tiers/legacy/snapshot/sitemap/canonique et métadonnées');
