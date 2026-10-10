import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app.js', 'utf8');
const urlCode = source.slice(source.indexOf('  function restoreAgendaFilters()'), source.indexOf('  function populateSubmissionRegion()'));
const renderCode = source.slice(source.indexOf('  function renderFilteredEvents()'), source.indexOf('  function filterEvents('));
const popCode = source.slice(source.indexOf('    window.addEventListener("popstate"'), source.indexOf('    bindCityAutocomplete();'));
const resetCode = source.slice(source.indexOf('  function resetFilters()'), source.indexOf('  function setLoadingState()'));
assert(urlCode.includes('function syncAgendaUrl()') && renderCode.includes('syncAgendaUrl()'));

function select(values) {
  let current = '';
  const control = { options: values.map(value => ({ value, dataset: {} })) };
  Object.defineProperty(control, 'value', {
    get: () => current,
    set: value => { current = control.options.some(option => option.value === value) ? value : ''; }
  });
  return control;
}

let href = 'https://www.dedicalivres.fr/?source=lettre#agenda';
const replaces = [];
const listeners = {};
const location = {
  get href() { return href; }, get search() { return new URL(href).search; },
  get pathname() { return new URL(href).pathname; }, get hash() { return new URL(href).hash; }
};
const countryFilter = select(['', 'FR', 'BE']);
const regionFilter = select(['']);
const typeFilter = select(['', 'Salon', 'Festival', 'Dédicace', 'Autre']);
const dateFilter = select(['', '2026-11', '2026-12']);
const searchInput = { value: '' };
const renders = { events: 0, past: 0, map: 0, calendar: 0 };
const context = vm.createContext({
  window: {
    location, history: { state: { safe: true }, replaceState(state, title, path) {
      assert.deepEqual(state, { safe: true });
      href = new URL(path, href).href; replaces.push(href);
    } },
    clearTimeout() {}, addEventListener(name, listener) { listeners[name] = listener; }
  },
  URL, URLSearchParams, countryFilter, regionFilter, typeFilter, dateFilter, searchInput,
  geo: { normalizeCountryCode: value => value.toUpperCase() },
  populateAgendaRegionFilter() {
    regionFilter.options = countryFilter.value === 'FR'
      ? [{ value: '', dataset: {} }, { value: 'Bretagne', dataset: { countryCode: 'FR' } }]
      : countryFilter.value === 'BE'
        ? [{ value: '', dataset: {} }, { value: 'Wallonie', dataset: { countryCode: 'BE' } }]
        : [{ value: '', dataset: {} }, { value: 'Bretagne', dataset: { countryCode: 'FR' } }, { value: 'Wallonie', dataset: { countryCode: 'BE' } }];
    regionFilter.value = '';
  },
  parseLocalDate: value => { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? null : date; },
  toDateKey: date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
  selectedCalendarDate: '', calendarCursor: new Date(2026, 9, 1), restoringUrlFilters: false,
  catalogVersion: 1, searchRenderTimer: null, lastRenderedFilterKey: '', allEvents: [],
  userPosition: null, locationRadiusKm: 25, DEFAULT_LOCATION_RADIUS_KM: 25,
  locationRadiusSelect: { value: '25' }, userMarker: null, map: null,
  locateMeButton: { textContent: '' }, setLocateStatus: () => {}, centerMapOnGlobalView: () => {},
  document: { body: { dataset: { agendaMode: 'global' } } },
  normalize: value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  filterEvents: () => [], sortUpcomingEvents: () => 0, sortPastEvents: () => 0,
  findEventsWithinRadius: (position, events) => events,
  isPastEvent: () => false, renderEvents: () => renders.events++,
  renderPastEvents: () => renders.past++, renderMapMarkers: () => renders.map++,
  renderAgendaCalendar: () => renders.calendar++, JSON, Date
});
vm.runInContext(`${urlCode}\n${renderCode}\n${resetCode}\n${popCode}`, context);

context.restoreAgendaFilters(); context.renderFilteredEvents();
assert.equal(countryFilter.value, '');
assert.equal(replaces.length, 0, 'URL sans filtre inchangée');

href = 'https://www.dedicalivres.fr/?source=lettre&country=FR&region=Bretagne&type=Salon&month=2026-11&q=%C3%89t%C3%A9#agenda';
context.restoreAgendaFilters(); context.renderFilteredEvents();
assert.deepEqual([countryFilter.value, regionFilter.value, typeFilter.value, dateFilter.value, searchInput.value],
  ['FR', 'Bretagne', 'Salon', '2026-11', 'Été']);
assert.equal(replaces.length, 0, 'Restauration valide sans remplacement');

href = 'https://www.dedicalivres.fr/?source=lettre&country=FR&region=Wallonie&type=Inconnu&month=2026-99&date=2026-02-30#agenda';
context.restoreAgendaFilters(); context.renderFilteredEvents();
assert.deepEqual([countryFilter.value, regionFilter.value, typeFilter.value, dateFilter.value, context.selectedCalendarDate],
  ['FR', '', '', '', '']);
assert(new URL(href).searchParams.has('source'));
assert.equal(new URL(href).hash, '#agenda');
assert.equal(new URL(href).searchParams.has('date'), false, 'Date invalide ignorée');

href = 'https://www.dedicalivres.fr/?source=lettre&month=2026-11&date=2026-12-08#agenda';
context.restoreAgendaFilters(); context.renderFilteredEvents();
assert.equal(context.selectedCalendarDate, '2026-12-08');
assert.equal(dateFilter.value, '2026-12', 'Le jour prime sur le mois incohérent');
assert.equal(new URL(href).searchParams.get('month'), '2026-12');

searchInput.value = 'Dédicace'; typeFilter.value = 'Dédicace';
context.userPosition = { lat: 48.8, lng: 2.3 };
context.renderFilteredEvents();
assert.equal(new URL(href).searchParams.get('q'), 'Dédicace');
assert.equal(new URL(href).searchParams.get('type'), 'Dédicace');
assert.equal(new URL(href).searchParams.has('lat'), false);
assert.equal(new URL(href).searchParams.has('lng'), false);
assert.equal(new URL(href).searchParams.get('source'), 'lettre');

href = 'https://www.dedicalivres.fr/?source=lettre&country=BE&region=Wallonie#agenda';
const beforePop = replaces.length;
listeners.popstate();
assert.equal(replaces.length, beforePop, 'popstate ne réécrit pas l’historique');
assert.deepEqual([countryFilter.value, regionFilter.value, searchInput.value, context.selectedCalendarDate], ['BE', 'Wallonie', '', '']);
const beforeRepeat = renders.events;
listeners.popstate();
assert.equal(renders.events, beforeRepeat, 'popstate identique évité');

context.resetFilters();
assert.equal(new URL(href).searchParams.get('source'), 'lettre');
assert.equal(new URL(href).searchParams.has('country'), false);
assert.equal(context.userPosition, null);
assert.equal(new URL(href).hash, '#agenda');
assert.equal(renders.map, renders.events, 'Aucun rendu cartographique supplémentaire');

console.log('PASS URL : restauration, validation, synchronisation, popstate et paramètres préservés');
