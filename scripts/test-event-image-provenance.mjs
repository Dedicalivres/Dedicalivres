import assert from 'node:assert/strict';
import { auditEventImages, imageIdentity } from './event-image-provenance-core.mjs';
const base = { validated:true, rejected:false, city:'Paris', start_date:'2026-11-14', source_label:'', website:'', image_url:'' };
const e = (id, patch={}) => ({...base, id, title:`Test ${id}`, ...patch});
const stockA = 'https://images.unsplash.com/photo-1579370318443-8da816457e3d?auto=format&w=1200';
const stockB = 'https://images.unsplash.com/photo-1579370318443-8da816457e3d?fm=jpg&w=3000';
assert.equal(imageIdentity(stockA), imageIdentity(stockB), 'les variantes Unsplash désignent la même photographie');
assert.notEqual(imageIdentity('https://a.test/thumb.php?image=x.png'),imageIdentity('https://a.test/thumb.php?image=y.png'));
assert.equal(imageIdentity('javascript:alert(1)'), '', 'schémas non HTTP exclus');
const cases = [
 e('stock-a',{image_url:stockA}), e('stock-b',{image_url:stockB}),
 e('missing'),
 e('invalid',{image_url:'javascript:alert(1)'}),
 e('batch',{source_label:'Sources publiques + visuel booking_with_emilie',image_url:'https://images.example.org/creation-42.jpg',website:'https://organisateur.fr/'}),
 e('official-ycon',{source_label:'Sources publiques + visuel booking_with_emilie',website:'https://y-con-france.com/',image_url:'https://y-con-france.com/wp-content/uploads/2026/06/YCON-12-affiche-1-scaled.jpg'}),
 e('official-pornic',{source_label:'Ville de Pornic — affiche officielle 2026 annoncée pour diffusion',website:'https://www.pornic.fr/evenement/salon-du-livre-de-noel/',image_url:'https://www.pornic.fr/wp-content/uploads/2026/10/salon-du-livre.png'}),
 e('shared-a',{image_url:'https://r2.example.org/poster.jpg'}),
 e('shared-b',{image_url:'https://r2.example.org/poster.jpg'}),
 e('rejected',{image_url:stockA,rejected:true}),
 e('old',{image_url:stockA,start_date:'2025-02-02'})
];
const r = auditEventImages(cases,{fromDate:'2026-11-01'});
const byId = new Map(r.findings.map(x=>[x.id,x]));
assert.equal(r.examined,9);
assert.equal(r.counts.STOCK_IMAGE,2);
assert.equal(r.counts.SHARED_IMAGE_REVIEW,4);
assert.equal(r.counts.MISSING_IMAGE,1);
assert.equal(r.counts.INVALID_IMAGE_URL,1);
assert.equal(r.counts.BATCH_PROVENANCE_REVIEW,1);
assert.ok(byId.get('batch').issues.includes('BATCH_PROVENANCE_REVIEW'));
assert.ok(!byId.has('official-ycon'), 'ne pas éliminer une affiche authentique par seule appartenance au lot');
assert.ok(!byId.has('official-pornic'), 'affiche officielle sur le site de son organisateur');
assert.ok(!byId.has('rejected'), 'événement rejeté ignoré');
assert.ok(!byId.has('old'), 'horizon appliqué');
assert.ok(byId.get('shared-a').issues.includes('SHARED_IMAGE_REVIEW'));
assert.ok(!byId.get('shared-a').issues.includes('STOCK_IMAGE'));
console.log('EVENT_IMAGE_PROVENANCE_TEST_OK');
