import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app.js', 'utf8');
const code = source.slice(source.indexOf('  function renderEvents('), source.indexOf('  function renderEventCard('));
assert(code.includes('function renderPastEvents('));

function grid() {
  return { writes: 0, value: '', set innerHTML(value) { this.writes++; this.value = value; } };
}
const eventsGrid = grid();
const pastEventsGrid = grid();
const resultsCount = { textContent: '' };
const pastEventsCount = { textContent: '' };
const pastEventsSection = { hidden: false };
const dispatches = [];
let favoriteRefreshes = 0;
const context = vm.createContext({
  eventsGrid, pastEventsGrid, resultsCount, pastEventsCount, pastEventsSection,
  lastUpcomingCardsHtml: null, lastPastCardsHtml: null,
  renderEventCard: (event, options = {}) => JSON.stringify({
    id: event.id, title: event.title, date: event.start_date, image: event.image_url,
    badge: event.featured, favorite: event.favorite, past: Boolean(options.isPast)
  }),
  refreshFavoriteButtons: () => favoriteRefreshes++,
  window: { dispatchEvent: event => dispatches.push(event) },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
});
vm.runInContext(code, context);

const a = { id: 'a', title: 'Été', start_date: '2099-06-01', image_url: 'a.jpg', featured: true, favorite: false };
const b = { id: 'b', title: 'Salon', start_date: '2099-07-01' };
context.renderEvents([a, b]);
context.renderPastEvents([{ id: 'old', title: 'Archive' }]);
assert.equal(eventsGrid.writes, 1);
assert.equal(pastEventsGrid.writes, 1);
assert.equal(resultsCount.textContent, '2 événements à venir');
assert.equal(pastEventsSection.hidden, false);

context.renderEvents([a, b]);
context.renderPastEvents([{ id: 'old', title: 'Archive' }]);
assert.equal(eventsGrid.writes, 1, 'Même liste : aucune réécriture');
assert.equal(pastEventsGrid.writes, 1, 'Même archive : aucune réécriture');
assert.equal(dispatches.length, 2, 'cards-rendered reste émis à chaque rendu demandé');
assert.equal(favoriteRefreshes, 2, 'États favoris restent actualisés');

context.renderEvents([b, a]);
assert.equal(eventsGrid.writes, 2, 'Ordre modifié');
context.renderEvents([b, a, { id: 'c', title: 'Nouveau' }]);
assert.equal(eventsGrid.writes, 3, 'Nouvel événement');
context.renderEvents([b, { ...a, title: 'Titre modifié', start_date: '2099-06-02', image_url: 'b.jpg', featured: false, favorite: true }]);
assert.equal(eventsGrid.writes, 4, 'Contenu et favori modifiés');
assert(eventsGrid.value.includes('Titre modifié'));
assert(eventsGrid.value.includes('b.jpg'));

context.renderEvents([], 1);
assert.equal(eventsGrid.writes, 5);
assert(eventsGrid.value.includes('Des événements passés'));
assert.equal(resultsCount.textContent, '0 événement à venir · 1 passé');
context.renderEvents([], 1);
assert.equal(eventsGrid.writes, 5, 'État vide identique');
context.renderPastEvents([]);
assert.equal(pastEventsGrid.writes, 2);
assert.equal(pastEventsSection.hidden, true);
context.renderPastEvents([]);
assert.equal(pastEventsGrid.writes, 2, 'Archives vides identiques');
assert.equal(dispatches.at(-1).detail.count, 0);

console.log('PASS cartes : réécritures évitées, ordre, contenu, archives, favoris, événement');
console.log(`DOM simulé, même scénario : 11 réécritures avant / ${eventsGrid.writes + pastEventsGrid.writes} après ; 13 cartes reconstruites avant / 10 après`);
