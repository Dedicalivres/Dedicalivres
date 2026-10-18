import assert from 'node:assert/strict';
import {assertCatalog, assertNewFranceArchives, temporalArchivePreview} from './project-targeted-publication.mjs';
import {renderTerritory, territories} from './territorial-render.mjs';

const oldDay = '2026-10-17', day = '2026-10-18';
const france = territories.find(territory => territory.id === 'FR');
const mainFile = france.file;
const archiveFile = n => `evenements-litteraires-france-archives-${n}.html`;
const uuid = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const events = Array.from({length:625}, (_, i) => ({
  id:uuid(i), title:`Livre ${String(i).padStart(4, '0')}`, city:'Quimper', type:'Salon',
  country_code:'FR', region:'Bretagne', validated:true, rejected:false,
  start_date:i < 499 ? '2026-10-01' : i < 507 ? oldDay : '2026-11-14',
  end_date:i < 499 ? '2026-10-01' : i < 507 ? oldDay : '2026-11-15',
  registration_force_status:null,
}));
const edition = date => {
  const rendered = renderTerritory({p:france, events, registry:[],
    capturedAt:'2026-10-17T12:00:00Z', referenceDate:date});
  return new Map([[mainFile, rendered.main], ...rendered.archivePages.map(page => [page.file,
    `<link rel="canonical" href="https://dedicalivres.fr/${page.file}">${page.main}`])]);
};
const sitemap = pages => `<urlset>${[...pages.keys()].map(file =>
  `<url><loc>https://dedicalivres.fr/${file}</loc></url>`).join('')}</urlset>`;
