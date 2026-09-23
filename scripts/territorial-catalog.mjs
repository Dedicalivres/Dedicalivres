// Build-time helpers only. No default country and no inference from a city name.
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function territoryFor(event, registry) {
  const country=registry.find(c=>c.code===event.country_code);
  return country?.territories.find(t=>t.label===event.region) ?? null;
}
export function validDate(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function classify(event, today) {
  const hasStart=event.start_date!==null && event.start_date!==undefined && event.start_date!=='';
  if(hasStart&&!validDate(event.start_date))return 'invalid';
  const end=event.end_date || event.start_date;
  if(event.end_date&&!validDate(event.end_date))return 'invalid';
  if(hasStart&&end<event.start_date)return 'invalid';
  if(event.registration_force_status==='annule')return 'registration-cancelled';
  if(!hasStart)return 'undated';
  if(end<today)return 'past';
  return event.start_date<=today?'ongoing':'future';
}
export function duplicateGroups(events) {
 const groups=new Map();
 for(const e of events){
  const key=[e.country_code,e.region,normalize(e.city),normalize(e.title),e.start_date,e.end_date||e.start_date].join('|');
  groups.set(key,[...(groups.get(key)||[]),e.id]);
 }
 return [...groups.values()].filter(g=>g.length>1);
}
// Publication status alone governs inclusion. Quality warnings never suppress rows.
export function qualify(events, registry, observations, today) {
 const ids=new Set();
 for(const e of events){if(!e.id || ids.has(String(e.id)))throw Error('Collision d’identifiant: '+e.id);ids.add(String(e.id));}
 const accepted=[],rejected=[];
 for(const e of events){
  if(e.validated!==true||e.rejected!==false){rejected.push({...e,reason:'Non public'});continue;}
  accepted.push({...e,territoryId:territoryFor(e,registry)?.id??null,status:classify(e,today)});
 }
 return {accepted,rejected};
}
export const PUBLIC_EVENT_FIELDS='id,title,type,country_code,region,city,start_date,end_date,validated,rejected,registration_force_status,website';
export async function fetchPublicEvents(config,request=fetch) {
 const events=[],seen=new Set();let cursor=null;
 for(let page=0;page<200;page++){
  const query=new URLSearchParams({select:PUBLIC_EVENT_FIELDS,validated:'eq.true',rejected:'eq.false',order:'id.asc',limit:'500'});
  if(cursor!==null)query.set('id','gt.'+cursor);
  const response=await request(config.supabaseUrl+'/rest/v1/events?'+query,{headers:{apikey:config.supabaseAnonKey},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Catalogue indisponible (HTTP '+response.status+')');
  const rows=await response.json();
  if(!Array.isArray(rows))throw Error('Catalogue invalide');
  if(!rows.length)return events;
  for(const e of rows){
   if(!e.id||seen.has(String(e.id))||e.validated!==true||e.rejected!==false)throw Error('Catalogue incohérent');
   seen.add(String(e.id));events.push(e);
  }
  cursor=rows.at(-1).id;
 }
 throw Error('Catalogue incomplet');
}
export const eventHref = e => 'event.html?id='+encodeURIComponent(e.id);
