import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('app.js','utf8');
const events=[
 {id:'1',title:'Été du livre',city:'Paris',region:'Île-de-France',country_code:'FR',description:'Salon littéraire',type:'Salon',start_date:'2099-06-10',end_date:'2099-06-11'},
 {id:'2',title:'Dédicace Élodie',city:'Lyon',region:'Auvergne-Rhône-Alpes',country_code:'FR',description:'Rencontre',type:'Dédicace',start_date:'2099-07-01'},
 {id:'3',title:'Salon ancien',city:'Bruxelles',region:'Bruxelles',country_code:'BE',description:'Archive',type:'Salon',start_date:'2020-01-01'},
 {id:'4',title:'Festival du livre',city:'Namur',region:'Wallonie',country_code:'BE',description:'Festival',type:'Festival',start_date:'2099-08-01'}
];

function setup(){
 const listeners={};const timers=new Map();let timerId=0;
 const searchInput={value:'',addEventListener:(name,fn)=>{listeners[name]=fn;}};
 const countryFilter={value:''},regionFilter={value:''},typeFilter={value:''},dateFilter={value:''};
 const writes={events:0,past:0,map:0,calendar:0,calendarCorpus:0,upcoming:[],pastIds:[]};
 const calendarGrid={set innerHTML(value){writes.calendar++;this.html=value;}};
 const context=vm.createContext({
  window:{setTimeout:(fn,delay)=>{assert.equal(delay,200);const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)},
  searchInput,countryFilter,regionFilter,typeFilter,dateFilter,calendarGrid,
  calendarMonthLabel:{textContent:''},calendarCursor:new Date(2099,5,1),
  selectedCalendarDate:'',allEvents:events,searchableText:new WeakMap(),catalogVersion:1,
  searchRenderTimer:null,lastRenderedFilterKey:'',calendarBaseKey:'',calendarBaseEvents:[],calendarRenderKey:'',
  userPosition:null,locationRadiusKm:25,document:{body:{dataset:{agendaMode:'global'}}},
  geo:{getCountryName:code=>({FR:'France',BE:'Belgique'}[code]),getCountryCode:event=>event.country_code,normalizeCountryCode:code=>code},
  normalize:value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
  toDateKey:date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),
  isPastEvent:event=>event.start_date<'2026-10-10',
  sortUpcomingEvents:(a,b)=>a.start_date.localeCompare(b.start_date)||a.title.localeCompare(b.title,'fr'),
  sortPastEvents:(a,b)=>b.start_date.localeCompare(a.start_date),
  renderEvents:rows=>{writes.events++;writes.upcoming=rows.map(e=>e.id);},
  renderPastEvents:rows=>{writes.past++;writes.pastIds=rows.map(e=>e.id);},
  renderMapMarkers:()=>{writes.map++;},
  parseLocalDate:value=>value?new Date(`${value}T00:00:00`):null,
  getEventsForCalendarDate:()=>[],getCalendarSummary:()=>'',getCalendarDots:()=>'',
  formatDate:value=>value,escapeAttribute:value=>value,escapeHtml:value=>value,
  updateCalendarSelection:()=>{},Intl,Date,JSON,WeakMap
 });
 const filterSource=source.slice(source.indexOf('  function renderFilteredEvents()'),source.indexOf('  function renderAgendaCalendar()'));
 const calendarSource=source.slice(source.indexOf('  function renderAgendaCalendar()'),source.indexOf('  function getEventsForCalendarDate('));
 vm.runInContext(`${filterSource}\n${calendarSource}`,context);
 const filter=context.filterEvents;
 context.filterEvents=(rows,options)=>{
  if(options?.includeMonth===false)writes.calendarCorpus++;
  return filter(rows,options);
 };
 events.forEach(event=>context.searchableText.set(event,context.eventSearchText(event)));
 const listener=source.match(/searchInput\?\.addEventListener\("input", (?:renderFilteredEvents|\(\) => \{[\s\S]*?\n    \})\);/)?.[0];
 assert(listener,'Recherche : écouteur introuvable');
 vm.runInContext(listener,context);
 return {context,writes,searchInput,countryFilter,regionFilter,typeFilter,listeners,
  flush:()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());},pending:()=>timers.size};
}