const fixture = () => {
  const oldPages = edition(oldDay), freshPages = edition(day);
  return {oldPages, freshPages, before:new Map(events.map(event => [event.id, structuredClone(event)])),
    after:new Map(events.map(event => [event.id, structuredClone(event)])),
    published:new Set(events.map(event => event.id)), oldXml:sitemap(oldPages), freshXml:sitemap(freshPages)};
};
const check = value => {
  assertCatalog({events:[...value.before.values()]}, {events:[...value.after.values()]}, new Set([uuid(624)]));
  return assertNewFranceArchives(value.oldPages, value.freshPages, value.before, value.after,
    value.published, oldDay, day, value.oldXml, value.freshXml);
};
const run = (label, callback) => { callback(); console.log(`PASS ${label}`); };
const stop = (label, mutate, message) => run(`STOP ${label}`, () => {
  const value = fixture(); mutate(value); assert.throws(() => check(value), message);
});
const edit = (value, file, change) => value.freshPages.set(file, change(value.freshPages.get(file)));
const item = /<li data-event-id="[^"]+" data-status="[^"]+">[\s\S]*?<\/li>/;

run('archive connue, 10 → 11 pages, 499 → 507 passés, 625 événements conservés', () => {
  const value = fixture();
  assert.equal(value.oldPages.size - 1, 10);
  assert.equal(value.freshPages.size - 1, 11);
  assert.deepEqual([...check(value)], [archiveFile(11)]);
  for (const pages of [value.oldPages, value.freshPages]) {
    const ids = [...pages.values()].flatMap(html => [...html.matchAll(/<li data-event-id="([^"]+)"/g)].map(match => match[1]));
    assert.equal(ids.length, 625);
    assert.equal(new Set(ids).size, 625);
    assert.deepEqual(new Set(ids), value.published);
  }
  assert.equal([...value.freshPages.get(archiveFile(11)).matchAll(/<li data-event-id=/g)].length, 7);
});
stop('UUID inconnu', value => edit(value, archiveFile(11), html =>
  html.replace(/data-event-id="[^"]+"/, `data-event-id="${uuid(999)}"`)), /inconnu/);
stop('UUID nouveau même autorisé dans le catalogue', value => {
  const event = {...events[0], id:uuid(999)}; value.after.set(event.id, event);
}, /tierce|corpus/);
stop('événement non terminé, fin inclusive', value => {
  const id = [...value.freshPages.get(archiveFile(11)).matchAll(/data-event-id="([^"]+)"/g)][0][1];
  value.before.get(id).end_date = day; value.after.get(id).end_date = day;
}, /couverture|non passé/);
stop('statut past falsifié', value => edit(value, archiveFile(11), html =>
  html.replace('data-status="past"', 'data-status="ongoing"')), /non passé/);
stop('modification métier tierce', value => { value.after.get(uuid(0)).title = 'Altéré'; }, /métier tierce/);
stop('date modifiée même sur événement autorisé', value => { value.after.get(uuid(624)).start_date = '2026-09-01';
  value.after.get(uuid(624)).end_date = '2026-09-02'; }, /non issues/);
stop('pagination manquante', value => { value.freshPages.delete(archiveFile(10)); }, /pagination/);
stop('mauvaise taille de page', value => edit(value, archiveFile(10), html => html.replace(item, '')), /perdu/);
stop('ordre des événements', value => edit(value, archiveFile(11), html => {
  const cards = [...html.matchAll(new RegExp(item.source, 'g'))].map(match => match[0]);
  return html.replace(cards[0], 'PLACEHOLDER').replace(cards[1], cards[0]).replace('PLACEHOLDER', cards[1]);
}), /perdu/);
stop('compteur de pages', value => edit(value, archiveFile(11), html => html.replace('Page 11 sur 11.', 'Page 11 sur 12.')), /pagination/);
stop('lien suivant incorrect', value => edit(value, archiveFile(10), html =>
  html.replace('href="'+archiveFile(11)+'"', 'href="'+archiveFile(12)+'"')), /pagination/);
stop('canonical archive erroné', value => edit(value, archiveFile(11), html =>
  html.replace(`https://dedicalivres.fr/${archiveFile(11)}`, `https://dedicalivres.fr/${archiveFile(12)}`)), /canonical/);
stop('doublon dans une archive', value => edit(value, archiveFile(11), html => html.replace('</ul>', html.match(item)[0]+'</ul>')), /dupliqué/);
stop('doublon entre deux archives', value => edit(value, archiveFile(11), html =>
  html.replace(item, value.freshPages.get(archiveFile(10)).match(item)[0])), /dupliqué/);
stop('disparition d’un événement France', value => edit(value, mainFile, html => html.replace(item, '')), /couverture/);
stop('doublon dans l’agenda France', value => edit(value, mainFile, html => html.replace('</ul>', html.match(item)[0]+'</ul>')), /couverture/);
stop('disparition du catalogue', value => { value.after.delete(uuid(624)); }, /corpus/);
stop('nouvelle page territoriale', value => { value.freshPages.set('evenements-litteraires-inattendu.html', ''); }, /hors archives/);
stop('nouvelle page territoriale sans archive nouvelle', value => {
  value.freshPages = new Map(value.oldPages); value.freshPages.set('evenements-litteraires-inattendu.html', '');
}, /hors archives/);
stop('nom archive avec zéro initial', value => {
  value.freshPages.set('evenements-litteraires-france-archives-011.html', value.freshPages.get(archiveFile(11)));
}, /hors archives/);
stop('archive surnuméraire', value => { value.freshPages.set(archiveFile(12), value.freshPages.get(archiveFile(11))); }, /pagination/);
stop('archive absente du sitemap', value => { value.freshXml = value.oldXml; }, /sitemap/);
stop('URL dupliquée dans le sitemap', value => { value.freshXml += `<loc>https://dedicalivres.fr/${archiveFile(11)}</loc>`; }, /sitemap/);
stop('URL tierce ajoutée au sitemap', value => { value.freshXml += '<loc>https://dedicalivres.fr/inattendu.html</loc>'; }, /sitemap/);
stop('URL tierce disparue du sitemap', value => { value.oldXml += '<loc>https://dedicalivres.fr/existant.html</loc>'; }, /sitemap/);
stop('pagination historique incohérente', value => { value.oldPages.delete(archiveFile(9)); }, /pagination/);
stop('UUID absent des canonicals publiés', value => { value.published.delete(uuid(0)); }, /corpus publié/);
run('pas de nouvelle page : garde existant conservé', () => {
  const value = fixture(); value.freshPages = new Map(value.oldPages);
  assert.equal(check(value).size, 0);
});

run('libellé ville archivée : transition prouvée, carte strictement inchangée', () => {
  const event = events[499];
  const source = new Map([[event.id, event]]);
  const old = `<body data-city="Quimper"><div id="seo-events" class="events-grid">\n<article data-event-id="${event.id}" data-static-event-preview="true">Carte inchangée</article></div>`;
  const label = '<p class="static-event-preview-label">Événements récemment référencés</p>\n';
  const fresh = old.replace('<article', label + '<article');
  assert(temporalArchivePreview(old, fresh, source, source, oldDay, day));
  assert(!temporalArchivePreview(old, fresh.replace('inchangée', 'altérée'), source, source, oldDay, day));
  assert(!temporalArchivePreview(old, fresh, source, source, oldDay, oldDay));
  const notEnded = new Map([[event.id, {...event, end_date:day}]]);
  assert(!temporalArchivePreview(old, fresh, notEnded, notEnded, oldDay, day));
  assert(!temporalArchivePreview(old, fresh, source, new Map([...source, [uuid(624), events[624]]]), oldDay, day));
  assert(!temporalArchivePreview(old, fresh + label, source, source, oldDay, day));
  assert(!temporalArchivePreview(old, fresh, new Map(), source, oldDay, day));
  console.log('PASS STOP libellé sans transition, carte altérée, événement encore actif, UUID inconnu ou libellé dupliqué');
});