const updated=setup();
updated.context.renderFilteredEvents();
assert.deepEqual(updated.writes.upcoming,['1','2','4']);
assert.deepEqual(updated.writes.pastIds,['3']);
const initialRenders=updated.writes.events;
for(const value of ['e','et','ete']){
 updated.searchInput.value=value;updated.listeners.input();
}
assert.equal(updated.writes.events-initialRenders,0);
assert.equal(updated.pending(),1);
updated.flush();
assert.equal(updated.writes.events-initialRenders,1,'Trois frappes rapides : un seul rendu');
assert.deepEqual(updated.writes.upcoming,['1']);
assert.deepEqual(updated.writes.pastIds,[]);

for(const [query,upcoming,past] of [
 ['', ['1','2','4'], ['3']],
 ['inexistant', [], []],
 ['ÉTÉ', ['1'], []],
 ['ete', ['1'], []]
]){
 updated.searchInput.value=query;
 updated.context.renderFilteredEvents();
 assert.deepEqual(updated.writes.upcoming,upcoming,query);
 assert.deepEqual(updated.writes.pastIds,past,query);
}
updated.searchInput.value='livre';
updated.countryFilter.value='FR';
updated.typeFilter.value='Salon';
updated.context.renderFilteredEvents();
assert.deepEqual(updated.writes.upcoming,['1']);
assert.deepEqual(updated.writes.pastIds,[]);

updated.searchInput.value='dedicace';updated.listeners.input();
assert.equal(updated.pending(),1);
updated.typeFilter.value='Dédicace';
const prior=updated.writes.events;
updated.context.renderFilteredEvents();updated.flush();
assert.equal(updated.writes.events-prior,1,'Changement de filtre : rendu immédiat unique');
assert.equal(updated.pending(),0);
const same=updated.writes.events;
updated.context.renderFilteredEvents();
assert.equal(updated.writes.events,same,'Rendu identique évité');

const corpusBefore=updated.writes.calendarCorpus;
const firstCalendar=updated.writes.calendar;
updated.context.calendarCursor=new Date(2099,6,1);
updated.context.renderAgendaCalendar();
assert.equal(updated.writes.calendar,firstCalendar+1);
updated.context.renderAgendaCalendar();
assert.equal(updated.writes.calendar,firstCalendar+1,'Calendrier identique évité');
assert.equal(updated.writes.calendarCorpus,corpusBefore);

const markerSource=source.slice(source.indexOf('  function renderMapMarkers('),source.indexOf('  function ensureMapFloatingPanel('));
let markerCreates=0,layerClears=0;
const mapContext=vm.createContext({
 pendingMapEvents:[],map:null,markersLayer:null,markerByEventId:{},
 TYPE_META:{Salon:{},Autre:{}},createTypeIcon:()=>({}),closeMapFloatingPanel:()=>{},openMapFloatingPanel:()=>{},
 L:{marker:()=>{markerCreates++;return {on(){return this;},addTo(){return this;}};}}
});
vm.runInContext(markerSource,mapContext);
const markerEvent={id:'map-1',title:'Salon',type:'Salon',lat:48.8,lng:2.3};
mapContext.renderMapMarkers([markerEvent]);
assert.equal(mapContext.pendingMapEvents.length,1);
assert.equal(markerCreates,0,'Carte inactive : aucun usage Leaflet');
mapContext.map={};
mapContext.markersLayer={clearLayers:()=>{layerClears++;}};
mapContext.renderMapMarkers([markerEvent]);
assert.equal(layerClears,1);
assert.equal(markerCreates,1,'Carte active : marqueur mis à jour');
assert(mapContext.markerByEventId['map-1']);

console.log('PASS recherche : debounce 200 ms, filtres, ordre, calendrier et marqueurs');
